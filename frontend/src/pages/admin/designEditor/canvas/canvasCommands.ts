import { FabricImage, Group, loadSVGFromString, util, type Canvas, type FabricObject } from 'fabric';
import {
  applyPhotoFieldPanToGroup,
  buildFilledPhotoFieldGroup,
  getFabricImageIntrinsicSize,
  refreshFilledPhotoFieldLayoutWhenReady,
  resolvePhotoFieldFitMode,
  resolvePhotoFieldFrameSize,
  wrapLegacyFilledPhotoImage,
} from '../photoFieldFit';
import { createEmptyPhotoField, finalizeEmptyPhotoFieldPlacement } from '../photoFieldEmpty';
import { resolvePhotoFieldSizeForPage } from '../photoFieldClientSizing';
import { syncFilledPhotoFieldSceneAnchor } from '../photoFieldGeometry';
import { isClientAddedPhotoField } from '../designFields';
import { copyImportStackMetadata } from '../designFields/importStackOrder';
import { detachFabricObject } from './canvasObjectDetach';
import {
  resolvePhotoFieldFrameSceneTL,
  snapshotPhotoFieldTransformNoPosition,
} from './canvasPhotoFieldFrame';
import type { ResolveImageFileUrl } from './types';
import { asAny } from './canvasUtils';
import { prepareImageFileForCanvasSafeMode, prepareImageUrlForCanvasSafeMode } from './photoUploadCanvasSafeMode';

interface FillPhotoFieldImageMeta {
  previewUrl: string;
  originalUrl?: string;
  originalName?: string;
  originalMime?: string;
  originalSize?: number;
}

async function applyImageToPhotoField(
  canvas: Canvas,
  field: FabricObject,
  img: Awaited<ReturnType<typeof FabricImage.fromURL>>,
  meta: FillPhotoFieldImageMeta,
  afterFill?: () => void,
): Promise<void> {
  const f = field as unknown as Record<string, unknown>;
  const rawId = f.id;
  const idCandidate =
    rawId != null && String(rawId).trim() !== '' ? String(rawId) : undefined;
  const { fw, fh } = resolvePhotoFieldFrameSize(field);
  const fitMode = resolvePhotoFieldFitMode(f);
  const panX = Number(f.photoFieldPanX ?? 0);
  const panY = Number(f.photoFieldPanY ?? 0);
  const zoom = Number(f.photoFieldZoom ?? 1);

  const anchorSceneTL = resolvePhotoFieldFrameSceneTL(field);
  const placementSnap = snapshotPhotoFieldTransformNoPosition(field, { bakeScaleIntoFrame: true });

  const parent = field.group;
  const stackIndex =
    parent != null ? parent.getObjects().indexOf(field) : -1;
  const canvasStackIndex =
    parent == null ? canvas.getObjects().indexOf(field) : -1;

  // Сначала собираем новую группу — detach только после успеха, иначе поле «пропадёт».
  const { iw, ih } = getFabricImageIntrinsicSize(img);
  const group = buildFilledPhotoFieldGroup({
    left: 0,
    top: 0,
    frameW: fw,
    frameH: fh,
    intrinsicW: iw,
    intrinsicH: ih,
    image: img,
    id: idCandidate ?? `field-${Date.now()}`,
    panX,
    panY,
    zoom,
    fitMode,
    fileSize: meta.originalSize,
    clientAdded: isClientAddedPhotoField(f),
  });
  copyImportStackMetadata(field, group);
  const groupMeta = asAny(group);
  groupMeta.photoFieldPreviewSrc = meta.previewUrl;
  groupMeta.photoFieldOriginalSrc = meta.originalUrl ?? meta.previewUrl;
  groupMeta.photoFieldOriginalName = meta.originalName;
  groupMeta.photoFieldOriginalMime = meta.originalMime;
  groupMeta.photoFieldOriginalSize = meta.originalSize;

  const reattachOriginalField = (): void => {
    if (parent != null && stackIndex >= 0) {
      parent.insertAt(stackIndex, field);
      parent.set({ dirty: true });
      parent.setCoords();
    } else if (parent != null) {
      parent.add(field);
      parent.set({ dirty: true });
      parent.setCoords();
    } else if (canvasStackIndex >= 0) {
      canvas.insertAt(canvasStackIndex, field);
    } else {
      canvas.add(field);
    }
  };

  try {
    detachFabricObject(canvas, field);

    if (parent != null && stackIndex >= 0) {
      parent.insertAt(stackIndex, group);
      parent.set({ dirty: true });
      parent.setCoords();
    } else if (parent != null) {
      parent.add(group);
      parent.set({ dirty: true });
      parent.setCoords();
    } else if (canvasStackIndex >= 0) {
      canvas.insertAt(canvasStackIndex, group);
    } else {
      canvas.add(group);
    }
  } catch (err) {
    try {
      reattachOriginalField();
    } catch {
      /* best-effort restore */
    }
    canvas.requestRenderAll();
    throw err;
  }

  const syncPlacement = (): void => {
    group.set(placementSnap as Parameters<typeof group.set>[0]);
    group.setXY(anchorSceneTL, 'left', 'top');
    group.setCoords();
    syncFilledPhotoFieldSceneAnchor(group, anchorSceneTL);
    applyPhotoFieldPanToGroup(group, panX, panY, zoom);
    parent?.setCoords();
    canvas.requestRenderAll();
  };
  syncPlacement();
  queueMicrotask(syncPlacement);
  requestAnimationFrame(syncPlacement);
  void refreshFilledPhotoFieldLayoutWhenReady(group).then(() => {
    syncFilledPhotoFieldSceneAnchor(group, anchorSceneTL);
    parent?.setCoords();
    canvas.requestRenderAll();
  });
  canvas.setActiveObject(group);
  afterFill?.();
}

