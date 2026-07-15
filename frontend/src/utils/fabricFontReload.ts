import type { Canvas, FabricObject } from 'fabric';
import {
  collectFontFamiliesFromTextField,
  hydrateTextObjectStyles,
} from '../pages/admin/designEditor/textStyleRuns';

function isTextObject(obj: FabricObject): boolean {
  const type = obj.type?.toLowerCase();
  return type === 'i-text' || type === 'textbox' || type === 'text';
}

type TextLikeObject = FabricObject & {
  fontSize?: number;
  initDimensions?: () => void;
  setCoords?: () => void;
};

function collectTextObjectFontFamilies(obj: FabricObject, out: Set<string>): void {
  if (!isTextObject(obj)) return;
  collectFontFamiliesFromTextField(obj as unknown as Record<string, unknown>, out);
}

function collectTextObjectFontLoads(obj: FabricObject, out: Set<string>): void {
  if (!isTextObject(obj)) return;
  const textObj = obj as TextLikeObject;
  const family = String((textObj as unknown as { fontFamily?: string }).fontFamily ?? '').trim();
  if (!family) return;
  const fontSize = Math.max(6, Number(textObj.fontSize) || 16);
  const escaped = family.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  out.add(`${fontSize}px "${escaped}"`);
}

function refreshTextObjectFont(obj: FabricObject): void {
  if (!isTextObject(obj)) return;
  const textObj = obj as TextLikeObject;
  hydrateTextObjectStyles(textObj as Parameters<typeof hydrateTextObjectStyles>[0]);
  textObj.initDimensions?.();
  textObj.setCoords?.();
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
    collectTextObjectFontFamilies(obj, families);
  });
  return [...families];
}

/** После FontFace / document.fonts — пересчитать метрики текста Fabric (иначе остаётся fallback). */
export async function reloadFabricCanvasFonts(canvas: Canvas): Promise<void> {
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
  canvas.requestRenderAll();
}
