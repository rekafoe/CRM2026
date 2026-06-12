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

  for (const obj of objects) {
    const br = obj.getBoundingRect();
    const rightEdge = br.left + br.width;
    const crosses = br.left < spine && rightEdge > spine;
    const serialized = safeSerializeObject(obj);
    if (!serialized) continue;

    if (crosses) {
      leftJson.push(deepCloneJson(serialized));
      const rightCopy = deepCloneJson(serialized);
      shiftLeftInSerialized(rightCopy, -spine);
      rightJson.push(rightCopy);
    } else if (rightEdge <= spine + 0.5) {
      leftJson.push(serialized);
    } else if (br.left >= spine - 0.5) {
      const o = deepCloneJson(serialized);
      shiftLeftInSerialized(o, -spine);
      rightJson.push(o);
    }
  }

  let base: Record<string, unknown>;
  try {
    base = canvas.toObject(CUSTOM_PROPS) as Record<string, unknown>;
  } catch {
    base = {
      objects: [],
      backgroundColor: (canvas as unknown as { backgroundColor?: unknown }).backgroundColor,
    };
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
