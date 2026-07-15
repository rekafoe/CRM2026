import type { Canvas, FabricObject } from 'fabric';

type AnyObj = Record<string, unknown>;

function ax(obj: FabricObject): AnyObj {
  return obj as unknown as AnyObj;
}

function readImportStackIndex(obj: FabricObject): number | null {
  const value = Number(ax(obj).importStackIndex);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Метаданные z-order из SVG-импорта — переносим при замене rect → group. */
export const IMPORT_STACK_META_KEYS = ['importStackIndex', 'isDecorElement', 'decorLayerName'] as const;

export function copyImportStackMetadata(from: unknown, to: unknown): void {
  const src = ax(from as FabricObject);
  const dst = ax(to as FabricObject);
  for (const key of IMPORT_STACK_META_KEYS) {
    if (src[key] != null) dst[key] = src[key];
  }
}

/**
 * Восстанавливает z-order из SVG-импорта после нормализаций canvas
 * (например normalizeTemplateEmptyPhotoFieldStack).
 */
export function applyImportStackOrder(canvas: Canvas): void {
  const objects = canvas.getObjects();
  if (objects.length < 2) return;

  const entries = objects.map((obj, originalPos) => ({
    obj,
    originalPos,
    isBackground: ax(obj).isBackground === true,
    stackIndex: readImportStackIndex(obj),
  }));

  const indexedCount = entries.filter((entry) => entry.stackIndex != null).length;
  if (indexedCount < 2) return;

  const backgrounds = entries.filter((entry) => entry.isBackground);
  const foreground = entries.filter((entry) => !entry.isBackground);

  foreground.sort((a, b) => {
    const aStack = a.stackIndex;
    const bStack = b.stackIndex;
    if (aStack != null && bStack != null && aStack !== bStack) return aStack - bStack;
    if (aStack != null && bStack == null) return -1;
    if (aStack == null && bStack != null) return 1;
    return a.originalPos - b.originalPos;
  });

  const targetOrder = [...backgrounds.map((entry) => entry.obj), ...foreground.map((entry) => entry.obj)];
  for (const obj of objects) {
    canvas.remove(obj);
  }
  for (const obj of targetOrder) {
    canvas.add(obj);
  }
}
