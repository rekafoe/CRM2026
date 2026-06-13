import { useCallback, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { DesignEditorCanvasHandle } from '../../pages/admin/designEditor/DesignEditorCanvas';
import { EMPTY_PAGE } from '../../pages/admin/designEditor/constants';
import type { PageSaveSnapshot } from '../../pages/admin/designEditor/mergePagesSnapshot';
import { mergeSavedEditorPages } from '../../pages/admin/designEditor/designEditorState';
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

interface UsePublicDesignPageActionsInput {
  canvasHandleRef: RefObject<DesignEditorCanvasHandle | null>;
  currentPage: number;
  documentMode: PublicDesignDocumentMode;
  navigation: DesignDocumentNavigationState;
  pageSpec: PublicDesignPageSpec;
  spreadMode: boolean;
  coverPages: number;
  minimumPageCount: number;
  setPages: Dispatch<SetStateAction<DesignPage[]>>;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  setPageSpec: Dispatch<SetStateAction<PublicDesignPageSpec>>;
  setThumbnails: Dispatch<SetStateAction<Record<number, string>>>;
  markDirty: () => void;
}

export function usePublicDesignPageActions({
  canvasHandleRef,
  currentPage,
  documentMode,
  navigation,
  pageSpec,
  spreadMode,
  coverPages,
  minimumPageCount,
  setPages,
  setCurrentPage,
  setPageSpec,
  setThumbnails,
  markDirty,
}: UsePublicDesignPageActionsInput) {
  const pageActionQueueRef = useRef(createPageActionQueue({
    getIdleSource: () => canvasHandleRef.current,
  }));

  const saveCurrentCanvasPage = useCallback(async () => {
    const handle = canvasHandleRef.current;
    if (!handle) return;
    await handle.whenPageTransitionIdle?.();
    const saved = await handle.saveCurrentPage();
    setPages((currentPages) => mergeSavedEditorPages(
      currentPages,
      saved as PageSaveSnapshot,
      currentPage,
      navigation.leftPageIdx,
      navigation.rightPageIdx,
    ));
  }, [canvasHandleRef, currentPage, navigation.leftPageIdx, navigation.rightPageIdx, setPages]);

  const enqueuePageAction = useCallback((task: () => Promise<void>) => {
    return pageActionQueueRef.current.enqueue(task);
  }, []);

  const runNavigationTransaction = useCallback(async (
    task: () => Promise<boolean>,
  ) => {
    await enqueuePageAction(async () => {
      const changed = await task();
      await canvasHandleRef.current?.whenPageTransitionIdle?.();
      if (changed) markDirty();
    });
  }, [canvasHandleRef, enqueuePageAction, markDirty]);

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
    });
  }, [currentPage, navigation.stripItems, runNavigationTransaction, setCurrentPage]);

  const handleAddClientPage = useCallback(async () => {
    await runNavigationTransaction(async () => {
      const nextPageIndex = pageSpec.pageCount;
      setPages((prev) => [
        ...Array.from({ length: pageSpec.pageCount }, (_, index) => prev[index] ?? { ...EMPTY_PAGE }),
        { ...EMPTY_PAGE },
      ]);
      setPageSpec((spec) => ({ ...spec, pageCount: spec.pageCount + 1 }));
      setCurrentPage(nextPageIndex);
      return true;
    });
  }, [pageSpec.pageCount, runNavigationTransaction, setCurrentPage, setPageSpec, setPages]);

  const handleInsertClientPage = useCallback(async (pageIndex: number) => {
    await runNavigationTransaction(async () => {
      const safeIndex = Math.max(0, Math.min(pageSpec.pageCount, pageIndex));
      setPages((prev) => {
        const normalized = Array.from({ length: pageSpec.pageCount }, (_, index) => prev[index] ?? { ...EMPTY_PAGE });
        return [
          ...normalized.slice(0, safeIndex),
          { ...EMPTY_PAGE },
          ...normalized.slice(safeIndex),
        ];
      });
      setPageSpec((spec) => ({ ...spec, pageCount: spec.pageCount + 1 }));
      setCurrentPage(safeIndex);
      setThumbnails((prev) => shiftThumbnails(prev, safeIndex, 1));
      return true;
    });
  }, [
    pageSpec.pageCount,
    runNavigationTransaction,
    setCurrentPage,
    setPageSpec,
    setPages,
    setThumbnails,
  ]);

  const handleAddClientSpread = useCallback(async () => {
    await runNavigationTransaction(async () => {
      const { insertAt, addCount } = spreadMode && documentMode === 'multipage'
        ? buildSpreadPageInsert(pageSpec.pageCount, coverPages)
        : { insertAt: pageSpec.pageCount, addCount: 2 as const };
      setPages((prev) => {
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
        return next;
      });
      setCurrentPage(insertAt);
      return true;
    });
  }, [
    coverPages,
    documentMode,
    pageSpec.pageCount,
    runNavigationTransaction,
    setCurrentPage,
    setPageSpec,
    setPages,
    setThumbnails,
    spreadMode,
  ]);

  const handleDeleteClientLast = useCallback(async () => {
    if (pageSpec.pageCount <= minimumPageCount) return;
    await runNavigationTransaction(async () => {

      const spreadRange = spreadMode && documentMode === 'multipage'
        ? getLastInnerSpreadRange(pageSpec.pageCount, coverPages)
        : null;
      const removeStart = spreadRange?.start ?? pageSpec.pageCount - 1;
      const removeCount = spreadRange?.length ?? 1;

      if (pageSpec.pageCount - removeCount < minimumPageCount) return false;

      setPages((prev) => {
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
    runNavigationTransaction,
    setCurrentPage,
    setPageSpec,
    setPages,
    setThumbnails,
    spreadMode,
  ]);

  const handleDeleteClientPage = useCallback(async (pageIndex: number) => {
    if (pageSpec.pageCount <= minimumPageCount) return;
    await runNavigationTransaction(async () => {
      const safeIndex = Math.max(0, Math.min(pageSpec.pageCount - 1, pageIndex));
      setPages((prev) => {
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
    runNavigationTransaction,
    setCurrentPage,
    setPageSpec,
    setPages,
    setThumbnails,
  ]);

  return {
    saveCurrentCanvasPage,
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
