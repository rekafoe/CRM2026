import { Canvas, FabricImage, loadSVGFromString, util, type FabricObject } from 'fabric';
import type { DesignTemplate } from '../../../api';
import type { DesignPage } from './types';
import { FABRIC_CUSTOM_PROPS } from './constants';
import { normalizeDesignFieldsOnCanvas } from './designFields';
import { prepareTextObjectsOnCanvas } from './textStyleRuns';
import { PUBLIC_EDITOR_FEATURE_FLAGS } from '../../../features/publicDesignEditor/publicEditorFeatureFlags';
import {
  PUBLIC_EDITOR_DEV,
  recordPublicEditorDebugEvent,
  recordPublicEditorPerfMetric,
} from '../../../features/publicDesignEditor/publicEditorPerf';

type AnyObj = Record<string, unknown>;

const svgDataUrlCache = new Map<string, string>();

type DeferredBackground = Record<string, unknown>;

type PreparedFabricJson = {
  json: Record<string, unknown>;
  deferredBackgrounds: DeferredBackground[];
};

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

function summarizeSource(src: string): Record<string, unknown> {
  return {
    kind: src.startsWith('data:') ? 'data-url' : 'url',
    isSvg: isSvgImageSource(src),
    length: src.length,
    preview: src.startsWith('data:') ? src.slice(0, 72) : src,
  };
}

function summarizeCanvasObjects(canvas: Canvas): Array<Record<string, unknown>> {
  return canvas.getObjects().map((obj, index) => {
    const meta = asAny(obj);
    return {
      index,
      type: obj.type,
      id: typeof meta.id === 'string' ? meta.id : null,
      isBackground: meta.isBackground === true,
      isPhotoField: meta.isPhotoField === true,
      photoFieldFilled: meta.photoFieldFilled === true,
      fill: typeof meta.fill === 'string' ? meta.fill : undefined,
      src: typeof meta.src === 'string' ? summarizeSource(meta.src) : undefined,
      left: Math.round(Number(obj.left ?? 0)),
      top: Math.round(Number(obj.top ?? 0)),
      width: Math.round(Number(obj.width ?? 0)),
      height: Math.round(Number(obj.height ?? 0)),
      scaleX: Number(obj.scaleX ?? 1),
      scaleY: Number(obj.scaleY ?? 1),
      visible: obj.visible !== false,
      opacity: obj.opacity,
    };
  });
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

function isSvgImageUrl(url: string): boolean {
  return /\.svg(?:$|[?#])/i.test(url);
}

function isSvgImageSource(src: string): boolean {
  return src.startsWith('data:image/svg+xml') || isSvgImageUrl(src);
}

function svgTextToDataUrl(svgText: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
}

function decodeSvgDataUrl(src: string): string | null {
  if (!src.startsWith('data:image/svg+xml')) return null;
  const commaIndex = src.indexOf(',');
  if (commaIndex < 0) return null;
  const meta = src.slice(0, commaIndex).toLowerCase();
  const payload = src.slice(commaIndex + 1);
  try {
    return meta.includes(';base64') ? atob(payload) : decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function shouldLoadSvgBackgroundAsVector(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua)
    && /(iPhone|iPad|iPod)/i.test(ua)
    && !/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(ua);
}

async function resolveSvgImageDataUrl(src: string): Promise<string | null> {
  if (!isSvgImageUrl(src) || src.startsWith('data:')) return null;
  const cached = svgDataUrlCache.get(src);
  if (cached) {
    recordPublicEditorDebugEvent('svg.inline.cache-hit', summarizeSource(src));
    return cached;
  }
  try {
    recordPublicEditorDebugEvent('svg.inline.fetch.start', summarizeSource(src));
    const response = await fetch(src, { credentials: 'same-origin' });
    if (!response.ok) {
      recordPublicEditorDebugEvent('svg.inline.fetch.bad-status', {
        ...summarizeSource(src),
        status: response.status,
      }, 'warn');
      return null;
    }
    const svgText = await response.text();
    if (!/<svg[\s>]/i.test(svgText)) {
      recordPublicEditorDebugEvent('svg.inline.fetch.not-svg', {
        ...summarizeSource(src),
        textStart: svgText.slice(0, 120),
      }, 'warn');
      return null;
    }
    const dataUrl = svgTextToDataUrl(svgText);
    svgDataUrlCache.set(src, dataUrl);
    recordPublicEditorDebugEvent('svg.inline.fetch.ok', {
      ...summarizeSource(src),
      svgLength: svgText.length,
      dataUrlLength: dataUrl.length,
    });
    return dataUrl;
  } catch (error) {
    recordPublicEditorDebugEvent('svg.inline.fetch.error', {
      ...summarizeSource(src),
      error,
    }, 'error');
    return null;
  }
}

async function inlineSvgImageSources(value: unknown): Promise<void> {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    await Promise.all(value.map((item) => inlineSvgImageSources(item)));
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.src === 'string') {
    const dataUrl = await resolveSvgImageDataUrl(record.src);
    if (dataUrl) {
      record.src = dataUrl;
      delete record.crossOrigin;
    }
  }
  await Promise.all(Object.values(record).map((nested) => inlineSvgImageSources(nested)));
}

function collectDeferredSvgBackgrounds(value: unknown, deferred: DeferredBackground[]): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const item = value[index];
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const record = item as Record<string, unknown>;
        if (record.isBackground === true && typeof record.src === 'string' && isSvgImageSource(record.src)) {
          deferred.unshift(record);
          value.splice(index, 1);
          continue;
        }
      }
      collectDeferredSvgBackgrounds(item, deferred);
    }
    return;
  }
  for (const nested of Object.values(value)) collectDeferredSvgBackgrounds(nested, deferred);
}

