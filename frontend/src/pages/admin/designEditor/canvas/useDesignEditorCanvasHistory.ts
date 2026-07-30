import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import type { Canvas, FabricObject } from 'fabric';
import { normalizeDesignFieldsOnCanvas } from '../designFields';
import { fabricDeserializeReviver } from '../designPageLoader';
import { fillPhotoField, fillPhotoFieldFromStableUrl } from './canvasCommands';
import { applyBasicModeConstraints, releaseBasicModeConstraints } from './canvasBasicMode';
import { lockSacredTextPositions, restoreDesignedTextLayoutsAfterCanvasLoad, finalizeCanvasTextEditingBeforeSave, finalizeCanvasTextEditingPreservingLayout, isAnyTextObjectEditingOnCanvas } from '../textStyleRuns';
import type { CanvasHistoryStack } from './canvasHistory';
import { canvasToJSON } from './canvasSerialization';
import type { EditorMode, ResolveImageFileUrl } from './types';
import {
  recordPublicEditorPerfMetric,
  startPublicEditorPerfSpan,
} from '../../../../features/publicDesignEditor/publicEditorPerf';
import { isPhotoPlacementBatchActive } from '../../../../features/publicDesignEditor/photoPlacementBatchMode';

interface UseDesignEditorCanvasHistoryInput {
  fabricRef: MutableRefObject<Canvas | null>;
  historyRef: MutableRefObject<CanvasHistoryStack>;
  isLoadingRef: MutableRefObject<boolean>;
  pageTransitionLockRef: MutableRefObject<boolean>;
  pageLoadKeyRef: MutableRefObject<string>;
  waitForPageTransitionIdle: () => Promise<void>;
  onCanvasDocumentCommitRef: MutableRefObject<(() => void | Promise<void>) | undefined>;
  documentCommitTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  pageWidthRef: MutableRefObject<number>;
  pageHeightRef: MutableRefObject<number>;
  modeRef: MutableRefObject<EditorMode>;
  selectionDisplayScaleRef: MutableRefObject<number>;
  resolveImageFileUrlRef: MutableRefObject<ResolveImageFileUrl | undefined>;
  reportPhotoFillProgress: (progress: number | null) => void;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  prepareCanvasForPersistenceRef?: MutableRefObject<(() => void) | undefined>;
}

