import { useLayoutEffect, useState, type RefObject } from 'react';

export type DesignEditorViewportState = {
  fitZoom: number;
  viewportReady: boolean;
  rulerOrigin: { x: number; y: number };
  /** Полный layout-размер макета до scale (для мобильного контейнера без обрезки) */
  layoutWidthPx: number;
  layoutHeightPx: number;
}

export function useDesignEditorViewport(input: {
  viewportRef: RefObject<HTMLElement | null>;
  fallbackRef: RefObject<HTMLElement | null>;
  pageWidthPx: number;
  pageHeightPx: number;
  bleedPx: number;
  showBleed: boolean;
  isSpreadView: boolean;
  /** Меньше отступы вокруг холста — лучше вписывается на узком экране */
  compactPadding?: boolean;
  /** Смена раскладки (моб. панель текста, тулбар) — пересчитать fit */
  layoutTrigger?: number;
}): DesignEditorViewportState {
  const [fitZoom, setFitZoom] = useState(1);
  const [viewportReady, setViewportReady] = useState(false);
  const [rulerOrigin, setRulerOrigin] = useState({ x: 0, y: 0 });
  const [layoutWidthPx, setLayoutWidthPx] = useState(1);
  const [layoutHeightPx, setLayoutHeightPx] = useState(1);

  useLayoutEffect(() => {
    const viewportEl = input.viewportRef.current;
    const fallbackEl = input.fallbackRef.current;
    if ((!viewportEl && !fallbackEl) || !input.pageWidthPx || !input.pageHeightPx) return;
    setViewportReady(false);

    const visibleBleedPx = input.showBleed ? input.bleedPx : 0;
    const compact = input.compactPadding === true;
    const wrapperPadX = compact
      ? (input.isSpreadView ? 16 : 8)
      : (input.isSpreadView ? 64 : 80);
    const wrapperPadY = compact
      ? (input.isSpreadView ? 20 : 12)
      : (input.isSpreadView ? 98 : 80);
    const contentW = (input.isSpreadView ? input.pageWidthPx * 2 : input.pageWidthPx) + wrapperPadX + visibleBleedPx * 2;
    const contentH = input.pageHeightPx + wrapperPadY + visibleBleedPx * 2;
    const canvasPadX = compact
      ? (input.isSpreadView ? 8 + visibleBleedPx : 4 + visibleBleedPx)
      : (input.isSpreadView ? 32 + visibleBleedPx : 40 + visibleBleedPx);
    const canvasPadY = compact
      ? (input.isSpreadView ? 8 + visibleBleedPx : 4 + visibleBleedPx)
      : (input.isSpreadView ? 32 + visibleBleedPx : 40 + visibleBleedPx);
    const cw = Math.max(contentW, 1);
    const ch = Math.max(contentH, 1);
    let rafId = 0;
    let retryTimerId: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    let alive = true;

    const readElementSize = (node: HTMLElement): { width: number; height: number } => {
      const rect = node.getBoundingClientRect();
      return {
        width: Math.max(
          Math.round(node.clientWidth),
          Math.round(node.offsetWidth),
          Math.round(rect.width),
        ),
        height: Math.max(
          Math.round(node.clientHeight),
          Math.round(node.offsetHeight),
          Math.round(rect.height),
        ),
      };
    };

    const readVisualViewportSize = () => {
      const vv = window.visualViewport;
      return {
        width: Math.round(vv?.width ?? 0),
        height: Math.round(vv?.height ?? 0),
        offsetTop: Math.round(vv?.offsetTop ?? 0),
        offsetLeft: Math.round(vv?.offsetLeft ?? 0),
        scale: vv?.scale ?? null,
        innerWidth: Math.round(window.innerWidth || 0),
        innerHeight: Math.round(window.innerHeight || 0),
      };
    };

    const resolveViewportCandidates = (): HTMLElement[] => {
      const candidates = [
        viewportEl,
        viewportEl?.parentElement ?? null,
        fallbackEl,
        fallbackEl?.parentElement ?? null,
      ].filter(
        (node): node is HTMLElement => node instanceof HTMLElement,
      );
      if (candidates.length === 0) return [];
      return Array.from(new Set(candidates));
    };

    const resolveBestContainer = (): HTMLElement | null => {
      const minWidth = input.compactPadding === true ? 120 : 220;
      const minHeight = input.compactPadding === true ? 140 : 220;
      // С линейками viewport меньше scroll-area: нельзя брать «самый большой» parent —
      // иначе fitZoom/origin считаются по зоне с ruler gutters и холст уезжает под линейки.
      if (viewportEl) {
        const viewportSize = readElementSize(viewportEl);
        if (viewportSize.width >= minWidth && viewportSize.height >= minHeight) {
          return viewportEl;
        }
      }
      const candidates = resolveViewportCandidates();
      if (candidates.length === 0) return null;
      return candidates.reduce((best, current) => {
        const bestSize = readElementSize(best);
        const currentSize = readElementSize(current);
        const bestArea = bestSize.width * bestSize.height;
        const currentArea = currentSize.width * currentSize.height;
        return currentArea > bestArea ? current : best;
      });
    };

    const compute = () => {
      cancelAnimationFrame(rafId);
      if (retryTimerId) {
        clearTimeout(retryTimerId);
        retryTimerId = null;
      }
      rafId = requestAnimationFrame(() => {
        if (!alive) return;
        const container = resolveBestContainer();
        if (!container) {
return;
        }
        const containerSize = readElementSize(container);
        let aw = containerSize.width;
        let ah = containerSize.height;
        const minWidth = input.compactPadding === true ? 120 : 220;
        const minHeight = input.compactPadding === true ? 140 : 220;
        const hasUsableContainerSize = aw >= minWidth && ah >= minHeight;
        if (!hasUsableContainerSize) {
          const viewportSnapshot = readVisualViewportSize();
          const viewportWidth = Math.max(
            viewportSnapshot.width,
            viewportSnapshot.innerWidth,
          );
          const viewportHeight = Math.max(
            viewportSnapshot.height,
            viewportSnapshot.innerHeight,
          );
          if (input.compactPadding === true) {
            aw = Math.max(aw, viewportWidth);
            ah = Math.max(ah, viewportHeight);
          }
          if ((aw < minWidth || ah < minHeight) && retryCount < 100) {
            retryCount += 1;
retryTimerId = setTimeout(compute, 100);
            return;
          }

          // Fallback: on mobile browsers the measured container can stay
          // undersized (or 0x0) during toolbar transitions.
          aw = Math.max(aw, viewportWidth);
          ah = Math.max(ah, viewportHeight);
          if (aw < minWidth || ah < minHeight) return;
        }
        retryCount = 0;
        const zRaw = Math.max(0.1, Math.min(aw / cw, ah / ch, 3));
        const z = Math.round(zRaw * 1000) / 1000;
        setFitZoom(z);
        setLayoutWidthPx(cw);
        setLayoutHeightPx(ch);
        setRulerOrigin({
          x: (aw - cw * z) / 2 + canvasPadX * z,
          y: (ah - ch * z) / 2 + canvasPadY * z,
        });
        setViewportReady(true);
});
    };

    const ro = new ResizeObserver(compute);
    resolveViewportCandidates().forEach((node) => ro.observe(node));
    const vv = window.visualViewport;
    vv?.addEventListener('resize', compute);
    vv?.addEventListener('scroll', compute);
    window.addEventListener('orientationchange', compute);
    window.addEventListener('pageshow', compute);
    compute();
    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      if (retryTimerId) clearTimeout(retryTimerId);
      ro.disconnect();
      vv?.removeEventListener('resize', compute);
      vv?.removeEventListener('scroll', compute);
      window.removeEventListener('orientationchange', compute);
      window.removeEventListener('pageshow', compute);
    };
  }, [
    input.bleedPx,
    input.fallbackRef,
    input.isSpreadView,
    input.pageHeightPx,
    input.pageWidthPx,
    input.showBleed,
    input.compactPadding,
    input.layoutTrigger,
    input.viewportRef,
  ]);

  return { fitZoom, viewportReady, rulerOrigin, layoutWidthPx, layoutHeightPx };
}