async function resolveCanvasAndOriginalImageUrls(
  file: File,
  resolveImageFileUrl?: ResolveImageFileUrl,
  onUploadProgress?: (progress: number) => void,
): Promise<{
  canvasFile: File;
  previewUrl: string | null;
  originalUrl: string | null;
}> {
  const canvasFile = await prepareImageFileForCanvasSafeMode(file);
  const shouldUploadOriginal = canvasFile !== file && !!resolveImageFileUrl;
  const originalUrl = shouldUploadOriginal
    ? await resolveImageFileUrl(file)
    : null;
  const previewUrl = await resolveImageFileUrl?.(canvasFile, onUploadProgress) ?? null;
  return {
    canvasFile,
    previewUrl,
    originalUrl: originalUrl ?? previewUrl,
  };
}

export async function addImageFileToCanvas(
  canvas: Canvas,
  file: File,
  resolveImageFileUrl?: ResolveImageFileUrl,
): Promise<void> {
  const canvasFile = await prepareImageFileForCanvasSafeMode(file);
  const stableUrl = await resolveImageFileUrl?.(canvasFile);
  const url = stableUrl || URL.createObjectURL(canvasFile);
  try {
    const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
    const maxW = canvas.width! * 0.6;
    const maxH = canvas.height! * 0.6;
    const scale = Math.min(
      img.width! > maxW ? maxW / img.width! : 1,
      img.height! > maxH ? maxH / img.height! : 1,
    );
    img.set({
      left: canvas.width! / 2 - (img.width! * scale) / 2,
      top: canvas.height! / 2 - (img.height! * scale) / 2,
      scaleX: scale,
      scaleY: scale,
    });
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
  } finally {
    if (!stableUrl) {
      setTimeout(() => URL.revokeObjectURL(url), 750);
    }
  }
}

export async function addImageUrlToCanvas(canvas: Canvas, url: string): Promise<void> {
  const prepared = await prepareImageUrlForCanvasSafeMode(url);
  try {
    const img = await FabricImage.fromURL(prepared.canvasUrl, { crossOrigin: 'anonymous' });
    const maxW = canvas.width! * 0.6;
    const maxH = canvas.height! * 0.6;
    const scale = Math.min(
      img.width! > maxW ? maxW / img.width! : 1,
      img.height! > maxH ? maxH / img.height! : 1,
    );
    img.set({
      left: canvas.width! / 2 - (img.width! * scale) / 2,
      top: canvas.height! / 2 - (img.height! * scale) / 2,
      scaleX: scale,
      scaleY: scale,
    });
    canvas.add(img);
    canvas.setActiveObject(img);
    canvas.requestRenderAll();
  } finally {
    if (prepared.revokeUrl) {
      setTimeout(() => URL.revokeObjectURL(prepared.revokeUrl!), 750);
    }
  }
}

