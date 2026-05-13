import React, { useRef, useEffect, useCallback, useState } from 'react';
import { MM_TO_PX, SAFE_ZONE_MM } from './constants';

/* ── Types ─────────────────────────────────────────────────────────────────── */

export interface GuideLine {
  id: string;
  axis: 'h' | 'v';
  /** Position in mm relative to safe-zone origin (0 = safe-zone edge) */
  posMM: number;
}

interface RulersProps {
  widthMM: number;
  heightMM: number;
  fitZoom: number;
  /** Template scene scale: SVG imports can render one logical mm as several Fabric pixels. */
  sceneScale?: number;
  /** px offset from ruler left edge to canvas (0,0) pixel in viewport */
  originX: number;
  /** px offset from ruler top edge to canvas (0,0) pixel in viewport */
  originY: number;
  /** Admin editor uses safe-zone coordinates; client editor needs trim/page edge coordinates. */
  coordinateOrigin?: 'safe' | 'trim';
  guides: GuideLine[];
  onGuidesChange: (guides: GuideLine[]) => void;
}

/* ── Constants ─────────────────────────────────────────────────────────────── */

const RULER_H = 22;
const BG = '#f8f9fa';
const BORDER = '#e0e0e0';
const TICK = '#aaa';
const TEXT = '#666';
const GUIDE_COLOR = '#2563eb';
const FONT = '10px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

/* ── Helpers ───────────────────────────────────────────────────────────────── */

function pickStep(pxPerMM: number): { major: number; minor: number } {
  if (pxPerMM >= 8) return { major: 10, minor: 5 };
  if (pxPerMM >= 3) return { major: 20, minor: 10 };
  if (pxPerMM >= 1.5) return { major: 50, minor: 10 };
  return { major: 100, minor: 20 };
}

/**
 * Convert a safe-zone-relative mm value to a viewport px position.
 * safeOriginPx = canvas origin px + safeZone * ppm
 */
function mmToViewportPx(mm: number, safeOriginPx: number, ppm: number): number {
  return safeOriginPx + mm * ppm;
}

function viewportPxToMM(px: number, safeOriginPx: number, ppm: number): number {
  return (px - safeOriginPx) / ppm;
}

function snapGuideToFractions(rawMM: number, totalMM: number, ppm: number): number {
  const usableMM = Math.max(0, totalMM - 2 * SAFE_ZONE_MM);
  const anchors = [0, usableMM * 0.25, usableMM * 0.5, usableMM * 0.75, usableMM];
  const thresholdMM = Math.max(0.5, 10 / Math.max(ppm, 0.001)); // ~10 screen px
  let snapped = rawMM;
  let best = Infinity;
  for (const a of anchors) {
    const d = Math.abs(rawMM - a);
    if (d < thresholdMM && d < best) {
      best = d;
      snapped = a;
    }
  }
  return snapped;
}

/* ── Drawing ───────────────────────────────────────────────────────────────── */

function drawH(
  c: HTMLCanvasElement,
  totalMM: number,
  pxPerMM: number,
  safeOriginPx: number,
  guides: GuideLine[],
  coordinateOrigin: 'safe' | 'trim',
) {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  c.width = w * dpr;
  c.height = RULER_H * dpr;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, RULER_H);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RULER_H - 0.5);
  ctx.lineTo(w, RULER_H - 0.5);
  ctx.stroke();

  const ppm = pxPerMM;
  const { major, minor } = pickStep(ppm);
  ctx.font = FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const usableMM = totalMM - 2 * SAFE_ZONE_MM;
  const startMM = coordinateOrigin === 'safe' ? -SAFE_ZONE_MM : 0;
  const endMM = coordinateOrigin === 'safe' ? usableMM + SAFE_ZONE_MM : totalMM;
  const firstTick = Math.floor(startMM / minor) * minor;

  for (let mm = firstTick; mm <= endMM; mm += minor) {
    const x = mmToViewportPx(mm, safeOriginPx, ppm);
    if (x < -10 || x > w + 10) continue;
    const isMaj = mm % major === 0 || mm === 0;
    const isZero = mm === 0;
    ctx.strokeStyle = isZero ? '#e53e3e' : TICK;
    ctx.lineWidth = isZero ? 1.5 : isMaj ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(Math.round(x) + 0.5, RULER_H);
    ctx.lineTo(Math.round(x) + 0.5, RULER_H - (isMaj ? 10 : 5));
    ctx.stroke();
    if (isMaj) {
      ctx.fillStyle = isZero ? '#e53e3e' : TEXT;
      ctx.fillText(String(mm), x, 2);
    }
  }

  // Guide markers
  guides.filter((g) => g.axis === 'v').forEach((g) => {
    const x = mmToViewportPx(g.posMM, safeOriginPx, ppm);
    if (x < 0 || x > w) return;
    ctx.fillStyle = GUIDE_COLOR;
    ctx.beginPath();
    ctx.moveTo(x, RULER_H);
    ctx.lineTo(x - 4, RULER_H - 6);
    ctx.lineTo(x + 4, RULER_H - 6);
    ctx.closePath();
    ctx.fill();
  });
}

