import { Canvas } from 'fabric';
import type { DesignTemplate } from '../../../api';
import { loadDesignPageScene } from './designPageLoader';
import type { DesignPage } from './types';
import { getIosSafariCanvasOptions } from './canvas/iosSafariCanvasSafeMode';
import { reloadFabricCanvasFonts } from '../../../utils/fabricFontReload';

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

export type ClientRenderedDesignPageExport = {
  pageIndex: number;
  dataUrl: string;
};

/**
 * Рендерит страницы макета в PNG через offscreen-canvas.
 * Не трогает видимый холст редактора — клиент не видит переключения страниц.
 */
export async function exportClientRenderedDesignPages(input: {
  pages: DesignPage[];
  template: DesignTemplate | null;
  pageW: number;
  pageH: number;
  apiBaseUrl: string;
  dpi: number;
  sceneScale: number;
  onProgress?: (current: number, total: number) => void;
}): Promise<ClientRenderedDesignPageExport[]> {
  const {
    pages,
    template,
    pageW,
    pageH,
    apiBaseUrl,
    dpi,
    sceneScale,
    onProgress,
  } = input;

  if (pages.length === 0 || pageW <= 0 || pageH <= 0) return [];

  const scale = Number.isFinite(sceneScale) && sceneScale > 0 ? sceneScale : 1;
  const multiplier = Math.max(0.25, dpi / 96 / scale);
  const rendered: ClientRenderedDesignPageExport[] = [];

  const el = document.createElement('canvas');
  const canvas = new Canvas(el, {
    width: pageW,
    height: pageH,
    backgroundColor: 'white',
    preserveObjectStacking: true,
    ...getIosSafariCanvasOptions(),
  });

  try {
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
      onProgress?.(pageIndex + 1, pages.length);
      await loadDesignPageScene({
        canvas,
        pageData: pages[pageIndex],
        pageIndex,
        template,
        pageW,
        pageH,
        apiBaseUrl,
        // Не пересчитывать ширину text_* — иначе в client_png (особенно сувенирка) текст «скачет».
        preserveTextLayout: true,
      });
      // Шрифты уже подгружены в loadDesignPageScene с preserveLayout; повтор — только soft.
      await reloadFabricCanvasFonts(canvas, { preserveLayout: true });
      await waitForCanvasPaint(canvas);
      const dataUrl = canvas.toDataURL({ format: 'png', multiplier });
      if (!dataUrl.startsWith('data:image/png')) {
        throw new Error(`Не удалось экспортировать страницу ${pageIndex + 1} в PNG.`);
      }
      rendered.push({ pageIndex, dataUrl });
    }
  } finally {
    canvas.dispose();
  }

  return rendered;
}
