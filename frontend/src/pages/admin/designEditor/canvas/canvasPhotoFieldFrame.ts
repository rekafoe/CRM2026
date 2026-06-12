import { Group, Point, type FabricObject } from 'fabric';
import { resolvePhotoFieldFrameSceneTL as resolvePhotoFieldFrameSceneTLFromGeometry } from '../photoFieldGeometry';

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
  return resolvePhotoFieldFrameSceneTLFromGeometry(field);
}