function drawV(
  c: HTMLCanvasElement,
  totalMM: number,
  pxPerMM: number,
  safeOriginPx: number,
  guides: GuideLine[],
  coordinateOrigin: 'safe' | 'trim',
) {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const h = c.clientHeight;
  c.width = RULER_H * dpr;
  c.height = h * dpr;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, RULER_H, h);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(RULER_H - 0.5, 0);
  ctx.lineTo(RULER_H - 0.5, h);
  ctx.stroke();

  const ppm = pxPerMM;
  const { major, minor } = pickStep(ppm);
  ctx.font = FONT;
  ctx.textBaseline = 'middle';

  const usableMM = totalMM - 2 * SAFE_ZONE_MM;
  const startMM = coordinateOrigin === 'safe' ? -SAFE_ZONE_MM : 0;
  const endMM = coordinateOrigin === 'safe' ? usableMM + SAFE_ZONE_MM : totalMM;
  const firstTick = Math.floor(startMM / minor) * minor;

  for (let mm = firstTick; mm <= endMM; mm += minor) {
    const y = mmToViewportPx(mm, safeOriginPx, ppm);
    if (y < -10 || y > h + 10) continue;
    const isMaj = mm % major === 0 || mm === 0;
    const isZero = mm === 0;
    ctx.strokeStyle = isZero ? '#e53e3e' : TICK;
    ctx.lineWidth = isZero ? 1.5 : isMaj ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(RULER_H, Math.round(y) + 0.5);
    ctx.lineTo(RULER_H - (isMaj ? 10 : 5), Math.round(y) + 0.5);
    ctx.stroke();
    if (isMaj) {
      ctx.save();
      ctx.fillStyle = isZero ? '#e53e3e' : TEXT;
      ctx.translate(8, y);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(mm), 0, 0);
      ctx.restore();
    }
  }

  // Guide markers
  guides.filter((g) => g.axis === 'h').forEach((g) => {
    const y = mmToViewportPx(g.posMM, safeOriginPx, ppm);
    if (y < 0 || y > h) return;
    ctx.fillStyle = GUIDE_COLOR;
    ctx.beginPath();
    ctx.moveTo(RULER_H, y);
    ctx.lineTo(RULER_H - 6, y - 4);
    ctx.lineTo(RULER_H - 6, y + 4);
    ctx.closePath();
    ctx.fill();
  });
}

/* ── Component ─────────────────────────────────────────────────────────────── */

