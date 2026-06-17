import { Canvas, FabricImage } from 'fabric';
import type { DesignTemplate } from '../../../api';
import type { DesignPage } from './types';
import { FABRIC_CUSTOM_PROPS } from './constants';
import { normalizeDesignFieldsOnCanvas } from './designFields';
import { prepareTextObjectsOnCanvas } from './textStyleRuns';
import { PUBLIC_EDITOR_FEATURE_FLAGS } from '../../../features/publicDesignEditor/publicEditorFeatureFlags';
import { PUBLIC_EDITOR_DEV, recordPublicEditorPerfMetric } from '../../../features/publicDesignEditor/publicEditorPerf';

type AnyObj = Record<string, unknown>;

export function fabricDeserializeReviver(
  serializedObj: Record<string, unknown>,
  instance: unknown,
): void {
  const target = instance as AnyObj;
  for (const key of FABRIC_CUSTOM_PROPS) {
    if (!Object.prototype.hasOwnProperty.call(serializedObj, key)) continue;
    target[key] = serializedObj[key];
  }
}

function asAny(value: unknown): AnyObj {
  return value as AnyObj;
}

function normalizeFabricJsonRoot(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const root = { ...(value as Record<string, unknown>) };
  if (!Array.isArray(root.objects)) root.objects = [];
  if (root.backgroundImage != null && typeof root.backgroundImage !== 'object') {
    root.backgroundImage = undefined;
  }
  return root;
}

function deepCloneFabricJson(value: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return { ...value, objects: Array.isArray(value.objects) ? [...value.objects] : [] };
  }
}

function getFabricJsonObjects(value: Record<string, unknown> | null): Record<string, unknown>[] {
  if (!value || !Array.isArray(value.objects)) return [];
  return value.objects.filter(
    (obj): obj is Record<string, unknown> => !!obj && typeof obj === 'object' && !Array.isArray(obj),
  );
}

function shiftSerializedLeft(obj: Record<string, unknown>, delta: number): void {
  const current = typeof obj.left === 'number' ? obj.left : Number(obj.left ?? 0);
  obj.left = (Number.isFinite(current) ? current : 0) + delta;
}

function clearSpreadMirrorMeta(obj: Record<string, unknown>): void {
  delete obj.spreadMirrorId;
  delete obj.spreadMirrorSide;
  delete obj.spreadMirrorSpineX;
}

function readSpreadMirrorMeta(obj: Record<string, unknown>): { id: string; side: 'left' | 'right' } | null {
  const id = typeof obj.spreadMirrorId === 'string' ? obj.spreadMirrorId.trim() : '';
  const side = obj.spreadMirrorSide;
  if (!id || (side !== 'left' && side !== 'right')) return null;
  return { id, side };
}

function normalizeSerializedBackgroundObject(obj: Record<string, unknown>, pageW: number, pageH: number): void {
  if (obj.isBackground !== true) return;
  obj.selectable = false;
  obj.evented = false;
  if (obj.backgroundFit !== 'page') return;
  const width = Math.max(Number(obj.width) || pageW, 1);
  const height = Math.max(Number(obj.height) || pageH, 1);
  obj.left = 0;
  obj.top = 0;
  obj.scaleX = pageW / width;
  obj.scaleY = pageH / height;
}

