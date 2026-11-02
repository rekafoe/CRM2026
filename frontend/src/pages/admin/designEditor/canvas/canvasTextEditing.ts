import type { MutableRefObject } from 'react';
import { Point, type Canvas, type FabricObject, type IText } from 'fabric';
import { stripFabricStylesForEditing } from '../textStyleRuns';
import { asAny, isTextLikeObject } from './canvasUtils';

export function normalizeTextForDisplay(text: string | undefined): string {
  return String(text ?? '').replace(/\u200b/g, '');
}

export function normalizeTextForFabric(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n');
  return normalized.length > 0 ? normalized : '\u200b';
}

export function isMobileTextInputEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches
    || window.matchMedia('(max-width: 760px)').matches
  );
}

export type TextFloatingAnchor = {
  x: number;
  y: number;
  placement: 'above' | 'below';
};

/** Сцена Fabric → координаты клиента (для плавающей панели над текстом) */
export function scenePointToClient(canvas: Canvas, sx: number, sy: number): { x: number; y: number } {
  const vpt = canvas.viewportTransform!;
  const vp = new Point(sx, sy).transform(vpt);
  const upper = canvas.upperCanvasEl;
  const b = upper.getBoundingClientRect();
  return {
    x: b.left + (vp.x / upper.width) * b.width,
    y: b.top + (vp.y / upper.height) * b.height,
  };
}

type RotationMarkerPoint = { x: number; y: number };

function canvasPixelToClient(canvas: Canvas, px: number, py: number): { x: number; y: number } | null {
  const upper = canvas.upperCanvasEl;
  if (!upper || upper.width <= 0 || upper.height <= 0) return null;
  const b = upper.getBoundingClientRect();
  return {
    x: b.left + (px / upper.width) * b.width,
    y: b.top + (py / upper.height) * b.height,
  };
}

/** Маркер поворота (mtr) в координатах клиента. oCoords — пиксели viewport холста. */
function rotationMarkerClientBox(
  canvas: Canvas,
  active: FabricObject,
): { top: number; bottom: number } | null {
  const upper = canvas.upperCanvasEl;
  if (!upper || upper.height <= 0) return null;
  const withCoords = active as FabricObject & { oCoords?: Record<string, RotationMarkerPoint> };
  if (!withCoords.oCoords?.mtr) {
    try {
      active.setCoords();
    } catch {
      return null;
    }
  }
  const mtr = withCoords.oCoords?.mtr;
  if (!mtr || !Number.isFinite(mtr.x) || !Number.isFinite(mtr.y)) return null;
  const center = canvasPixelToClient(canvas, mtr.x, mtr.y);
  if (!center) return null;
  const cssScale = upper.getBoundingClientRect().height / upper.height;
  const radius = Math.max(16, Number(active.cornerSize ?? 18) * cssScale * 0.65);
  return { top: center.y - radius, bottom: center.y + radius };
}

/**
 * Якорь плавающей панели так, чтобы её низ (или верх) не накрывал маркер поворота.
 * Панель общая для CRM и сайта.
 */
export function resolveTextFloatingAnchor(
  canvas: Canvas,
  active: FabricObject,
): TextFloatingAnchor | null {
  const upper = canvas.upperCanvasEl;
  if (!upper?.isConnected) return null;
  const br = active.getBoundingRect();
  const cx = br.left + br.width / 2;
  const top = scenePointToClient(canvas, cx, br.top);
  const bottom = scenePointToClient(canvas, cx, br.top + br.height);
  const margin = 72;
  const x = Math.min(window.innerWidth - margin, Math.max(margin, top.x));
  const marker = rotationMarkerClientBox(canvas, active);
  const air = 14;
  let y = top.y;
  if (marker && marker.top < top.y + 4) {
    y = Math.min(y, marker.top - air);
  } else if (!marker) {
    y = top.y - 56;
  }
  const estimatedToolbarHeight = 72;
  if (y - estimatedToolbarHeight < 8) {
    let below = bottom.y;
    if (marker && marker.bottom > bottom.y - 4) {
      below = Math.max(below, marker.bottom + air);
    }
    return { x, y: below, placement: 'below' };
  }
  return { x, y, placement: 'above' };
}

export function pinFabricHiddenTextarea(canvas: Canvas, text: IText): void {
  const hidden = (text as unknown as { hiddenTextarea?: HTMLTextAreaElement }).hiddenTextarea;
  if (!hidden) return;
  hidden.classList.add('de-fabric-text-input');
  hidden.style.margin = '0';
  hidden.style.transform = 'none';
  hidden.style.zIndex = '10050';
  hidden.style.boxSizing = 'border-box';

  if (isMobileTextInputEnvironment()) {
    hidden.style.position = 'fixed';
    hidden.style.left = '12px';
    hidden.style.right = '12px';
    hidden.style.top = 'auto';
    hidden.style.width = 'auto';
    hidden.style.bottom = 'max(148px, calc(128px + env(safe-area-inset-bottom, 0px)))';
    hidden.style.minHeight = '44px';
    hidden.style.maxHeight = '120px';
    hidden.style.padding = '10px 12px';
    hidden.style.fontSize = '16px';
    hidden.style.lineHeight = '1.35';
    hidden.style.color = '#0f172a';
    hidden.style.background = '#ffffff';
    hidden.style.border = '1px solid rgba(15, 23, 42, 0.14)';
    hidden.style.borderRadius = '12px';
    hidden.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.12)';
    hidden.style.opacity = '1';
  } else {
    const br = text.getBoundingRect();
    const cx = br.left + br.width / 2;
    const cy = br.top + Math.min(20, Math.max(8, br.height / 2));
    const { x, y } = scenePointToClient(canvas, cx, cy);
    hidden.style.position = 'fixed';
    hidden.style.left = `${Math.round(Math.max(8, x - 64))}px`;
    hidden.style.top = `${Math.round(Math.max(8, y - 14))}px`;
    hidden.style.right = 'auto';
    hidden.style.bottom = 'auto';
    hidden.style.width = `${Math.max(96, Math.round(br.width))}px`;
    hidden.style.minHeight = '28px';
    hidden.style.opacity = '0.01';
    hidden.style.background = 'transparent';
    hidden.style.border = 'none';
    hidden.style.boxShadow = 'none';
  }

  try {
    hidden.focus({ preventScroll: true });
  } catch {
    hidden.focus();
  }
}

export function beginTextEditingOnCanvas(
  canvas: Canvas,
  target: FabricObject,
  inlineEditSession?: MutableRefObject<boolean>,
  captureBaseline?: (target: FabricObject) => void,
): void {
  if (!isTextLikeObject(target)) return;
  const text = target as IText;
  if (asAny(text).isEditing) return;
  captureBaseline?.(target);
  if (inlineEditSession) inlineEditSession.current = true;
  stripFabricStylesForEditing(text);
  text.set({ editable: true });
  canvas.setActiveObject(text);
  if (typeof text.enterEditing === 'function') {
    text.enterEditing();
    pinFabricHiddenTextarea(canvas, text);
  }
  canvas.requestRenderAll();
}
