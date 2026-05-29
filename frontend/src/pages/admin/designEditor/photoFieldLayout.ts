/** Расчёт вписывания изображения в рамку поля без искажений (cover / contain). */

export interface PhotoFitLayout {
  scale: number;
  displayW: number;
  displayH: number;
  baseLeft: number;
  baseTop: number;
}

export type PhotoFieldFitMode = 'cover' | 'contain';

export function computeCoverLayout(
  frameW: number,
  frameH: number,
  intrinsicW: number,
  intrinsicH: number,
): PhotoFitLayout {
  const iw = Math.max(1, intrinsicW);
  const ih = Math.max(1, intrinsicH);
  const scale = Math.max(frameW / iw, frameH / ih);
  const displayW = iw * scale;
  const displayH = ih * scale;
  return {
    scale,
    displayW,
    displayH,
    baseLeft: (frameW - displayW) / 2,
    baseTop: (frameH - displayH) / 2,
  };
}

/** Весь кадр виден внутри рамки; при разном соотношении остаются «поля» по краям рамки. */
export function computeContainLayout(
  frameW: number,
  frameH: number,
  intrinsicW: number,
  intrinsicH: number,
): PhotoFitLayout {
  const iw = Math.max(1, intrinsicW);
  const ih = Math.max(1, intrinsicH);
  const scale = Math.min(frameW / iw, frameH / ih);
  const displayW = iw * scale;
  const displayH = ih * scale;
  return {
    scale,
    displayW,
    displayH,
    baseLeft: (frameW - displayW) / 2,
    baseTop: (frameH - displayH) / 2,
  };
}

export function computePhotoFieldLayout(
  mode: PhotoFieldFitMode,
  frameW: number,
  frameH: number,
  intrinsicW: number,
  intrinsicH: number,
): PhotoFitLayout {
  return mode === 'contain'
    ? computeContainLayout(frameW, frameH, intrinsicW, intrinsicH)
    : computeCoverLayout(frameW, frameH, intrinsicW, intrinsicH);
}

export const PHOTO_FIELD_ZOOM_MIN = 1;
export const PHOTO_FIELD_ZOOM_MAX = 6;

export function normalizePhotoFieldZoom(value: unknown): number {
  const zoom = Number(value ?? 1);
  return Number.isFinite(zoom)
    ? Math.max(PHOTO_FIELD_ZOOM_MIN, Math.min(PHOTO_FIELD_ZOOM_MAX, zoom))
    : 1;
}

export function zoomPhotoFieldLayout(layout: PhotoFitLayout, zoom: number): PhotoFitLayout {
  const safeZoom = normalizePhotoFieldZoom(zoom);
  return {
    scale: layout.scale * safeZoom,
    displayW: layout.displayW * safeZoom,
    displayH: layout.displayH * safeZoom,
    baseLeft: layout.baseLeft - ((layout.displayW * safeZoom) - layout.displayW) / 2,
    baseTop: layout.baseTop - ((layout.displayH * safeZoom) - layout.displayH) / 2,
  };
}

/** Фрагмент исходного bitmap, видимый в рамке поля (как в модалке «Настроить кадр»). */
export interface PhotoFieldCropSource {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function computePhotoFieldCropSource(
  frameW: number,
  frameH: number,
  intrinsicW: number,
  intrinsicH: number,
  layout: PhotoFitLayout,
  panX: number,
  panY: number,
  mode: PhotoFieldFitMode,
): PhotoFieldCropSource {
  if (mode === 'contain') {
    return { x: 0, y: 0, w: intrinsicW, h: intrinsicH };
  }
  const imageLeft = layout.baseLeft + panX;
  const imageTop = layout.baseTop + panY;
  const sourceX = Math.max(0, Math.min(intrinsicW, -imageLeft / layout.scale));
  const sourceY = Math.max(0, Math.min(intrinsicH, -imageTop / layout.scale));
  return {
    x: sourceX,
    y: sourceY,
    w: Math.max(1, Math.min(intrinsicW - sourceX, frameW / layout.scale)),
    h: Math.max(1, Math.min(intrinsicH - sourceY, frameH / layout.scale)),
  };
}

/** Подбирает pan/zoom, чтобы в новой рамке остался тот же фрагмент исходника. */
export function resolvePanZoomFromPhotoFieldCropSource(
  frameW: number,
  frameH: number,
  intrinsicW: number,
  intrinsicH: number,
  mode: PhotoFieldFitMode,
  crop: PhotoFieldCropSource,
): { panX: number; panY: number; zoom: number } {
  if (mode === 'contain') {
    return { panX: 0, panY: 0, zoom: PHOTO_FIELD_ZOOM_MIN };
  }
  const iw = Math.max(1, intrinsicW);
  const ih = Math.max(1, intrinsicH);
  const baseLayout = computePhotoFieldLayout(mode, frameW, frameH, iw, ih);
  const zoom = normalizePhotoFieldZoom(frameW / (Math.max(1, crop.w) * baseLayout.scale));
  const layout = zoomPhotoFieldLayout(baseLayout, zoom);
  const panX = -(crop.x * layout.scale) - layout.baseLeft;
  const panY = -(crop.y * layout.scale) - layout.baseTop;
  const clamped = clampPhotoFieldPan(frameW, frameH, layout, panX, panY, mode);
  return { panX: clamped.panX, panY: clamped.panY, zoom };
}

export function clampPhotoFieldPan(
  frameW: number,
  frameH: number,
  layout: PhotoFitLayout,
  panX: number,
  panY: number,
  mode: PhotoFieldFitMode,
): { panX: number; panY: number } {
  if (mode === 'contain') {
    const maxPX = Math.max(0, (frameW - layout.displayW) / 2);
    const maxPY = Math.max(0, (frameH - layout.displayH) / 2);
    return {
      panX: Math.min(maxPX, Math.max(-maxPX, panX)),
      panY: Math.min(maxPY, Math.max(-maxPY, panY)),
    };
  }
  const maxPX = Math.max(0, (layout.displayW - frameW) / 2);
  const maxPY = Math.max(0, (layout.displayH - frameH) / 2);
  return {
    panX: Math.min(maxPX, Math.max(-maxPX, panX)),
    panY: Math.min(maxPY, Math.max(-maxPY, panY)),
  };
}
