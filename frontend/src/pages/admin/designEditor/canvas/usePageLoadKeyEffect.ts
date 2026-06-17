import { useEffect, useRef, type RefObject } from 'react';
import type { Canvas } from 'fabric';
import type { DesignTemplate } from '../../../../api';
import type { DesignPage } from '../types';
import type { PageTransitionGate } from '../pageTransitionGate';
import type { EditorMode } from './types';
import type { CanvasHistoryStack } from './canvasHistory';
import {
  runPageLoadKeyTransition,
  type PageLoadKeyTransitionCallbacks,
  type PageLoadKeyTransitionRefs,
} from './canvasPageTransitions';
import { getPageTransitionInvariantError } from './pageTransitionInvariant';

export interface UsePageLoadKeyEffectInput {
  fabricRef: RefObject<Canvas | null>;
  canvasReady: boolean;
  pageLoadKey: string;
  apiBaseUrl: string;
  setPages: React.Dispatch<React.SetStateAction<DesignPage[]>>;
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  pageTransitionGate: PageTransitionGate;
  prevPageLoadKeyRef: { current: string | null };
  canvasInstanceRef: { current: number };
  loadedPageForInstanceRef: { current: number };
  pageTransitionLockRef: { current: boolean };
  pageLoadKeyRef: { current: string };
  pagesRef: { current: DesignPage[] };
  pageWidthRef: { current: number };
  pageHeightRef: { current: number };
  templateRef: { current: DesignTemplate | null };
  modeRef: { current: EditorMode };
  isLoadingRef: { current: boolean };
  historyRef: { current: CanvasHistoryStack };
  pageThumbReadyRef: { current: ((pageIndex: number, thumbUrl: string) => void) | undefined };
  selectionDisplayScaleRef: { current: number };
  invalidatePendingDocumentCommit?: () => void;
}

/**
 * Смена страницы / разворота по pageLoadKey.
 * Должен идти ПЕРЕД синхронным resize по canvasWidthPx — иначе split увидит неверную геометрию.
 */
export function usePageLoadKeyEffect(input: UsePageLoadKeyEffectInput): void {
  const {
    fabricRef,
    canvasReady,
    pageLoadKey,
    apiBaseUrl,
    setPages,
    onHistoryChange,
    pageTransitionGate,
    prevPageLoadKeyRef,
    canvasInstanceRef,
    loadedPageForInstanceRef,
    pageTransitionLockRef,
    pageLoadKeyRef,
    pagesRef,
    pageWidthRef,
    pageHeightRef,
    templateRef,
    modeRef,
    isLoadingRef,
    historyRef,
    pageThumbReadyRef,
    selectionDisplayScaleRef,
    invalidatePendingDocumentCommit,
  } = input;
  const requestedKeyRef = useRef(pageLoadKey);
  const drainingRef = useRef(false);

  useEffect(() => {
    requestedKeyRef.current = pageLoadKey;
    if (!fabricRef.current || !canvasReady) return;
    if (drainingRef.current) return;

    invalidatePendingDocumentCommit?.();
    drainingRef.current = true;
    pageTransitionGate.begin();

    void (async () => {
      try {
        const refs: PageLoadKeyTransitionRefs = {
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
        };
        const callbacks: PageLoadKeyTransitionCallbacks = {
          setPages,
          onHistoryChange,
          apiBaseUrl,
        };

        let drainIterations = 0;
        let invariantRetryKey: string | null = null;
        let invariantRetryCount = 0;
        while (fabricRef.current && canvasReady) {
          drainIterations += 1;
          if (drainIterations > 48) {
            if (import.meta.env.DEV) {
              console.warn('[DesignEditorCanvas] transition drain reached safety limit', {
                requestedKey: requestedKeyRef.current,
                displayedKey: prevPageLoadKeyRef.current,
              });
            }
            break;
          }
          const targetKey = requestedKeyRef.current;
          const prevKey = prevPageLoadKeyRef.current;
          const canvasInstance = canvasInstanceRef.current;
          const canvas = fabricRef.current;
          if (
            prevKey === targetKey
            && loadedPageForInstanceRef.current === canvasInstance
          ) {
            break;
          }

          pageTransitionLockRef.current = true;
          let result: Awaited<ReturnType<typeof runPageLoadKeyTransition>> | null = null;
          try {
            result = await runPageLoadKeyTransition({
              canvas,
              targetKey,
              prevKey,
              canvasInstance,
              refs,
              callbacks,
            });
          } catch (transitionError) {
            if (import.meta.env.DEV) {
              console.warn('[DesignEditorCanvas] transition iteration failed, retrying drain', {
                targetKey,
                requestedKey: requestedKeyRef.current,
                error: transitionError,
              });
            }
            if (requestedKeyRef.current === targetKey) {
              prevPageLoadKeyRef.current = null;
            }
            continue;
          }
          const invariantError = getPageTransitionInvariantError({
            result,
            targetKey,
            requestedKey: requestedKeyRef.current,
            displayedKey: prevPageLoadKeyRef.current,
            loadedCanvasInstance: loadedPageForInstanceRef.current,
            expectedCanvasInstance: canvasInstance,
          });
          if (invariantError) {
            if (import.meta.env.DEV) {
              console.warn('[DesignEditorCanvas] transition invariant mismatch, self-healing', {
                targetKey,
                requestedKey: requestedKeyRef.current,
                invariantError,
              });
            }
            if (invariantRetryKey === targetKey) {
              invariantRetryCount += 1;
            } else {
              invariantRetryKey = targetKey;
              invariantRetryCount = 1;
            }
            if (invariantRetryCount <= 2) {
              prevPageLoadKeyRef.current = null;
              loadedPageForInstanceRef.current = -1;
              continue;
            }
          } else {
            invariantRetryKey = null;
            invariantRetryCount = 0;
          }
          if (import.meta.env.DEV) {
            canvas.upperCanvasEl.dataset.pageRequestedKey = targetKey;
            canvas.upperCanvasEl.dataset.pageDisplayedKey = result.displayedKey;
            canvas.upperCanvasEl.dataset.pageActiveIndex = String(result.activePageIndex);
            canvas.upperCanvasEl.dataset.pageObjectCountBeforeFlush = String(result.objectCountBeforeFlush);
            canvas.upperCanvasEl.dataset.pageObjectCount = String(canvas.getObjects().length);
            canvas.upperCanvasEl.dataset.pageObjectCountAfterLoad = String(result.objectCountAfterLoad);
          }

          if (requestedKeyRef.current === targetKey) break;
        }
      } catch (error) {
        // Ошибка загрузки страницы не должна оставлять pagestrip в busy-состоянии.
        if (import.meta.env.DEV) {
          console.error('[DesignEditorCanvas] page transition failed', error);
        }
      } finally {
        drainingRef.current = false;
        pageTransitionLockRef.current = false;
        pageTransitionGate.end();
      }
    })();

    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageLoadKey, canvasReady, invalidatePendingDocumentCommit]);
}
