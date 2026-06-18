import { FabricImage, Group, type Canvas, type FabricObject } from 'fabric';
import {
  applyPhotoFieldPanToGroup,
  buildFilledPhotoFieldGroup,
  getFabricImageIntrinsicSize,
  refreshFilledPhotoFieldLayoutWhenReady,
  resolvePhotoFieldFitMode,
  resolvePhotoFieldFrameSize,
  wrapLegacyFilledPhotoImage,
} from '../photoFieldFit';
import { syncFilledPhotoFieldSceneAnchor } from '../photoFieldGeometry';
import { isClientAddedPhotoField } from '../designFields';
import { detachFabricObject } from './canvasObjectDetach';
import {
  resolvePhotoFieldFrameSceneTL,
  snapshotPhotoFieldTransformNoPosition,
} from './canvasPhotoFieldFrame';
import type { ResolveImageFileUrl } from './types';
import { asAny } from './canvasUtils';
import { prepareImageFileForCanvasSafeMode } from './photoUploadCanvasSafeMode';

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

    detachFabricObject(canvas, field);

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
      fileSize: canvasFile.size,
      clientAdded: isClientAddedPhotoField(f),
    });
    const groupMeta = asAny(group);
    groupMeta.photoFieldPreviewSrc = stableUrl ?? url;
    groupMeta.photoFieldOriginalSrc = originalUrl ?? stableUrl ?? url;
    groupMeta.photoFieldOriginalName = file.name;
    groupMeta.photoFieldOriginalMime = file.type;
    groupMeta.photoFieldOriginalSize = file.size;

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
  } finally {
    if (!stableUrl) setTimeout(() => URL.revokeObjectURL(url), 750);
  }
}

export { wrapLegacyFilledPhotoImage };
