import type { Canvas, FabricObject, Group } from 'fabric';
import type { SelectedObjProps } from '../types';
import { asAny } from './canvasUtils';

export function resolvePhotoFieldTarget(target: FabricObject | undefined): FabricObject | undefined {
  let field = target;
  if (field?.group && asAny(field.group).isPhotoField) field = field.group as FabricObject;
  if (!field || !asAny(field).isPhotoField) return undefined;
  return field;
}

/** Поле для фото может быть внутри группы; `canvas.getObjects().find` его не находит. */
export function findPhotoFieldByIdDeep(canvas: Canvas, fieldId: string): FabricObject | undefined {
  if (!fieldId) return undefined;
  const walk = (list: FabricObject[]): FabricObject | undefined => {
    for (const o of list) {
      if (asAny(o).isPhotoField && String(asAny(o).id ?? '') === fieldId) return o;
      if (typeof (o as Group).getObjects === 'function') {
        const nested = walk((o as Group).getObjects());
        if (nested) return nested;
      }
    }
    return undefined;
  };
  return walk(canvas.getObjects());
}

export function findDesignObjectByIdDeep(canvas: Canvas, id: string): FabricObject | undefined {
  const targetId = id.trim();
  if (!targetId) return undefined;
  const walk = (list: FabricObject[]): FabricObject | undefined => {
    for (const o of list) {
      if (String(asAny(o).id ?? '') === targetId) return o;
      if (typeof (o as Group).getObjects === 'function') {
        const nested = walk((o as Group).getObjects());
        if (nested) return nested.group ?? nested;
      }
    }
    return undefined;
  };
  return walk(canvas.getObjects());
}

export function getObjProps(obj: unknown): SelectedObjProps {
  const o = asAny(obj);
  const typeName = (o.type as string) ?? '';
  const isPhoto = !!o.isPhotoField;

  let type: SelectedObjProps['type'] = 'other';
  if (isPhoto) type = 'photoField';
  else if (typeName === 'i-text' || typeName === 'textbox') type = 'IText';
  else if (typeName === 'image') type = 'image';
  else if (typeName === 'rect') type = 'rect';
  else if (typeName === 'circle') type = 'circle';
  else if (typeName === 'line') type = 'line';
  else if (typeName === 'triangle') type = 'triangle';

  const id = String(o.id ?? '').trim();
  return {
    type,
    id: id || undefined,
    photoFieldFilled: type === 'photoField' ? o.photoFieldFilled === true : undefined,
    text: type === 'IText' ? (o.text as string) : undefined,
    fontFamily: o.fontFamily as string | undefined,
    fontSize: o.fontSize as number | undefined,
    fontWeight: (o.fontWeight as string) ?? 'normal',
    fontStyle: (o.fontStyle as string) ?? 'normal',
    underline: !!(o.underline),
    textAlign: (o.textAlign as string) ?? 'left',
    lineHeight: type === 'IText' ? (typeof o.lineHeight === 'number' ? o.lineHeight : 1.16) : undefined,
    fill: o.fill as string | undefined,
    stroke: o.stroke as string | undefined,
    strokeWidth: o.strokeWidth as number | undefined,
    opacity: (o.opacity as number) ?? 1,
    flipX: !!(o.flipX),
    flipY: !!(o.flipY),
    locked: !!(o.locked),
  };
}
