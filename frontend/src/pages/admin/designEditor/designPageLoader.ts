import { Canvas, FabricImage, loadSVGFromString, util, type FabricObject } from 'fabric';
import type { DesignTemplate } from '../../../api';
import type { DesignPage } from './types';
import { FABRIC_CUSTOM_PROPS } from './constants';
import { normalizeDesignFieldsOnCanvas } from './designFields';
import { reloadFabricCanvasFonts } from '../../../utils/fabricFontReload';
import { prepareTextObjectsOnCanvas, finalizeCanvasTextEditingBeforeSave, captureSacredTemplateTextGeometry, extractDesignedTextLayoutsFromFabricJson, applyDesignedTextLayoutSnapshot, normalizeDesignedTextInFabricJSON, type DesignedTextLayoutSnapshot } from './textStyleRuns';
import type { TextLikeObject } from './textStyleRuns';
import { PUBLIC_EDITOR_FEATURE_FLAGS } from '../../../features/publicDesignEditor/publicEditorFeatureFlags';
import {
  PUBLIC_EDITOR_DEV,
  isTextPositionDebugEnabled,
  recordPublicEditorPerfMetric,
} from '../../../features/publicDesignEditor/publicEditorPerf';
import { deduplicateFabricJsonObjectsById } from './fabricSnapshotReconcile';
import { deduplicateCanvasObjectsByStableId } from './canvas/canvasUtils';
import { isTemplateTextLayerId, prefixSpreadPageFabricObjectIds, stripSpreadPageIdPrefix } from './spreadPageObjectIds';
import {
  getIosSafariCanvasOptions,
  hardenCanvasObjectsForIosSafari,
  hardenFabricObjectForIosSafari,
  isIosSafariCanvasSafeMode,
} from './canvas/iosSafariCanvasSafeMode';
import { setFabricCanvasSceneSize } from './canvas/mobileEditorPixelBudget';
import { rewriteEphemeralPhotoFieldBlobSources } from './canvas/canvasSerialization';
import {
  resolveCrmEditorAssetUrl,
  rewriteFabricJsonAssetUrls,
} from '../../../utils/crmEditorAssetUrl';

type AnyObj = Record<string, unknown>;

const svgDataUrlCache = new Map<string, string>();

type DeferredBackground = Record<string, unknown>;
export type ResolveEditorImageSrc = (src: string) => Promise<string | null>;

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

function captureSacredTemplateTextsOnCanvas(
  canvas: Canvas,
  pageKeyForLog: string,
  layoutSnapshots?: Map<string, DesignedTextLayoutSnapshot>,
): void {
  try {
    canvas.getObjects().forEach((o) => {
      const meta = asAny(o);
      const id = String(meta.id ?? '');
      if (isTemplateTextLayerId(id) && meta.textFieldClientAdded !== true) {
        const snap = layoutSnapshots?.get(id);
        if (snap) applyDesignedTextLayoutSnapshot(o as TextLikeObject, snap);
        captureSacredTemplateTextGeometry(o as TextLikeObject, { overwrite: true, jsonSnapshot: snap });
      }
    });
    if (isTextPositionDebugEnabled()) {
      const captured = canvas.getObjects().filter((o) => isTemplateTextLayerId(asAny(o).id));
      if (captured.length) {
        console.log(`[TEXT-POS] sacred-captured ${pageKeyForLog}`);
        captured.forEach((o) => {
          const t = o as TextLikeObject;
          console.log(`[TEXT-POS]   SACRED id=${t.id} left=${t.left} top=${t.top} w=${t.width} angle=${t.angle ?? 0} originX=${t.originX}`);
        });
      }
    }
  } catch {
    /* non-fatal */
  }
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
  return isIosSafariCanvasSafeMode();
}

