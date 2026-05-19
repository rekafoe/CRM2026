import { useCallback } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { DesignEditorCanvasHandle } from '../../pages/admin/designEditor/DesignEditorCanvas';
import { EMPTY_PAGE } from '../../pages/admin/designEditor/constants';
import type { PageSaveSnapshot } from '../../pages/admin/designEditor/mergePagesSnapshot';
import { mergeSavedEditorPages } from '../../pages/admin/designEditor/designEditorState';
import type { DesignPage } from '../../pages/admin/designEditor/types';
import { getLastInnerSpreadRange, getSpreadInsertIndex } from '../../pages/admin/designEditor/spreadUtils';
import type { DesignDocumentNavigationState, PublicDesignDocumentMode } from './useDesignDocumentNavigation';

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
  const saveCurrentCanvasPage = useCallback(async () => {
    const handle = canvasHandleRef.current;
    if (!handle) return;
    const saved = await handle.saveCurrentPage();
    setPages((currentPages) => mergeSavedEditorPages(
      currentPages,
      saved as PageSaveSnapshot,
      currentPage,
      navigation.leftPageIdx,
      navigation.rightPageIdx,
    ));
  }, [canvasHandleRef, currentPage, navigation.leftPageIdx, navigation.rightPageIdx, setPages]);

  const handleGoToPage = useCallback(async (pageIndex: number) => {
    const targetItem = navigation.stripItems.find(
      (item) => item.goToPage === pageIndex || item.pages.includes(pageIndex),
    );
    if (!targetItem) return;
    if (targetItem.pages.includes(currentPage)) return;

    await saveCurrentCanvasPage();
    setCurrentPage(targetItem.goToPage);
  }, [currentPage, navigation.stripItems, saveCurrentCanvasPage, setCurrentPage]);

  const handleAddClientPage = useCallback(async () => {
    await saveCurrentCanvasPage();
    const nextPageIndex = pageSpec.pageCount;
    setPages((prev) => [
      ...Array.from({ length: pageSpec.pageCount }, (_, index) => prev[index] ?? { ...EMPTY_PAGE }),
      { ...EMPTY_PAGE },
    ]);
    setPageSpec((spec) => ({ ...spec, pageCount: spec.pageCount + 1 }));
    setCurrentPage(nextPageIndex);
    markDirty();
  }, [markDirty, pageSpec.pageCount, saveCurrentCanvasPage, setCurrentPage, setPageSpec, setPages]);

  const handleInsertClientPage = useCallback(async (pageIndex: number) => {
    await saveCurrentCanvasPage();
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
    markDirty();
  }, [
    markDirty,
    pageSpec.pageCount,
    saveCurrentCanvasPage,
    setCurrentPage,
    setPageSpec,
    setPages,
    setThumbnails,
  ]);

  const handleAddClientSpread = useCallback(async () => {
    await saveCurrentCanvasPage();
    const insertAt = spreadMode && documentMode === 'multipage'
      ? getSpreadInsertIndex(pageSpec.pageCount, coverPages)
      : pageSpec.pageCount;
    setPages((prev) => {
      const normalized = Array.from(
        { length: pageSpec.pageCount },
        (_, index) => prev[index] ?? { ...EMPTY_PAGE },
      );
      return [
        ...normalized.slice(0, insertAt),
        { ...EMPTY_PAGE },
        { ...EMPTY_PAGE },
        ...normalized.slice(insertAt),
      ];
    });
    setPageSpec((spec) => ({ ...spec, pageCount: spec.pageCount + 2 }));
    setThumbnails((prev) => shiftThumbnails(shiftThumbnails(prev, insertAt, 1), insertAt, 1));
    setCurrentPage(insertAt);
    markDirty();
  }, [
    coverPages,
    documentMode,
    markDirty,
    pageSpec.pageCount,
    saveCurrentCanvasPage,
    setCurrentPage,
    setPageSpec,
    setPages,
    setThumbnails,
    spreadMode,
  ]);

  const handleDeleteClientLast = useCallback(async () => {
    if (pageSpec.pageCount <= minimumPageCount) return;
    await saveCurrentCanvasPage();

    const spreadRange = spreadMode && documentMode === 'multipage'
      ? getLastInnerSpreadRange(pageSpec.pageCount, coverPages)
      : null;
    const removeStart = spreadRange?.start ?? pageSpec.pageCount - 1;
    const removeCount = spreadRange?.length ?? 1;

    if (pageSpec.pageCount - removeCount < minimumPageCount) return;

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
    markDirty();
  }, [
    coverPages,
    documentMode,
    markDirty,
    minimumPageCount,
    pageSpec.pageCount,
    saveCurrentCanvasPage,
    setCurrentPage,
    setPageSpec,
    setPages,
    setThumbnails,
    spreadMode,
  ]);

  const handleDeleteClientPage = useCallback(async (pageIndex: number) => {
    if (pageSpec.pageCount <= minimumPageCount) return;
    await saveCurrentCanvasPage();
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
    markDirty();
  }, [
    markDirty,
    minimumPageCount,
    pageSpec.pageCount,
    saveCurrentCanvasPage,
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
