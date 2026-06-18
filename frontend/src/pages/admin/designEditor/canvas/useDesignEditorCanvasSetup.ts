import { useEffect, type MutableRefObject } from 'react';
import { Canvas } from 'fabric';
import {
  registerCanvasEventHandlers,
  type CanvasEventHandlerDeps,
} from './registerCanvasEventHandlers';
import { recordPublicEditorDebugEvent } from '../../../../features/publicDesignEditor/publicEditorPerf';

interface UseDesignEditorCanvasSetupInput extends Omit<CanvasEventHandlerDeps, 'canvas'> {
  canvasWidthPx: number;
  pageHeightPx: number;
  canvasInstanceRef: MutableRefObject<number>;
  prevPageLoadKeyRef: MutableRefObject<string | null>;
  loadedPageForInstanceRef: MutableRefObject<number>;
  setCanvasReady: (ready: boolean) => void;
}

function isIphoneSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua)
    && /(iPhone|iPad|iPod)/i.test(ua)
    && !/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(ua);
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
    const disableRetinaScaling = isIphoneSafari();

    const canvas = new Canvas(canvasElRef.current, {
      width: canvasWidthPx,
      height: pageHeightPx,
      backgroundColor: 'white',
      preserveObjectStacking: true,
      enableRetinaScaling: !disableRetinaScaling,
      selectionColor: 'rgba(37, 99, 235, 0.08)',
      selectionBorderColor: '#2563eb',
    });
    recordPublicEditorDebugEvent('canvas.setup.created', {
      canvasWidthPx,
      pageHeightPx,
      disableRetinaScaling,
      devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : null,
      lowerCanvas: {
        width: canvas.lowerCanvasEl?.width ?? null,
        height: canvas.lowerCanvasEl?.height ?? null,
        clientWidth: canvas.lowerCanvasEl?.clientWidth ?? null,
        clientHeight: canvas.lowerCanvasEl?.clientHeight ?? null,
      },
      upperCanvas: {
        width: canvas.upperCanvasEl?.width ?? null,
        height: canvas.upperCanvasEl?.height ?? null,
        clientWidth: canvas.upperCanvasEl?.clientWidth ?? null,
        clientHeight: canvas.upperCanvasEl?.clientHeight ?? null,
      },
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
