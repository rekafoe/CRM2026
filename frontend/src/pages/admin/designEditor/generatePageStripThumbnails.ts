import { Canvas } from 'fabric';
import type { DesignTemplate } from '../../../api';
import {
  getCachedPageThumbnail,
  rememberPageThumbnail,
  type DesignPageThumbnailCacheScope,
} from './designPageThumbnailCache';
import { loadDesignPageScene } from './designPageLoader';
import type { DesignPage } from './types';
import { startPublicEditorPerfSpan } from '../../../features/publicDesignEditor/publicEditorPerf';
import { getIosSafariCanvasOptions, isIosSafariCanvasSafeMode } from './canvas/iosSafariCanvasSafeMode';

const THUMB_EXPORT = { format: 'jpeg' as const, multiplier: 0.14, quality: 0.7 };

async function waitForCanvasPaint(canvas: Canvas): Promise<void> {
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      canvas.off('after:render', finish);
      resolve();
    };
    canvas.on('after:render', finish);
    canvas.requestRenderAll();
    window.setTimeout(finish, 120);
  });
}

/**
 * Рендерит миниатюры страниц в offscreen-canvas.
 * Пропускает страницы с актуальным кешем (memory + sessionStorage).
 */
export async function generatePageStripThumbnails(input: {
  pages: DesignPage[];
  template: DesignTemplate | null;
  pageW: number;
  pageH: number;
  apiBaseUrl: string;
  onThumb: (pageIndex: number, thumbUrl: string) => void;
  shouldAbort?: () => boolean;
  cacheScope?: DesignPageThumbnailCacheScope | null;
  pageIndexes?: number[];
}): Promise<void> {
  const stopTotal = startPublicEditorPerfSpan('thumb.prefetch.total.ms', {
    pageCount: input.pages.length,
  });
  try {
    const {
      pages,
      template,
      pageW,
      pageH,
      apiBaseUrl,
      onThumb,
      shouldAbort,
      cacheScope = null,
      pageIndexes,
    } = input;
    if (pages.length === 0 || pageW <= 0 || pageH <= 0) return;
    if (isIosSafariCanvasSafeMode()) return;

    const indices = pageIndexes ?? pages.map((_, index) => index);
    const pending: number[] = [];

    for (const pageIndex of indices) {
      if (shouldAbort?.()) return;
      if (cacheScope) {
        const cached = getCachedPageThumbnail(cacheScope, pageIndex, pages[pageIndex]);
        if (cached) {
          onThumb(pageIndex, cached);
          continue;
        }
      }
      pending.push(pageIndex);
    }

    if (pending.length === 0) return;

    const el = document.createElement('canvas');
    const canvas = new Canvas(el, {
      width: pageW,
      height: pageH,
      backgroundColor: 'white',
      preserveObjectStacking: true,
      ...getIosSafariCanvasOptions(),
    });

    try {
      for (const pageIndex of pending) {
        if (shouldAbort?.()) return;
        const stopOne = startPublicEditorPerfSpan('thumb.prefetch.single.ms', { pageIndex });
        try {
          await loadDesignPageScene({
            canvas,
            pageData: pages[pageIndex],
            pageIndex,
            template,
            pageW,
            pageH,
            apiBaseUrl,
          });
          await waitForCanvasPaint(canvas);
          if (shouldAbort?.()) return;
          const thumbUrl = canvas.toDataURL(THUMB_EXPORT);
          if (cacheScope) {
            rememberPageThumbnail(cacheScope, pageIndex, pages[pageIndex], thumbUrl);
          }
          onThumb(pageIndex, thumbUrl);
        } finally {
          stopOne();
        }
      }
    } finally {
      canvas.dispose();
    }
  } finally {
    stopTotal();
  }
}
