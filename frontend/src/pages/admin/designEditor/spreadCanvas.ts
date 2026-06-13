import type { Canvas } from 'fabric';
import type { FabricObject } from 'fabric';
import { FABRIC_CUSTOM_PROPS as CUSTOM_PROPS } from './constants';

function deepCloneJson<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function shiftLeftInSerialized(o: Record<string, unknown>, delta: number): void {
  const raw = o.left;
  const n = typeof raw === 'number' ? raw : Number(raw ?? 0);
  o.left = n + delta;
}

function safeSerializeObject(obj: FabricObject): Record<string, unknown> | null {
  try {
    return obj.toObject(CUSTOM_PROPS) as Record<string, unknown>;
  } catch {
    return null;
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

function serializeCanvasObjectsStrict(canvas: Canvas, objects: FabricObject[]): {
  base: Record<string, unknown>;
  serialized: Record<string, unknown>[];
} {
  try {
    const base = canvas.toObject(CUSTOM_PROPS) as Record<string, unknown>;
    if (Array.isArray(base.objects) && base.objects.length === objects.length) {
      const serialized = base.objects.filter(
        (item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item),
      );
      if (serialized.length === objects.length) {
        return { base, serialized };
      }
    }
  } catch {
    // Fallback below keeps behavior predictable even if canvas.toObject throws.
  }

  const serialized = objects.map((obj, index) => {
    const next = safeSerializeObject(obj);
    if (next) return next;
    throw new Error(`Failed to serialize spread object at index ${index}`);
  });

  return {
    base: {
      objects: [],
      backgroundColor: (canvas as unknown as { backgroundColor?: unknown }).backgroundColor,
    },
    serialized,
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
  const { base, serialized } = serializeCanvasObjectsStrict(canvas, objects);

  for (let index = 0; index < objects.length; index += 1) {
    const obj = objects[index]!;
    const serializedObject = serialized[index]!;
    const bounds = getObjectHorizontalBounds(obj, serializedObject);

    // Never drop an object from both pages: if bounds are invalid, duplicate defensively.
    if (!bounds) {
      leftJson.push(deepCloneJson(serializedObject));
      const rightCopy = deepCloneJson(serializedObject);
      shiftLeftInSerialized(rightCopy, -spine);
      rightJson.push(rightCopy);
      continue;
    }

    const crosses = bounds.left < spine && bounds.right > spine;
    if (crosses) {
      leftJson.push(deepCloneJson(serializedObject));
      const rightCopy = deepCloneJson(serializedObject);
      shiftLeftInSerialized(rightCopy, -spine);
      rightJson.push(rightCopy);
      continue;
    }

    const centerX = bounds.left + (bounds.right - bounds.left) / 2;
    if (centerX < spine) {
      leftJson.push(serializedObject);
    } else {
      const o = deepCloneJson(serializedObject);
      shiftLeftInSerialized(o, -spine);
      rightJson.push(o);
    }
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