export type DesignAssetInsert = {
  id: number;
  url: string;
  format: string;
  label?: string;
};

function removeLibraryBackgrounds(canvas: Canvas): void {
  for (const object of [...canvas.getObjects()]) {
    const id = String((object as FabricObject & { id?: string }).id || '');
    if (id.startsWith('decor_background_')) canvas.remove(object);
  }
}

function markDesignAssetObject(
  object: FabricObject,
  asset: { id?: number; label?: string; asBackground?: boolean },
): void {
  const prefix = asset.asBackground ? 'decor_background' : 'decor_clipart';
  object.set({
    isDecorElement: true,
    id: asset.id ? `${prefix}_${asset.id}_${Date.now().toString(36)}` : `${prefix}_${Date.now()}`,
    souvenirLayerName: asset.label || (asset.asBackground ? 'Фон' : 'Клипарт'),
  });
}

export async function addSvgUrlToCanvas(
  canvas: Canvas,
  url: string,
  options?: { assetId?: number; label?: string; asBackground?: boolean },
): Promise<FabricObject> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Не удалось загрузить SVG');
  const svgText = await response.text();
  if (!/<svg[\s>]/i.test(svgText)) throw new Error('Файл не похож на SVG');
  const parsed = await loadSVGFromString(svgText);
  const objects = parsed.objects.filter((object): object is FabricObject => object != null);
  if (!objects.length) throw new Error('SVG пустой');
  const group = util.groupSVGElements(objects, parsed.options);
  const maxW = Math.max(1, Number(canvas.width) * (options?.asBackground ? 1 : 0.6));
  const maxH = Math.max(1, Number(canvas.height) * (options?.asBackground ? 1 : 0.6));
  const width = Math.max(1, Number(group.width || maxW));
  const height = Math.max(1, Number(group.height || maxH));
  const scale = options?.asBackground
    ? Math.max(maxW / width, maxH / height)
    : Math.min(maxW / width, maxH / height, 1);
  group.set({
    left: Number(canvas.width) / 2,
    top: Number(canvas.height) / 2,
    originX: 'center',
    originY: 'center',
    scaleX: scale,
    scaleY: scale,
  });
  markDesignAssetObject(group, {
    id: options?.assetId,
    label: options?.label,
    asBackground: options?.asBackground,
  });
  if (options?.asBackground) removeLibraryBackgrounds(canvas);
  canvas.add(group);
  if (options?.asBackground) canvas.sendObjectToBack(group);
  canvas.setActiveObject(group);
  canvas.requestRenderAll();
  return group;
}

export async function addDesignAssetToCanvas(
  canvas: Canvas,
  asset: DesignAssetInsert,
  options?: { asBackground?: boolean },
): Promise<void> {
  const label = asset.label || (options?.asBackground ? 'Фон' : 'Клипарт');
  if (asset.format === 'svg') {
    await addSvgUrlToCanvas(canvas, asset.url, {
      assetId: asset.id,
      label,
      asBackground: options?.asBackground,
    });
    return;
  }
  if (options?.asBackground) removeLibraryBackgrounds(canvas);
  await addImageUrlToCanvas(canvas, asset.url);
  const object = canvas.getActiveObject();
  if (!object) return;
  markDesignAssetObject(object, { id: asset.id, label, asBackground: options?.asBackground });
  if (options?.asBackground) {
    const maxW = Math.max(1, Number(canvas.width));
    const maxH = Math.max(1, Number(canvas.height));
    const width = Math.max(1, Number(object.width || maxW));
    const height = Math.max(1, Number(object.height || maxH));
    const scale = Math.max(maxW / width, maxH / height);
    object.set({
      left: maxW / 2,
      top: maxH / 2,
      originX: 'center',
      originY: 'center',
      scaleX: scale,
      scaleY: scale,
    });
    canvas.sendObjectToBack(object);
  }
  canvas.requestRenderAll();
}

