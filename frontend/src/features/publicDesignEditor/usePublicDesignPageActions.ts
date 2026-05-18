import { useCallback } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { DesignEditorCanvasHandle } from '../../pages/admin/designEditor/DesignEditorCanvas';
import { EMPTY_PAGE } from '../../pages/admin/designEditor/constants';
import type { PageSaveSnapshot } from '../../pages/admin/designEditor/mergePagesSnapshot';
import { mergeSavedEditorPages } from '../../pages/admin/designEditor/designEditorState';
import type { DesignPage } from '../../pages/admin/designEditor/types';
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
    await saveCurrentCanvasPage();
    setCurrentPage(pageIndex);
  }, [saveCurrentCanvasPage, setCurrentPage]);

  const handleAddClientPage = useCallback(async () => {
    await saveCurrentCanvasPage();
    const nextPageIndex = pageSpec.pageCount;
    setPages((prev) => [...prev, { ...EMPTY_PAGE }]);
    setPageSpec((spec) => ({ ...spec, pageCount: spec.pageCount + 1 }));
    setCurrentPage(nextPageIndex);
    markDirty();
  }, [markDirty, pageSpec.pageCount, saveCurrentCanvasPage, setCurrentPage, setPageSpec, setPages]);

  const handleAddClientSpread = useCallback(async () => {
    await saveCurrentCanvasPage();
    const nextPageIndex = pageSpec.pageCount;
    setPages((prev) => [...prev, { ...EMPTY_PAGE }, { ...EMPTY_PAGE }]);
    setPageSpec((spec) => ({ ...spec, pageCount: spec.pageCount + 2 }));
    setCurrentPage(nextPageIndex);
    markDirty();
  }, [markDirty, pageSpec.pageCount, saveCurrentCanvasPage, setCurrentPage, setPageSpec, setPages]);

  const handleDeleteClientLast = useCallback(async () => {
    const removeCount = spreadMode && documentMode === 'multipage' ? 2 : 1;
    if (pageSpec.pageCount <= minimumPageCount) return;
    await saveCurrentCanvasPage();
    const safeRemoveCount = Math.min(removeCount, pageSpec.pageCount - minimumPageCount);
    setPages((prev) => {
      const next = prev.slice(0, Math.max(minimumPageCount, prev.length - safeRemoveCount));
      return next.length ? next : [{ ...EMPTY_PAGE }];
    });
    setPageSpec((spec) => ({ ...spec, pageCount: Math.max(minimumPageCount, spec.pageCount - safeRemoveCount) }));
    setCurrentPage((page) => Math.min(page, Math.max(0, pageSpec.pageCount - safeRemoveCount - 1)));
    setThumbnails((prev) => {
      const next = { ...prev };
      for (let i = 0; i < safeRemoveCount; i += 1) delete next[pageSpec.pageCount - 1 - i];
      return next;
    });
    markDirty();
  }, [
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

  return {
    saveCurrentCanvasPage,
    handleGoToPage,
    handleAddClientPage,
    handleAddClientSpread,
    handleDeleteClientLast,
  };
}
