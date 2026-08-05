/**
 * Расход рулона для биллинга per_m2 и склада roll_feed:
 * billedM2 = ширина_рулона × длина_подачи (из раскладки).
 * Без ширины рулона — fallback на площадь изделия × тираж.
 */

import { computeOptimizedRollFeedMeters, type PlotterMargins } from './plotterLayout';

export type RollConsumedAreaInput = {
  rollWidthMm?: number | null;
  trimMm: { width: number; height: number };
  bleedMm?: number;
  quantity: number;
  margins?: Partial<PlotterMargins> | null;
};

export type RollConsumedAreaResult = {
  /** м² для биллинга (цена × billedM2) */
  billedM2: number;
  /** пог. м подачи для склада */
  feedMeters: number;
  /** true, если использована раскладка по ширине рулона */
  usedRollLayout: boolean;
};

function trimAreaM2(trimMm: { width: number; height: number }, quantity: number): number {
  const w = Math.max(0, Number(trimMm.width) || 0);
  const h = Math.max(0, Number(trimMm.height) || 0);
  const q = Math.max(0, Number(quantity) || 0);
  return (w * h) / 1_000_000 * q;
}

function simpleFeedMeters(trimMm: { width: number; height: number }, quantity: number): number {
  const w = Math.max(0, Number(trimMm.width) || 0);
  const h = Math.max(0, Number(trimMm.height) || 0);
  const q = Math.max(0, Number(quantity) || 0);
  // Без рулона: подача ≈ большая сторона × тираж (как грубый fallback)
  return (Math.max(w, h) / 1000) * q;
}

/**
 * Считает израсходованные м² рулона и погонные метры подачи.
 */
export function resolveRollConsumedArea(input: RollConsumedAreaInput): RollConsumedAreaResult {
  const quantity = Math.max(1, Math.floor(Number(input.quantity) || 0));
  const rollWidthMm = Number(input.rollWidthMm);
  const hasRollWidth = Number.isFinite(rollWidthMm) && rollWidthMm > 0;

  if (hasRollWidth) {
    const layout = computeOptimizedRollFeedMeters({
      rollWidthMm,
      trimMm: input.trimMm,
      bleedMm: Math.max(0, Number(input.bleedMm) || 0),
      quantity,
      margins: {
        edgeMm: Math.max(0, Number(input.margins?.edgeMm) || 0),
        gapMm: Math.max(0, Number(input.margins?.gapMm) || 0),
      },
    });
    if (layout && Number.isFinite(layout.totalAreaM2) && layout.totalAreaM2 > 0) {
      return {
        billedM2: layout.totalAreaM2,
        feedMeters: Math.max(0, layout.feedMeters),
        usedRollLayout: true,
      };
    }
  }

  return {
    billedM2: trimAreaM2(input.trimMm, quantity),
    feedMeters: simpleFeedMeters(input.trimMm, quantity),
    usedRollLayout: false,
  };
}
