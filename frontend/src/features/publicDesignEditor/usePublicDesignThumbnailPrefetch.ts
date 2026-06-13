import { useEffect, useMemo, useRef } from 'react';
import type { DesignTemplate } from '../../api';
import { API_BASE_URL } from '../../config/constants';
import {
  loadCachedThumbnailsForPages,
  pageContentFingerprint,
  type DesignPageThumbnailCacheScope,
} from '../../pages/admin/designEditor/designPageThumbnailCache';
import { generatePageStripThumbnails } from '../../pages/admin/designEditor/generatePageStripThumbnails';
import type { DesignPage } from '../../pages/admin/designEditor/types';

export function usePublicDesignThumbnailPrefetch(input: {
  enabled: boolean;
  templateId: number;
  draftToken: string | null;
  pages: DesignPage[];
  pageCount: number;
  template: DesignTemplate | null;
  pageWidthPx: number;
  pageHeightPx: number;
  onThumb: (pageIndex: number, thumbUrl: string) => void;
  onHydrate?: (thumbnails: Record<number, string>) => void;
}): void {
  const {
    enabled,
    templateId,
    draftToken,
    pages,
    pageCount,
    template,
    pageWidthPx,
    pageHeightPx,
    onThumb,
    onHydrate,
  } = input;
  const onThumbRef = useRef(onThumb);
  const onHydrateRef = useRef(onHydrate);
  onThumbRef.current = onThumb;
  onHydrateRef.current = onHydrate;

  const cacheScope = useMemo<DesignPageThumbnailCacheScope | null>(() => {
    if (!enabled || !template) return null;
    return {
      templateId,
      draftToken,
      pageWidthPx: pageWidthPx,
      pageHeightPx: pageHeightPx,
    };
  }, [draftToken, enabled, pageHeightPx, pageWidthPx, template, templateId]);

  const pagesKey = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => {
      const page = pages[index];
      return `${index}:${pageContentFingerprint(page)}`;
    }).join('|'),
    [pageCount, pages],
  );

  useEffect(() => {
    if (!enabled || !template || !cacheScope || pageWidthPx <= 0 || pageHeightPx <= 0) return;

    const cached = loadCachedThumbnailsForPages(cacheScope, pages, pageCount);
    if (Object.keys(cached).length > 0) {
      onHydrateRef.current?.(cached);
      Object.entries(cached).forEach(([rawIndex, url]) => {
        onThumbRef.current(Number(rawIndex), url);
      });
    }

    const missingIndexes: number[] = [];
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      if (!cached[pageIndex]) missingIndexes.push(pageIndex);
    }
    if (missingIndexes.length === 0) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void generatePageStripThumbnails({
        pages,
        template,
        pageW: pageWidthPx,
        pageH: pageHeightPx,
        apiBaseUrl: API_BASE_URL,
        cacheScope,
        pageIndexes: missingIndexes,
        shouldAbort: () => cancelled,
        onThumb: (pageIndex, thumbUrl) => {
          if (!cancelled) onThumbRef.current(pageIndex, thumbUrl);
        },
      });
    }, Object.keys(cached).length > 0 ? 0 : 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [cacheScope, enabled, pageCount, pageHeightPx, pageWidthPx, pages, pagesKey, template]);
}