function buildSpreadMergedFabricJson(input: {
  leftPage: DesignPage | undefined;
  rightPage: DesignPage | undefined;
  pageW: number;
  pageH: number;
}): Record<string, unknown> | null {
  const leftRoot = normalizeFabricJsonRoot(input.leftPage?.fabricJSON);
  const rightRoot = normalizeFabricJsonRoot(input.rightPage?.fabricJSON);
  const enableMirrorReconciliation = PUBLIC_EDITOR_FEATURE_FLAGS.spreadMirrorReconciliation;
  const leftMirrorIds = new Set<string>();
  const leftObjects = getFabricJsonObjects(leftRoot).map((obj) => {
    const next = deepCloneFabricJson(obj);
    const mirror = readSpreadMirrorMeta(next);
    if (enableMirrorReconciliation && mirror?.side === 'left') {
      leftMirrorIds.add(mirror.id);
    }
    clearSpreadMirrorMeta(next);
    normalizeSerializedBackgroundObject(next, input.pageW, input.pageH);
    return next;
  });
  let dedupedMirrorCount = 0;
  const rightObjects = getFabricJsonObjects(rightRoot).flatMap((obj) => {
    const next = deepCloneFabricJson(obj);
    const mirror = readSpreadMirrorMeta(next);
    const isMirroredDuplicate = enableMirrorReconciliation
      && mirror?.side === 'right'
      && leftMirrorIds.has(mirror.id);
    clearSpreadMirrorMeta(next);
    if (isMirroredDuplicate) {
      dedupedMirrorCount += 1;
      return [];
    }
    normalizeSerializedBackgroundObject(next, input.pageW, input.pageH);
    shiftSerializedLeft(next, input.pageW);
    return [next];
  });
  recordPublicEditorPerfMetric('spread.merge.dedupedMirrors', dedupedMirrorCount, {
    leftObjects: leftObjects.length,
    rightObjects: rightObjects.length,
  });
  if (PUBLIC_EDITOR_DEV && dedupedMirrorCount > 0) {
    console.info('[DesignEditorCanvas] spread merge reconciled mirrored duplicates', {
      dedupedMirrorCount,
      leftObjects: leftObjects.length,
      rightObjects: rightObjects.length,
    });
  }
  if (leftObjects.length === 0 && rightObjects.length === 0) return null;
  return {
    ...(leftRoot ?? rightRoot ?? {}),
    objects: [...leftObjects, ...rightObjects],
    backgroundColor: 'white',
  };
}

function resolvePreviewUrl(template: DesignTemplate | null, apiBaseUrl: string): string | null {
  if (!template?.preview_url) return null;
  if (template.preview_url.startsWith('http')) return template.preview_url;
  const base = apiBaseUrl.replace(/\/api\/?$/, '');
  return `${base}${template.preview_url.startsWith('/') ? '' : '/'}${template.preview_url}`;
}

function hasBackgroundObject(canvas: Canvas): boolean {
  return canvas.getObjects().some((obj) => !!asAny(obj).isBackground);
}

function ensureWhiteCanvasBackground(canvas: Canvas): void {
  const currentBg = (canvas as unknown as { backgroundColor?: unknown }).backgroundColor;
  const hasExplicitBg = typeof currentBg === 'string' && currentBg.trim().length > 0;
  if (!hasExplicitBg) {
    (canvas as unknown as AnyObj).backgroundColor = 'white';
  }
}

function normalizeBackgroundObjects(canvas: Canvas, pageW: number, pageH: number): void {
  canvas.getObjects().forEach((obj) => {
    const meta = asAny(obj);
    if (!meta.isBackground) return;
    obj.set({ selectable: false, evented: false });
    if (meta.backgroundFit === 'page') {
      obj.set({
        left: 0,
        top: 0,
        scaleX: pageW / Math.max(Number(obj.width) || pageW, 1),
        scaleY: pageH / Math.max(Number(obj.height) || pageH, 1),
      });
    }
    canvas.sendObjectToBack(obj);
  });
}

export async function addTemplatePreviewBackground(
  canvas: Canvas,
  template: DesignTemplate | null,
  pageW: number,
  pageH: number,
  apiBaseUrl: string,
): Promise<void> {
  const previewUrl = resolvePreviewUrl(template, apiBaseUrl);
  if (!previewUrl) return;
  try {
    const img = await FabricImage.fromURL(previewUrl, { crossOrigin: 'anonymous' });
    img.set({
      left: 0,
      top: 0,
      scaleX: pageW / (img.width || pageW),
      scaleY: pageH / (img.height || pageH),
      selectable: false,
      evented: false,
    });
    asAny(img).isBackground = true;
    asAny(img).backgroundFit = 'page';
    canvas.add(img);
    canvas.sendObjectToBack(img);
  } catch {
    // preview is optional for draft/manual templates
  }
}

