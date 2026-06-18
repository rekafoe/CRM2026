import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { DesignEditorCanvasHandle } from '../../pages/admin/designEditor/DesignEditorCanvas';
import { EMPTY_PAGE } from '../../pages/admin/designEditor/constants';
import type { PageSaveSnapshot } from '../../pages/admin/designEditor/mergePagesSnapshot';
import { mergeSavedEditorPages } from '../../pages/admin/designEditor/designEditorState';
import { parsePageLoadKey } from '../../pages/admin/designEditor/canvas/canvasSerialization';
import type { DesignPage } from '../../pages/admin/designEditor/types';
import { buildSpreadPageInsert, getLastInnerSpreadRange } from '../../pages/admin/designEditor/spreadUtils';
import type { DesignDocumentNavigationState, PublicDesignDocumentMode } from './useDesignDocumentNavigation';
import { createPageActionQueue } from './pageActionQueue';

export interface PublicDesignPageSpec {
  pageWidth: number;
  pageHeight: number;
  pageCount: number;
  scale: number;
}

export interface PublicDesignPageCountLimits {
  min?: number;
  max?: number;
  step?: number;
}

export interface PublicDesignPageCountAdjustment {
  addedPages: number;
  requestedPages: number;
  step: number;
}

interface UsePublicDesignPageActionsInput {
  canvasHandleRef: RefObject<DesignEditorCanvasHandle | null>;
  currentPage: number;
  documentMode: PublicDesignDocumentMode;
  navigation: DesignDocumentNavigationState;
  pages: DesignPage[];
  pageSpec: PublicDesignPageSpec;
  spreadMode: boolean;
  coverPages: number;
  minimumPageCount: number;
  setPages: Dispatch<SetStateAction<DesignPage[]>>;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  setPageSpec: Dispatch<SetStateAction<PublicDesignPageSpec>>;
  setThumbnails: Dispatch<SetStateAction<Record<number, string>>>;
  markDirty: () => void;
  pageCountLimits?: PublicDesignPageCountLimits;
  onPageCountRejected?: (message: string) => void;
  onPageCountAdjusted?: (adjustment: PublicDesignPageCountAdjustment) => void;
}

export function resolveAllowedPageCountIncrease(input: {
  currentCount: number;
  requestedAddCount: number;
  limits?: PublicDesignPageCountLimits;
  minimumPageCount: number;
}): { ok: true; addCount: number; step: number } | { ok: false; message: string } {
  const current = Math.floor(Number(input.currentCount));
  const requestedAddCount = Math.max(1, Math.floor(Number(input.requestedAddCount)));
  if (!Number.isFinite(current) || current < 1) {
    return { ok: false, message: 'Некорректное количество страниц.' };
  }
  const min = Math.max(input.minimumPageCount, Math.floor(Number(input.limits?.min) || 0));
  const maxRaw = Number(input.limits?.max);
  const max = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.floor(maxRaw) : Number.POSITIVE_INFINITY;
  const step = Math.floor(Number(input.limits?.step) || 0);
  const requestedCount = Math.max(current + requestedAddCount, min);
  let targetCount = requestedCount;
  if (step > 1) {
    const remainder = targetCount % step;
    if (remainder !== 0) targetCount += step - remainder;
  }
  if (targetCount > max) {
    return { ok: false, message: `Для этого продукта доступно не более ${max} стр.` };
  }
  return { ok: true, addCount: targetCount - current, step };
}