export const CanvasRulers: React.FC<RulersProps> = ({
  widthMM, heightMM, fitZoom, sceneScale = 1, originX, originY, coordinateOrigin = 'safe', guides, onGuidesChange,
}) => {
  const hRef = useRef<HTMLCanvasElement>(null);
  const vRef = useRef<HTMLCanvasElement>(null);

  const pxPerMM = MM_TO_PX * sceneScale * fitZoom;
  const safeOffPx = SAFE_ZONE_MM * pxPerMM;
  const safeOriginX = originX + (coordinateOrigin === 'safe' ? safeOffPx : 0);
  const safeOriginY = originY + (coordinateOrigin === 'safe' ? safeOffPx : 0);

  const redraw = useCallback(() => {
    if (hRef.current) drawH(hRef.current, widthMM, pxPerMM, safeOriginX, guides, coordinateOrigin);
    if (vRef.current) drawV(vRef.current, heightMM, pxPerMM, safeOriginY, guides, coordinateOrigin);
  }, [widthMM, heightMM, pxPerMM, safeOriginX, safeOriginY, guides, coordinateOrigin]);

  useEffect(() => { redraw(); }, [redraw]);

  useEffect(() => {
    const els = [hRef.current, vRef.current].filter(Boolean) as HTMLCanvasElement[];
    if (!els.length) return;
    const ro = new ResizeObserver(redraw);
    els.forEach((e) => ro.observe(e));
    return () => ro.disconnect();
  }, [redraw]);

  // ── Drag guide from ruler ─────────────────────────────────────────────────

  const [dragging, setDragging] = useState<{
    axis: 'h' | 'v';
    id: string;
    posMM: number;
  } | null>(null);

  const ppm = pxPerMM;

  const handleRulerMouseDown = useCallback(
    (axis: 'h' | 'v', e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const id = `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = axis === 'v'
        ? e.clientX - rect.left
        : e.clientY - rect.top;
      const safeOrig = axis === 'v' ? safeOriginX : safeOriginY;
      const mm = viewportPxToMM(pos, safeOrig, ppm);
      setDragging({ axis, id, posMM: mm });
    },
    [safeOriginX, safeOriginY, ppm],
  );

  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dragging) return;

    const handleMove = (e: MouseEvent) => {
      // Use the guides-overlay or ruler as reference for position calculation
      const overlay = overlayRef.current;
      const ruler = dragging.axis === 'v' ? hRef.current : vRef.current;
      const refEl = overlay ?? ruler;
      if (!refEl) return;
      const rect = refEl.getBoundingClientRect();
      const pos = dragging.axis === 'v'
        ? e.clientX - rect.left
        : e.clientY - rect.top;
      const safeOrig = dragging.axis === 'v' ? safeOriginX : safeOriginY;
      const totalMM = dragging.axis === 'v' ? widthMM : heightMM;
      const rawMM = viewportPxToMM(pos, safeOrig, ppm);
      const snappedMM = snapGuideToFractions(rawMM, totalMM, ppm);
      const mm = Math.round(snappedMM * 10) / 10;
      setDragging((d) => d ? { ...d, posMM: mm } : null);
    };

    const handleUp = () => {
      if (dragging) {
        onGuidesChange([...guides, { id: dragging.id, axis: dragging.axis, posMM: dragging.posMM }]);
      }
      setDragging(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [dragging, guides, onGuidesChange, safeOriginX, safeOriginY, ppm, widthMM, heightMM]);

  // ── Guide overlay lines (rendered as absolute-positioned divs in viewport) ─

  const allGuides = dragging
    ? [...guides, { id: dragging.id, axis: dragging.axis, posMM: dragging.posMM }]
    : guides;

  const handleGuideDoubleClick = useCallback(
    (id: string) => {
      onGuidesChange(guides.filter((g) => g.id !== id));
    },
    [guides, onGuidesChange],
  );

  /** Start dragging an existing guide */
  const handleExistingGuideMouseDown = useCallback(
    (g: GuideLine, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Remove from guides (will be re-added on mouseup via dragging state)
      onGuidesChange(guides.filter((x) => x.id !== g.id));
      setDragging({ axis: g.axis, id: g.id, posMM: g.posMM });
    },
    [guides, onGuidesChange],
  );

  return (
    <>
      <div className="ruler-corner" />
      {/* Верхняя линейка → горизонтальные направляющие (ось Y в мм) */}
      <canvas
        ref={hRef}
        className="ruler-h"
        onMouseDown={(e) => handleRulerMouseDown('h', e)}
        style={{ cursor: 'row-resize' }}
      />
      {/* Боковая линейка → вертикальные направляющие (ось X в мм) */}
      <canvas
        ref={vRef}
        className="ruler-v"
        onMouseDown={(e) => handleRulerMouseDown('v', e)}
        style={{ cursor: 'col-resize' }}
      />
      {/* Guide lines overlay — positioned in the viewport grid cell */}
      <div className="guides-overlay" ref={overlayRef}>
        {allGuides.map((g) => {
          const px = g.axis === 'v'
            ? mmToViewportPx(g.posMM, safeOriginX, ppm)
            : mmToViewportPx(g.posMM, safeOriginY, ppm);
          const isDragged = dragging?.id === g.id;
          return g.axis === 'v' ? (
            <div
              key={g.id}
              className={`guide-line guide-v${isDragged ? ' is-dragging' : ''}`}
              style={{ left: px }}
              onMouseDown={(e) => handleExistingGuideMouseDown(g, e)}
              onDoubleClick={() => handleGuideDoubleClick(g.id)}
              title={`${g.posMM.toFixed(1)} мм · перетащить / двойной клик — удалить`}
            >
              <span className="guide-label">{g.posMM.toFixed(1)}</span>
            </div>
          ) : (
            <div
              key={g.id}
              className={`guide-line guide-h${isDragged ? ' is-dragging' : ''}`}
              style={{ top: px }}
              onMouseDown={(e) => handleExistingGuideMouseDown(g, e)}
              onDoubleClick={() => handleGuideDoubleClick(g.id)}
              title={`${g.posMM.toFixed(1)} мм · перетащить / двойной клик — удалить`}
            >
              <span className="guide-label">{g.posMM.toFixed(1)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
};

export type { SnapResult, ComputeSnapOptions } from './snapGuide';
export { computeSnap } from './snapGuide';
