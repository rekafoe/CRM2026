import { useEffect, type MutableRefObject } from 'react';
import { Canvas } from 'fabric';
import {
  registerCanvasEventHandlers,
  type CanvasEventHandlerDeps,
} from './registerCanvasEventHandlers';

interface UseDesignEditorCanvasSetupInput extends Omit<CanvasEventHandlerDeps, 'canvas'> {
  canvasWidthPx: number;
  pageHeightPx: number;
  canvasInstanceRef: MutableRefObject<number>;
  prevPageLoadKeyRef: MutableRefObject<string | null>;
  loadedPageForInstanceRef: MutableRefObject<number>;
  setCanvasReady: (ready: boolean) => void;
}

export function useDesignEditorCanvasSetup({
  canvasElRef,
  canvasWidthPx,
  pageHeightPx,
  canvasInstanceRef,
  prevPageLoadKeyRef,
  loadedPageForInstanceRef,
  setCanvasReady,
  ...handlerDeps
}: UseDesignEditorCanvasSetupInput): void {
  useEffect(() => {
    if (!canvasElRef.current) return;

    const canvas = new Canvas(canvasElRef.current, {
      width: canvasWidthPx,
      height: pageHeightPx,
      backgroundColor: 'white',
      preserveObjectStacking: true,
      selectionColor: 'rgba(37, 99, 235, 0.08)',
      selectionBorderColor: '#2563eb',
    });
    handlerDeps.fabricRef.current = canvas;
    canvasInstanceRef.current += 1;
    prevPageLoadKeyRef.current = null;
    loadedPageForInstanceRef.current = 0;
    setCanvasReady(true);

    const unregisterCanvasHandlers = registerCanvasEventHandlers({
      canvas,
      canvasElRef,
      pageHeightPx,
      ...handlerDeps,
    });

    return () => {
      unregisterCanvasHandlers();
      canvas.dispose();
      handlerDeps.fabricRef.current = null;
      setCanvasReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