export type AddClientPhotoFieldToCanvasInput = {
  pageWidthPx: number;
  pageHeightPx: number;
  safeZonePx: number;
  pageSafeLeft: number;
  url?: string;
  file?: File;
  originalName?: string;
  resolveImageFileUrl?: ResolveImageFileUrl;
  fieldId?: string;
};

/** Клиентское фото-поле из библиотеки (movable в basic, стабильный id при save). */
export async function addClientPhotoFieldToCanvas(
  canvas: Canvas,
  input: AddClientPhotoFieldToCanvasInput,
): Promise<FabricObject> {
  let previewUrl = '';
  let originalUrl = '';
  let originalName = input.originalName;
  let originalMime: string | undefined;
  let originalSize: number | undefined;
  let img: Awaited<ReturnType<typeof FabricImage.fromURL>>;
  let revokePreviewUrl: string | null = null;

  if (input.file) {
    const resolved = await resolveCanvasAndOriginalImageUrls(
      input.file,
      input.resolveImageFileUrl,
    );
    previewUrl = resolved.previewUrl ?? '';
    if (!previewUrl) {
      revokePreviewUrl = URL.createObjectURL(resolved.canvasFile);
      previewUrl = revokePreviewUrl;
    }
    originalUrl = resolved.originalUrl ?? previewUrl;
    originalMime = input.file.type;
    originalSize = input.file.size;
    originalName = originalName ?? input.file.name;
    img = await FabricImage.fromURL(previewUrl, { crossOrigin: 'anonymous' });
  } else if (input.url) {
    originalUrl = input.url;
    const prepared = await prepareImageUrlForCanvasSafeMode(input.url);
    previewUrl = prepared.canvasUrl;
    if (prepared.revokeUrl) revokePreviewUrl = prepared.revokeUrl;
    img = await FabricImage.fromURL(previewUrl, { crossOrigin: 'anonymous' });
  } else {
    throw new Error('addClientPhotoFieldToCanvas: url or file required');
  }

  try {
    const { iw, ih } = getFabricImageIntrinsicSize(img);
    const { width, height } = resolvePhotoFieldSizeForPage({
      aspectW: iw,
      aspectH: ih,
      pageWidthPx: input.pageWidthPx,
      pageHeightPx: input.pageHeightPx,
      safeZonePx: input.safeZonePx,
    });
    const safeLeft = input.pageSafeLeft + input.safeZonePx;
    const safeTop = input.safeZonePx;
    const safeWidth = Math.max(1, input.pageWidthPx - input.safeZonePx * 2);
    const safeHeight = Math.max(1, input.pageHeightPx - input.safeZonePx * 2);
    const fieldId = input.fieldId ?? `field-${Date.now()}`;
    const fieldLeft = safeLeft + (safeWidth - width) / 2;
    const fieldTop = safeTop + (safeHeight - height) / 2;

    const field = createEmptyPhotoField({
      id: fieldId,
      left: fieldLeft,
      top: fieldTop,
      width,
      height,
      clientAdded: true,
    });
    canvas.add(field);
    finalizeEmptyPhotoFieldPlacement(field as Group, { x: fieldLeft, y: fieldTop });
    await applyImageToPhotoField(canvas, field, img, {
      previewUrl,
      originalUrl,
      originalName,
      originalMime,
      originalSize,
    });
    return canvas.getActiveObject() ?? field;
  } finally {
    if (revokePreviewUrl) {
      setTimeout(() => URL.revokeObjectURL(revokePreviewUrl!), 750);
    }
  }
}

