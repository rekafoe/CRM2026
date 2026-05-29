/**
 * Пустое фото-поле — один Fabric Rect, как в импорте SVG-шаблона (designTemplateSvgImportBuilder).
 * Группа с дочерними объектами ломает ресайз в Fabric 7.
 */
import { Rect, type FabricObject } from 'fabric';

type AnyObj = Record<string, unknown>;

function ax(obj: unknown): AnyObj {
  return obj as AnyObj;
}

export function isEmptyPhotoFieldRect(field: FabricObject): boolean {
  const o = ax(field);
  return field.type === 'rect' && o.isPhotoField === true && o.photoFieldFilled !== true;
}

/** Создаёт пустое поле — один rect на сцене (как parsed template fields). */
export function createEmptyPhotoField(opts: {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  clientAdded?: boolean;
}): FabricObject {
  const { id, left, top, width, height } = opts;
  const rect = new Rect({
    left,
    top,
    originX: 'left',
    originY: 'top',
    width,
    height,
    fill: '#ffffff',
    stroke: '#94a3b8',
    strokeWidth: 1,
    strokeDashArray: [6, 4],
    strokeUniform: true,
    rx: 6,
    ry: 6,
    objectCaching: false,
  });
  const o = ax(rect);
  o.isPhotoField = true;
  o.photoFieldFilled = false;
  o.photoFieldFw = width;
  o.photoFieldFh = height;
  o.id = id;
  if (opts.clientAdded) o.photoFieldClientAdded = true;
  rect.set({ scaleX: 1, scaleY: 1 });
  rect.setCoords();
  return rect;
}

/**
 * После drag Fabric иногда сбрасывает width/height, оставляя photoFieldFw/Fh.
 * Восстанавливаем запечённый размер без пересчёта по уменьшенному bbox.
 */
export function restoreEmptyPhotoFieldRectFromProps(field: FabricObject): boolean {
  if (!isEmptyPhotoFieldRect(field)) return false;
  const o = ax(field);
  const pW = Math.max(32, Math.round(Number(o.photoFieldFw ?? 0)));
  const pH = Math.max(32, Math.round(Number(o.photoFieldFh ?? 0)));
  if (pW < 32 || pH < 32) return false;
  const sx = Math.abs(Number(field.scaleX ?? 1));
  const sy = Math.abs(Number(field.scaleY ?? 1));
  if (sx > 1.004 || sy > 1.004) return false;

  const curW = Math.max(1, Math.round(field.getScaledWidth()));
  const curH = Math.max(1, Math.round(field.getScaledHeight()));
  if (Math.abs(curW - pW) <= 1 && Math.abs(curH - pH) <= 1) return false;

  field.set({
    left: field.left ?? 0,
    top: field.top ?? 0,
    width: pW,
    height: pH,
    scaleX: 1,
    scaleY: 1,
  });
  field.setCoords();
  return true;
}

/** Запекает scale в width/height rect-поля (после углового ресайза). */
export function bakeEmptyPhotoFieldRectScale(
  field: FabricObject,
  sizeOverride?: { fw: number; fh: number },
): boolean {
  if (!isEmptyPhotoFieldRect(field)) return false;

  const o = ax(field);
  let frameW: number;
  let frameH: number;
  if (sizeOverride) {
    frameW = Math.max(32, Math.round(sizeOverride.fw));
    frameH = Math.max(32, Math.round(sizeOverride.fh));
  } else {
    const pW = Math.max(0, Math.round(Number(o.photoFieldFw ?? 0)));
    const pH = Math.max(0, Math.round(Number(o.photoFieldFh ?? 0)));
    const sx = Math.abs(Number(field.scaleX ?? 1));
    const sy = Math.abs(Number(field.scaleY ?? 1));
    const curW = Math.max(1, Math.round(field.getScaledWidth()));
    const curH = Math.max(1, Math.round(field.getScaledHeight()));
    if (
      pW >= 32
      && pH >= 32
      && sx < 1.004
      && sy < 1.004
      && (Math.abs(curW - pW) > 1 || Math.abs(curH - pH) > 1)
    ) {
      frameW = pW;
      frameH = pH;
    } else {
      frameW = Math.max(32, curW);
      frameH = Math.max(32, curH);
    }
  }

  const pW = Number(o.photoFieldFw ?? 0);
  const pH = Number(o.photoFieldFh ?? 0);
  const sx = Math.abs(Number(field.scaleX ?? 1));
  const sy = Math.abs(Number(field.scaleY ?? 1));
  if (
    pW >= 32
    && pH >= 32
    && Math.abs(pW - frameW) <= 1
    && Math.abs(pH - frameH) <= 1
    && Math.abs(sx - 1) < 0.004
    && Math.abs(sy - 1) < 0.004
  ) {
    return false;
  }

  const left = field.left ?? 0;
  const top = field.top ?? 0;
  field.set({
    left,
    top,
    width: frameW,
    height: frameH,
    scaleX: 1,
    scaleY: 1,
  });
  o.photoFieldFw = frameW;
  o.photoFieldFh = frameH;
  field.setCoords();
  return true;
}
