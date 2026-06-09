import type { Canvas, FabricObject } from 'fabric';

function isTextObject(obj: FabricObject): boolean {
  const type = obj.type?.toLowerCase();
  return type === 'i-text' || type === 'textbox' || type === 'text';
}

function collectTextObjectFontFamilies(obj: FabricObject, out: Set<string>): void {
  if (!isTextObject(obj)) return;
  const o = obj as {
    fontFamily?: string;
    styles?: Record<string, Record<string, { fontFamily?: string }>>;
  };
  const base = o.fontFamily?.trim();
  if (base) out.add(base);
  const styles = o.styles;
  if (!styles || typeof styles !== 'object') return;
  for (const line of Object.values(styles)) {
    if (!line || typeof line !== 'object') continue;
    for (const style of Object.values(line)) {
      const segFont = style?.fontFamily?.trim();
      if (segFont) out.add(segFont);
    }
  }
}

function refreshTextObjectFont(obj: FabricObject): void {
  if (!isTextObject(obj)) return;
  const o = obj as {
    fontFamily?: string;
    styles?: Record<string, Record<string, { fontFamily?: string }>>;
    initDimensions?: () => void;
    setCoords?: () => void;
  };
  const family = o.fontFamily?.trim();
  if (family) obj.set('fontFamily', family);
  if (o.styles) {
    obj.set('styles', { ...o.styles });
  }
  o.initDimensions?.();
  o.setCoords?.();
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
