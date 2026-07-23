import type { Canvas, FabricObject } from 'fabric';
import { isTextLikeObject } from './canvas/canvasUtils';
import { checkTextSceneBoxOverflow, type DesignPageBoundsPx, type TextSceneBox } from './designEditorTextBounds';
import { normalizeTextForPlaceholderCheck } from './designEditorTextPlaceholder';
import type { TextLikeObject } from './textStyleRuns';

export type TextOverflowWarningMarker = {
  id: string;
  x: number;
  y: number;
};

const MARKER_OFFSET_X = 8;
const MARKER_OFFSET_Y = -6;

function readLiveTextSceneBox(obj: TextLikeObject): TextSceneBox | null {
  obj.setCoords?.();
  if (typeof obj.getBoundingRect !== 'function') return null;
  try {
    const br = obj.getBoundingRect();
    const left = Number(br.left);
    const top = Number(br.top);
    const width = Number(br.width);
    const height = Number(br.height);
    if (![left, top, width, height].every(Number.isFinite)) return null;
    return { left, top, width, height };
  } catch {
    return null;
  }
}

function resolveSpreadPageOffsetX(box: TextSceneBox, pageWidthPx: number, canvasWidthPx: number): number {
  if (canvasWidthPx <= pageWidthPx * 1.5) return 0;
  const cx = box.left + box.width / 2;
  return cx >= pageWidthPx ? pageWidthPx : 0;
}

function isTextOutsidePageBounds(
  box: TextSceneBox,
  pageWidthPx: number,
  pageHeightPx: number,
  pageOffsetX: number,
): boolean {
  const relativeBox: TextSceneBox = {
    left: box.left - pageOffsetX,
    top: box.top,
    width: box.width,
    height: box.height,
  };
  const bounds: DesignPageBoundsPx = {
    pageWidthPx,
    pageHeightPx,
    safeZonePx: 0,
  };
  return checkTextSceneBoxOverflow(relativeBox, bounds).outsidePage;
}

function collectOverflowMarker(
  obj: TextLikeObject,
  pageWidthPx: number,
  pageHeightPx: number,
  canvasWidthPx: number,
): TextOverflowWarningMarker | null {
  const text = normalizeTextForPlaceholderCheck(String(obj.text ?? ''));
  if (!text) return null;

  const box = readLiveTextSceneBox(obj);
  if (!box) return null;

  const pageOffsetX = resolveSpreadPageOffsetX(box, pageWidthPx, canvasWidthPx);
  if (!isTextOutsidePageBounds(box, pageWidthPx, pageHeightPx, pageOffsetX)) return null;

  const id = String(obj.id ?? '').trim();
  if (!id) return null;

  return {
    id,
    x: box.left + box.width + MARKER_OFFSET_X,
    y: box.top + MARKER_OFFSET_Y,
  };
}

export function collectTextOverflowWarningsOnCanvas(
  canvas: Canvas,
  pageWidthPx: number,
  pageHeightPx: number,
  canvasWidthPx: number,
): TextOverflowWarningMarker[] {
  const warnings: TextOverflowWarningMarker[] = [];
  const visit = (objects: FabricObject[]) => {
    for (const obj of objects) {
      if (isTextLikeObject(obj)) {
        const marker = collectOverflowMarker(
          obj as TextLikeObject,
          pageWidthPx,
          pageHeightPx,
          canvasWidthPx,
        );
        if (marker) warnings.push(marker);
      }
      const group = obj as { getObjects?: () => FabricObject[] };
      if (typeof group.getObjects === 'function') {
        visit(group.getObjects());
      }
    }
  };
  visit(canvas.getObjects());
  return warnings;
}

export function textOverflowWarningsSignature(warnings: TextOverflowWarningMarker[]): string {
  if (warnings.length === 0) return '';
  return [...warnings]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((w) => `${w.id}:${Math.round(w.x)}:${Math.round(w.y)}`)
    .join(';');
}
