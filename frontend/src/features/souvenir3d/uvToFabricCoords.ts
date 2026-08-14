import type { PrintAreaUvRect } from './types';

export type FabricPoint = { x: number; y: number };
export type UvPoint = { u: number; v: number };

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

function normalizeUv(uv: UvPoint, rect?: PrintAreaUvRect): UvPoint {
  if (!rect) return { u: clamp01(uv.u), v: clamp01(uv.v) };
  const width = rect.u1 - rect.u0;
  const height = rect.v1 - rect.v0;
  return {
    u: clamp01(width === 0 ? 0 : (uv.u - rect.u0) / width),
    v: clamp01(height === 0 ? 0 : (uv.v - rect.v0) / height),
  };
}

/**
 * Three.js UV начинается снизу, Fabric — сверху, поэтому ось Y инвертируется.
 */
export function uvToFabricCoords(
  uv: UvPoint,
  width: number,
  height: number,
  rect?: PrintAreaUvRect,
): FabricPoint {
  const normalized = normalizeUv(uv, rect);
  return {
    x: normalized.u * Math.max(1, width),
    y: (1 - normalized.v) * Math.max(1, height),
  };
}

export function fabricToUvCoords(
  point: FabricPoint,
  width: number,
  height: number,
  rect?: PrintAreaUvRect,
): UvPoint {
  const u = clamp01(point.x / Math.max(1, width));
  const v = 1 - clamp01(point.y / Math.max(1, height));
  if (!rect) return { u, v };
  return {
    u: rect.u0 + u * (rect.u1 - rect.u0),
    v: rect.v0 + v * (rect.v1 - rect.v0),
  };
}
