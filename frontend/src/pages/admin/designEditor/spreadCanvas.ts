import type { Canvas } from 'fabric';
import type { FabricObject } from 'fabric';

/** Должны совпадать с DesignEditorCanvas CUSTOM_PROPS */
const CUSTOM_PROPS = ['id', 'isBackground', 'isPhotoField', 'locked'];

function deepCloneJson<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function shiftLeftInSerialized(o: Record<string, unknown>, delta: number): void {
  const raw = o.left;
  const n = typeof raw === 'number' ? raw : Number(raw ?? 0);
  o.left = n + delta;
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

    if (crosses) {
      const base = obj.toObject(CUSTOM_PROPS) as Record<string, unknown>;
      leftJson.push(deepCloneJson(base));
      const rightCopy = deepCloneJson(base);
      shiftLeftInSerialized(rightCopy, -spine);
      rightJson.push(rightCopy);
    } else if (rightEdge <= spine + 0.5) {
      leftJson.push(obj.toObject(CUSTOM_PROPS) as Record<string, unknown>);
    } else if (br.left >= spine - 0.5) {
      const o = deepCloneJson(obj.toObject(CUSTOM_PROPS) as Record<string, unknown>);
      shiftLeftInSerialized(o, -spine);
      rightJson.push(o);
    }
  }

  const base = canvas.toObject(CUSTOM_PROPS) as Record<string, unknown>;
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
