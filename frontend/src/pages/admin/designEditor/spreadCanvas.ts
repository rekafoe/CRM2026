import type { Canvas } from 'fabric';
import { canvasToJSON } from './canvas/canvasSerialization';
import { PUBLIC_EDITOR_DEV, recordPublicEditorPerfMetric } from '../../../features/publicDesignEditor/publicEditorPerf';

function deepCloneJson<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function isSyntheticTemplatePreviewBackground(obj: Record<string, unknown>): boolean {
  return obj.isBackground === true && obj.backgroundFit === 'page';
}

function shiftLeftInSerialized(o: Record<string, unknown>, delta: number): void {
  const raw = o.left;
  const n = typeof raw === 'number' ? raw : Number(raw ?? 0);
  o.left = n + delta;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveOriginOffsetX(width: number, originX: unknown): number {
  if (originX === 'center') return -width / 2;
  if (originX === 'right' || originX === 'end') return -width;
  return 0;
}

function getSerializedObjectHorizontalBounds(
  serialized: Record<string, unknown>,
): { left: number; right: number } | null {
  const left = toFiniteNumber(serialized.left);
  const width = toFiniteNumber(serialized.width);
  const scaleX = toFiniteNumber(serialized.scaleX) ?? 1;
  if (left == null || width == null) return null;
  const renderedWidth = Math.abs(width * scaleX);
  if (!Number.isFinite(renderedWidth) || renderedWidth <= 0) return null;
  const normalizedLeft = left + resolveOriginOffsetX(renderedWidth, serialized.originX);
  return { left: normalizedLeft, right: normalizedLeft + renderedWidth };
}

function clearSpreadMirrorMeta(obj: Record<string, unknown>): void {
  delete obj.spreadMirrorId;
  delete obj.spreadMirrorSide;
  delete obj.spreadMirrorSpineX;
}

function markSpreadMirrorMeta(
  obj: Record<string, unknown>,
  mirrorId: string,
  side: 'left' | 'right',
  spine: number,
): void {
  obj.spreadMirrorId = mirrorId;
  obj.spreadMirrorSide = side;
  obj.spreadMirrorSpineX = spine;
}

function buildSpreadMirrorId(input: {
  serialized: Record<string, unknown>;
  index: number;
  bounds: { left: number; right: number };
  spine: number;
}): string {
  const id = typeof input.serialized.id === 'string' && input.serialized.id.trim()
    ? input.serialized.id.trim()
    : null;
  if (id) return id;
  const center = Math.round((input.bounds.left + input.bounds.right) / 2);
  const width = Math.round(Math.abs(input.bounds.right - input.bounds.left));
  return `mirror-${input.index}-${center}-${width}-${Math.round(input.spine)}`;
}

function serializeCanvasSnapshot(canvas: Canvas): {
  base: Record<string, unknown>;
  serializedObjects: Array<Record<string, unknown>>;
} {
  const root = canvasToJSON(canvas);
  const serializedObjects = Array.isArray(root.objects)
    ? root.objects.filter(
      (item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item),
    )
    : [];
  return {
    base: { ...root, objects: [] },
    serializedObjects,
  };
}

/**
 * Делит широкий холст разворота на два JSON страниц (без await clone — без гонок с resize).
 * Объекты, пересекающие корешок, дублируются на обе страницы (полная копия на каждой стороне).
 */
export function splitSpreadCanvasToPagesSync(
  canvas: Canvas,
  halfWidthPx: number,
): { left: Record<string, unknown>; right: Record<string, unknown> } {
  const spine = halfWidthPx;
  const leftJson: Record<string, unknown>[] = [];
  const rightJson: Record<string, unknown>[] = [];
  const { base, serializedObjects } = serializeCanvasSnapshot(canvas);
  let sourceCount = 0;
  let skippedBackgroundCount = 0;
  let fallbackCount = 0;

  for (let index = 0; index < serializedObjects.length; index += 1) {
    const serializedObject = serializedObjects[index]!;
    if (isSyntheticTemplatePreviewBackground(serializedObject)) {
      skippedBackgroundCount += 1;
      continue;
    }
    sourceCount += 1;
    const bounds = getSerializedObjectHorizontalBounds(serializedObject);

    // Never drop an object from both pages: if bounds are invalid, duplicate defensively.
    if (!bounds) {
      fallbackCount += 1;
      const leftCopy = deepCloneJson(serializedObject);
      clearSpreadMirrorMeta(leftCopy);
      leftJson.push(leftCopy);
      const rightCopy = deepCloneJson(serializedObject);
      clearSpreadMirrorMeta(rightCopy);
      shiftLeftInSerialized(rightCopy, -spine);
      rightJson.push(rightCopy);
      continue;
    }

    const crosses = bounds.left < spine && bounds.right > spine;
    if (crosses) {
      const mirrorId = buildSpreadMirrorId({
        serialized: serializedObject,
        index,
        bounds,
        spine,
      });
      const leftCopy = deepCloneJson(serializedObject);
      markSpreadMirrorMeta(leftCopy, mirrorId, 'left', spine);
      leftJson.push(leftCopy);
      const rightCopy = deepCloneJson(serializedObject);
      markSpreadMirrorMeta(rightCopy, mirrorId, 'right', spine);
      shiftLeftInSerialized(rightCopy, -spine);
      rightJson.push(rightCopy);
      continue;
    }

    const centerX = bounds.left + (bounds.right - bounds.left) / 2;
    if (centerX < spine) {
      const leftCopy = deepCloneJson(serializedObject);
      clearSpreadMirrorMeta(leftCopy);
      leftJson.push(leftCopy);
    } else {
      const o = deepCloneJson(serializedObject);
      clearSpreadMirrorMeta(o);
      shiftLeftInSerialized(o, -spine);
      rightJson.push(o);
    }
  }
  recordPublicEditorPerfMetric(
    'spread.split.objectDelta',
    leftJson.length + rightJson.length - sourceCount,
    {
      sourceCount,
      leftCount: leftJson.length,
      rightCount: rightJson.length,
      fallbackCount,
      skippedBackgroundCount,
    },
  );
  if (PUBLIC_EDITOR_DEV && leftJson.length + rightJson.length < sourceCount) {
    console.warn('[DesignEditorCanvas] spread split dropped objects unexpectedly', {
      sourceCount,
      leftCount: leftJson.length,
      rightCount: rightJson.length,
      fallbackCount,
      skippedBackgroundCount,
    });
  }
  return {
    left: { ...base, objects: leftJson },
    right: { ...base, objects: rightJson },
  };
}

/** @deprecated используйте splitSpreadCanvasToPagesSync */
export async function splitSpreadCanvasToPages(
  canvas: Canvas,
  halfWidthPx: number,
): Promise<{ left: Record<string, unknown>; right: Record<string, unknown> }> {
  return splitSpreadCanvasToPagesSync(canvas, halfWidthPx);
}
