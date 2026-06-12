import { MM_TO_PX } from '../constants';
import type { DesignState } from '../types';

type AnyObj = Record<string, unknown>;

function measurePageContentExtent(objects: unknown[]): { maxW: number; maxH: number } {
  let maxW = 0;
  let maxH = 0;
  for (const raw of objects) {
    const o = raw as AnyObj;
    if (o.isBackground) continue;
    const left = Number(o.left ?? 0);
    const top = Number(o.top ?? 0);
    let w = Math.abs(Number(o.width ?? 0) * Number(o.scaleX ?? 1));
    let h = Math.abs(Number(o.height ?? 0) * Number(o.scaleY ?? 1));
    if (o.isPhotoField) {
      const pW = Number(o.photoFieldFw);
      const pH = Number(o.photoFieldFh);
      if (Number.isFinite(pW) && pW > 0) w = pW;
      if (Number.isFinite(pH) && pH > 0) h = pH;
    }
    maxW = Math.max(maxW, left + w);
    maxH = Math.max(maxH, top + h);
  }
  return { maxW, maxH };
}

/** По размерам объектов в JSON подобрать sceneScale относительно pageWidth/pageHeight в мм. */
export function inferSceneScaleFromPageExtents(
  designState: Pick<DesignState, 'pageWidth' | 'pageHeight' | 'pages'> | null | undefined,
): number | null {
  const pageWmm = Number(designState?.pageWidth);
  const pageHmm = Number(designState?.pageHeight);
  if (!Number.isFinite(pageWmm) || !Number.isFinite(pageHmm) || pageWmm <= 0 || pageHmm <= 0) {
    return null;
  }
  const basePxW = pageWmm * MM_TO_PX;
  const basePxH = pageHmm * MM_TO_PX;

  let bgScale: number | null = null;
  let maxW = 0;
  let maxH = 0;

  for (const page of designState?.pages ?? []) {
    const objects = page.fabricJSON?.objects;
    if (!Array.isArray(objects)) continue;
    for (const raw of objects) {
      const o = raw as AnyObj;
      if (o.isBackground) {
        const fromBg = Number(o.backgroundSceneScale);
        if (Number.isFinite(fromBg) && fromBg > 0) bgScale = fromBg;
      }
    }
    const extent = measurePageContentExtent(objects);
    maxW = Math.max(maxW, extent.maxW);
    maxH = Math.max(maxH, extent.maxH);
  }

  if (maxW < 1 || maxH < 1) return bgScale;

  for (const scale of [3, 2, 1] as const) {
    const expectedW = basePxW * scale;
    const expectedH = basePxH * scale;
    const matchW = maxW >= expectedW * 0.82 && maxW <= expectedW * 1.15;
    const matchH = maxH >= expectedH * 0.82 && maxH <= expectedH * 1.15;
    if (matchW && matchH) return scale;
  }

  if (maxW <= basePxW * 1.12 && maxH <= basePxH * 1.12) return 1;
  if (maxW <= basePxW * 3.15 && maxH <= basePxH * 3.15 && maxW > basePxW * 1.4) return 3;

  return bgScale;
}