export function useDesignEditorCanvasHistory({
  fabricRef,
  historyRef,
  isLoadingRef,
  pageTransitionLockRef,
  pageLoadKeyRef,
  waitForPageTransitionIdle,
  onCanvasDocumentCommitRef,
  documentCommitTimerRef,
  pageWidthRef,
  pageHeightRef,
  modeRef,
  selectionDisplayScaleRef,
  resolveImageFileUrlRef,
  reportPhotoFillProgress,
  onHistoryChange,
  prepareCanvasForPersistenceRef,
}: UseDesignEditorCanvasHistoryInput) {
  const snapshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const documentCommitEpochRef = useRef(0);

  const invalidatePendingDocumentCommit = useCallback(() => {
    documentCommitEpochRef.current += 1;
    if (snapshotTimerRef.current) {
      clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
    if (documentCommitTimerRef.current) {
      clearTimeout(documentCommitTimerRef.current);
      documentCommitTimerRef.current = null;
    }
  }, [documentCommitTimerRef]);

  const runCanvasDocumentCommit = useCallback(async () => {
    if (!onCanvasDocumentCommitRef.current) return;
    const stop = startPublicEditorPerfSpan('history.documentCommit.ms');
    try {
      await Promise.resolve(onCanvasDocumentCommitRef.current());
    } finally {
      stop();
    }
  }, [onCanvasDocumentCommitRef]);

  const runScheduledDocumentCommit = useCallback(async (epoch: number, scheduledPageLoadKey: string) => {
    if (epoch !== documentCommitEpochRef.current) return;
    if (pageLoadKeyRef.current !== scheduledPageLoadKey) return;
    if (isLoadingRef.current || pageTransitionLockRef.current) {
      const stopWait = startPublicEditorPerfSpan('history.documentCommit.waitIdle.ms');
      await waitForPageTransitionIdle();
      stopWait();
      if (epoch !== documentCommitEpochRef.current) return;
      if (pageLoadKeyRef.current !== scheduledPageLoadKey) return;
      if (isLoadingRef.current || pageTransitionLockRef.current) return;
    }
    await runCanvasDocumentCommit();
  }, [
    isLoadingRef,
    pageLoadKeyRef,
    pageTransitionLockRef,
    runCanvasDocumentCommit,
    waitForPageTransitionIdle,
  ]);

  const scheduleCanvasDocumentCommit = useCallback(() => {
    if (!onCanvasDocumentCommitRef.current) return;
    const epoch = documentCommitEpochRef.current;
    const scheduledPageLoadKey = pageLoadKeyRef.current;
    if (documentCommitTimerRef.current) clearTimeout(documentCommitTimerRef.current);
    documentCommitTimerRef.current = setTimeout(() => {
      documentCommitTimerRef.current = null;
      void runScheduledDocumentCommit(epoch, scheduledPageLoadKey);
    }, 400);
  }, [
    documentCommitTimerRef,
    onCanvasDocumentCommitRef,
    pageLoadKeyRef,
    runScheduledDocumentCommit,
  ]);

  const saveSnapshotNow = useCallback((options?: {
    scheduleDocumentCommit?: boolean;
    movedTextObject?: FabricObject;
    /** Order/flush: завершить inline-edit и снять snapshot даже во время editing. */
    forceExitEditing?: boolean;
  }) => {
    const canvas = fabricRef.current;
    if (!canvas || isLoadingRef.current) return;
    const forceExit = Boolean(options?.forceExitEditing);
    if (!forceExit && isAnyTextObjectEditingOnCanvas(canvas)) return;
    prepareCanvasForPersistenceRef?.current?.();
    // flush перед «Заказать» (forceExit) — без stabilize/lock, иначе top уезжает в pages[].
    if (forceExit && !options?.movedTextObject) {
      finalizeCanvasTextEditingPreservingLayout(canvas);
    } else {
      finalizeCanvasTextEditingBeforeSave(canvas, {
        preserveActiveEditing: !forceExit,
        movedTextObject: options?.movedTextObject,
      });
    }
    const stopSerialize = startPublicEditorPerfSpan('history.snapshot.serialize.ms');
    const json = JSON.stringify(canvasToJSON(canvas));
    stopSerialize();
    recordPublicEditorPerfMetric('history.snapshot.bytes', json.length);
    const flags = historyRef.current.push(json);
    onHistoryChange(flags.canUndo, flags.canRedo);
    if (options?.scheduleDocumentCommit !== false) {
      scheduleCanvasDocumentCommit();
    }
  }, [fabricRef, historyRef, isLoadingRef, onHistoryChange, prepareCanvasForPersistenceRef, scheduleCanvasDocumentCommit]);

  const saveSnapshot = useCallback((options?: { debounce?: boolean; movedTextObject?: FabricObject }) => {
    if (!options?.debounce) {
      if (snapshotTimerRef.current) {
        clearTimeout(snapshotTimerRef.current);
        snapshotTimerRef.current = null;
      }
      saveSnapshotNow({ movedTextObject: options?.movedTextObject });
      return;
    }
    if (snapshotTimerRef.current) clearTimeout(snapshotTimerRef.current);
    snapshotTimerRef.current = setTimeout(() => {
      snapshotTimerRef.current = null;
      saveSnapshotNow();
    }, 500);
  }, [saveSnapshotNow]);

  const flushCanvasDocumentCommit = useCallback(async () => {
    const stopFlush = startPublicEditorPerfSpan('history.flushDocumentCommit.ms');
    try {
      if (snapshotTimerRef.current) {
        clearTimeout(snapshotTimerRef.current);
        snapshotTimerRef.current = null;
      }
      if (documentCommitTimerRef.current) {
        clearTimeout(documentCommitTimerRef.current);
        documentCommitTimerRef.current = null;
      }
      if (isLoadingRef.current || pageTransitionLockRef.current) {
        const stopWait = startPublicEditorPerfSpan('history.flush.waitIdle.ms');
        await waitForPageTransitionIdle();
        stopWait();
      }
      // Всегда свежий snapshot с exitEditing — иначе правки текста во время edit не попадают в pages[].
      saveSnapshotNow({ scheduleDocumentCommit: false, forceExitEditing: true });
      if (isLoadingRef.current || pageTransitionLockRef.current) {
        const stopWait = startPublicEditorPerfSpan('history.flush.waitIdleBeforeCommit.ms');
        await waitForPageTransitionIdle();
        stopWait();
      }
      if (isLoadingRef.current || pageTransitionLockRef.current) return;
      await runCanvasDocumentCommit();
    } finally {
      stopFlush();
    }
  }, [
    documentCommitTimerRef,
    isLoadingRef,
    pageLoadKeyRef,
    pageTransitionLockRef,
    runCanvasDocumentCommit,
    saveSnapshotNow,
    waitForPageTransitionIdle,
  ]);

  useEffect(() => () => {
    if (snapshotTimerRef.current) {
      clearTimeout(snapshotTimerRef.current);
      snapshotTimerRef.current = null;
    }
    if (documentCommitTimerRef.current) {
      clearTimeout(documentCommitTimerRef.current);
      documentCommitTimerRef.current = null;
    }
  }, [documentCommitTimerRef]);

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
      if (changed && !isPhotoPlacementBatchActive()) saveSnapshot();
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

  const fillPhotoFieldWithStableUrlSnapshot = useCallback(
    async (
      canvas: Canvas,
      field: FabricObject,
      url: string,
      originalName?: string,
      originalUrl?: string,
    ): Promise<void> => {
      let changed = false;
      isLoadingRef.current = true;
      reportPhotoFillProgress(0);
      try {
        await fillPhotoFieldFromStableUrl(
          canvas,
          field,
          url,
          originalName,
          () => {
            if (modeRef.current === 'basic') {
              applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
            } else {
              releaseBasicModeConstraints(canvas);
            }
          },
          originalUrl ? { originalUrl } : undefined,
        );
        reportPhotoFillProgress(96);
        changed = true;
      } finally {
        isLoadingRef.current = false;
        reportPhotoFillProgress(null);
      }
      if (changed && !isPhotoPlacementBatchActive()) saveSnapshot();
    },
    [
      isLoadingRef,
      modeRef,
      reportPhotoFillProgress,
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
      const parsed = JSON.parse(target) as Record<string, unknown>;
      await canvas.loadFromJSON(parsed, fabricDeserializeReviver);
      restoreDesignedTextLayoutsAfterCanvasLoad(canvas, parsed);
      const pw = pageWidthRef.current;
      const ph = pageHeightRef.current;
      await normalizeDesignFieldsOnCanvas(canvas, pw, ph);
      if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
      try { lockSacredTextPositions(canvas); } catch {}
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
      const parsed = JSON.parse(target) as Record<string, unknown>;
      await canvas.loadFromJSON(parsed, fabricDeserializeReviver);
      restoreDesignedTextLayoutsAfterCanvasLoad(canvas, parsed);
      const pw = pageWidthRef.current;
      const ph = pageHeightRef.current;
      await normalizeDesignFieldsOnCanvas(canvas, pw, ph);
      if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
      try { lockSacredTextPositions(canvas); } catch {}
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
    invalidatePendingDocumentCommit,
    scheduleCanvasDocumentCommit,
    saveSnapshot,
    flushCanvasDocumentCommit,
    fillPhotoFieldWithSnapshot,
    fillPhotoFieldWithStableUrlSnapshot,
    undo,
    redo,
  };
}
