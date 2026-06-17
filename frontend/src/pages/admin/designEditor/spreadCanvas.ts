import type { Canvas } from 'fabric';
import type { FabricObject } from 'fabric';
import { FABRIC_CUSTOM_PROPS as CUSTOM_PROPS } from './constants';
import { PUBLIC_EDITOR_DEV, recordPublicEditorPerfMetric } from '../../../features/publicDesignEditor/publicEditorPerf';

function deepCloneJson<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function shiftLeftInSerialized(o: Record<string, unknown>, delta: number): void {
  const raw = o.left;
  const n = typeof raw === 'number' ? raw : Number(raw ?? 0);
  o.left = n + delta;
}

function buildFallbackSerializedObject(obj: FabricObject, index: number): Record<string, unknown> {
  const rect = obj.getBoundingRect();
  const anyObj = obj as unknown as { id?: unknown; type?: unknown; angle?: unknown };
  const left = Number.isFinite(rect.left) ? rect.left : Number(obj.left ?? 0);
  const top = Number.isFinite(rect.top) ? rect.top : Number(obj.top ?? 0);
  const width = Number.isFinite(rect.width) && rect.width > 0 ? rect.width : Math.max(1, Number(obj.width ?? 1));
  const height = Number.isFinite(rect.height) && rect.height > 0 ? rect.height : Math.max(1, Number(obj.height ?? 1));
  const id = typeof anyObj.id === 'string' && anyObj.id.trim()
    ? anyObj.id
    : `spread-fallback-${index}-${Math.round(left)}-${Math.round(top)}`;
  return {
    type: 'rect',
    id,
    left,
    top,
    width,
    height,
    angle: Number(anyObj.angle) || 0,
    fill: 'rgba(0,0,0,0.001)',
    strokeWidth: 0,
    selectable: false,
    evented: false,
    spreadFallbackProxy: true,
  };
}

function safeSerializeObject(obj: FabricObject, index: number): Record<string, unknown> {
  try {
    return obj.toObject(CUSTOM_PROPS) as Record<string, unknown>;
  } catch {
    const fallback = buildFallbackSerializedObject(obj, index);
    if (PUBLIC_EDITOR_DEV) {
      console.warn('[DesignEditorCanvas] spread split used fallback serialization', {
        index,
        type: obj.type,
        id: (obj as unknown as { id?: unknown }).id,
      });
    }
    return fallback;
  }
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getObjectHorizontalBounds(
  obj: FabricObject,
  serialized: Record<string, unknown>,
): { left: number; right: number } | null {
  const rect = obj.getBoundingRect();
  if (Number.isFinite(rect.left) && Number.isFinite(rect.width) && rect.width >= 0) {
    return { left: rect.left, right: rect.left + rect.width };
  }

  const left = toFiniteNumber(serialized.left);
  const width = toFiniteNumber(serialized.width);
  const scaleX = toFiniteNumber(serialized.scaleX) ?? 1;
  if (left == null || width == null) return null;
  const renderedWidth = Math.abs(width * scaleX);
  return { left, right: left + renderedWidth };
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

function serializeCanvasObjectsStrict(canvas: Canvas, objects: FabricObject[]): {
  base: Record<string, unknown>;
  serialized: Array<Record<string, unknown>>;
  fallbackCount: number;
} {
  let fallbackCount = 0;
  try {
    const base = canvas.toObject(CUSTOM_PROPS) as Record<string, unknown>;
    if (Array.isArray(base.objects) && base.objects.length === objects.length) {
      const serialized = base.objects.filter(
        (item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item),
      );
      if (serialized.length === objects.length) {
        return { base, serialized, fallbackCount };
      }
    }
  } catch {
    // Fallback below keeps behavior predictable even if canvas.toObject throws.
  }

  const serialized = objects.map((obj, index) => {
    const next = safeSerializeObject(obj, index);
    if (next.spreadFallbackProxy === true) fallbackCount += 1;
    return next;
  });
  return {
    base: {
      objects: [],
      backgroundColor: (canvas as unknown as { backgroundColor?: unknown }).backgroundColor,
    },
    serialized,
    fallbackCount,
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

  const objects = canvas.getObjects() as FabricObject[];
  const { base, serialized, fallbackCount } = serializeCanvasObjectsStrict(canvas, objects);

  for (let index = 0; index < objects.length; index += 1) {
    const obj = objects[index]!;
    const serializedObject = serialized[index]!;
    const bounds = getObjectHorizontalBounds(obj, serializedObject);

    // Never drop an object from both pages: if bounds are invalid, duplicate defensively.
    if (!bounds) {
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
    leftJson.length + rightJson.length - objects.length,
    {
      sourceCount: objects.length,
      leftCount: leftJson.length,
      rightCount: rightJson.length,
      fallbackCount,
    },
  );
  if (PUBLIC_EDITOR_DEV && leftJson.length + rightJson.length < objects.length) {
    console.warn('[DesignEditorCanvas] spread split dropped objects unexpectedly', {
      sourceCount: objects.length,
      leftCount: leftJson.length,
      rightCount: rightJson.length,
      fallbackCount,
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
