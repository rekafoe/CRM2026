import { MM_TO_PX } from './constants';

export type DesignSceneGeometry = {
  pageWidthPx: number;
  pageHeightPx: number;
  safeZonePx: number;
  bleedPx: number;
}

function mmToPx(mm: number, scale = 1): number {
  return Math.round(mm * MM_TO_PX * scale);
}

export function createDesignSceneGeometry(input: {
  pageWidthMm: number;
  pageHeightMm: number;
  safeZoneMm: number;
  bleedMm: number;
  scale?: number;
}): DesignSceneGeometry {
  const scale = input.scale ?? 1;
  return {
    pageWidthPx: mmToPx(input.pageWidthMm, scale),
    pageHeightPx: mmToPx(input.pageHeightMm, scale),
    safeZonePx: input.safeZoneMm * MM_TO_PX * scale,
    bleedPx: input.bleedMm * MM_TO_PX * scale,
  };
}
