import { Group, Point, type FabricObject } from 'fabric';
import { pickEmptyPhotoFieldFrameRect } from '../photoFieldGeometry';

/** Снимок трансформа без позиции. origin не копируем — заполненная группа всегда LT. */
export function snapshotPhotoFieldTransformNoPosition(
  field: FabricObject,
  options?: { bakeScaleIntoFrame?: boolean },
): Record<string, unknown> {
  return {
    angle: field.angle ?? 0,
    scaleX: options?.bakeScaleIntoFrame ? 1 : (field.scaleX ?? 1),
    scaleY: options?.bakeScaleIntoFrame ? 1 : (field.scaleY ?? 1),
    skewX: field.skewX ?? 0,
    skewY: field.skewY ?? 0,
    flipX: !!field.flipX,
    flipY: !!field.flipY,
    opacity: field.opacity ?? 1,
    originX: 'left',
    originY: 'top',
  };
}

/** Левый верх рамки поля на сцене — по серому rect пустого поля или fallback. */
export function resolvePhotoFieldFrameSceneTL(field: FabricObject): Point {
  const emptyRect = pickEmptyPhotoFieldFrameRect(field);
  if (emptyRect) {
    const c = emptyRect.getCoords();
    if (c.length >= 1) return c[0]!;
  }
  if (field.type === 'group') {
    const inner = (field as Group).getObjects()[0];
    if (inner?.type === 'rect') {
      const c = inner.getCoords();
      if (c.length >= 1) return c[0]!;
    }
  }
  const c = field.getCoords();
  if (c.length >= 1) return c[0]!;
  const br = field.getBoundingRect();
  return new Point(br.left, br.top);
}
