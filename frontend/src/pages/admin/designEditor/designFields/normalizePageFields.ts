import type { Canvas, FabricObject } from 'fabric';
import { normalizeFilledPhotoFieldsOnCanvas } from '../photoFieldFit';
import { upgradeOrphanLibraryImagesOnCanvas } from '../canvas/canvasCommands';
import { prepareTextObjectsOnCanvas } from '../textStyleRuns';
import { isTemplatePhotoField } from './fieldMeta';
import { syncImportedPhotoFieldsOnCanvas, upgradeEmptyPhotoFieldsOnCanvas } from './photoField';
import { applyImportStackOrder } from './importStackOrder';

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
  options?: { preserveTextLayout?: boolean },
): Promise<void> {
  prepareTextObjectsOnCanvas(canvas.getObjects(), {
    preserveLayout: options?.preserveTextLayout === true,
  });
  syncImportedPhotoFieldsOnCanvas(canvas);
  upgradeEmptyPhotoFieldsOnCanvas(canvas);
  await upgradeOrphanLibraryImagesOnCanvas(canvas);
  normalizeTemplateEmptyPhotoFieldStack(canvas);
  await normalizeFilledPhotoFieldsOnCanvas(canvas);
  applyImportStackOrder(canvas);
}
