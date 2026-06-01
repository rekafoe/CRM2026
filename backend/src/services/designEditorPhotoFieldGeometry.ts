/** Измерение рамки фото-поля без зависимости от Fabric (тесты и preflight). */

type AnyObj = Record<string, unknown>;

export type PhotoFieldFrameChild = {
  type?: string;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
};

export type PhotoFieldFrameMeasurable = {
  type?: string;
  scaleX?: number;
  scaleY?: number;
  width?: number;
  height?: number;
  getScaledWidth?: () => number;
  getScaledHeight?: () => number;
  getObjects?: () => PhotoFieldFrameChild[];
};

function ax(obj: unknown): AnyObj {
  return obj as AnyObj;
}

function normAbsScaleMag(s: unknown): number {
  const v = typeof s === 'number' ? s : Number(s ?? 1);
  if (!Number.isFinite(v) || v === 0) return 1;
  return Math.abs(v);
}

export function pickFilledPhotoFieldFrameRect(
  group: PhotoFieldFrameMeasurable,
): PhotoFieldFrameChild | null {
  const rects = (group.getObjects?.() ?? []).filter((obj) => obj.type === 'rect');
  return rects[0] ?? null;
}

export function measureFilledPhotoFieldFrameSize(
  group: PhotoFieldFrameMeasurable,
): { fw: number; fh: number } | null {
  const frameAnchor = pickFilledPhotoFieldFrameRect(group);
  if (!frameAnchor) return null;
  const iw = Math.abs(Number(frameAnchor.width) || 0);
  const ih = Math.abs(Number(frameAnchor.height) || 0);
  if (iw < 1 || ih < 1) return null;
  const gsx = normAbsScaleMag(group.scaleX);
  const gsy = normAbsScaleMag(group.scaleY);
  return {
    fw: Math.max(1, iw * normAbsScaleMag(frameAnchor.scaleX) * gsx),
    fh: Math.max(1, ih * normAbsScaleMag(frameAnchor.scaleY) * gsy),
  };
}

export function resolvePhotoFieldFrameSize(
  field: PhotoFieldFrameMeasurable,
): { fw: number; fh: number } {
  const oField = ax(field);
  if (field.type === 'group' && oField.isPhotoField && oField.photoFieldFilled === true) {
    const measured = measureFilledPhotoFieldFrameSize(field);
    if (measured) return measured;
    const pW = Number(oField.photoFieldFw);
    const pH = Number(oField.photoFieldFh);
    if (Number.isFinite(pW) && Number.isFinite(pH) && pW >= 32 && pH >= 32) {
      return { fw: pW, fh: pH };
    }
    return {
      fw: Math.max(1, field.getScaledWidth?.() ?? field.width ?? 1),
      fh: Math.max(1, field.getScaledHeight?.() ?? field.height ?? 1),
    };
  }

  const mw = Math.max(1, field.getScaledWidth?.() ?? field.width ?? 1);
  const mh = Math.max(1, field.getScaledHeight?.() ?? field.height ?? 1);
  const pW = Number(oField.photoFieldFw);
  const pH = Number(oField.photoFieldFh);
  if (
    Number.isFinite(pW)
    && Number.isFinite(pH)
    && pW >= 32
    && pH >= 32
    && Math.abs(pW - mw) > 1
    && Math.abs(pH - mh) > 1
  ) {
    return { fw: pW, fh: pH };
  }
  return { fw: mw, fh: mh };
}
