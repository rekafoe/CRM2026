import { Canvas, FabricImage } from 'fabric';
import type { DesignTemplate } from '../../../api';
import type { DesignPage } from './types';
import { FABRIC_CUSTOM_PROPS } from './constants';
import { upgradeEmptyPhotoFieldsOnCanvas } from './photoFieldEmpty';
import { prepareTextObjectsOnCanvas } from './textStyleRuns';

type AnyObj = Record<string, unknown>;

export function fabricDeserializeReviver(
  serializedObj: Record<string, unknown>,
  instance: unknown,
): void {
  const target = instance as AnyObj;
  for (const key of FABRIC_CUSTOM_PROPS) {
    if (!Object.prototype.hasOwnProperty.call(serializedObj, key)) continue;
    target[key] = serializedObj[key];
  }
}

function asAny(value: unknown): AnyObj {
  return value as AnyObj;
}

function resolvePreviewUrl(template: DesignTemplate | null, apiBaseUrl: string): string | null {
  if (!template?.preview_url) return null;
  if (template.preview_url.startsWith('http')) return template.preview_url;
  const base = apiBaseUrl.replace(/\/api\/?$/, '');
  return `${base}${template.preview_url.startsWith('/') ? '' : '/'}${template.preview_url}`;
}

function hasBackgroundObject(canvas: Canvas): boolean {
  return canvas.getObjects().some((obj) => !!asAny(obj).isBackground);
}

function normalizeBackgroundObjects(canvas: Canvas, pageW: number, pageH: number): void {
  canvas.getObjects().forEach((obj) => {
    const meta = asAny(obj);
    if (!meta.isBackground) return;
    obj.set({ selectable: false, evented: false });
    if (meta.backgroundFit === 'page') {
      obj.set({
        left: 0,
        top: 0,
        scaleX: pageW / Math.max(Number(obj.width) || pageW, 1),
        scaleY: pageH / Math.max(Number(obj.height) || pageH, 1),
      });
    }
    canvas.sendObjectToBack(obj);
  });
}

export async function addTemplatePreviewBackground(
  canvas: Canvas,
  template: DesignTemplate | null,
  pageW: number,
  pageH: number,
  apiBaseUrl: string,
): Promise<void> {
  const previewUrl = resolvePreviewUrl(template, apiBaseUrl);
  if (!previewUrl) return;
  try {
    const img = await FabricImage.fromURL(previewUrl, { crossOrigin: 'anonymous' });
    img.set({
      left: 0,
      top: 0,
      scaleX: pageW / (img.width || pageW),
      scaleY: pageH / (img.height || pageH),
      selectable: false,
      evented: false,
    });
    asAny(img).isBackground = true;
    asAny(img).backgroundFit = 'page';
    canvas.add(img);
    canvas.sendObjectToBack(img);
  } catch {
    // preview is optional for draft/manual templates
  }
}

export async function loadDesignPageScene(input: {
  canvas: Canvas;
  pageData: DesignPage | undefined;
  pageIndex?: number;
  template: DesignTemplate | null;
  pageW: number;
  pageH: number;
  apiBaseUrl: string;
}): Promise<void> {
  const { canvas, pageData, pageIndex, template, pageW, pageH, apiBaseUrl } = input;
  const useTemplatePreviewBackground = pageIndex == null || pageIndex === 0;
  const hasJson = pageData?.fabricJSON && Object.keys(pageData.fabricJSON).length > 0;
  if (hasJson) {
    await canvas.loadFromJSON(pageData!.fabricJSON, fabricDeserializeReviver);
    prepareTextObjectsOnCanvas(canvas.getObjects());
    upgradeEmptyPhotoFieldsOnCanvas(canvas);
    normalizeBackgroundObjects(canvas, pageW, pageH);
    if (useTemplatePreviewBackground && !hasBackgroundObject(canvas)) {
      await addTemplatePreviewBackground(canvas, template, pageW, pageH, apiBaseUrl);
    }
  } else {
    canvas.clear();
    (canvas as unknown as AnyObj).backgroundColor = 'white';
    if (useTemplatePreviewBackground) {
      await addTemplatePreviewBackground(canvas, template, pageW, pageH, apiBaseUrl);
    }
  }
  canvas.requestRenderAll();
}

export async function loadSpreadMergedScene(input: {
  canvas: Canvas;
  leftPage: DesignPage | undefined;
  rightPage: DesignPage | undefined;
  leftPageIndex?: number;
  rightPageIndex?: number;
  pageW: number;
  pageH: number;
  template: DesignTemplate | null;
  apiBaseUrl: string;
}): Promise<void> {
  const { canvas, leftPage, rightPage, leftPageIndex, rightPageIndex, pageW, pageH, template, apiBaseUrl } = input;
  await loadDesignPageScene({ canvas, pageData: leftPage, pageIndex: leftPageIndex, template, pageW, pageH, apiBaseUrl });
  const tempEl = document.createElement('canvas');
  const temp = new Canvas(tempEl, {
    width: pageW,
    height: pageH,
    backgroundColor: 'white',
    preserveObjectStacking: true,
  });
  await loadDesignPageScene({ canvas: temp, pageData: rightPage, pageIndex: rightPageIndex, template, pageW, pageH, apiBaseUrl });
  for (const obj of [...temp.getObjects()]) {
    const clone = await obj.clone();
    clone.set({ left: (clone.left ?? 0) + pageW });
    canvas.add(clone);
  }
  temp.dispose();
  canvas.requestRenderAll();
}