function hashOrphanImageKey(src: string, left: number, top: number, width: number, height: number): string {
  const raw = `${src}|${Math.round(left)}|${Math.round(top)}|${Math.round(width)}|${Math.round(height)}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/** Старые «голые» image с библиотеки → клиентское фото-поле (id + movable + без дублей). */
export async function wrapOrphanLibraryImageAsClientPhotoField(
  canvas: Canvas,
  img: FabricImage,
): Promise<Group | null> {
  const o = asAny(img);
  if (img.type !== 'image' || o.isBackground === true || o.isPhotoField === true) return null;

  const br = img.getBoundingRect();
  const fw = Math.max(32, Math.round(br.width));
  const fh = Math.max(32, Math.round(br.height));
  const el = img.getElement() as HTMLImageElement | undefined;
  const src = typeof el?.src === 'string' && el.src.length ? el.src : (img.getSrc?.() ?? '');
  if (!src) return null;

  const preservedId = typeof o.id === 'string' && String(o.id).trim() ? String(o.id).trim() : undefined;
  const id = preservedId ?? `field-lib-${hashOrphanImageKey(src, br.left, br.top, fw, fh)}`;
  const canvasStackIndex = canvas.getObjects().indexOf(img);
  const fresh = await FabricImage.fromURL(src, { crossOrigin: 'anonymous' });
  canvas.remove(img);

  const { iw, ih } = getFabricImageIntrinsicSize(fresh);
  const group = buildFilledPhotoFieldGroup({
    left: br.left,
    top: br.top,
    frameW: fw,
    frameH: fh,
    intrinsicW: iw,
    intrinsicH: ih,
    image: fresh,
    id,
    fitMode: 'cover',
    clientAdded: true,
  });
  const groupMeta = asAny(group);
  groupMeta.photoFieldPreviewSrc = src;
  groupMeta.photoFieldOriginalSrc = src;

  if (canvasStackIndex >= 0) {
    canvas.insertAt(canvasStackIndex, group);
  } else {
    canvas.add(group);
  }
  group.setCoords();
  return group;
}

export async function upgradeOrphanLibraryImagesOnCanvas(canvas: Canvas): Promise<number> {
  const orphans = canvas.getObjects().filter((obj) => {
    const meta = asAny(obj);
    return obj.type === 'image' && meta.isBackground !== true && meta.isPhotoField !== true;
  });
  let upgraded = 0;
  for (const obj of orphans) {
    const wrapped = await wrapOrphanLibraryImageAsClientPhotoField(canvas, obj as FabricImage);
    if (wrapped) upgraded += 1;
  }
  return upgraded;
}

/** Заполняет поле для фото: cover/contain в рамке. */
export async function fillPhotoField(
  canvas: Canvas,
  field: FabricObject,
  file: File,
  resolveImageFileUrl?: ResolveImageFileUrl,
  afterFill?: () => void,
  onUploadProgress?: (progress: number) => void,
): Promise<void> {
  const {
    canvasFile,
    previewUrl: stableUrl,
    originalUrl,
  } = await resolveCanvasAndOriginalImageUrls(file, resolveImageFileUrl, onUploadProgress);
  const url = stableUrl || URL.createObjectURL(canvasFile);
  try {
    const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
    await applyImageToPhotoField(
      canvas,
      field,
      img,
      {
        previewUrl: stableUrl ?? url,
        originalUrl: originalUrl ?? stableUrl ?? url,
        originalName: file.name,
        originalMime: file.type,
        originalSize: file.size,
      },
      afterFill,
    );
  } finally {
    if (!stableUrl) setTimeout(() => URL.revokeObjectURL(url), 750);
  }
}

/** Заполняет поле готовым URL из draft без повторной загрузки на сервер. */
export async function fillPhotoFieldFromStableUrl(
  canvas: Canvas,
  field: FabricObject,
  url: string,
  originalName?: string,
  afterFill?: () => void,
  options?: { originalUrl?: string },
): Promise<void> {
  const originalUrl = (options?.originalUrl ?? url).trim() || url;
  const prepared = await prepareImageUrlForCanvasSafeMode(url);
  try {
    const img = await FabricImage.fromURL(prepared.canvasUrl, { crossOrigin: 'anonymous' });
    await applyImageToPhotoField(
      canvas,
      field,
      img,
      {
        // Persist stable URLs only — canvasUrl may be ephemeral blob: on mobile safe-mode.
        previewUrl: url,
        originalUrl,
        originalName,
      },
      afterFill,
    );
  } finally {
    if (prepared.revokeUrl) {
      setTimeout(() => URL.revokeObjectURL(prepared.revokeUrl!), 750);
    }
  }
}

export { wrapLegacyFilledPhotoImage };