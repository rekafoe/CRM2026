import type { Dispatch, SetStateAction } from 'react';
import type { Canvas } from 'fabric';
import type { DesignTemplate } from '../../../../api';
import type { DesignPage } from '../types';
import { cropSpreadThumbnail } from '../cropSpreadThumbnail';
import { loadDesignPageScene, loadSpreadMergedScene } from '../designPageLoader';
import type { EditorMode } from './types';
import { applyBasicModeConstraints, lockTextInlineEditing } from './canvasBasicMode';
import { canvasToJSON, parsePageLoadKey } from './canvasSerialization';
import type { CanvasHistoryStack } from './canvasHistory';
import type { PageLoadKeyTransitionResult } from './pageTransitionInvariant';

export interface PageLoadKeyTransitionRefs {
  pageLoadKeyRef: { current: string };
  pagesRef: { current: DesignPage[] };
  pageWidthRef: { current: number };
  pageHeightRef: { current: number };
  templateRef: { current: DesignTemplate | null };
  modeRef: { current: EditorMode };
  isLoadingRef: { current: boolean };
  pageTransitionLockRef: { current: boolean };
  prevPageLoadKeyRef: { current: string | null };
  loadedPageForInstanceRef: { current: number };
  historyRef: { current: CanvasHistoryStack };
  pageThumbReadyRef: { current: ((pageIndex: number, thumbUrl: string) => void) | undefined };
  selectionDisplayScaleRef: { current: number };
}

export interface PageLoadKeyTransitionCallbacks {
  setPages: Dispatch<SetStateAction<DesignPage[]>>;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  apiBaseUrl: string;
}

export interface PageLoadKeyTransitionParams {
  canvas: Canvas;
  targetKey: string;
  prevKey: string | null;
  canvasInstance: number;
  refs: PageLoadKeyTransitionRefs;
  callbacks: PageLoadKeyTransitionCallbacks;
}

type TransitionObjectDigest = {
  key: string;
  type: string;
  id: string | null;
};

function buildTransitionObjectDigest(canvas: Canvas): TransitionObjectDigest[] {
  return canvas.getObjects().map((obj, index) => {
    const anyObj = obj as unknown as { id?: unknown; type?: unknown };
    const type = typeof anyObj.type === 'string' ? anyObj.type : obj.type ?? 'unknown';
    const id = typeof anyObj.id === 'string' ? anyObj.id : null;
    return {
      key: id ? `${type}:${id}` : `${type}:#${index}`,
      type,
      id,
    };
  });
}

function buildTypeHistogram(digest: TransitionObjectDigest[]): Record<string, number> {
  const histogram: Record<string, number> = {};
  digest.forEach((item) => {
    histogram[item.type] = (histogram[item.type] ?? 0) + 1;
  });
  return histogram;
}

function logTransitionLossIfAny(input: {
  targetKey: string;
  prevKey: string | null;
  beforeDigest: TransitionObjectDigest[];
  afterDigest: TransitionObjectDigest[];
}): void {
  if (!import.meta.env.DEV) return;
  const { targetKey, prevKey, beforeDigest, afterDigest } = input;
  const beforeKeys = new Set(beforeDigest.map((item) => item.key));
  const afterKeys = new Set(afterDigest.map((item) => item.key));
  const dropped = beforeDigest.filter((item) => !afterKeys.has(item.key));
  const appeared = afterDigest.filter((item) => !beforeKeys.has(item.key));
  if (dropped.length === 0 && appeared.length === 0) return;
  console.warn('[DesignEditorCanvas] transition object delta', {
    prevKey,
    targetKey,
    beforeCount: beforeDigest.length,
    afterCount: afterDigest.length,
    beforeTypes: buildTypeHistogram(beforeDigest),
    afterTypes: buildTypeHistogram(afterDigest),
    dropped: dropped.slice(0, 20).map((item) => ({ key: item.key, type: item.type, id: item.id })),
    appeared: appeared.slice(0, 20).map((item) => ({ key: item.key, type: item.type, id: item.id })),
  });
}

async function emitSinglePageThumb(
  canvas: Canvas,
  pageIndex: number,
  pageThumbReady: ((pageIndex: number, thumbUrl: string) => void) | undefined,
): Promise<void> {
  try {
    const thumbUrl = canvas.toDataURL({ format: 'jpeg', multiplier: 0.14, quality: 0.7 });
    pageThumbReady?.(pageIndex, thumbUrl);
  } catch {
    // Thumbnail export must never block page switching (CORS/tainted canvas, decode errors).
  }
}

function shouldEmitIncomingThumb(canvas: Canvas, pageIndex: number): boolean {
  void canvas;
  void pageIndex;
  return true;
}

