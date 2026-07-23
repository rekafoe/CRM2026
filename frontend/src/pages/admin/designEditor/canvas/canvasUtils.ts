import type { Canvas, FabricObject } from 'fabric';
import { isTextLikeFabricObject } from '../designEditorTextChrome';

export type AnyObj = Record<string, unknown>;

export type FabricDragTransform = {
  offsetX?: number;
  offsetY?: number;
};

export const KEYBOARD_NUDGE_FAST_MULTIPLIER = 10;
export const CLIPBOARD_PASTE_OFFSET_PX = 16;

export function asAny(obj: unknown): AnyObj {
  return obj as unknown as AnyObj;
}

export function isTextLikeObject(obj: FabricObject): boolean {
  return isTextLikeFabricObject(obj);
}

function pickPreferredDuplicateCanvasObject(objects: FabricObject[]): FabricObject {
  return objects.reduce((best, current) => {
    const bestMeta = asAny(best);
    const curMeta = asAny(current);
    const bestLayout = Number(bestMeta.textFieldLayoutWidth ?? best.width ?? 0);
    const curLayout = Number(curMeta.textFieldLayoutWidth ?? current.width ?? 0);
    if (curLayout > bestLayout + 1) return current;
    if (bestLayout > curLayout + 1) return best;
    if (curMeta.textFieldUserEdited === true && bestMeta.textFieldUserEdited !== true) return current;
    return best;
  });
}

/** Удаляет дубликаты объектов с одинаковым id (оставляет предпочтительный: edited / шире). */
export function deduplicateCanvasObjectsByStableId(canvas: Canvas): number {
  const byId = new Map<string, FabricObject[]>();
  for (const obj of canvas.getObjects()) {
    const id = String(asAny(obj).id ?? '').trim();
    if (!id) continue;
    const list = byId.get(id) ?? [];
    list.push(obj);
    byId.set(id, list);
  }
  let removed = 0;
  for (const objects of byId.values()) {
    if (objects.length <= 1) continue;
    const keep = pickPreferredDuplicateCanvasObject(objects);
    for (const obj of objects) {
      if (obj === keep) continue;
      canvas.remove(obj);
      removed += 1;
    }
  }
  return removed;
}
