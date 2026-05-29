/**
 * Оценка bbox текста по Fabric JSON (без живого canvas) для preflight.
 */
import { MM_TO_PX } from './constants';
import { isFabricTextObjectType } from './patchFabricTextObjects';

type FabricJsonObject = Record<string, unknown>;

const CHAR_WIDTH_FACTOR = 0.52;

export type TextSceneBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type TextOverflowCheck = {
  outsidePage: boolean;
  outsideSafeZone: boolean;
};

export type DesignPageBoundsPx = {
  pageWidthPx: number;
  pageHeightPx: number;
  safeZonePx: number;
};

export function designPageBoundsFromMm(input: {
  pageWidthMm: number;
  pageHeightMm: number;
  safeZoneMm: number;
  sceneScale?: number;
}): DesignPageBoundsPx {
  const scale = input.sceneScale ?? 1;
  const pxPerMm = MM_TO_PX * scale;
  return {
    pageWidthPx: Math.round(input.pageWidthMm * pxPerMm),
    pageHeightPx: Math.round(input.pageHeightMm * pxPerMm),
    safeZonePx: input.safeZoneMm * pxPerMm,
  };
}

export function estimateTextSceneBox(obj: FabricJsonObject): TextSceneBox | null {
  const type = String(obj.type ?? '');
  if (!isFabricTextObjectType(type)) return null;

  const left = Number(obj.left) || 0;
  const top = Number(obj.top) || 0;
  const scaleX = Math.abs(Number(obj.scaleX) || 1);
  const scaleY = Math.abs(Number(obj.scaleY) || 1);
  const fontSize = Math.max(6, Number(obj.fontSize) || 24);
  const lineHeight = Math.max(1, Number(obj.lineHeight) || 1.16);
  const text = String(obj.text ?? '');
  const lines = text.length > 0 ? text.split('\n') : [''];

  let width: number;
  let lineCount: number;

  const typeLower = type.toLowerCase();
  if (typeLower === 'textbox' && Number(obj.width) > 0) {
    width = Math.max(1, Number(obj.width) * scaleX);
    const charsPerLine = Math.max(1, width / (fontSize * CHAR_WIDTH_FACTOR));
    lineCount = lines.reduce(
      (sum, line) => sum + Math.max(1, Math.ceil(Math.max(1, line.length) / charsPerLine)),
      0,
    );
  } else {
    const maxLineLen = Math.max(1, ...lines.map((line) => line.length));
    width = Math.max(1, maxLineLen * fontSize * CHAR_WIDTH_FACTOR * scaleX);
    lineCount = Math.max(1, lines.length);
  }

  const height = Math.max(fontSize, lineCount * fontSize * lineHeight * scaleY);
  return { left, top, width, height };
}

export function checkTextSceneBoxOverflow(
  box: TextSceneBox,
  bounds: DesignPageBoundsPx,
): TextOverflowCheck {
  const { pageWidthPx, pageHeightPx, safeZonePx } = bounds;
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  const tol = 2;

  const outsidePage =
    box.left < -tol
    || box.top < -tol
    || right > pageWidthPx + tol
    || bottom > pageHeightPx + tol;

  const safe = Math.max(0, safeZonePx);
  const outsideSafeZone =
    box.left < safe - tol
    || box.top < safe - tol
    || right > pageWidthPx - safe + tol
    || bottom > pageHeightPx - safe + tol;

  return { outsidePage, outsideSafeZone };
}

export function clientTextboxWidthInSafeZone(pageWidthPx: number, safeZonePx: number): number {
  return Math.max(80, Math.round(pageWidthPx - safeZonePx * 2));
}
