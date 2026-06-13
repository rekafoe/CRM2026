import type { Dispatch, SetStateAction } from 'react';
import type { Canvas } from 'fabric';
import type { DesignTemplate } from '../../../../api';
import type { DesignPage } from '../types';
import { cropSpreadThumbnail } from '../cropSpreadThumbnail';
import { loadDesignPageScene, loadSpreadMergedScene } from '../designPageLoader';
import { splitSpreadCanvasToPagesSync } from '../spreadCanvas';
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
  const { setPages, onHistoryChange, apiBaseUrl } = callbacks;

  try {
    let snapshotPages: DesignPage[] = pagesRef.current;
    let pagesChanged = false;
    const objectCountBeforeFlush = canvas.getObjects().length;

    if (prevKey != null) {
      const parsedPrev = parsePageLoadKey(prevKey);
      if (parsedPrev?.type === 'spread') {
        const { left, right } = splitSpreadCanvasToPagesSync(canvas, pageWidthRef.current);
        snapshotPages = pagesRef.current.map((p, i) => {
          if (i === parsedPrev.left) return { fabricJSON: left };
          if (i === parsedPrev.right) return { fabricJSON: right };
          return p;
        });
        pagesChanged = true;
        await emitSpreadPageThumbs(canvas, parsedPrev.left, parsedPrev.right, pageThumbReadyRef.current);
      } else if (parsedPrev?.type === 'single') {
        const json = canvasToJSON(canvas);
        snapshotPages = pagesRef.current.map((p, i) =>
          i === parsedPrev.index ? { fabricJSON: json } : p,
        );
        pagesChanged = true;
        await emitSinglePageThumb(canvas, parsedPrev.index, pageThumbReadyRef.current);
      }
    }

    if (pagesChanged) {
      // Transition runner is the canonical writer for outgoing flush; keep ref in sync immediately
      // so loadIncoming never reads stale pages between async React renders.
      pagesRef.current = snapshotPages;
    }

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

    if (pagesChanged) setPages(snapshotPages);

    if (modeRef.current === 'basic') applyBasicModeConstraints(canvas, selectionDisplayScaleRef.current);
    else lockTextInlineEditing(canvas);
    const snap = JSON.stringify(canvasToJSON(canvas));
    historyRef.current.reset(snap);

    if (parsedNext?.type === 'spread') {
      await emitSpreadPageThumbs(canvas, parsedNext.left, parsedNext.right, pageThumbReadyRef.current);
    } else if (parsedNext?.type === 'single') {
      await emitSinglePageThumb(canvas, parsedNext.index, pageThumbReadyRef.current);
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
