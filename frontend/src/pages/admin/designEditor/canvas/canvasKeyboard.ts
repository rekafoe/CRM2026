import { ActiveSelection, type Canvas, type FabricObject, type Group } from 'fabric';
import type { EditorMode } from './types';
import {
  applyBasicModeConstraints,
  canDuplicateObjectInBasicMode,
  isClientAddedPhotoField,
} from './canvasBasicMode';
import {
  asAny,
  CLIPBOARD_PASTE_OFFSET_PX,
  isTextLikeObject,
  KEYBOARD_NUDGE_FAST_MULTIPLIER,
  type FabricDragTransform,
} from './canvasUtils';

export function canKeyboardTransformObject(obj: FabricObject, mode: EditorMode): boolean {
  const o = asAny(obj);
  if (o.isBackground) return false;
  if (mode === 'basic') {
    return (!!o.isPhotoField && isClientAddedPhotoField(o))
      || isTextLikeObject(obj)
      || obj.type === 'rect'
      || obj.type === 'circle'
      || obj.type === 'line'
      || obj.type === 'triangle';
  }
  return obj.selectable !== false;
}

export function getKeyboardTargetObjects(canvas: Canvas, mode: EditorMode): FabricObject[] {
  return canvas.getActiveObjects().filter((obj) => canKeyboardTransformObject(obj, mode));
}

export function resolveKeyboardNudgePx(canvas: Canvas, fast: boolean): number {
  const shortSide = Math.max(1, Math.min(canvas.getWidth(), canvas.getHeight()));
  const baseStep = Math.max(1, Math.round(shortSide / 350));
  return fast ? baseStep * KEYBOARD_NUDGE_FAST_MULTIPLIER : baseStep;
}

export function moveActiveObjectsByKeyboard(canvas: Canvas, dx: number, dy: number, mode: EditorMode): boolean {
  const targets = getKeyboardTargetObjects(canvas, mode);
  if (targets.length === 0) return false;
  targets.forEach((obj) => {
    obj.set({
      left: (obj.left ?? 0) + dx,
      top: (obj.top ?? 0) + dy,
    });
    obj.setCoords();
  });
  canvas.getActiveObject()?.setCoords();
  canvas.requestRenderAll();
  return true;
}

export async function cloneFabricObjects(
  objects: FabricObject[],
  options?: { offset?: number; regenerateIds?: boolean },
): Promise<FabricObject[]> {
  const clones = await Promise.all(objects.map((obj) => obj.clone() as Promise<FabricObject>));
  clones.forEach((clone) => {
    if (options?.offset) {
      clone.set({
        left: (clone.left ?? 0) + options.offset,
        top: (clone.top ?? 0) + options.offset,
      });
    }
    if (options?.regenerateIds) regenerateClonedObjectIdentity(clone);
    clone.setCoords();
  });
  return clones;
}

export function regenerateClonedObjectIdentity(obj: FabricObject): void {
  const o = asAny(obj);
  if (typeof o.id === 'string' && o.id.trim()) {
    const prefix = o.isPhotoField ? 'field' : 'obj';
    o.id = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  if (typeof (obj as Group).getObjects === 'function') {
    (obj as Group).getObjects().forEach(regenerateClonedObjectIdentity);
  }
}

export function activateClonedObjects(canvas: Canvas, objects: FabricObject[]): void {
  canvas.discardActiveObject();
  if (objects.length === 1) {
    canvas.setActiveObject(objects[0]!);
  } else if (objects.length > 1) {
    canvas.setActiveObject(new ActiveSelection(objects, { canvas }));
  }
}

export function keepGrabPointAlignedWithSnap(event: unknown, dx: number, dy: number): void {
  const transform = (event as { transform?: FabricDragTransform }).transform;
  if (!transform) return;
  if (dx !== 0 && typeof transform.offsetX === 'number') transform.offsetX -= dx;
  if (dy !== 0 && typeof transform.offsetY === 'number') transform.offsetY -= dy;
}

export function duplicateActiveObjects(
  canvas: Canvas,
  mode: EditorMode,
  afterDone: () => void,
  displayScale = 1,
): void {
  const active = canvas.getActiveObjects().filter((obj) => (
    mode === 'basic' ? canDuplicateObjectInBasicMode(obj) : canKeyboardTransformObject(obj, 'advanced')
  ));
  if (!active.length) return;
  void cloneFabricObjects(active, {
    offset: CLIPBOARD_PASTE_OFFSET_PX,
    regenerateIds: true,
  }).then((copies) => {
    copies.forEach((copy) => canvas.add(copy));
    if (mode === 'basic') applyBasicModeConstraints(canvas, displayScale);
    activateClonedObjects(canvas, copies);
    canvas.requestRenderAll();
    afterDone();
  });
}
