import type { Canvas, FabricObject } from 'fabric';
import {
  collectFontFamiliesFromTextField,
  collectFontLoadSpecsFromTextField,
  hydrateTextObjectStyles,
  isDesignedTemplateText,
  kickTextObjectFontRerender,
  remeasureTextObjectsAfterFontLoad,
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

function refreshTextObjectFont(obj: FabricObject): void {
  if (!isTextObject(obj)) return;
  const textObj = obj as TextLikeObject;
  if (isDesignedTemplateText(textObj)) {
    kickTextObjectFontRerender(textObj);
    textObj.setCoords?.();
    return;
  }
  hydrateTextObjectStyles(textObj);
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
export async function reloadFabricCanvasFonts(canvas: Canvas): Promise<void> {
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

  walkObjects(canvas.getObjects(), refreshTextObjectFont);
  remeasureTextObjectsAfterFontLoad(canvas.getObjects());

  await waitForPaintFrames();
  walkObjects(canvas.getObjects(), (obj) => {
    if (!isTextObject(obj)) return;
    kickTextObjectFontRerender(obj as TextLikeObject);
  });
  remeasureTextObjectsAfterFontLoad(canvas.getObjects());

  canvas.requestRenderAll();
}
