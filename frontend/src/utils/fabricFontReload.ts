import type { Canvas, FabricObject } from 'fabric';
import {
  collectFontFamiliesFromTextField,
  collectFontLoadSpecsFromTextField,
  captureSacredTemplateTextGeometry,
  hydrateTextObjectStyles,
  isDesignedTemplateText,
  kickTextObjectFontRerender,
  lockSacredTextPositions,
  markCanvasTextMetricsTrusted,
  remeasureTextObjectsAfterFontLoad,
  stabilizeDesignedTextboxWidthFromContent,
  tightenDraftTextboxWidthOnLoad,
  type TextLikeObject,
} from '../pages/admin/designEditor/textStyleRuns';
import { ensureDesignFontLoaded } from './loadDesignFonts';

function isTextObject(obj: FabricObject): boolean {
  const type = obj.type?.toLowerCase();
  return type === 'i-text' || type === 'textbox' || type === 'text';
}

function collectTextObjectFontLoads(obj: FabricObject, out: Set<string>): void {
  if (!isTextObject(obj)) return;
  for (const spec of collectFontLoadSpecsFromTextField(obj as unknown as Record<string, unknown>)) {
    out.add(spec);
  }
}

function refreshTextObjectFont(obj: FabricObject, options?: { allowTighten?: boolean }): void {
  if (!isTextObject(obj)) return;
  const textObj = obj as TextLikeObject;
  // Designed text_* тоже: материализует textStyleRuns → styles, если styles ещё пустой.
  hydrateTextObjectStyles(textObj);
  if (isDesignedTemplateText(textObj)) {
    kickTextObjectFontRerender(textObj);
    if (textObj.type === 'textbox' && textObj.textFieldUserEdited === true) {
      if (options?.allowTighten) {
        tightenDraftTextboxWidthOnLoad(textObj);
      }
      stabilizeDesignedTextboxWidthFromContent(textObj);
      captureSacredTemplateTextGeometry(textObj, { overwrite: true });
    }
    textObj.setCoords?.();
    return;
  }
  kickTextObjectFontRerender(textObj);
}

function walkObjects(objects: FabricObject[], visit: (obj: FabricObject) => void): void {
  for (const obj of objects) {
    visit(obj);
    const group = obj as { getObjects?: () => FabricObject[] };
    if (typeof group.getObjects === 'function') {
      walkObjects(group.getObjects(), visit);
    }
  }
}

export function collectCanvasFontFamilies(canvas: Canvas): string[] {
  const families = new Set<string>();
  walkObjects(canvas.getObjects(), (obj) => {
    if (!isTextObject(obj)) return;
    collectFontFamiliesFromTextField(obj as unknown as Record<string, unknown>, families);
  });
  return [...families];
}

async function waitForPaintFrames(frames = 2): Promise<void> {
  for (let i = 0; i < frames; i += 1) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}

/** После FontFace / document.fonts — пересчитать метрики текста Fabric (иначе остаётся fallback). */
export async function reloadFabricCanvasFonts(
  canvas: Canvas,
  options?: { preserveLayout?: boolean },
): Promise<void> {
  const families = collectCanvasFontFamilies(canvas);
  await Promise.all(
    families.map(async (family) => {
      try {
        await ensureDesignFontLoaded(family);
      } catch {
        /* шрифт может быть системным */
      }
    }),
  );

  const loads = new Set<string>();
  walkObjects(canvas.getObjects(), (obj) => {
    collectTextObjectFontLoads(obj, loads);
  });
  await Promise.all(
    [...loads].map(async (spec) => {
      try {
        await document.fonts.load(spec);
      } catch {
        /* системный шрифт или ещё не в document.fonts */
      }
    }),
  );
  await document.fonts.ready;

  // Order/export PNG: только подгрузить глифы, без stabilize/sacred overwrite (иначе текст «скачет»).
  if (options?.preserveLayout) {
    walkObjects(canvas.getObjects(), (obj) => {
      if (!isTextObject(obj)) return;
      const textObj = obj as TextLikeObject;
      hydrateTextObjectStyles(textObj);
      kickTextObjectFontRerender(textObj);
      textObj.setCoords?.();
    });
    canvas.requestRenderAll();
    return;
  }

  // Первый проход: сброс кэша Fabric, без tighten (метрики ещё могут быть fallback).
  walkObjects(canvas.getObjects(), (obj) => refreshTextObjectFont(obj, { allowTighten: false }));
  remeasureTextObjectsAfterFontLoad(canvas.getObjects());
  lockSacredTextPositions(canvas);

  await waitForPaintFrames();
  walkObjects(canvas.getObjects(), (obj) => {
    if (!isTextObject(obj)) return;
    const textObj = obj as TextLikeObject;
    if (!isDesignedTemplateText(textObj)) return;
    kickTextObjectFontRerender(textObj);
    if (textObj.type === 'textbox' && textObj.textFieldUserEdited === true) {
      stabilizeDesignedTextboxWidthFromContent(textObj);
    }
  });
  remeasureTextObjectsAfterFontLoad(canvas.getObjects());
  lockSacredTextPositions(canvas);

  // После paint метрики скрипта обычно уже реальные — разрешаем tighten/expand + sacred overwrite.
  await waitForPaintFrames(3);
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 120);
  });
  markCanvasTextMetricsTrusted(canvas.getObjects());
  walkObjects(canvas.getObjects(), (obj) => refreshTextObjectFont(obj, { allowTighten: true }));
  remeasureTextObjectsAfterFontLoad(canvas.getObjects());
  lockSacredTextPositions(canvas);
  canvas.requestRenderAll();

  // iOS cold cache: повторный expand только для user-edited text_* (authored soft-load не трогаем).
  await waitForPaintFrames(2);
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 280);
  });
  walkObjects(canvas.getObjects(), (obj) => {
    if (!isTextObject(obj)) return;
    const textObj = obj as TextLikeObject;
    if (!isDesignedTemplateText(textObj) || textObj.type !== 'textbox') return;
    kickTextObjectFontRerender(textObj);
    if (textObj.textFieldUserEdited === true) {
      stabilizeDesignedTextboxWidthFromContent(textObj);
      captureSacredTemplateTextGeometry(textObj, { overwrite: true });
    }
    textObj.setCoords?.();
  });
  lockSacredTextPositions(canvas);
  canvas.requestRenderAll();
}
