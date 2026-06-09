/** Патч всех текстовых объектов в Fabric JSON (i-text, textbox; рекурсивно в группах) */

/** Fabric 6 сериализует IText как type: "IText" → toLowerCase "itext" */
export const FABRIC_TEXT_OBJECT_TYPES = new Set(['i-text', 'itext', 'textbox', 'text']);

export function isFabricTextObjectType(type: unknown): boolean {
  return FABRIC_TEXT_OBJECT_TYPES.has(String(type ?? '').toLowerCase());
}

const TEXT_TYPES = FABRIC_TEXT_OBJECT_TYPES;

function patchTextObjectsRecursive(objects: unknown[], patch: Record<string, unknown>): void {
  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    const o = obj as Record<string, unknown>;
    const t = String(o.type ?? '').toLowerCase();
    if (TEXT_TYPES.has(t)) {
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) {
          delete o[k];
        } else {
          o[k] = v as unknown;
        }
      }
    }
    if (Array.isArray(o.objects)) {
      patchTextObjectsRecursive(o.objects as unknown[], patch);
    }
  }
}

export function patchAllTextInFabricJSON(
  fabricJSON: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  if (!fabricJSON || typeof fabricJSON !== 'object') {
    return fabricJSON;
  }
  const next = structuredClone(fabricJSON) as Record<string, unknown>;
  const objects = next.objects;
  if (Array.isArray(objects)) {
    patchTextObjectsRecursive(objects, patch);
  }
  return next;
}

function collectFontFamiliesFromTextObject(o: Record<string, unknown>, out: Set<string>): void {
  const ff = o.fontFamily;
  if (typeof ff === 'string' && ff.trim()) out.add(ff.trim());
  const styles = o.styles;
  if (!styles || typeof styles !== 'object' || Array.isArray(styles)) return;
  for (const line of Object.values(styles as Record<string, unknown>)) {
    if (!line || typeof line !== 'object' || Array.isArray(line)) continue;
    for (const style of Object.values(line as Record<string, unknown>)) {
      if (!style || typeof style !== 'object' || Array.isArray(style)) continue;
      const segFont = (style as Record<string, unknown>).fontFamily;
      if (typeof segFont === 'string' && segFont.trim()) out.add(segFont.trim());
    }
  }
}

function collectFontFamiliesRecursive(objects: unknown[], out: Set<string>): void {
  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    const o = obj as Record<string, unknown>;
    const t = String(o.type ?? '').toLowerCase();
    if (TEXT_TYPES.has(t)) {
      collectFontFamiliesFromTextObject(o, out);
    }
    if (Array.isArray(o.objects)) {
      collectFontFamiliesRecursive(o.objects as unknown[], out);
    }
  }
}

/** Уникальные fontFamily из одного снимка Fabric JSON (включая группы). */
export function extractUsedFontFamiliesFromFabricJSON(
  fabricJSON: Record<string, unknown>,
): string[] {
  const out = new Set<string>();
  const objects = fabricJSON?.objects;
  if (Array.isArray(objects)) {
    collectFontFamiliesRecursive(objects, out);
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b, 'ru'));
}

/** Уникальные шрифты по всем страницам макета. */
export function extractUsedFontFamiliesFromPages(
  pages: Array<{ fabricJSON: Record<string, unknown> }>,
): string[] {
  const out = new Set<string>();
  for (const p of pages) {
    for (const f of extractUsedFontFamiliesFromFabricJSON(p.fabricJSON)) {
      out.add(f);
    }
  }
  return Array.from(out).sort((a, b) => a.localeCompare(b, 'ru'));
}
