import { collectFontFamiliesFromTextField, patchTextStyleRunsFontInFabricJSON } from './textStyleRuns';

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
      if (typeof patch.fontFamily === 'string') {
        o.fontFamily = patch.fontFamily;
        delete o.textStyleRuns;
        delete o.styles;
      }
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'fontFamily') continue;
        if (v === undefined) {
          delete o[k];
        } else {
          o[k] = v as unknown;
        }
      }
      if (patch.fontFamily === undefined && Array.isArray(o.textStyleRuns)) {
        o.textStyleRuns = (o.textStyleRuns as Array<Record<string, unknown>>).map((run) => {
          const next = { ...run };
          if (typeof patch.fill === 'string') next.fill = patch.fill;
          if (typeof patch.fontWeight === 'string') next.fontWeight = patch.fontWeight;
          if (typeof patch.fontStyle === 'string') next.fontStyle = patch.fontStyle;
          if (typeof patch.fontSize === 'number') next.fontSize = patch.fontSize;
          return next;
        });
      }
      delete o.styles;
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

/** Глобальная смена шрифта: сбрасывает textStyleRuns и styles. */
export function patchAllTextFontFamilyInFabricJSON(
  fabricJSON: Record<string, unknown>,
  fontFamily: string,
): Record<string, unknown> {
  return patchTextStyleRunsFontInFabricJSON(fabricJSON, fontFamily);
}

function collectFontFamiliesRecursive(objects: unknown[], out: Set<string>): void {
  for (const obj of objects) {
    if (!obj || typeof obj !== 'object') continue;
    const o = obj as Record<string, unknown>;
    const t = String(o.type ?? '').toLowerCase();
    if (TEXT_TYPES.has(t)) {
      collectFontFamiliesFromTextField(o, out);
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
