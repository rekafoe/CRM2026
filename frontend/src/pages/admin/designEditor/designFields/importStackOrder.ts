import type { Canvas, FabricObject } from 'fabric';
import { resolveFabricObjectBaseId, isTemplateTextLayerId } from '../spreadPageObjectIds';

type AnyObj = Record<string, unknown>;

function ax(obj: FabricObject): AnyObj {
  return obj as unknown as AnyObj;
}

function readImportStackIndex(obj: FabricObject): number | null {
  const value = Number(ax(obj).importStackIndex);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Жёсткий порядок семейств слоёв:
 * photo ниже decor/прочего, text всегда сверху.
 * Правило master/клиента: фотополе никогда не перекрывает текст.
 */
export function resolveDesignLayerKindRank(obj: FabricObject): number {
  const meta = ax(obj);
  const baseId = resolveFabricObjectBaseId(meta.id).toLowerCase();
  const type = String(obj.type ?? '').toLowerCase();
  if (meta.isPhotoField === true || baseId.startsWith('photo_') || baseId.startsWith('field-')) {
    return 0;
  }
  if (meta.isDecorElement === true || baseId.startsWith('decor_')) return 1;
  if (
    isTemplateTextLayerId(meta.id)
    || type === 'i-text'
    || type === 'textbox'
    || type === 'text'
  ) {
    return 3;
  }
  return 2;
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
 * Восстанавливает z-order: background → photo → decor → прочее → text.
 * Всегда применяет kind-rank (даже без importStackIndex), чтобы client-added
 * photo_* / field-* не всплывали над текстом.
 */
export function applyImportStackOrder(canvas: Canvas): void {
  const objects = canvas.getObjects();
  if (objects.length < 2) return;

  const entries = objects.map((obj, originalPos) => ({
    obj,
    originalPos,
    isBackground: ax(obj).isBackground === true,
    stackIndex: readImportStackIndex(obj),
    kindRank: resolveDesignLayerKindRank(obj),
  }));

  const backgrounds = entries.filter((entry) => entry.isBackground);
  const foreground = entries.filter((entry) => !entry.isBackground);

  foreground.sort((a, b) => {
    if (a.kindRank !== b.kindRank) return a.kindRank - b.kindRank;
    const aStack = a.stackIndex;
    const bStack = b.stackIndex;
    if (aStack != null && bStack != null && aStack !== bStack) return aStack - bStack;
    if (aStack != null && bStack == null) return -1;
    if (aStack == null && bStack != null) return 1;
    return a.originalPos - b.originalPos;
  });

  const targetOrder = [...backgrounds.map((entry) => entry.obj), ...foreground.map((entry) => entry.obj)];
  let orderChanged = false;
  for (let i = 0; i < targetOrder.length; i += 1) {
    if (targetOrder[i] !== objects[i]) {
      orderChanged = true;
      break;
    }
  }
  if (!orderChanged) return;

  for (const obj of objects) {
    canvas.remove(obj);
  }
  for (const obj of targetOrder) {
    canvas.add(obj);
  }
}