async function prepareFabricJsonForLoad(fabricJson: Record<string, unknown>): Promise<PreparedFabricJson> {
  const prepared = deepCloneFabricJson(fabricJson);
  const deferredBackgrounds: DeferredBackground[] = [];
  collectDeferredSvgBackgrounds(prepared.objects, deferredBackgrounds);
  recordPublicEditorDebugEvent('fabric.prepare.start', {
    objectCount: Array.isArray(prepared.objects) ? prepared.objects.length : null,
    deferredBackgroundCount: deferredBackgrounds.length,
    deferredBackgrounds: deferredBackgrounds.map((bg) => (
      typeof bg.src === 'string' ? summarizeSource(bg.src) : { kind: 'missing-src' }
    )),
  });
  await inlineSvgImageSources(prepared);
  await inlineSvgImageSources(deferredBackgrounds);
  recordPublicEditorDebugEvent('fabric.prepare.done', {
    objectCount: Array.isArray(prepared.objects) ? prepared.objects.length : null,
    deferredBackgroundCount: deferredBackgrounds.length,
    deferredBackgrounds: deferredBackgrounds.map((bg) => (
      typeof bg.src === 'string' ? summarizeSource(bg.src) : { kind: 'missing-src' }
    )),
  });
  return { json: prepared, deferredBackgrounds };
}

async function loadSvgBackgroundAsVector(src: string): Promise<FabricObject | null> {
  const svgText = decodeSvgDataUrl(src);
  if (!svgText || !/<svg[\s>]/i.test(svgText)) {
    recordPublicEditorDebugEvent('svg.vector.skip', {
      ...summarizeSource(src),
      hasDecodedText: Boolean(svgText),
    }, 'warn');
    return null;
  }
  const parsed = await loadSVGFromString(svgText);
  const objects = parsed.objects.filter((obj): obj is FabricObject => obj != null);
  if (!objects.length) {
    recordPublicEditorDebugEvent('svg.vector.empty', {
      ...summarizeSource(src),
      svgLength: svgText.length,
    }, 'warn');
    return null;
  }
  recordPublicEditorDebugEvent('svg.vector.ok', {
    ...summarizeSource(src),
    svgLength: svgText.length,
    objectCount: objects.length,
    options: parsed.options,
  });
  return util.groupSVGElements(objects, parsed.options);
}

