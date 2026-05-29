import type { FabricObject } from 'fabric';
import type { Group } from 'fabric';
import type { Point } from 'fabric';

type AnyObj = Record<string, unknown>;

function ax(obj: unknown): AnyObj {
  return obj as unknown as AnyObj;
}

/** Пустое поле: один rect на сцене (шаблон) или крупнейший rect внутри legacy-группы. */
export function pickEmptyPhotoFieldFrameRect(field: FabricObject): FabricObject | null {
  const o = ax(field);
  if (!o.isPhotoField || o.photoFieldFilled === true) return null;
  if (field.type === 'rect') return field;
  if (field.type !== 'group') return null;
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

/** Первый rect в заполненной группе — прозрачная рамка (не union bbox cover-изображения). */
export function pickFilledPhotoFieldFrameRect(group: Group): FabricObject | null {
  const rects = group.getObjects().filter((obj) => obj.type === 'rect');
  return rects[0] ?? null;
}

/**
 * Размер видимой рамки заполненного поля в координатах сцены.
 * Не использует group.getScaledWidth() — cover-картинка может быть больше рамки.
 */
export function measureFilledPhotoFieldFrameSize(group: Group): { fw: number; fh: number } | null {
  const frameAnchor = pickFilledPhotoFieldFrameRect(group);
  if (!frameAnchor) return null;
  const iw = Math.abs(Number(frameAnchor.width) || 0);
  const ih = Math.abs(Number(frameAnchor.height) || 0);
  if (iw < 1 || ih < 1) return null;
  const gsx = normAbsScaleMag((group as { scaleX?: unknown }).scaleX);
  const gsy = normAbsScaleMag((group as { scaleY?: unknown }).scaleY);
  return {
    fw: Math.max(1, iw * normAbsScaleMag(frameAnchor.scaleX) * gsx),
    fh: Math.max(1, ih * normAbsScaleMag(frameAnchor.scaleY) * gsy),
  };
}

/** Размер ячейки в сцене: ручной scale поля запекается в frameW/frameH перед заполнением. */
export function resolvePhotoFieldFrameSize(field: FabricObject): { fw: number; fh: number } {
  if (field.type === 'rect' && ax(field).isPhotoField) {
    const o = ax(field);
    const mw = Math.max(1, field.getScaledWidth());
    const mh = Math.max(1, field.getScaledHeight());
    const pW = Number(o.photoFieldFw);
    const pH = Number(o.photoFieldFh);
    const sx = Math.abs(Number(field.scaleX ?? 1));
    const sy = Math.abs(Number(field.scaleY ?? 1));
    if (
      Number.isFinite(pW)
      && Number.isFinite(pH)
      && pW >= 32
      && pH >= 32
      && sx < 1.004
      && sy < 1.004
      && (Math.abs(pW - mw) > 1 || Math.abs(pH - mh) > 1)
    ) {
      return { fw: pW, fh: pH };
    }
    return { fw: mw, fh: mh };
  }
  const oField = ax(field);
  if (field.type === 'group' && oField.isPhotoField && oField.photoFieldFilled === true) {
    const group = field as Group;
    const measured = measureFilledPhotoFieldFrameSize(group);
    if (measured) return measured;
    const pW = Number(oField.photoFieldFw);
    const pH = Number(oField.photoFieldFh);
    if (Number.isFinite(pW) && Number.isFinite(pH) && pW >= 32 && pH >= 32) {
      return { fw: pW, fh: pH };
    }
    return {
      fw: Math.max(1, field.getScaledWidth()),
      fh: Math.max(1, field.getScaledHeight()),
    };
  }

  const surface = pickEmptyPhotoFieldFrameRect(field);
  if (surface != null) {
    const iw = Math.abs(Number(surface.width) || 0);
    const ih = Math.abs(Number(surface.height) || 0);
    const gsx = normAbsScaleMag((field as { scaleX?: unknown }).scaleX);
    const gsy = normAbsScaleMag((field as { scaleY?: unknown }).scaleY);
    if (iw >= 1 && ih >= 1) {
      const fw0 = iw * normAbsScaleMag(surface.scaleX) * gsx;
      const fh0 = ih * normAbsScaleMag(surface.scaleY) * gsy;
      return { fw: Math.max(1, fw0), fh: Math.max(1, fh0) };
    }
    const br = surface.getBoundingRect();
    return {
      fw: Math.max(1, br.width),
      fh: Math.max(1, br.height),
    };
  }
  const mw = Math.max(1, field.getScaledWidth());
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
export function relayoutEmptyPhotoFieldChrome(group: Group, frameW: number, frameH: number): void {
  const frameRect = pickEmptyPhotoFieldFrameRect(group);
  if (frameRect) {
    frameRect.set({
      left: 0,
      top: 0,
      originX: 'left',
      originY: 'top',
      width: frameW,
      height: frameH,
      scaleX: 1,
      scaleY: 1,
      strokeUniform: true,
      objectCaching: false,
    });
  }

  const minSide = Math.min(frameW, frameH);
  const badgeR = Math.max(12, Math.min(22, minSide * 0.22));
  const badgeCx = frameW / 2;
  const badgeCy = frameH / 2;
  const camBodyW = badgeR * 0.82;
  const camBodyH = badgeR * 0.55;

  const kids = group.getObjects();
  const badge = kids[1];
  const camBody = kids[2];
  const camTop = kids[3];
  const camLens = kids[4];

  if (badge?.type === 'circle') {
    badge.set({
      left: badgeCx,
      top: badgeCy,
      originX: 'center',
      originY: 'center',
      radius: badgeR,
      scaleX: 1,
      scaleY: 1,
    });
  }
  if (camBody?.type === 'rect') {
    camBody.set({
      left: badgeCx,
      top: badgeCy + 1,
      originX: 'center',
      originY: 'center',
      width: camBodyW,
      height: camBodyH,
      scaleX: 1,
      scaleY: 1,
    });
  }
  if (camTop?.type === 'rect') {
    camTop.set({
      left: badgeCx,
      top: badgeCy - camBodyH / 2 - 2,
      originX: 'center',
      originY: 'center',
      width: badgeR * 0.42,
      height: badgeR * 0.18,
      scaleX: 1,
      scaleY: 1,
    });
  }
  if (camLens?.type === 'circle') {
    camLens.set({
      left: badgeCx,
      top: badgeCy + 1,
      originX: 'center',
      originY: 'center',
      radius: Math.max(2, badgeR * 0.15),
      scaleX: 1,
      scaleY: 1,
    });
  }

  ax(group).photoFieldFw = frameW;
  ax(group).photoFieldFh = frameH;
}

/** Пустое поле: рамка в (0,0) группы — якорь по TL серого rect. */
export function syncEmptyPhotoFieldSceneAnchor(group: Group, anchorSceneTL: Point): void {
  const frameAnchor = pickEmptyPhotoFieldFrameRect(group);
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