async function emitSpreadPageThumbs(
  canvas: Canvas,
  leftPageIndex: number,
  rightPageIndex: number,
  pageThumbReady: ((pageIndex: number, thumbUrl: string) => void) | undefined,
): Promise<void> {
  try {
    const thumbUrl = canvas.toDataURL({ format: 'jpeg', multiplier: 0.14, quality: 0.7 });
    const spreadThumbs = await cropSpreadThumbnail(thumbUrl);
    pageThumbReady?.(leftPageIndex, spreadThumbs.left);
    pageThumbReady?.(rightPageIndex, spreadThumbs.right);
  } catch {
    // Thumbnail export must never block page switching (CORS/tainted canvas, decode errors).
  }
}

function schedulePageThumbEmit(input: {
  canvas: Canvas;
  targetKey: string;
  parsedNext: NonNullable<ReturnType<typeof parsePageLoadKey>>;
  pageLoadKeyRef: { current: string };
  pageThumbReady: ((pageIndex: number, thumbUrl: string) => void) | undefined;
}): void {
  const { canvas, targetKey, parsedNext, pageLoadKeyRef, pageThumbReady } = input;
  if (!pageThumbReady) return;
  window.setTimeout(() => {
    if (pageLoadKeyRef.current !== targetKey) return;
    if (parsedNext.type === 'spread') {
      void emitSpreadPageThumbs(canvas, parsedNext.left, parsedNext.right, pageThumbReady);
      return;
    }
    void emitSinglePageThumb(canvas, parsedNext.index, pageThumbReady);
  }, 80);
}

/** Async split/save outgoing page + load incoming page/spread by pageLoadKey. */
export async function runPageLoadKeyTransition({
  canvas,
  targetKey,
  prevKey,
  canvasInstance,
  refs,
  callbacks,
}: PageLoadKeyTransitionParams): Promise<PageLoadKeyTransitionResult> {
  const {
    pageLoadKeyRef,
    pagesRef,
    pageWidthRef,
    pageHeightRef,
    templateRef,
    modeRef,
    isLoadingRef,
    pageTransitionLockRef,
    prevPageLoadKeyRef,
    loadedPageForInstanceRef,
    historyRef,
    pageThumbReadyRef,
    selectionDisplayScaleRef,
  } = refs;
  const { onHistoryChange, apiBaseUrl } = callbacks;

  try {
    const snapshotPages: DesignPage[] = pagesRef.current;
    const beforeDigest = buildTransitionObjectDigest(canvas);
    const objectCountBeforeFlush = canvas.getObjects().length;

    historyRef.current.reset();
    onHistoryChange(false, false);

    const parsedNext = parsePageLoadKey(targetKey);
    if (!parsedNext) {
      throw new Error(`Invalid pageLoadKey: ${targetKey}`);
    }
    const pw = pageWidthRef.current;
    const ph = pageHeightRef.current;

    if (parsedNext?.type === 'spread') {
      canvas.setDimensions({ width: pw * 2, height: ph });
      isLoadingRef.current = true;
      await loadSpreadMergedScene({
        canvas,
        leftPage: snapshotPages[parsedNext.left],
        rightPage: snapshotPages[parsedNext.right],
        leftPageIndex: parsedNext.left,
        rightPageIndex: parsedNext.right,
        pageW: pw,
        pageH: ph,
        template: templateRef.current,
        apiBaseUrl,
      });
      prevPageLoadKeyRef.current = targetKey;
      loadedPageForInstanceRef.current = canvasInstance;
    } else if (parsedNext?.type === 'single') {
      canvas.setDimensions({ width: pw, height: ph });
      isLoadingRef.current = true;
      await loadDesignPageScene({
        canvas,
        pageData: snapshotPages[parsedNext.index],
        pageIndex: parsedNext.index,
        template: templateRef.current,
        pageW: pw,
        pageH: ph,
        apiBaseUrl,
      });
      prevPageLoadKeyRef.current = targetKey;
      loadedPageForInstanceRef.current = canvasInstance;
    }

    logTransitionLossIfAny({
      targetKey,
      prevKey,
      beforeDigest,
      afterDigest: buildTransitionObjectDigest(canvas),
    });

    if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
    else lockTextInlineEditing(canvas);
    const snap = JSON.stringify(canvasToJSON(canvas));
    historyRef.current.reset(snap);

    if (
      parsedNext?.type === 'spread'
      || (parsedNext?.type === 'single' && shouldEmitIncomingThumb(canvas, parsedNext.index))
    ) {
      schedulePageThumbEmit({
        canvas,
        targetKey,
        parsedNext,
        pageLoadKeyRef,
        pageThumbReady: pageThumbReadyRef.current,
      });
    }

    prevPageLoadKeyRef.current = targetKey;
    loadedPageForInstanceRef.current = canvasInstance;
    return {
      displayedKey: targetKey,
      canvasInstance,
      activePageIndex: parsedNext.type === 'single' ? parsedNext.index : parsedNext.left,
      objectCountBeforeFlush,
      objectCountAfterLoad: canvas.getObjects().length,
    };
  } finally {
    isLoadingRef.current = false;
    if (pageLoadKeyRef.current === targetKey) {
      pageTransitionLockRef.current = false;
    }
  }
}
