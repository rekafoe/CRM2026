import { useEffect, useRef, type MutableRefObject } from 'react';
import { EMPTY_PAGE } from '../../pages/admin/designEditor/constants';
import type { DesignPage } from '../../pages/admin/designEditor/types';
import {
  ensureEvenInnerSpreadPages,
  needsInnerSpreadPadding,
} from '../../pages/admin/designEditor/spreadUtils';
import type { PublicDesignDocumentMode } from './useDesignDocumentNavigation';

/**
 * Сразу после открытия макета выравнивает нечётное число внутренних страниц
 * (без перезагрузки). Иначе первый «Добавить разворот» визуально даёт +1 страницу.
 */
export function useSpreadLayoutNormalize(input: {
  enabled: boolean;
  documentMode: PublicDesignDocumentMode;
  spreadMode: boolean;
  coverPages: number;
  pageCount: number;
  pages: DesignPage[];
  setPages: (pages: DesignPage[]) => void;
  setPageCount: (count: number) => void;
  suppressDirtyRef?: MutableRefObject<boolean>;
}): void {
  const {
    enabled,
    documentMode,
    spreadMode,
    coverPages,
    pageCount,
    pages,
    setPages,
    setPageCount,
    suppressDirtyRef,
  } = input;
  const appliedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || documentMode !== 'multipage' || !spreadMode) return;
    if (!needsInnerSpreadPadding(pageCount, coverPages)) return;

    const key = `${pageCount}:${coverPages}:${pages.length}`;
    if (appliedKeyRef.current === key) return;

    const result = ensureEvenInnerSpreadPages(
      pages,
      pageCount,
      coverPages,
      () => ({ ...EMPTY_PAGE }),
    );
    appliedKeyRef.current = `${result.pageCount}:${coverPages}:${result.pages.length}`;
    if (suppressDirtyRef) suppressDirtyRef.current = true;
    setPages(result.pages);
    setPageCount(result.pageCount);
    if (suppressDirtyRef) {
      window.setTimeout(() => {
        suppressDirtyRef.current = false;
      }, 0);
    }
  }, [
    coverPages,
    documentMode,
    enabled,
    pageCount,
    pages,
    setPageCount,
    setPages,
    spreadMode,
  ]);
}
