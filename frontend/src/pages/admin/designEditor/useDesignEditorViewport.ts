import { useLayoutEffect, useState, type RefObject } from 'react';

export type DesignEditorViewportState = {
  fitZoom: number;
  viewportReady: boolean;
  rulerOrigin: { x: number; y: number };
}

export function useDesignEditorViewport(input: {
  viewportRef: RefObject<HTMLElement>;
  fallbackRef: RefObject<HTMLElement>;
  pageWidthPx: number;
  pageHeightPx: number;
  bleedPx: number;
  showBleed: boolean;
  isSpreadView: boolean;
  /** Меньше отступы вокруг холста — лучше вписывается на узком экране */
  compactPadding?: boolean;
}): DesignEditorViewportState {
  const [fitZoom, setFitZoom] = useState(1);
  const [viewportReady, setViewportReady] = useState(false);
  const [rulerOrigin, setRulerOrigin] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    const el = input.viewportRef.current ?? input.fallbackRef.current;
    if (!el || !input.pageWidthPx || !input.pageHeightPx) return;
    setViewportReady(false);

    const visibleBleedPx = input.showBleed ? input.bleedPx : 0;
    const compact = input.compactPadding === true;
    const wrapperPadX = compact
      ? (input.isSpreadView ? 20 : 12)
      : (input.isSpreadView ? 64 : 80);
    const wrapperPadY = compact
      ? (input.isSpreadView ? 28 : 20)
      : (input.isSpreadView ? 98 : 80);
    const contentW = (input.isSpreadView ? input.pageWidthPx * 2 : input.pageWidthPx) + wrapperPadX + visibleBleedPx * 2;
    const contentH = input.pageHeightPx + wrapperPadY + visibleBleedPx * 2;
    const canvasPadX = compact
      ? (input.isSpreadView ? 12 + visibleBleedPx : 8 + visibleBleedPx)
      : (input.isSpreadView ? 32 + visibleBleedPx : 40 + visibleBleedPx);
    const canvasPadY = compact
      ? (input.isSpreadView ? 12 + visibleBleedPx : 8 + visibleBleedPx)
      : (input.isSpreadView ? 32 + visibleBleedPx : 40 + visibleBleedPx);
    const cw = Math.max(contentW, 1);
    const ch = Math.max(contentH, 1);
    let rafId = 0;
    let alive = true;

    const compute = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!alive) return;
        const aw = Math.round(el.clientWidth);
        const ah = Math.round(el.clientHeight);
        if (aw < 48 || ah < 48) return;
        const zRaw = Math.max(0.1, Math.min(aw / cw, ah / ch, 3));
        const z = Math.round(zRaw * 1000) / 1000;
        setFitZoom(z);
        setRulerOrigin({
          x: (aw - cw * z) / 2 + canvasPadX * z,
          y: (ah - ch * z) / 2 + canvasPadY * z,
        });
        setViewportReady(true);
      });
    };

    const ro = new ResizeObserver(compute);
    ro.observe(el);
    compute();
    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [
    input.bleedPx,
    input.fallbackRef,
    input.isSpreadView,
    input.pageHeightPx,
    input.pageWidthPx,
    input.showBleed,
    input.compactPadding,
    input.viewportRef,
  ]);

  return { fitZoom, viewportReady, rulerOrigin };
}
