import { useEffect, type MutableRefObject } from 'react';
import type { Canvas } from 'fabric';
import {
  applyBasicModeConstraints,
  lockTextInlineEditing,
  releaseBasicModeConstraints,
} from './canvasBasicMode';
import {
  applyEditorDisplayBoost,
  resolveEditorDisplayBoost,
} from './editorCanvasDisplaySharpness';
import type { EditorMode } from './types';

interface UseDesignEditorRuntimeEffectsInput {
  fabricRef: MutableRefObject<Canvas | null>;
  pageTransitionLockRef: MutableRefObject<boolean>;
  canvasWidthPx: number;
  pageHeightPx: number;
  /** CSS fit-zoom: если > 1 — поднимаем плотность backstore. */
  fitZoom?: number;
  mode: EditorMode;
  selectionDisplayScaleRef: MutableRefObject<number>;
}

export function useDesignEditorRuntimeEffects({
  fabricRef,
  pageTransitionLockRef,
  canvasWidthPx,
  pageHeightPx,
  fitZoom = 1,
  mode,
  selectionDisplayScaleRef,
}: UseDesignEditorRuntimeEffectsInput): void {
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || pageTransitionLockRef.current) return;
    if (canvas.getWidth() !== canvasWidthPx || canvas.getHeight() !== pageHeightPx) {
      canvas.setDimensions({ width: canvasWidthPx, height: pageHeightPx });
    }
    const boost = resolveEditorDisplayBoost(canvasWidthPx, pageHeightPx, fitZoom);
    applyEditorDisplayBoost(canvas, boost);
    canvas.requestRenderAll();
  }, [canvasWidthPx, fabricRef, fitZoom, pageHeightPx, pageTransitionLockRef]);

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (mode === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
    else {
      releaseBasicModeConstraints(canvas);
      lockTextInlineEditing(canvas);
    }
  }, [fabricRef, mode, selectionDisplayScaleRef]);
}