async function addDeferredBackgrounds(canvas: Canvas, backgrounds: DeferredBackground[]): Promise<void> {
  for (const background of backgrounds) {
    const src = typeof background.src === 'string' ? background.src : '';
    if (!src) continue;
    try {
      recordPublicEditorDebugEvent('background.deferred.start', {
        source: summarizeSource(src),
        safariVector: shouldLoadSvgBackgroundAsVector(),
      });
      const props = { ...background };
      delete props.src;
      delete props.type;
      delete props.version;
      const backgroundObject = shouldLoadSvgBackgroundAsVector()
        ? await loadSvgBackgroundAsVector(src)
        : null;
      const obj = backgroundObject
        ?? await FabricImage.fromURL(src, src.startsWith('data:') ? {} : { crossOrigin: 'anonymous' });
      obj.set(props);
      for (const key of FABRIC_CUSTOM_PROPS) {
        if (Object.prototype.hasOwnProperty.call(background, key)) {
          asAny(obj)[key] = background[key];
        }
      }
      asAny(obj).isBackground = true;
      obj.set({ selectable: false, evented: false });
      canvas.add(obj);
      canvas.sendObjectToBack(obj);
      recordPublicEditorDebugEvent('background.deferred.done', {
        source: summarizeSource(src),
        objectType: obj.type,
        objectCount: canvas.getObjects().length,
      });
    } catch (error) {
      recordPublicEditorDebugEvent('background.deferred.error', {
        source: summarizeSource(src),
        error,
      }, 'error');
      // SVG backgrounds are decorative; never block the rest of the page.
    }
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
  recordPublicEditorDebugEvent('scene.load.single.start', {
    pageIndex,
    pageW,
    pageH,
    hasJson,
    objectCount: Array.isArray(fabricJson?.objects) ? fabricJson.objects.length : null,
    canvasObjectCountBefore: canvas.getObjects().length,
  });
  if (hasJson) {
    canvas.clear();
    (canvas as unknown as AnyObj).backgroundColor = 'white';
    try {
      // Не даём Fabric мутировать snapshot страницы в React state при переходах.
      const prepared = await prepareFabricJsonForLoad(fabricJson);
      await canvas.loadFromJSON(prepared.json, fabricDeserializeReviver);
      await addDeferredBackgrounds(canvas, prepared.deferredBackgrounds);
      recordPublicEditorDebugEvent('scene.load.single.after-json', {
        pageIndex,
        objectCount: canvas.getObjects().length,
        objects: summarizeCanvasObjects(canvas),
      });
    } catch (error) {
      recordPublicEditorDebugEvent('scene.load.single.error', {
        pageIndex,
        error,
      }, 'error');
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
  recordPublicEditorDebugEvent('scene.load.single.done', {
    pageIndex,
    backgroundColor: (canvas as unknown as AnyObj).backgroundColor,
    objectCount: canvas.getObjects().length,
    hasBackgroundObject: hasBackgroundObject(canvas),
    objects: summarizeCanvasObjects(canvas),
  });
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
  recordPublicEditorDebugEvent('scene.load.spread.start', {
    leftPageIndex,
    rightPageIndex,
    pageW,
    pageH,
    hasMergedJson: Boolean(mergedJson),
    mergedObjectCount: Array.isArray(mergedJson?.objects) ? mergedJson.objects.length : null,
  });
  if (mergedJson) {
    canvas.clear();
    canvas.setDimensions({ width: pageW * 2, height: pageH });
    (canvas as unknown as AnyObj).backgroundColor = 'white';
    try {
      const prepared = await prepareFabricJsonForLoad(mergedJson);
      await canvas.loadFromJSON(prepared.json, fabricDeserializeReviver);
      await addDeferredBackgrounds(canvas, prepared.deferredBackgrounds);
      ensureWhiteCanvasBackground(canvas);
      await normalizeDesignFieldsOnCanvas(canvas, pageW, pageH);
      canvas.renderAll();
      canvas.requestRenderAll();
      recordPublicEditorDebugEvent('scene.load.spread.done.direct', {
        leftPageIndex,
        rightPageIndex,
        objectCount: canvas.getObjects().length,
        objects: summarizeCanvasObjects(canvas),
      });
      return;
    } catch (error) {
      recordPublicEditorDebugEvent('scene.load.spread.direct-error', {
        leftPageIndex,
        rightPageIndex,
        error,
      }, 'error');
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
  recordPublicEditorDebugEvent('scene.load.spread.done.fallback', {
    leftPageIndex,
    rightPageIndex,
    objectCount: canvas.getObjects().length,
    objects: summarizeCanvasObjects(canvas),
  });
}

