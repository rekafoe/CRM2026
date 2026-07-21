/**
 * Резкость превью: при CSS fitZoom > 1 (визитки и мелкие форматы)
 * поднимаем плотность Fabric backstore через getRetinaScaling,
 * не меняя scene-координаты и getZoom().
 */
import type { Canvas } from 'fabric';
import { isIosSafariCanvasSafeMode } from './iosSafariCanvasSafeMode';

type AnyObj = Record<string, unknown>;

function asAny(value: unknown): AnyObj {
  return value as AnyObj;
}

/** Верхний множитель сверх devicePixelRatio (совпадает с max CSS fit). */
export const EDITOR_MAX_DISPLAY_BOOST = 3;

/** Лимит длинной стороны backstore (logical × dpr × boost). */
export const EDITOR_MAX_BACKSTORE_SIDE = 4096;

/**
 * Насколько нужно «доуплотнить» bitmap, если CSS собирается увеличить сцену.
 * На iOS Safari safe-mode не трогаем (память).
 */
export function resolveEditorDisplayBoost(
  sceneWidthPx: number,
  sceneHeightPx: number,
  fitZoom: number,
): number {
  if (isIosSafariCanvasSafeMode()) return 1;
  if (!(Number.isFinite(fitZoom) && fitZoom > 1.02)) return 1;

  let boost = Math.min(fitZoom, EDITOR_MAX_DISPLAY_BOOST);
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
  const maxSceneSide = Math.max(1, sceneWidthPx, sceneHeightPx);
  const projected = maxSceneSide * dpr * boost;
  if (projected > EDITOR_MAX_BACKSTORE_SIDE) {
    boost = EDITOR_MAX_BACKSTORE_SIDE / (maxSceneSide * dpr);
  }
  return Math.max(1, Math.round(boost * 1000) / 1000);
}

function devicePixelRatioSafe(): number {
  return typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
}

/**
 * Патчит getRetinaScaling и пересобирает backstore под текущий boost.
 * Идемпотентно при том же boost.
 */
export function applyEditorDisplayBoost(canvas: Canvas, boost: number): void {
  const next = Number.isFinite(boost) && boost > 0 ? boost : 1;
  const meta = asAny(canvas);
  const prev = Number(meta._editorDisplayBoost);
  const sameBoost = Number.isFinite(prev) && Math.abs(prev - next) < 0.01;

  if (!meta._editorDisplayBoostPatched) {
    meta._editorDisplayBoostPatched = true;
    canvas.getRetinaScaling = function patchedGetRetinaScaling(this: Canvas) {
      const base = this.enableRetinaScaling ? devicePixelRatioSafe() : 1;
      const b = Number(asAny(this)._editorDisplayBoost);
      const safeBoost = Number.isFinite(b) && b > 0 ? b : 1;
      return base * Math.max(1, safeBoost);
    };
  }

  meta._editorDisplayBoost = next;
  if (sameBoost) return;

  const width = canvas.getWidth();
  const height = canvas.getHeight();
  if (!(width > 0) || !(height > 0)) return;
  canvas.setDimensions({ width, height });
  canvas.requestRenderAll();
}
