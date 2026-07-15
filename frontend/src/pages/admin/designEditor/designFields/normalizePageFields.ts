import type { Canvas, FabricObject } from 'fabric';
import { normalizeFilledPhotoFieldsOnCanvas } from '../photoFieldFit';
import { prepareTextObjectsOnCanvas } from '../textStyleRuns';
import { isTemplatePhotoField } from './fieldMeta';
import { syncImportedPhotoFieldsOnCanvas, upgradeEmptyPhotoFieldsOnCanvas } from './photoField';
import { applyImportStackOrder } from './importStackOrder';

// Re-assert positions of template text fields after all normalizations.
// This is the final seat-belt so that no combination of hydrate/width/coords
// can drift the original placement coming from the SVG import when flipping pages.
function lockAllTemplateTextPositions(canvas: Canvas): void {
  for (const obj of canvas.getObjects()) {
    const anyObj = obj as unknown as { id?: string; textFieldClientAdded?: boolean; left?: number; top?: number; set?: (p: any) => void; setCoords?: () => void; type?: string };
    const id = String(anyObj.id ?? '');
    if (anyObj.type !== 'textbox') continue;
    if (!id.toLowerCase().startsWith('text_')) continue;
    if (anyObj.textFieldClientAdded === true) continue;
    const l = Number(anyObj.left);
    const t = Number(anyObj.top);
    const patch: Record<string, number> = {};
    if (Number.isFinite(l)) patch.left = l;
    if (Number.isFinite(t)) patch.top = t;
    if (anyObj.set && Object.keys(patch).length) anyObj.set(patch);
    anyObj.setCoords?.();
    // Also recurse groups if any
    const group = obj as { getObjects?: () => FabricObject[] };
    if (typeof group.getObjects === 'function') {
      for (const child of group.getObjects()) {
        const c = child as unknown as { id?: string; textFieldClientAdded?: boolean; left?: number; top?: number; set?: (p: any) => void; setCoords?: () => void; type?: string };
        const cid = String(c.id ?? '');
        if (c.type !== 'textbox' || !cid.toLowerCase().startsWith('text_') || c.textFieldClientAdded === true) continue;
        const cl = Number(c.left); const ct = Number(c.top);
        const cp: Record<string, number> = {};
        if (Number.isFinite(cl)) cp.left = cl;
        if (Number.isFinite(ct)) cp.top = ct;
        if (c.set && Object.keys(cp).length) c.set(cp);
        c.setCoords?.();
      }
    }
  }
}

type AnyObj = Record<string, unknown>;

function ax(obj: unknown): AnyObj {
  return obj as AnyObj;
}

function isTemplateEmptyPhotoField(obj: FabricObject): boolean {
  const meta = ax(obj);
  return isTemplatePhotoField(meta) && meta.photoFieldFilled !== true;
}

function getBackgroundLayerCount(objects: FabricObject[]): number {
  let count = 0;
  for (const obj of objects) {
    if (ax(obj).isBackground !== true) break;
    count += 1;
  }
  return count;
}

function normalizeTemplateEmptyPhotoFieldStack(canvas: Canvas): void {
  const objects = canvas.getObjects();
  const emptyTemplateFields = objects.filter(isTemplateEmptyPhotoField);
  if (emptyTemplateFields.length === 0) return;

  for (const field of emptyTemplateFields) {
    canvas.remove(field);
  }

  const insertIndex = getBackgroundLayerCount(canvas.getObjects());
  emptyTemplateFields.forEach((field, offset) => {
    canvas.insertAt(insertIndex + offset, field);
  });
}

/**
 * Единая точка нормализации полей после loadFromJSON:
 * текст (импорт) → геометрия шаблонных photo_* → chrome пустых полей → порядок слоёв → layout заполненных.
 */
export async function normalizeDesignFieldsOnCanvas(
  canvas: Canvas,
  _pageW: number,
  _pageH: number,
): Promise<void> {
  prepareTextObjectsOnCanvas(canvas.getObjects());
  syncImportedPhotoFieldsOnCanvas(canvas);
  upgradeEmptyPhotoFieldsOnCanvas(canvas);
  normalizeTemplateEmptyPhotoFieldStack(canvas);
  await normalizeFilledPhotoFieldsOnCanvas(canvas);
  applyImportStackOrder(canvas);
  lockAllTemplateTextPositions(canvas);
}
