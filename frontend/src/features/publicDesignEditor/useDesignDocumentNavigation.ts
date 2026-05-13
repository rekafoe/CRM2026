import { useMemo } from 'react';
import { buildStripItems } from '../../pages/admin/designEditor/spreadUtils';

export type PublicDesignDocumentMode = 'single' | 'multipage';

export interface DesignDocumentNavigationState {
  stripItems: ReturnType<typeof buildStripItems>;
  isSpreadView: boolean;
  leftPageIdx: number;
  rightPageIdx: number;
  pageLoadKey: string;
  spreadPairPages: [number, number] | null;
}

export function useDesignDocumentNavigation(input: {
  mode: PublicDesignDocumentMode;
  pageCount: number;
  currentPage: number;
  spreadMode: boolean;
  coverPages: number;
}): DesignDocumentNavigationState {
  const { mode, pageCount, currentPage, spreadMode, coverPages } = input;
  const effectiveSpreadMode = mode === 'multipage' && spreadMode;
  const stripItems = useMemo(
    () => buildStripItems(pageCount, effectiveSpreadMode, coverPages),
    [pageCount, effectiveSpreadMode, coverPages],
  );
  const currentStripItem = stripItems.find((item) => item.pages.includes(currentPage));
  const isSpreadView = effectiveSpreadMode && (currentStripItem?.pages.length ?? 1) === 2;
  const leftPageIdx = isSpreadView ? (currentStripItem?.pages[0] ?? currentPage) : currentPage;
  const rightPageIdx = isSpreadView ? (currentStripItem?.pages[1] ?? currentPage + 1) : -1;
  const pageLoadKey = isSpreadView && rightPageIdx >= 0
    ? `spread-${leftPageIdx}-${rightPageIdx}`
    : `single-${currentPage}`;

  return {
    stripItems,
    isSpreadView,
    leftPageIdx,
    rightPageIdx,
    pageLoadKey,
    spreadPairPages: isSpreadView && rightPageIdx >= 0 ? [leftPageIdx, rightPageIdx] : null,
  };
}