async function resolveSvgImageDataUrl(src: string): Promise<string | null> {
  if (!isSvgImageUrl(src) || src.startsWith('data:')) return null;
  const cached = svgDataUrlCache.get(src);
  if (cached) return cached;
  try {
    const response = await fetch(src, { credentials: 'same-origin' });
    if (!response.ok) return null;
    const svgText = await response.text();
    if (!/<svg[\s>]/i.test(svgText)) return null;
    const dataUrl = svgTextToDataUrl(svgText);
    svgDataUrlCache.set(src, dataUrl);
    return dataUrl;
  } catch {
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

async function remapFabricJsonImageSources(
  value: unknown,
  resolveImageSrc: ResolveEditorImageSrc,
): Promise<void> {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    await Promise.all(value.map((item) => remapFabricJsonImageSources(item, resolveImageSrc)));
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.src === 'string' && !record.src.startsWith('data:') && !record.src.startsWith('blob:')) {
    const resolved = await resolveImageSrc(record.src);
    if (resolved) {
      record.src = resolved;
      delete record.crossOrigin;
    }
  }
  await Promise.all(Object.values(record).map((nested) => remapFabricJsonImageSources(nested, resolveImageSrc)));
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

async function prepareFabricJsonForLoad(
  fabricJson: Record<string, unknown>,
  resolveImageSrc?: ResolveEditorImageSrc,
): Promise<PreparedFabricJson> {
  const prepared = rewriteFabricJsonAssetUrls(deepCloneFabricJson(fabricJson));
  rewriteEphemeralPhotoFieldBlobSources(prepared);
  const deferredBackgrounds: DeferredBackground[] = [];
  collectDeferredSvgBackgrounds(prepared.objects, deferredBackgrounds);
  await inlineSvgImageSources(prepared);
  await inlineSvgImageSources(deferredBackgrounds);
  if (resolveImageSrc) {
    await remapFabricJsonImageSources(prepared, resolveImageSrc);
    await remapFabricJsonImageSources(deferredBackgrounds, resolveImageSrc);
  }
  return { json: prepared, deferredBackgrounds };
}

async function loadSvgBackgroundAsVector(src: string): Promise<FabricObject | null> {
  const svgText = decodeSvgDataUrl(src);
  if (!svgText || !/<svg[\s>]/i.test(svgText)) return null;
  const parsed = await loadSVGFromString(svgText);
  const objects = parsed.objects.filter((obj): obj is FabricObject => obj != null);
  if (!objects.length) return null;
  objects.forEach(hardenFabricObjectForIosSafari);
  const group = util.groupSVGElements(objects, parsed.options);
  hardenFabricObjectForIosSafari(group);
  return group;
}

async function addDeferredBackgrounds(canvas: Canvas, backgrounds: DeferredBackground[]): Promise<void> {
  for (const background of backgrounds) {
    const src = typeof background.src === 'string' ? background.src : '';
    if (!src) continue;
    try {
      const props = { ...background };
      delete props.src;
      delete props.type;
      delete props.version;
      const obj = await loadBackgroundObject(src);
      obj.set(props);
      for (const key of FABRIC_CUSTOM_PROPS) {
        if (Object.prototype.hasOwnProperty.call(background, key)) {
          asAny(obj)[key] = background[key];
        }
      }
      asAny(obj).isBackground = true;
      obj.set({ selectable: false, evented: false });
      hardenFabricObjectForIosSafari(obj);
      canvas.add(obj);
      canvas.sendObjectToBack(obj);
    } catch {
      // SVG backgrounds are decorative; never block the rest of the page.
    }
  }
}

async function loadBackgroundObject(src: string): Promise<FabricObject> {
  if (shouldLoadSvgBackgroundAsVector() && isSvgImageSource(src)) {
    const vectorSrc = src.startsWith('data:')
      ? src
      : await resolveSvgImageDataUrl(src);
    if (vectorSrc) {
      const vectorObject = await loadSvgBackgroundAsVector(vectorSrc);
      if (vectorObject) return vectorObject;
    }
  }

  return FabricImage.fromURL(src, src.startsWith('data:') ? {} : { crossOrigin: 'anonymous' });
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

/**
 * Убирает text_* с правой страницы, если на левой уже есть тот же слой с тем же текстом
 * (остаток старого spine-mirror). Разный текст при том же id — норма для соседних страниц альбома.
 */
function scrubMirroredDesignedTextFromSpreadMerge(
  leftObjects: Record<string, unknown>[],
  rightObjects: Record<string, unknown>[],
): { rightObjects: Record<string, unknown>[]; removed: number } {
  const leftTextByBaseId = new Map<string, string>();
  for (const obj of leftObjects) {
    const id = typeof obj.id === 'string' ? obj.id.trim() : '';
    if (!id) continue;
    const baseId = stripSpreadPageIdPrefix(id);
    if (!isTemplateTextLayerId(baseId) || obj.textFieldClientAdded === true) continue;
    leftTextByBaseId.set(baseId, String(obj.text ?? '').replace(/\u200b/g, '').trim());
  }
  let removed = 0;
  const nextRight = rightObjects.filter((obj) => {
    const id = typeof obj.id === 'string' ? obj.id.trim() : '';
    if (!id) return true;
    const baseId = stripSpreadPageIdPrefix(id);
    if (!isTemplateTextLayerId(baseId) || obj.textFieldClientAdded === true) return true;
    const leftText = leftTextByBaseId.get(baseId);
    if (leftText == null) return true;
    const rightText = String(obj.text ?? '').replace(/\u200b/g, '').trim();
    if (leftText !== rightText) return true;
    removed += 1;
    return false;
  });
  return { rightObjects: nextRight, removed };
}

export function buildSpreadMergedFabricJson(input: {
  leftPage: DesignPage | undefined;
  rightPage: DesignPage | undefined;
  leftPageIndex: number;
  rightPageIndex: number;
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
    prefixSpreadPageFabricObjectIds(next, input.leftPageIndex);
    return next;
  });
  let dedupedMirrorCount = 0;
  const rightObjectsRaw = getFabricJsonObjects(rightRoot).flatMap((obj) => {
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
    prefixSpreadPageFabricObjectIds(next, input.rightPageIndex);
    return [next];
  });
  const scrubbed = scrubMirroredDesignedTextFromSpreadMerge(leftObjects, rightObjectsRaw);
  const rightObjects = scrubbed.rightObjects;
  dedupedMirrorCount += scrubbed.removed;
  recordPublicEditorPerfMetric('spread.merge.dedupedMirrors', dedupedMirrorCount, {
    leftObjects: leftObjects.length,
    rightObjects: rightObjects.length,
    scrubbedSameText: scrubbed.removed,
  });
  if (PUBLIC_EDITOR_DEV && dedupedMirrorCount > 0) {
    console.info('[DesignEditorCanvas] spread merge reconciled duplicates', {
      dedupedMirrorCount,
      leftObjects: leftObjects.length,
      rightObjects: rightObjects.length,
      scrubbedSameText: scrubbed.removed,
    });
  }
  if (leftObjects.length === 0 && rightObjects.length === 0) return null;
  return {
    ...(leftRoot ?? rightRoot ?? {}),
    objects: deduplicateFabricJsonObjectsById([...leftObjects, ...rightObjects]),
    backgroundColor: 'white',
  };
}

function resolvePreviewUrl(template: DesignTemplate | null, apiBaseUrl: string): string | null {
  if (!template?.preview_url) return null;
  const resolved = resolveCrmEditorAssetUrl(template.preview_url);
  if (resolved) return resolved;
  if (template.preview_url.startsWith('http')) return template.preview_url;
  const base = apiBaseUrl.replace(/\/api\/?$/, '');
  const joined = `${base}${template.preview_url.startsWith('/') ? '' : '/'}${template.preview_url}`;
  return resolveCrmEditorAssetUrl(joined) ?? joined;
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
    const img = await loadBackgroundObject(previewUrl);
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
  /** Order/export PNG: не пересчитывать ширину/позицию text_* после load. */
  preserveTextLayout?: boolean;
  /** CRM-specific resolver for image sources retained for existing callers. */
  resolveImageSrc?: ResolveEditorImageSrc;
}): Promise<void> {
  const {
    canvas, pageData, pageIndex, template, pageW, pageH, apiBaseUrl, preserveTextLayout, resolveImageSrc,
  } = input;
  const textLayoutOpts = preserveTextLayout ? { preserveTextLayout: true } as const : undefined;
  const fontReloadOpts = preserveTextLayout ? { preserveLayout: true } : undefined;
  const useTemplatePreviewBackground = pageIndex == null || pageIndex === 0;
  const fabricJson = normalizeFabricJsonRoot(pageData?.fabricJSON);
  const hasJson = !!fabricJson
    && Object.keys(fabricJson).length > 0;
  const pageKeyForLog = `single-${pageIndex ?? '?'}`;
  if (hasJson) {
    // DEBUG: positions coming from stored fabricJSON (before any mutation on load)
    try {
      const objs = Array.isArray(fabricJson.objects) ? fabricJson.objects : [];
      const textObjs = objs.filter((o: any) => isTemplateTextLayerId(o?.id));
      if (textObjs.length && isTextPositionDebugEnabled()) {
        console.log(`[TEXT-POS] incoming-json ${pageKeyForLog} count=${textObjs.length}`);
        textObjs.forEach((o: any) => {
          const t = String(o.text ?? '').slice(0, 40).replace(/\n/g, ' ');
          console.log(`[TEXT-POS]   [IN] id=${o.id} left=${o.left} top=${o.top} w=${o.width} angle=${o.angle ?? 0} originX=${o.originX} "${t}"`);
        });
      }
    } catch {}

    canvas.clear();
    (canvas as unknown as AnyObj).backgroundColor = 'white';
    try {
      const normalizedFabricJson = normalizeDesignedTextInFabricJSON(fabricJson);
      const layoutSnapshots = extractDesignedTextLayoutsFromFabricJson(normalizedFabricJson);
      // Не даём Fabric мутировать snapshot страницы в React state при переходах.
      const prepared = await prepareFabricJsonForLoad(normalizedFabricJson, resolveImageSrc);
      await canvas.loadFromJSON(prepared.json, fabricDeserializeReviver);
      await addDeferredBackgrounds(canvas, prepared.deferredBackgrounds);
      hardenCanvasObjectsForIosSafari(canvas);
      deduplicateCanvasObjectsByStableId(canvas);

      // Apply layout width/position from JSON — Fabric loadFromJSON may shrink textbox width.
      captureSacredTemplateTextsOnCanvas(canvas, pageKeyForLog, layoutSnapshots);

      // DEBUG: positions right after loadFromJSON
      try {
        const loadedTexts = canvas.getObjects().filter((o: any) => isTemplateTextLayerId(o.id));
      if (loadedTexts.length && isTextPositionDebugEnabled()) {
        console.log(`[TEXT-POS] after-loadFromJSON ${pageKeyForLog} count=${loadedTexts.length}`);
        loadedTexts.forEach((o: any) => {
          const t = String(o.text ?? '').slice(0, 40).replace(/\n/g, ' ');
          console.log(`[TEXT-POS]   [LOADED] id=${o.id} left=${o.left} top=${o.top} w=${o.width} angle=${o.angle ?? 0} originX=${o.originX} "${t}"`);
        });
      }
      } catch {}
    } catch {
      canvas.clear();
      (canvas as unknown as AnyObj).backgroundColor = 'white';
    }
    // Для пустых страниц без backgroundColor в JSON сохраняем непрозрачный белый фон.
    ensureWhiteCanvasBackground(canvas);
    await normalizeDesignFieldsOnCanvas(canvas, pageW, pageH, textLayoutOpts);
    normalizeBackgroundObjects(canvas, pageW, pageH);
    await reloadFabricCanvasFonts(canvas, fontReloadOpts);
    hardenCanvasObjectsForIosSafari(canvas);
    finalizeCanvasTextEditingBeforeSave(canvas, fontReloadOpts);

    // DEBUG: final positions after all normalization/hydrate/width-fit on this page load
    try {
      const finalTexts = canvas.getObjects().filter((o: any) => isTemplateTextLayerId(o.id));
      if (finalTexts.length && isTextPositionDebugEnabled()) {
        console.log(`[TEXT-POS] after-normalize ${pageKeyForLog} count=${finalTexts.length}`);
        finalTexts.forEach((o: any) => {
          const t = String(o.text ?? '').slice(0, 40).replace(/\n/g, ' ');
          console.log(`[TEXT-POS]   [FINAL] id=${o.id} left=${o.left} top=${o.top} w=${o.width} angle=${o.angle ?? 0} originX=${o.originX} "${t}"`);
        });
      }
    } catch {}

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
  hardenCanvasObjectsForIosSafari(canvas);
  // Final stabilize + lock before render (в т.ч. после подгрузки шрифтов на мобилке).
  try { finalizeCanvasTextEditingBeforeSave(canvas, fontReloadOpts); } catch {}
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
  const mergedJson = buildSpreadMergedFabricJson({
    leftPage,
    rightPage,
    leftPageIndex: leftPageIndex ?? 0,
    rightPageIndex: rightPageIndex ?? 1,
    pageW,
    pageH,
  });
if (mergedJson) {
    canvas.clear();
    setFabricCanvasSceneSize(canvas, pageW * 2, pageH);
    (canvas as unknown as AnyObj).backgroundColor = 'white';
    try {
      const normalizedMergedJson = normalizeDesignedTextInFabricJSON(mergedJson);
      const spreadLayoutSnapshots = extractDesignedTextLayoutsFromFabricJson(normalizedMergedJson);
      const prepared = await prepareFabricJsonForLoad(normalizedMergedJson);
      await canvas.loadFromJSON(prepared.json, fabricDeserializeReviver);
      await addDeferredBackgrounds(canvas, prepared.deferredBackgrounds);
      ensureWhiteCanvasBackground(canvas);
      deduplicateCanvasObjectsByStableId(canvas);
      captureSacredTemplateTextsOnCanvas(
        canvas,
        `spread-${leftPageIndex ?? '?'}-${rightPageIndex ?? '?'}`,
        spreadLayoutSnapshots,
      );
      await normalizeDesignFieldsOnCanvas(canvas, pageW, pageH);
      hardenCanvasObjectsForIosSafari(canvas);
      await reloadFabricCanvasFonts(canvas);
      finalizeCanvasTextEditingBeforeSave(canvas);
      canvas.renderAll();
      canvas.requestRenderAll();
return;
    } catch (error) {
canvas.clear();
      setFabricCanvasSceneSize(canvas, pageW * 2, pageH);
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
    ...getIosSafariCanvasOptions(),
  });
  const rightTemp = new Canvas(rightTempEl, {
    width: pageW,
    height: pageH,
    backgroundColor: 'white',
    preserveObjectStacking: true,
    ...getIosSafariCanvasOptions(),
  });

  try {
    await Promise.all([
      loadDesignPageScene({ canvas: leftTemp, pageData: leftPage, pageIndex: leftPageIndex, template, pageW, pageH, apiBaseUrl }),
      loadDesignPageScene({ canvas: rightTemp, pageData: rightPage, pageIndex: rightPageIndex, template, pageW, pageH, apiBaseUrl }),
    ]);

    canvas.clear();
    setFabricCanvasSceneSize(canvas, pageW * 2, pageH);
    (canvas as unknown as AnyObj).backgroundColor = 'white';

    for (const obj of [...leftTemp.getObjects()]) {
      try {
        const clone = await obj.clone();
        const beforeL = clone.left;
        clone.set({ left: clone.left ?? 0 });
        // Explicitly carry rotation for rotated template texts (clone may not transfer our _sacred*).
        if (isTemplateTextLayerId((obj as any).id)) {
          const srcAngle = (obj as any).angle ?? 0;
          clone.set({ angle: srcAngle } as any);
          if (typeof (obj as any)._sacredAngle === 'number') {
            (clone as any)._sacredAngle = (obj as any)._sacredAngle;
          }
        }
        hardenFabricObjectForIosSafari(clone);
        canvas.add(clone);
        if (isTemplateTextLayerId((obj as any).id) && isTextPositionDebugEnabled()) {
          console.log(`[TEXT-POS] spread-clone left id=${(obj as any).id} before=${beforeL} after=${clone.left} angle=${clone.angle ?? 0}`);
        }
      } catch (error) {
        if (PUBLIC_EDITOR_DEV) console.warn('[DesignEditorCanvas] skipped left spread object clone', error);
      }
    }

    for (const obj of [...rightTemp.getObjects()]) {
      try {
        const clone = await obj.clone();
        const beforeL = clone.left;
        clone.set({ left: (clone.left ?? 0) + pageW });
        // Explicitly carry rotation for rotated template texts.
        if (isTemplateTextLayerId((obj as any).id)) {
          const srcAngle = (obj as any).angle ?? 0;
          clone.set({ angle: srcAngle } as any);
          if (typeof (obj as any)._sacredAngle === 'number') {
            (clone as any)._sacredAngle = (obj as any)._sacredAngle;
          }
        }
        hardenFabricObjectForIosSafari(clone);
        canvas.add(clone);
        if (isTemplateTextLayerId((obj as any).id) && isTextPositionDebugEnabled()) {
          console.log(`[TEXT-POS] spread-clone right id=${(obj as any).id} before=${beforeL} after=${clone.left} angle=${clone.angle ?? 0}`);
        }
      } catch (error) {
        if (PUBLIC_EDITOR_DEV) console.warn('[DesignEditorCanvas] skipped right spread object clone', error);
      }
    }

    // Capture sacred geometry for text objects on spread fallback path.
    captureSacredTemplateTextsOnCanvas(canvas, `spread-fallback-${leftPageIndex ?? '?'}-${rightPageIndex ?? '?'}`);
  } finally {
    leftTemp.dispose();
    rightTemp.dispose();
  }

  ensureWhiteCanvasBackground(canvas);
  hardenCanvasObjectsForIosSafari(canvas);
  await reloadFabricCanvasFonts(canvas);
  finalizeCanvasTextEditingBeforeSave(canvas);
  canvas.renderAll();
  canvas.requestRenderAll();
}

