import type { Canvas, FabricObject, Group } from 'fabric';
import {
  createEmptyPhotoField,
  finalizeEmptyPhotoFieldPlacement,
  restoreEmptyPhotoFieldRectFromProps,
  upgradeEmptyPhotoFieldsOnCanvas,
} from '../photoFieldEmpty';
import { isClientAddedPhotoField, isTemplatePhotoField } from './fieldMeta';

type AnyObj = Record<string, unknown>;

function ax(obj: unknown): AnyObj {
  return obj as AnyObj;
}

/**
 * Импортированный rect photo_*: Fabric после loadFromJSON может отрисовать меньший bbox,
 * чем photoFieldFw/Fh. Подгоняем геометрию из props (только шаблонные поля).
 */
export function syncImportedPhotoFieldGeometry(field: FabricObject): boolean {
  const o = ax(field);
  if (!isTemplatePhotoField(o) || o.photoFieldFilled === true) return false;
  if (field.type === 'rect') {
    return restoreEmptyPhotoFieldRectFromProps(field);
  }
  if (field.type === 'group') {
    finalizeEmptyPhotoFieldPlacement(field as Group, {
      x: field.left ?? 0,
      y: field.top ?? 0,
    });
    return true;
  }
  return false;
}

export function syncImportedPhotoFieldsOnCanvas(canvas: Canvas): void {
  for (const obj of canvas.getObjects()) {
    syncImportedPhotoFieldGeometry(obj);
  }
}

export {
  createEmptyPhotoField,
  upgradeEmptyPhotoFieldsOnCanvas,
};
