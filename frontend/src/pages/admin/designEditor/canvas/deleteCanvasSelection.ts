import type { Canvas } from 'fabric';
import {
  applyBasicModeConstraints,
  canDeleteObjectInBasicMode,
  deletePhotoFieldTargetInBasicMode,
} from './canvasBasicMode';
import { detachFabricObject } from './canvasObjectDetach';
import { resolvePhotoFieldTarget } from './canvasSelection';
import { asAny } from './canvasUtils';
import type { EditorMode } from './types';

/** Общее удаление активных объектов (клавиатура, handle, delete-маркер). */
export function deleteCanvasSelection(
  canvas: Canvas,
  mode: EditorMode,
  displayScale: number,
  callbacks: {
    onSelectionChange: (info: null) => void;
    saveSnapshot: () => void;
  },
): boolean {
  const targets = canvas.getActiveObjects().filter((obj) => (
    mode === 'basic'
      ? canDeleteObjectInBasicMode(obj)
      : !asAny(obj).isBackground
  ));
  if (targets.length === 0) return false;

  targets.forEach((obj) => {
    if (mode === 'basic' && (asAny(obj).isPhotoField || resolvePhotoFieldTarget(obj))) {
      deletePhotoFieldTargetInBasicMode(canvas, obj);
    } else {
      detachFabricObject(canvas, obj);
    }
  });
  canvas.discardActiveObject();
  if (mode === 'basic') applyBasicModeConstraints(canvas, displayScale);
  canvas.requestRenderAll();
  callbacks.onSelectionChange(null);
  callbacks.saveSnapshot();
  return true;
}
