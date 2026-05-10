import type { FabricObject } from 'fabric';
import type { Group } from 'fabric';
import type { Point } from 'fabric';

type AnyObj = Record<string, unknown>;

function ax(obj: unknown): AnyObj {
  return obj as unknown as AnyObj;
}

/** Пустое поле: серый Rect — среди дочерних rect самый большой по площади (рамка ячейки, не элементы камеры). */
export function pickEmptyPhotoFieldFrameRect(field: FabricObject): FabricObject | null {
  if (field.type !== 'group') return null;
  const o = ax(field);
  if (!o.isPhotoField || o.photoFieldFilled === true) return null;
  const rects = (field as Group).getObjects().filter((obj) => obj.type === 'rect');
  if (rects.length === 0) return null;
  if (rects.length === 1) return rects[0]!;
  let best = rects[0]!;
  let bestA = Math.max(1e-9, best.getScaledWidth() * best.getScaledHeight());
  for (let i = 1; i < rects.length; i++) {
    const r = rects[i]!;
    const a = Math.max(1e-9, r.getScaledWidth() * r.getScaledHeight());
    if (a > bestA) {
      best = r;
      bestA = a;
    }
  }
  return best;
}

function normAbsScaleMag(s: unknown): number {
  const v = typeof s === 'number' ? s : Number(s ?? 1);
  if (!Number.isFinite(v) || v === 0) return 1;
  return Math.abs(v);
}

/** Размер ячейки: у пустого поля — локальный размер серого rect × его scale (масштаб родительской группы копируется на новую группу и второй раз не делится). */
export function resolvePhotoFieldFrameSize(field: FabricObject): { fw: number; fh: number } {
  const surface = pickEmptyPhotoFieldFrameRect(field);
  if (surface != null) {
    const iw = Math.abs(Number(surface.width) || 0);
    const ih = Math.abs(Number(surface.height) || 0);
    if (iw >= 1 && ih >= 1) {
      const fw0 = iw * normAbsScaleMag(surface.scaleX);
      const fh0 = ih * normAbsScaleMag(surface.scaleY);
      return { fw: Math.max(1, fw0), fh: Math.max(1, fh0) };
    }
    const br = surface.getBoundingRect();
    const gsx = normAbsScaleMag((field as { scaleX?: unknown }).scaleX);
    const gsy = normAbsScaleMag((field as { scaleY?: unknown }).scaleY);
    return {
      fw: Math.max(1, br.width / gsx),
      fh: Math.max(1, br.height / gsy),
    };
  }  const mw = Math.max(1, field.getScaledWidth());
  const mh = Math.max(1, field.getScaledHeight());
  const o = ax(field);
  const pW = Number(o.photoFieldFw);
  const pH = Number(o.photoFieldFh);
  const propsOk =
    Number.isFinite(pW) &&
    Number.isFinite(pH) &&
    pW >= 1 &&
    pH >= 1 &&
    Math.abs(pW - mw) <= 4 &&
    Math.abs(pH - mh) <= 4;
  if (propsOk) return { fw: Math.max(1, pW), fh: Math.max(1, pH) };
  return { fw: mw, fh: mh };
}

/**
 * После setXY группа может сместиться по union-bbox (cover шире рамки).
 * Совмещаем фактический TL прозрачной рамки с точкой плейсхолдера.
 */
export function syncFilledPhotoFieldSceneAnchor(group: Group, anchorSceneTL: Point): void {
  const rects = group.getObjects('rect');
  const frameAnchor = rects[0] as FabricObject | undefined;
  if (!frameAnchor) return;
  const c = frameAnchor.getCoords();
  if (!c.length) return;
  const got = c[0]!;
  const dx = anchorSceneTL.x - got.x;
  const dy = anchorSceneTL.y - got.y;
  if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) return;
  group.set({ left: (group.left ?? 0) + dx, top: (group.top ?? 0) + dy });
  group.setCoords();
}