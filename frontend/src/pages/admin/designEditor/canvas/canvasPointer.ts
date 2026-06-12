import { Point, type Canvas, type FabricObject } from 'fabric';
import { findPhotoFieldAtScene, findTextAtScene } from '../photoFieldHitTest';
import { resolvePhotoFieldTarget } from './canvasSelection';
import { isTextLikeObject } from './canvasUtils';

export function isCoarsePointerEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches
    || window.matchMedia('(max-width: 760px)').matches
  );
}

export function isCoarsePointerEvent(e: Event | undefined): boolean {
  if (!e) return false;
  const pe = e as PointerEvent;
  if (pe.pointerType === 'touch' || pe.pointerType === 'pen') return true;
  if ('TouchEvent' in window) {
    const te = e as TouchEvent;
    if (te.touches?.length || te.changedTouches?.length) return true;
  }
  return isCoarsePointerEnvironment();
}

export function scenePointFromClientPointer(canvas: Canvas, clientX: number, clientY: number): Point {
  const el = canvas.upperCanvasEl;
  const rect = el.getBoundingClientRect();
  const canvasW = canvas.getWidth() ?? 0;
  const canvasH = canvas.getHeight() ?? 0;
  if (rect.width <= 0 || rect.height <= 0 || canvasW <= 0 || canvasH <= 0) {
    return new Point(0, 0);
  }
  const x = ((clientX - rect.left) / rect.width) * canvasW;
  const y = ((clientY - rect.top) / rect.height) * canvasH;
  return new Point(x, y);
}

export function scenePointFromInteractionEvent(canvas: Canvas, e: Event): Point {
  canvas.calcOffset();
  try {
    const p = canvas.getScenePoint(e as never);
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
  } catch {
    /* fallback */
  }
  const pe = e as PointerEvent & TouchEvent;
  const touch = pe.changedTouches?.[0] ?? pe.touches?.[0];
  if (touch) return scenePointFromClientPointer(canvas, touch.clientX, touch.clientY);
  if (typeof pe.clientX === 'number' && typeof pe.clientY === 'number') {
    return scenePointFromClientPointer(canvas, pe.clientX, pe.clientY);
  }
  return new Point(0, 0);
}

export function resolveInteractiveTargetAtScene(
  canvas: Canvas,
  sceneX: number,
  sceneY: number,
  directTarget?: FabricObject,
): FabricObject | undefined {
  const photoFromTarget = resolvePhotoFieldTarget(directTarget);
  if (photoFromTarget) return photoFromTarget;
  if (directTarget && isTextLikeObject(directTarget)) return directTarget;

  const photo = findPhotoFieldAtScene(canvas, sceneX, sceneY);
  if (photo) return photo;
  return findTextAtScene(canvas, sceneX, sceneY);
}
