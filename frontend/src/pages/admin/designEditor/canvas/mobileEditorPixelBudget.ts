import type { Canvas } from 'fabric';
import { isIosSafariCanvasSafeMode } from './iosSafariCanvasSafeMode';

type AnyObj = Record<string, unknown>;

function asAny(value: unknown): AnyObj {
  return value as AnyObj;
}

/**
 * Длинная сторона Fabric backstore на mobile — edit budget, не print.
 * Объекты остаются в scene-координатах через setZoom(editScale).
 * CSS fit обязан считаться от DISPLAY (scene×editScale), иначе dual-scale.
 */
export const MOBILE_EDITOR_MAX_CANVAS_SIDE = 1440;

/** Фото на canvas: edit-preview, original остаётся в photoFieldOriginalSrc. */
export const MOBILE_EDITOR_MAX_PHOTO_SIDE = 1280;
export const MOBILE_EDITOR_MAX_PHOTO_PIXELS = 1_600_000;
export const MOBILE_EDITOR_JPEG_QUALITY = 0.82;

export function resolveMobileEditorEditScale(sceneWidthPx: number, sceneHeightPx: number): number {
  if (!isIosSafariCanvasSafeMode()) return 1;
  const maxSide = Math.max(1, sceneWidthPx, sceneHeightPx);
  if (maxSide <= MOBILE_EDITOR_MAX_CANVAS_SIDE) return 1;
  return MOBILE_EDITOR_MAX_CANVAS_SIDE / maxSide;
}

export function resolveMobileEditorLayoutSize(
  sceneWidthPx: number,
  sceneHeightPx: number,
): { width: number; height: number; editScale: number } {
  const editScale = resolveMobileEditorEditScale(sceneWidthPx, sceneHeightPx);
  return {
    width: Math.max(1, Math.round(sceneWidthPx * editScale)),
    height: Math.max(1, Math.round(sceneHeightPx * editScale)),
    editScale,
  };
}

/**
 * Backstore ≈ screen budget; left/top/width объектов — scene coords (setZoom).
 * sceneWidth/Height = фактический холст (для spread уже 2×pageW).
 */
export function setFabricCanvasSceneSize(
  canvas: Canvas,
  sceneWidthPx: number,
  sceneHeightPx: number,
): number {
  const sceneW = Math.max(1, Math.round(sceneWidthPx));
  const sceneH = Math.max(1, Math.round(sceneHeightPx));
  const editScale = resolveMobileEditorEditScale(sceneW, sceneH);
  const width = Math.max(1, Math.round(sceneW * editScale));
  const height = Math.max(1, Math.round(sceneH * editScale));

  canvas.setDimensions({ width, height });
  canvas.setZoom(editScale);

  const meta = asAny(canvas);
  meta._mobileEditorEditScale = editScale;
  meta._mobileEditorSceneWidth = sceneW;
  meta._mobileEditorSceneHeight = sceneH;

  try {
    canvas.calcOffset();
  } catch {
    /* noop */
  }

  return editScale;
}

export function getFabricCanvasEditScale(canvas: Canvas | null | undefined): number {
  if (!canvas) return 1;
  const scale = Number(asAny(canvas)._mobileEditorEditScale);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/**
 * Zoom-фактор для размера маркеров выделения.
 * Mobile editScale уже в Fabric viewport — controls рисуются в display px,
 * повторно делить cornerSize на editScale нельзя (маркеры становятся огромными).
 * Возвращает getZoom()/editScale (обычно 1).
 */
export function resolveSelectionChromeZoom(canvas: Canvas | null | undefined): number {
  if (!canvas) return 1;
  const zoom = Number(canvas.getZoom?.() ?? 1);
  const edit = getFabricCanvasEditScale(canvas);
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const safeEdit = Number.isFinite(edit) && edit > 0 ? edit : 1;
  return Math.max(0.1, Math.min(10, safeZoom / safeEdit));
}

/** Восстановить edit zoom после чужого setZoom(1). */
export function restoreFabricCanvasEditZoom(canvas: Canvas): number {
  const sceneW = Number(asAny(canvas)._mobileEditorSceneWidth);
  const sceneH = Number(asAny(canvas)._mobileEditorSceneHeight);
  if (Number.isFinite(sceneW) && sceneW > 0 && Number.isFinite(sceneH) && sceneH > 0) {
    return setFabricCanvasSceneSize(canvas, sceneW, sceneH);
  }
  const scale = getFabricCanvasEditScale(canvas);
  canvas.setZoom(scale);
  return scale;
}
