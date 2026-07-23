import type { Canvas, FabricObject, Group } from 'fabric';
import { ActiveSelection } from 'fabric';
import type { SelectedObjProps } from '../types';
import { isClientAddedPhotoField } from '../designFields';
import { isCoarsePointerEnvironment } from './canvasPointer';
import { asAny, isTextLikeObject } from './canvasUtils';

export function resolvePhotoFieldTarget(target: FabricObject | undefined): FabricObject | undefined {
  let field = target;
  if (field?.group && asAny(field.group).isPhotoField) field = field.group as FabricObject;
  if (!field || !asAny(field).isPhotoField) return undefined;
  return field;
}

/** Рамочное выделение нескольких объектов — только десктоп с точным указателем. */
export function isCanvasMarqueeSelectionAllowed(): boolean {
  return !isCoarsePointerEnvironment();
}

export function resolveCanvasMarqueeSelectionEnabled(interactionEnabled: boolean): boolean {
  return interactionEnabled && isCanvasMarqueeSelectionAllowed();
}

function resolvePreferredSingleSelectionTarget(objects: FabricObject[]): FabricObject | null {
  if (objects.length === 0) return null;
  const texts = objects.filter(isTextLikeObject);
  const hasLockedTemplatePhoto = objects.some((obj) => {
    const field = resolvePhotoFieldTarget(obj) ?? (asAny(obj).isPhotoField ? obj : undefined);
    return field && !isClientAddedPhotoField(asAny(field));
  });
  if (hasLockedTemplatePhoto && texts.length > 0) {
    return texts[texts.length - 1] ?? null;
  }
  if (texts.length > 0) return texts[texts.length - 1] ?? null;
  const clientPhotos = objects.filter((obj) => {
    const field = resolvePhotoFieldTarget(obj) ?? (asAny(obj).isPhotoField ? obj : undefined);
    return field && isClientAddedPhotoField(asAny(field));
  });
  if (clientPhotos.length > 0) return clientPhotos[clientPhotos.length - 1] ?? null;
  return objects[objects.length - 1] ?? null;
}

/** На мобилке не допускаем ActiveSelection из нескольких объектов (ломает drag фото-полей). */
export function enforceSingleObjectSelectionOnCoarse(canvas: Canvas): boolean {
  if (!isCoarsePointerEnvironment()) return false;
  const active = canvas.getActiveObject();
  if (!active) return false;
  const type = String(active.type ?? '').toLowerCase();
  if (type !== 'activeselection') return false;
  const selection = active as ActiveSelection;
  const objects = typeof selection.getObjects === 'function' ? selection.getObjects() : [];
  if (objects.length <= 1) return false;
  const keep = resolvePreferredSingleSelectionTarget(objects);
  if (!keep) return false;
  canvas.discardActiveObject();
  canvas.setActiveObject(keep);
  keep.setCoords?.();
  return true;
}

/** Поле для фото может быть внутри группы; `canvas.getObjects().find` его не находит. */
const SPREAD_OBJECT_ID_RE = /^p(\d+):(.+)$/;

export function photoFieldIdsMatch(objectId: string, fieldId: string): boolean {
  if (!objectId || !fieldId) return false;
  if (objectId === fieldId) return true;
  const objectMatch = objectId.match(SPREAD_OBJECT_ID_RE);
  if (objectMatch && objectMatch[2] === fieldId) return true;
  const fieldMatch = fieldId.match(SPREAD_OBJECT_ID_RE);
  if (fieldMatch && fieldMatch[2] === objectId) return true;
  if (objectMatch && fieldMatch && objectMatch[2] === fieldMatch[2]) return true;
  return false;
}

export function findPhotoFieldByIdDeep(
  canvas: Canvas,
  fieldId: string,
  preferredPageIndex?: number,
): FabricObject | undefined {
  if (!fieldId) return undefined;
  const matches: FabricObject[] = [];
  const walk = (list: FabricObject[]) => {
    for (const o of list) {
      const id = String(asAny(o).id ?? '');
      if (asAny(o).isPhotoField && photoFieldIdsMatch(id, fieldId)) {
        matches.push(o);
      }
      if (typeof (o as Group).getObjects === 'function') {
        walk((o as Group).getObjects());
      }
    }
  };
  walk(canvas.getObjects());
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];
  if (preferredPageIndex != null) {
    const preferredPrefix = `p${preferredPageIndex}:`;
    const onPage = matches.find((o) => String(asAny(o).id ?? '').startsWith(preferredPrefix));
    if (onPage) return onPage;
  }
  return matches[0];
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
  let fontSize = o.fontSize as number | undefined;
  if (type === 'IText') {
    // Визуальный кегль: per-char styles перекрывают base (Corel SVG).
    const styles = o.styles;
    if (styles && typeof styles === 'object' && !Array.isArray(styles)) {
      outer: for (const line of Object.values(styles as Record<string, unknown>)) {
        if (!line || typeof line !== 'object') continue;
        for (const char of Object.values(line as Record<string, unknown>)) {
          const fs = Number((char as { fontSize?: unknown })?.fontSize);
          if (Number.isFinite(fs) && fs > 0) {
            fontSize = fs;
            break outer;
          }
        }
      }
    } else if (Array.isArray(styles) && styles.length > 0) {
      const first = styles[0] as { style?: { fontSize?: unknown } };
      const fs = Number(first?.style?.fontSize);
      if (Number.isFinite(fs) && fs > 0) fontSize = fs;
    }
    const sx = Math.abs(Number(o.scaleX ?? 1)) || 1;
    const sy = Math.abs(Number(o.scaleY ?? 1)) || 1;
    const scale = Math.max(sx, sy);
    if (scale > 1.004 && typeof fontSize === 'number') {
      fontSize = Math.round(fontSize * scale);
    }
  }
  return {
    type,
    id: id || undefined,
    photoFieldFilled: type === 'photoField' ? o.photoFieldFilled === true : undefined,
    text: type === 'IText' ? (o.text as string) : undefined,
    fontFamily: o.fontFamily as string | undefined,
    fontSize,
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