export function usePublicDesignPageActions({
  canvasHandleRef,
  currentPage,
  documentMode,
  navigation,
  pages,
  pageSpec,
  spreadMode,
  coverPages,
  minimumPageCount,
  setPages,
  setCurrentPage,
  setPageSpec,
  setThumbnails,
  markDirty,
  pageCountLimits,
  onPageCountRejected,
  onPageCountAdjusted,
}: UsePublicDesignPageActionsInput) {
  const pageActionQueueRef = useRef(createPageActionQueue({
    getIdleSource: () => canvasHandleRef.current,
  }));
  const pagesRef = useRef(pages);
  const pendingPagesWriteRef = useRef<DesignPage[] | null>(null);
  useEffect(() => {
    if (pendingPagesWriteRef.current) {
      if (pages === pendingPagesWriteRef.current) {
        pendingPagesWriteRef.current = null;
        pagesRef.current = pages;
      }
      return;
    }
    pagesRef.current = pages;
  }, [pages]);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const pageMergeIndicesRef = useRef({ leftPageIdx: navigation.leftPageIdx, rightPageIdx: navigation.rightPageIdx });
  pageMergeIndicesRef.current = { leftPageIdx: navigation.leftPageIdx, rightPageIdx: navigation.rightPageIdx };

  const applyPagesUpdate = useCallback((updater: (prev: DesignPage[]) => DesignPage[]) => {
    setPages((prev) => {
      const next = updater(prev);
      pendingPagesWriteRef.current = next;
      pagesRef.current = next;
      return next;
    });
  }, [setPages]);

  const saveCurrentCanvasPage = useCallback(async (): Promise<DesignPage[] | null> => {
    const handle = canvasHandleRef.current;
    if (!handle) return null;
    await handle.whenPageTransitionIdle?.();
    const displayedKey = handle.getDisplayedPageLoadKey?.() ?? null;
    const parsedDisplayed = displayedKey ? parsePageLoadKey(displayedKey) : null;
    const mergeContext = parsedDisplayed?.type === 'spread'
      ? {
          currentPage: parsedDisplayed.left,
          leftPageIdx: parsedDisplayed.left,
          rightPageIdx: parsedDisplayed.right,
        }
      : parsedDisplayed?.type === 'single'
        ? {
            currentPage: parsedDisplayed.index,
            leftPageIdx: -1,
            rightPageIdx: -1,
          }
        : {
            currentPage: currentPageRef.current,
            leftPageIdx: pageMergeIndicesRef.current.leftPageIdx,
            rightPageIdx: pageMergeIndicesRef.current.rightPageIdx,
          };
    const saved = await handle.saveCurrentPage();
    const nextPages = mergeSavedEditorPages(
      pagesRef.current,
      saved as PageSaveSnapshot,
      mergeContext.currentPage,
      mergeContext.leftPageIdx,
      mergeContext.rightPageIdx,
    );
    pendingPagesWriteRef.current = nextPages;
    pagesRef.current = nextPages;
    setPages(nextPages);
    return nextPages;
  }, [canvasHandleRef, setPages]);

  const enqueuePageAction = useCallback((task: () => Promise<void>) => {
    return pageActionQueueRef.current.enqueue(task);
  }, []);

  const commitCanvasToPages = useCallback(async (): Promise<DesignPage[] | null> => {
    let committedPages: DesignPage[] | null = null;
    await enqueuePageAction(async () => {
      committedPages = await saveCurrentCanvasPage();
    });
    return committedPages;
  }, [enqueuePageAction, saveCurrentCanvasPage]);

  const runNavigationTransaction = useCallback(async (
    task: () => Promise<boolean>,
    options?: { markDirtyOnChange?: boolean; flushBefore?: boolean },
  ) => {
    if (options?.flushBefore !== false) {
      await canvasHandleRef.current?.flushPendingDocumentCommit?.();
    }
    await enqueuePageAction(async () => {
      const changed = await task();
      await canvasHandleRef.current?.whenPageTransitionIdle?.();
      if (changed && options?.markDirtyOnChange !== false) markDirty();
    });
  }, [canvasHandleRef, enqueuePageAction, markDirty]);

  const canUsePageCount = useCallback((count: number): { ok: boolean; message?: string } => {
    const next = Math.floor(Number(count));
    if (!Number.isFinite(next) || next < 1) {
      return { ok: false, message: 'Некорректное количество страниц.' };
    }
    const min = Math.max(minimumPageCount, Math.floor(Number(pageCountLimits?.min) || 0));
    if (next < min) {
      return { ok: false, message: `Для этого продукта нужно не менее ${min} стр.` };
    }
    const maxRaw = Number(pageCountLimits?.max);
    if (Number.isFinite(maxRaw) && maxRaw > 0 && next > Math.floor(maxRaw)) {
      return { ok: false, message: `Для этого продукта доступно не более ${Math.floor(maxRaw)} стр.` };
    }
    const step = Math.floor(Number(pageCountLimits?.step) || 0);
    if (step > 1 && next % step !== 0) {
      return { ok: false, message: `Количество страниц должно быть кратно ${step}.` };
    }
    return { ok: true };
  }, [minimumPageCount, pageCountLimits?.max, pageCountLimits?.min, pageCountLimits?.step]);

  const rejectPageCount = useCallback((count: number): boolean => {
    const check = canUsePageCount(count);
    if (check.ok) return false;
    onPageCountRejected?.(check.message ?? 'Недопустимое количество страниц для продукта.');
    return true;
  }, [canUsePageCount, onPageCountRejected]);

  const resolveAddCount = useCallback((requestedAddCount: number) => {
    const resolved = resolveAllowedPageCountIncrease({
      currentCount: pageSpec.pageCount,
      requestedAddCount,
      limits: pageCountLimits,
      minimumPageCount,
    });
    if (!resolved.ok) {
      onPageCountRejected?.(resolved.message);
      return null;
    }
    if (resolved.addCount > requestedAddCount && resolved.step > 1) {
      onPageCountAdjusted?.({
        addedPages: resolved.addCount,
        requestedPages: requestedAddCount,
        step: resolved.step,
      });
    }
    return resolved.addCount;
  }, [
    minimumPageCount,
    onPageCountAdjusted,
    onPageCountRejected,
    pageCountLimits,
    pageSpec.pageCount,
  ]);

  const handleGoToPage = useCallback(async (pageIndex: number) => {
    await runNavigationTransaction(async () => {
      const currentStripItem = navigation.stripItems.find((item) => item.pages.includes(currentPage));
      const targetItem = navigation.stripItems.find(
        (item) => item.goToPage === pageIndex || item.pages.includes(pageIndex),
      );
      if (!targetItem) return false;
      if (currentStripItem === targetItem) return false;
      setCurrentPage(targetItem.goToPage);
      return true;
    }, { markDirtyOnChange: false, flushBefore: false });
  }, [currentPage, navigation.stripItems, runNavigationTransaction, setCurrentPage]);

  const handleAddClientPage = useCallback(async () => {
    const addCount = resolveAddCount(1);
    if (addCount == null) return;
    await runNavigationTransaction(async () => {
      const nextPageIndex = pageSpec.pageCount;
      applyPagesUpdate((prev) => [
        ...Array.from({ length: pageSpec.pageCount }, (_, index) => prev[index] ?? { ...EMPTY_PAGE }),
        ...Array.from({ length: addCount }, () => ({ ...EMPTY_PAGE })),
      ]);
      setPageSpec((spec) => ({ ...spec, pageCount: spec.pageCount + addCount }));
      setCurrentPage(nextPageIndex);
      setThumbnails((prev) => {
        if (!(nextPageIndex in prev)) return prev;
        const next = { ...prev };
        delete next[nextPageIndex];
        return next;
      });
      return true;
    });
  }, [applyPagesUpdate, pageSpec.pageCount, resolveAddCount, runNavigationTransaction, setCurrentPage, setPageSpec, setThumbnails]);

  const handleInsertClientPage = useCallback(async (pageIndex: number) => {
    const addCount = resolveAddCount(1);
    if (addCount == null) return;
    await runNavigationTransaction(async () => {
      const safeIndex = Math.max(0, Math.min(pageSpec.pageCount, pageIndex));
      applyPagesUpdate((prev) => {
        const normalized = Array.from({ length: pageSpec.pageCount }, (_, index) => prev[index] ?? { ...EMPTY_PAGE });
        return [
          ...normalized.slice(0, safeIndex),
          ...Array.from({ length: addCount }, () => ({ ...EMPTY_PAGE })),
          ...normalized.slice(safeIndex),
        ];
      });
      setPageSpec((spec) => ({ ...spec, pageCount: spec.pageCount + addCount }));
      setCurrentPage(safeIndex);
      setThumbnails((prev) => {
        let shifted = prev;
        for (let i = 0; i < addCount; i += 1) {
          shifted = shiftThumbnails(shifted, safeIndex, 1);
        }
        if (!(safeIndex in shifted)) return shifted;
        const next = { ...shifted };
        delete next[safeIndex];
        return next;
      });
      return true;
    });
  }, [
    resolveAddCount,
    pageSpec.pageCount,
    runNavigationTransaction,
    setCurrentPage,
    setPageSpec,
    setThumbnails,
    applyPagesUpdate,
  ]);

  const handleAddClientSpread = useCallback(async () => {
    await runNavigationTransaction(async () => {
      const { insertAt, addCount: requestedAddCount } = spreadMode && documentMode === 'multipage'
        ? buildSpreadPageInsert(pageSpec.pageCount, coverPages)
        : { insertAt: pageSpec.pageCount, addCount: 2 as const };
      const addCount = resolveAddCount(requestedAddCount);
      if (addCount == null) return false;
      applyPagesUpdate((prev) => {
        const normalized = Array.from(
          { length: pageSpec.pageCount },
          (_, index) => prev[index] ?? { ...EMPTY_PAGE },
        );
        return [
          ...normalized.slice(0, insertAt),
          ...Array.from({ length: addCount }, () => ({ ...EMPTY_PAGE })),
          ...normalized.slice(insertAt),
        ];
      });
      setPageSpec((spec) => ({ ...spec, pageCount: spec.pageCount + addCount }));
      setThumbnails((prev) => {
        let next = prev;
        for (let i = 0; i < addCount; i += 1) {
          next = shiftThumbnails(next, insertAt, 1);
        }
        if (insertAt in next || (insertAt + 1) in next) {
          next = { ...next };
          delete next[insertAt];
          delete next[insertAt + 1];
        }
        return next;
      });
      setCurrentPage(insertAt);
      return true;
    });
  }, [
    coverPages,
    documentMode,
    pageSpec.pageCount,
    resolveAddCount,
    runNavigationTransaction,
    setCurrentPage,
    setPageSpec,
    setThumbnails,
    spreadMode,
    applyPagesUpdate,
  ]);

  const handleDeleteClientLast = useCallback(async () => {
    if (pageSpec.pageCount <= minimumPageCount) return;
    await runNavigationTransaction(async () => {

      const spreadRange = spreadMode && documentMode === 'multipage'
        ? getLastInnerSpreadRange(pageSpec.pageCount, coverPages)
        : null;
      const removeStart = spreadRange?.start ?? pageSpec.pageCount - 1;
      const removeCount = spreadRange?.length ?? 1;
      if (rejectPageCount(pageSpec.pageCount - removeCount)) return false;

      if (pageSpec.pageCount - removeCount < minimumPageCount) return false;

      applyPagesUpdate((prev) => {
        const normalized = Array.from(
          { length: pageSpec.pageCount },
          (_, index) => prev[index] ?? { ...EMPTY_PAGE },
        );
        const next = [
          ...normalized.slice(0, removeStart),
          ...normalized.slice(removeStart + removeCount),
        ];
        return next.length ? next : [{ ...EMPTY_PAGE }];
      });
      setPageSpec((spec) => ({ ...spec, pageCount: spec.pageCount - removeCount }));
      setCurrentPage((page) => {
        if (page >= removeStart + removeCount) return Math.max(0, page - removeCount);
        if (page >= removeStart) return Math.max(0, removeStart - 1);
        return page;
      });
      setThumbnails((prev) => {
        let next = prev;
        for (let i = 0; i < removeCount; i += 1) {
          next = shiftThumbnails(next, removeStart + removeCount - i, -1);
        }
        return next;
      });
      return true;
    });
  }, [
    coverPages,
    documentMode,
    minimumPageCount,
    pageSpec.pageCount,
    rejectPageCount,
    runNavigationTransaction,
    setCurrentPage,
    setPageSpec,
    setThumbnails,
    spreadMode,
    applyPagesUpdate,
  ]);

  const handleDeleteClientPage = useCallback(async (pageIndex: number) => {
    if (pageSpec.pageCount <= minimumPageCount) return;
    if (rejectPageCount(pageSpec.pageCount - 1)) return;
    await runNavigationTransaction(async () => {
      const safeIndex = Math.max(0, Math.min(pageSpec.pageCount - 1, pageIndex));
      applyPagesUpdate((prev) => {
        const normalized = Array.from({ length: pageSpec.pageCount }, (_, index) => prev[index] ?? { ...EMPTY_PAGE });
        const next = normalized.filter((_, index) => index !== safeIndex);
        return next.length ? next : [{ ...EMPTY_PAGE }];
      });
      setPageSpec((spec) => ({ ...spec, pageCount: Math.max(minimumPageCount, spec.pageCount - 1) }));
      setCurrentPage((page) => {
        if (page === safeIndex) return Math.max(0, safeIndex - 1);
        if (page > safeIndex) return page - 1;
        return Math.min(page, Math.max(0, pageSpec.pageCount - 2));
      });
      setThumbnails((prev) => shiftThumbnails(prev, safeIndex + 1, -1));
      return true;
    });
  }, [
    minimumPageCount,
    pageSpec.pageCount,
    rejectPageCount,
    runNavigationTransaction,
    setCurrentPage,
    setPageSpec,
    setThumbnails,
    applyPagesUpdate,
  ]);

  return {
    saveCurrentCanvasPage,
    commitCanvasToPages,
    handleGoToPage,
    handleAddClientPage,
    handleInsertClientPage,
    handleAddClientSpread,
    handleDeleteClientLast,
    handleDeleteClientPage,
  };
}

function shiftThumbnails(
  thumbnails: Record<number, string>,
  fromIndex: number,
  delta: 1 | -1,
): Record<number, string> {
  const next: Record<number, string> = {};
  Object.entries(thumbnails).forEach(([rawIndex, value]) => {
    const index = Number(rawIndex);
    if (!Number.isFinite(index)) return;
    if (delta < 0 && index === fromIndex - 1) return;
    next[index >= fromIndex ? index + delta : index] = value;
  });
  return next;
}
