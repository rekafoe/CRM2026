import { useEffect, type MutableRefObject } from 'react';
import type { Canvas } from 'fabric';
import {
  applyBasicModeConstraints,
  lockTextInlineEditing,
  releaseBasicModeConstraints,
} from './canvasBasicMode';
import type { EditorMode } from './types';

interface UseDesignEditorRuntimeEffectsInput {
  fabricRef: MutableRefObject<Canvas | null>;
  pageTransitionLockRef: MutableRefObject<boolean>;
  canvasWidthPx: number;
  pageHeightPx: number;
  mode: EditorMode;
  selectionDisplayScaleRef: MutableRefObject<number>;
}

export function useDesignEditorRuntimeEffects({
  fabricRef,
  pageTransitionLockRef,
  canvasWidthPx,
  pageHeightPx,
  mode,
  selectionDisplayScaleRef,
}: UseDesignEditorRuntimeEffectsInput): void {
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || pageTransitionLockRef.current) return;
    if (canvas.getWidth() === canvasWidthPx && canvas.getHeight() === pageHeightPx) return;
    canvas.setDimensions({ width: canvasWidthPx, height: pageHeightPx });
    canvas.requestRenderAll();
  }, [canvasWidthPx, fabricRef, pageHeightPx, pageTransitionLockRef]);

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
