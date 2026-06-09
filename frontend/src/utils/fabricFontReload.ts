import type { Canvas, FabricObject } from 'fabric';

function isTextObject(obj: FabricObject): boolean {
  const type = obj.type?.toLowerCase();
  return type === 'i-text' || type === 'textbox' || type === 'text';
}

function refreshTextObjectFont(obj: FabricObject): void {
  if (!isTextObject(obj)) return;
  const family = (obj as { fontFamily?: string }).fontFamily?.trim();
  if (!family) return;
  obj.set('fontFamily', family);
  const text = obj as { initDimensions?: () => void; setCoords?: () => void };
  text.initDimensions?.();
  text.setCoords?.();
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
    const family = (obj as { fontFamily?: string }).fontFamily?.trim();
    if (family) families.add(family);
  });
  return [...families];
}

/** После FontFace / document.fonts — пересчитать метрики текста Fabric (иначе остаётся fallback). */
export async function reloadFabricCanvasFonts(canvas: Canvas): Promise<void> {
  const families = collectCanvasFontFamilies(canvas);
  await Promise.all(
    families.map(async (family) => {
      const escaped = family.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      try {
        await document.fonts.load(`16px "${escaped}"`);
      } catch {
        /* системный шрифт или ещё не в document.fonts */
      }
    }),
  );
  await document.fonts.ready;
  walkObjects(canvas.getObjects(), refreshTextObjectFont);
  canvas.requestRenderAll();
}