export async function loadDesignPageScene(input: {
  canvas: Canvas;
  pageData: DesignPage | undefined;
  pageIndex?: number;
  template: DesignTemplate | null;
  pageW: number;
  pageH: number;
  apiBaseUrl: string;
}): Promise<void> {
  const { canvas, pageData, pageIndex, template, pageW, pageH, apiBaseUrl } = input;
  const useTemplatePreviewBackground = pageIndex == null || pageIndex === 0;
  const fabricJson = normalizeFabricJsonRoot(pageData?.fabricJSON);
  const hasJson = !!fabricJson
    && Object.keys(fabricJson).length > 0;
  if (hasJson) {
    canvas.clear();
    (canvas as unknown as AnyObj).backgroundColor = 'white';
    try {
      // Не даём Fabric мутировать snapshot страницы в React state при переходах.
      await canvas.loadFromJSON(deepCloneFabricJson(fabricJson), fabricDeserializeReviver);
    } catch {
      canvas.clear();
      (canvas as unknown as AnyObj).backgroundColor = 'white';
    }
    // Для пустых страниц без backgroundColor в JSON сохраняем непрозрачный белый фон.
    ensureWhiteCanvasBackground(canvas);
    await normalizeDesignFieldsOnCanvas(canvas, pageW, pageH);
    normalizeBackgroundObjects(canvas, pageW, pageH);
    if (useTemplatePreviewBackground && !hasBackgroundObject(canvas)) {
      await addTemplatePreviewBackground(canvas, template, pageW, pageH, apiBaseUrl);
    }
  } else {
    canvas.clear();
    (canvas as unknown as AnyObj).backgroundColor = 'white';
    if (useTemplatePreviewBackground) {
      await addTemplatePreviewBackground(canvas, template, pageW, pageH, apiBaseUrl);
    }
  }
  ensureWhiteCanvasBackground(canvas);
  canvas.requestRenderAll();
}

export async function loadSpreadMergedScene(input: {
  canvas: Canvas;
  leftPage: DesignPage | undefined;
  rightPage: DesignPage | undefined;
  leftPageIndex?: number;
  rightPageIndex?: number;
  pageW: number;
  pageH: number;
  template: DesignTemplate | null;
  apiBaseUrl: string;
}): Promise<void> {
  const { canvas, leftPage, rightPage, leftPageIndex, rightPageIndex, pageW, pageH, template, apiBaseUrl } = input;
  const mergedJson = buildSpreadMergedFabricJson({ leftPage, rightPage, pageW, pageH });
  if (mergedJson) {
    canvas.clear();
    canvas.setDimensions({ width: pageW * 2, height: pageH });
    (canvas as unknown as AnyObj).backgroundColor = 'white';
    try {
      await canvas.loadFromJSON(mergedJson, fabricDeserializeReviver);
      ensureWhiteCanvasBackground(canvas);
      await normalizeDesignFieldsOnCanvas(canvas, pageW, pageH);
      canvas.renderAll();
      canvas.requestRenderAll();
      return;
    } catch {
      canvas.clear();
      canvas.setDimensions({ width: pageW * 2, height: pageH });
      (canvas as unknown as AnyObj).backgroundColor = 'white';
    }
  }

  const leftTempEl = document.createElement('canvas');
  const rightTempEl = document.createElement('canvas');
  const leftTemp = new Canvas(leftTempEl, {
    width: pageW,
    height: pageH,
    backgroundColor: 'white',
    preserveObjectStacking: true,
  });
  const rightTemp = new Canvas(rightTempEl, {
    width: pageW,
    height: pageH,
    backgroundColor: 'white',
    preserveObjectStacking: true,
  });

  try {
    await Promise.all([
      loadDesignPageScene({ canvas: leftTemp, pageData: leftPage, pageIndex: leftPageIndex, template, pageW, pageH, apiBaseUrl }),
      loadDesignPageScene({ canvas: rightTemp, pageData: rightPage, pageIndex: rightPageIndex, template, pageW, pageH, apiBaseUrl }),
    ]);

    canvas.clear();
    canvas.setDimensions({ width: pageW * 2, height: pageH });
    (canvas as unknown as AnyObj).backgroundColor = 'white';

    for (const obj of [...leftTemp.getObjects()]) {
      try {
        const clone = await obj.clone();
        clone.set({ left: clone.left ?? 0 });
        canvas.add(clone);
      } catch (error) {
        if (PUBLIC_EDITOR_DEV) console.warn('[DesignEditorCanvas] skipped left spread object clone', error);
      }
    }

    for (const obj of [...rightTemp.getObjects()]) {
      try {
        const clone = await obj.clone();
        clone.set({ left: (clone.left ?? 0) + pageW });
        canvas.add(clone);
      } catch (error) {
        if (PUBLIC_EDITOR_DEV) console.warn('[DesignEditorCanvas] skipped right spread object clone', error);
      }
    }
  } finally {
    leftTemp.dispose();
    rightTemp.dispose();
  }

  ensureWhiteCanvasBackground(canvas);
  canvas.renderAll();
  canvas.requestRenderAll();
}

