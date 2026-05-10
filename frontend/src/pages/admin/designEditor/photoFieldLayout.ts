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
