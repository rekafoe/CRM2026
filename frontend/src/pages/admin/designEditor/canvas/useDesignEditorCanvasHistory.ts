import { useCallback, type MutableRefObject } from 'react';
import type { Canvas, FabricObject } from 'fabric';
import { normalizeDesignFieldsOnCanvas } from '../designFields';
import { fabricDeserializeReviver } from '../designPageLoader';
import { fillPhotoField } from './canvasCommands';
import { applyBasicModeConstraints, releaseBasicModeConstraints } from './canvasBasicMode';
import type { CanvasHistoryStack } from './canvasHistory';
import { canvasToJSON } from './canvasSerialization';
import type { EditorMode, ResolveImageFileUrl } from './types';

interface UseDesignEditorCanvasHistoryInput {
  fabricRef: MutableRefObject<Canvas | null>;
  historyRef: MutableRefObject<CanvasHistoryStack>;
  isLoadingRef: MutableRefObject<boolean>;
  pageTransitionLockRef: MutableRefObject<boolean>;
  onCanvasDocumentCommitRef: MutableRefObject<(() => void) | undefined>;
  documentCommitTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  pageWidthRef: MutableRefObject<number>;
  pageHeightRef: MutableRefObject<number>;
  modeRef: MutableRefObject<EditorMode>;
  selectionDisplayScaleRef: MutableRefObject<number>;
  resolveImageFileUrlRef: MutableRefObject<ResolveImageFileUrl | undefined>;
  reportPhotoFillProgress: (progress: number | null) => void;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
}

export function useDesignEditorCanvasHistory({
  fabricRef,
  historyRef,
  isLoadingRef,
  pageTransitionLockRef,
  onCanvasDocumentCommitRef,
  documentCommitTimerRef,
  pageWidthRef,
  pageHeightRef,
  modeRef,
  selectionDisplayScaleRef,
  resolveImageFileUrlRef,
  reportPhotoFillProgress,
  onHistoryChange,
}: UseDesignEditorCanvasHistoryInput) {
  const scheduleCanvasDocumentCommit = useCallback(() => {
    if (!onCanvasDocumentCommitRef.current) return;
    if (documentCommitTimerRef.current) clearTimeout(documentCommitTimerRef.current);
    documentCommitTimerRef.current = setTimeout(() => {
      documentCommitTimerRef.current = null;
      if (isLoadingRef.current || pageTransitionLockRef.current) return;
      onCanvasDocumentCommitRef.current?.();
    }, 400);
  }, [documentCommitTimerRef, isLoadingRef, onCanvasDocumentCommitRef, pageTransitionLockRef]);

  const saveSnapshot = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas || isLoadingRef.current) return;
    const json = JSON.stringify(canvasToJSON(canvas));
    const flags = historyRef.current.push(json);
    onHistoryChange(flags.canUndo, flags.canRedo);
    scheduleCanvasDocumentCommit();
  }, [fabricRef, historyRef, isLoadingRef, onHistoryChange, scheduleCanvasDocumentCommit]);

  const fillPhotoFieldWithSnapshot = useCallback(
    async (canvas: Canvas, field: FabricObject, file: File): Promise<void> => {
      let changed = false;
      isLoadingRef.current = true;
      reportPhotoFillProgress(0);
      try {
        await fillPhotoField(
          canvas,
          field,
          file,
          (fileToResolve, onProgress) =>
            resolveImageFileUrlRef.current?.(fileToResolve, onProgress) ?? Promise.resolve(null),
          () => {
            if (modeRef.current === 'basic') {
              applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
            } else {
              releaseBasicModeConstraints(canvas);
            }
          },
          (value) => reportPhotoFillProgress(value),
        );
        reportPhotoFillProgress(96);
        changed = true;
      } finally {
        isLoadingRef.current = false;
        reportPhotoFillProgress(null);
      }
      if (changed) saveSnapshot();
    },
    [
      isLoadingRef,
      modeRef,
      reportPhotoFillProgress,
      resolveImageFileUrlRef,
      saveSnapshot,
      selectionDisplayScaleRef,
    ],
  );

  const undo = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const target = historyRef.current.moveUndo();
    if (!target) return;
    isLoadingRef.current = true;
    try {
      await canvas.loadFromJSON(JSON.parse(target) as Record<string, unknown>, fabricDeserializeReviver);
      const pw = pageWidthRef.current;
      const ph = pageHeightRef.current;
      await normalizeDesignFieldsOnCanvas(canvas, pw, ph);
      if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
      canvas.requestRenderAll();
    } finally {
      isLoadingRef.current = false;
    }
    const flags = historyRef.current.flags();
    onHistoryChange(flags.canUndo, flags.canRedo);
  }, [
    fabricRef,
    historyRef,
    isLoadingRef,
    modeRef,
    onHistoryChange,
    pageHeightRef,
    pageWidthRef,
    selectionDisplayScaleRef,
  ]);

  const redo = useCallback(async () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const target = historyRef.current.moveRedo();
    if (!target) return;
    isLoadingRef.current = true;
    try {
      await canvas.loadFromJSON(JSON.parse(target) as Record<string, unknown>, fabricDeserializeReviver);
      const pw = pageWidthRef.current;
      const ph = pageHeightRef.current;
      await normalizeDesignFieldsOnCanvas(canvas, pw, ph);
      if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
      canvas.requestRenderAll();
    } finally {
      isLoadingRef.current = false;
    }
    const flags = historyRef.current.flags();
    onHistoryChange(flags.canUndo, flags.canRedo);
  }, [
    fabricRef,
    historyRef,
    isLoadingRef,
    modeRef,
    onHistoryChange,
    pageHeightRef,
    pageWidthRef,
    selectionDisplayScaleRef,
  ]);

  return {
    scheduleCanvasDocumentCommit,
    saveSnapshot,
    fillPhotoFieldWithSnapshot,
    undo,
    redo,
  };
}
