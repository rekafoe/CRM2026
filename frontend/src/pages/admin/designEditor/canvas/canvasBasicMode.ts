import type { Canvas, FabricObject, Group } from 'fabric';
import {
  applyPhotoFieldSelectionChrome,
  applyTextSelectionChrome,
  isTextLikeFabricObject,
} from '../designEditorTextChrome';
import { ensurePhotoFieldStaticLayout } from '../photoFieldFit';
import { createEmptyPhotoField, isClientAddedPhotoField } from '../designFields';
import { finalizeEmptyPhotoFieldPlacement } from '../photoFieldEmpty';
import { detachFabricObject } from './canvasObjectDetach';
import { resolvePhotoFieldFrameSceneTL } from './canvasPhotoFieldFrame';
import { resolvePhotoFieldTarget } from './canvasSelection';
import { asAny, isTextLikeObject, type AnyObj } from './canvasUtils';

export function isBasicDecorShape(obj: FabricObject): boolean {
  return obj.type === 'rect'
    || obj.type === 'circle'
    || obj.type === 'line'
    || obj.type === 'triangle';
}

export { isClientAddedPhotoField } from '../designFields';

/** Применяет ограничения basic-режима к объектам холста */
export function applyBasicModeConstraints(canvas: Canvas, displayScale = 1): void {
  const inv = 1 / Math.max(0.22, Math.min(1, displayScale));
  const canvasZoom = canvas.getZoom();
  canvas.getObjects().forEach((obj) => {
    const o = obj as unknown as AnyObj;
    if (o.isBackground) {
      obj.set({ selectable: false, evented: false });
    } else if (o.isPhotoField) {
      const clientAdded = isClientAddedPhotoField(o);
      const filled = o.photoFieldFilled === true;
      if (obj.type === 'group') {
        const group = obj as Group;
        ensurePhotoFieldStaticLayout(group);
        if (filled) {
          group.getObjects().forEach((child) => {
            if (child.type === 'image') {
              child.set({
                lockScalingX: true,
                lockScalingY: true,
                hasControls: false,
                hasBorders: false,
              });
            }
          });
        }
      }
      obj.set({
        selectable: true,
        evented: true,
        lockMovementX: !clientAdded,
        lockMovementY: !clientAdded,
        lockScalingX: !clientAdded,
        lockScalingY: !clientAdded,
        lockRotation: true,
        hasControls: clientAdded,
        hasBorders: true,
        borderColor: '#2563eb',
        ...(clientAdded
          ? {}
          : {
              borderScaleFactor: 2.75 * inv,
              padding: Math.round(8 * inv),
            }),
      });
      if (clientAdded) {
        applyPhotoFieldSelectionChrome(obj, displayScale, canvasZoom);
      }
      if (filled) {
        obj.set({ hoverCursor: 'pointer' });
      }
    } else if (isTextLikeFabricObject(obj)) {
      applyTextSelectionChrome(obj, 'basic', displayScale, canvasZoom);
    } else if (isBasicDecorShape(obj)) {
      obj.set({
        selectable: true,
        evented: true,
        lockMovementX: false,
        lockMovementY: false,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        hasControls: false,
        hasBorders: true,
        borderColor: '#2563eb',
        borderScaleFactor: 2.75 * inv,
        padding: Math.round(8 * inv),
      });
    } else {
      obj.set({ selectable: false, evented: false });
    }
  });
  canvas.requestRenderAll();
}

export function canDeleteObjectInBasicMode(obj: FabricObject): boolean {
  const o = asAny(obj);
  if (o.isBackground) return false;
  if (isTextLikeObject(obj) || isBasicDecorShape(obj)) return true;
  const field = resolvePhotoFieldTarget(obj);
  if (field) return true;
  if (o.isPhotoField) return true;
  return false;
}

export function clearFilledPhotoField(canvas: Canvas, field: FabricObject): boolean {
  const o = asAny(field);
  if (!o.isPhotoField || o.photoFieldFilled !== true) return false;
  const id = String(o.id ?? '').trim() || `field-${Date.now()}`;
  const fw = Math.max(1, Number(o.photoFieldFw ?? field.width ?? 1));
  const fh = Math.max(1, Number(o.photoFieldFh ?? field.height ?? 1));
  const anchor = resolvePhotoFieldFrameSceneTL(field);
  const clientAdded = isClientAddedPhotoField(o);
  const parent = field.group;
  const stackIndex = parent != null ? parent.getObjects().indexOf(field) : -1;

  detachFabricObject(canvas, field);

  const empty = createEmptyPhotoField({
    id,
    left: anchor.x,
    top: anchor.y,
    width: fw,
    height: fh,
    clientAdded,
  });

  if (parent != null && stackIndex >= 0) {
    parent.insertAt(stackIndex, empty);
    parent.set({ dirty: true });
    parent.setCoords();
  } else if (parent != null) {
    parent.add(empty);
    parent.set({ dirty: true });
    parent.setCoords();
  } else {
    canvas.add(empty);
  }

  finalizeEmptyPhotoFieldPlacement(empty as Group, anchor);
  canvas.setActiveObject(empty);
  empty.setCoords();
  return true;
}

/** Delete / Backspace: клиентское поле целиком; шаблонное заполненное — только сброс фото. */
export function deletePhotoFieldTargetInBasicMode(canvas: Canvas, obj: FabricObject): void {
  const field = resolvePhotoFieldTarget(obj) ?? (asAny(obj).isPhotoField ? obj : undefined);
  if (!field) {
    detachFabricObject(canvas, obj);
    return;
  }
  const o = asAny(field);
  if (o.photoFieldFilled === true && !isClientAddedPhotoField(o)) {
    clearFilledPhotoField(canvas, field);
    return;
  }
  detachFabricObject(canvas, field);
}

export function canDuplicateObjectInBasicMode(obj: FabricObject): boolean {
  if (asAny(obj).isBackground || asAny(obj).isPhotoField) return false;
  return isTextLikeObject(obj) || isBasicDecorShape(obj);
}

/** Снимает ограничения basic-режима (полный редактор) */
export function releaseBasicModeConstraints(canvas: Canvas): void {
  canvas.getObjects().forEach((obj) => {
    const o = obj as unknown as AnyObj;
    if (o.isBackground) {
      obj.set({ selectable: false, evented: false });
      return;
    }
    if (o.isPhotoField && o.photoFieldFilled === true && obj.type === 'group') {
      obj.set({
        selectable: true,
        evented: true,
        lockMovementX: false,
        lockMovementY: false,
        lockScalingX: true,
        lockScalingY: true,
        lockRotation: true,
        hasControls: true,
        hasBorders: true,
      });
      return;
    }
    if (isTextLikeFabricObject(obj)) {
      applyTextSelectionChrome(obj, 'advanced');
      return;
    }
    obj.set({
      selectable: true,
      evented: true,
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: false,
      hasControls: true,
      hasBorders: true,
    });
  });
  lockTextInlineEditing(canvas);
  canvas.requestRenderAll();
}

/** Текст только выделяется по клику; inline-редактирование — по dblclick / листу. */
export function lockTextInlineEditing(canvas: Canvas): void {
  canvas.getObjects().forEach((obj) => {
    if (!isTextLikeObject(obj)) return;
    const text = obj as import('fabric').IText;
    if (asAny(text).isEditing) {
      text.exitEditing();
    }
    text.set({ editable: false });
  });
}
