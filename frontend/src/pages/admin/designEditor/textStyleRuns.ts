import type { FabricObject } from 'fabric';
import { isFabricTextObjectType } from './patchFabricTextObjects';

export type TextStyleRun = {
  start: number;
  end: number;
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  fill?: string;
  fontSize?: number;
};

type FabricStyles = Record<number, Record<number, Record<string, unknown>>>;

type TextLikeObject = FabricObject & {
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  width?: number;
  id?: string;
  textFieldClientAdded?: boolean;
  styles?: FabricStyles;
  textStyleRuns?: TextStyleRun[];
  initDimensions?: () => void;
  setCoords?: () => void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function buildFabricStylesFromRuns(
  text: string,
  runs: TextStyleRun[],
  baseFontSizePx: number,
): FabricStyles | undefined {
  const lines = text.split('\n');
  const lineStartOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStartOffsets.push(offset);
    offset += line.length + 1;
  }
  const out: FabricStyles = {};
  for (const seg of runs) {
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const lineStart = lineStartOffsets[lineIndex]!;
      const lineText = lines[lineIndex] ?? '';
      const lineEnd = lineStart + lineText.length;
      if (seg.end <= lineStart || seg.start >= lineEnd) continue;
      const charIndex = Math.max(0, seg.start - lineStart);
      const patch: Record<string, unknown> = {};
      if (seg.fontFamily) patch.fontFamily = seg.fontFamily;
      if (seg.fontWeight) patch.fontWeight = seg.fontWeight;
      if (seg.fontStyle) patch.fontStyle = seg.fontStyle;
      if (seg.fill) patch.fill = seg.fill;
      if (seg.fontSize != null && seg.fontSize > baseFontSizePx + 0.5) {
        patch.fontSize = Math.max(6, seg.fontSize);
      }
      if (Object.keys(patch).length === 0) continue;
      out[lineIndex] ??= {};
      out[lineIndex]![charIndex] = patch;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function extractRunsFromFabricStyles(
  text: string,
  styles: FabricStyles,
): TextStyleRun[] {
  const lines = text.split('\n');
  const lineStartOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStartOffsets.push(offset);
    offset += line.length + 1;
  }
  const markers: Array<{ absIndex: number; patch: Record<string, unknown> }> = [];
  for (const [lineKey, lineStyles] of Object.entries(styles)) {
    const lineIndex = Number(lineKey);
    if (!Number.isFinite(lineIndex) || !lineStyles) continue;
    const lineStart = lineStartOffsets[lineIndex] ?? 0;
    for (const [charKey, patch] of Object.entries(lineStyles)) {
      const charIndex = Number(charKey);
      if (!Number.isFinite(charIndex) || !patch) continue;
      markers.push({ absIndex: lineStart + charIndex, patch });
    }
  }
  markers.sort((a, b) => a.absIndex - b.absIndex);
  if (!markers.length) return [];

  const runs: TextStyleRun[] = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i]!.absIndex;
    const end = i + 1 < markers.length ? markers[i + 1]!.absIndex : text.length;
    const patch = markers[i]!.patch;
    const run: TextStyleRun = { start, end };
    if (typeof patch.fontFamily === 'string') run.fontFamily = patch.fontFamily;
    if (typeof patch.fontWeight === 'string') run.fontWeight = patch.fontWeight;
    if (typeof patch.fontStyle === 'string') run.fontStyle = patch.fontStyle;
    if (typeof patch.fill === 'string') run.fill = patch.fill;
    if (typeof patch.fontSize === 'number') run.fontSize = patch.fontSize;
    runs.push(run);
  }
  return runs;
}

export function reconcileRunsAfterTextChange(
  oldText: string,
  newText: string,
  runs: TextStyleRun[] | undefined,
): TextStyleRun[] | undefined {
  if (!runs?.length) return runs;
  if (oldText === newText) return runs;

  const baseFont = runs[0]?.fontFamily;
  const secondaryRuns = runs.filter((run, index) => {
    if (index === 0 && run.start === 0) return false;
    return run.fontFamily && run.fontFamily !== baseFont;
  });
  if (!secondaryRuns.length) return undefined;

  const lastRun = secondaryRuns[secondaryRuns.length - 1]!;
  const oldSlice = oldText.slice(lastRun.start, lastRun.end);
  if (!oldSlice) return undefined;

  const wasSuffix = lastRun.end >= oldText.trimEnd().length;
  let newStart = newText.lastIndexOf(oldSlice);
  if (newStart < 0 && oldSlice.trim()) {
    newStart = newText.lastIndexOf(oldSlice.trim());
  }
  let newEnd = newStart >= 0 ? newStart + oldSlice.length : -1;
  if (newStart < 0 && wasSuffix) {
    const lastSpace = newText.lastIndexOf(' ');
    newStart = lastSpace >= 0 ? lastSpace + 1 : 0;
    newEnd = newText.length;
  }
  if (newStart < 0 || newEnd < 0) return undefined;
  const next: TextStyleRun[] = [];
  const first = runs[0];
  if (first && first.start === 0) {
    next.push({ ...first, end: Math.min(first.end, newStart > 0 ? newStart : newEnd) });
  }
  next.push({ ...lastRun, start: newStart, end: newEnd });
  return next.length > 0 ? next : undefined;
}

export function stripFabricStylesForEditing(obj: TextLikeObject): void {
  if (obj.styles) {
    obj.set('styles', undefined as unknown as FabricStyles);
  }
}

function lockTemplateImportedTextPosition(obj: TextLikeObject): void {
  // Hard guarantee for page-flip stability of template texts:
  // Objects with id like "text_1" (imported from SVG) must keep the exact
  // left/top they had in the page's fabricJSON. Hydration and width widening
  // are allowed to change the box size, but never the placement anchor.
  if (obj.type !== 'textbox') return;
  const id = String(obj.id ?? '');
  if (!id.toLowerCase().startsWith('text_')) return;
  if (obj.textFieldClientAdded === true) return;
  const l = Number(obj.left);
  const t = Number(obj.top);
  const patch: Record<string, number> = {};
  if (Number.isFinite(l)) patch.left = l;
  if (Number.isFinite(t)) patch.top = t;
  if (Object.keys(patch).length > 0) {
    obj.set(patch);
  }
  obj.setCoords?.();
}

export function hydrateTextObjectStyles(obj: TextLikeObject): void {
  const text = String(obj.text ?? '');
  const baseFontSize = Math.max(6, Number(obj.fontSize) || 16);
  let runs = obj.textStyleRuns;
  if ((!runs || runs.length === 0) && obj.styles) {
    runs = extractRunsFromFabricStyles(text, obj.styles);
    if (runs.length > 0) {
      (obj as { textStyleRuns?: TextStyleRun[] }).textStyleRuns = runs;
    }
  }
  if (!runs?.length) {
    if (obj.styles) obj.set('styles', undefined as unknown as FabricStyles);
    return;
  }
  const styles = buildFabricStylesFromRuns(text, runs, baseFontSize);
  if (styles) {
    obj.set('styles', styles);
  } else {
    obj.set('styles', undefined as unknown as FabricStyles);
  }
  obj.setCoords?.();
  lockTemplateImportedTextPosition(obj);
}

function measureTextboxContentWidth(obj: TextLikeObject): number | null {
  const withMeasure = obj as TextLikeObject & { calcTextWidth?: () => number };
  if (typeof withMeasure.calcTextWidth !== 'function') return null;
  try {
    const measured = Number(withMeasure.calcTextWidth());
    return Number.isFinite(measured) && measured > 0 ? measured : null;
  } catch {
    return null;
  }
}

function computeMinTextboxWidth(obj: TextLikeObject, text: string): number {
  const fontSize = Math.max(6, Number(obj.fontSize) || 16);
  const runs = obj.textStyleRuns;
  const hasMixedFonts = Array.isArray(runs) && runs.some(
    (run) => run.fontFamily && run.fontFamily !== obj.fontFamily,
  );
  const widthFactor = hasMixedFonts ? 0.72 : 0.7;
  const padding = hasMixedFonts ? fontSize * 1.4 : fontSize * 0.9;
  const heuristic = Math.max(120, text.length * fontSize * widthFactor + padding);
  const measured = measureTextboxContentWidth(obj);
  if (measured != null) {
    return Math.max(heuristic, measured + fontSize * 0.3);
  }
  return heuristic;
}

function adjustTextboxWidthPreservingOrigin(obj: TextLikeObject, nextWidth: number): void {
  // For template-imported text_* we must keep the exact original placement (left/top)
  // that was set during SVG import. Width may be widened to fit content, but the
  // anchor point must not move when the user flips pages.
  const preservedLeft = Number(obj.left ?? 0);
  const preservedTop = Number(obj.top ?? 0);
  obj.set({ width: nextWidth });
  if (Number.isFinite(preservedLeft)) obj.set({ left: preservedLeft });
  if (Number.isFinite(preservedTop)) obj.set({ top: preservedTop });
  obj.setCoords?.();
}

function normalizeImportedSingleLineTextboxWidth(obj: TextLikeObject): void {
  if (obj.type !== 'textbox') return;
  if (obj.textFieldClientAdded === true) return;
  const id = String(obj.id ?? '');
  if (!id.toLowerCase().startsWith('text_')) return;
  const text = String(obj.text ?? '');
  if (!text || text.includes('\n')) return;
  const minWidth = computeMinTextboxWidth(obj, text);
  const width = Number(obj.width ?? 0);
  if (!Number.isFinite(width) || width + 1 >= minWidth) return;
  adjustTextboxWidthPreservingOrigin(obj, minWidth);
}

export function applyFormatToTextField(
  obj: TextLikeObject,
  patch: Record<string, unknown>,
): void {
  const next: Record<string, unknown> = { ...patch };
  if (next.shadow != null && typeof next.shadow === 'object') {
    // Shadow handled by caller (Fabric Shadow instance).
  }

  if (typeof next.fontFamily === 'string') {
    obj.set({ fontFamily: next.fontFamily });
    obj.textStyleRuns = undefined;
    obj.set('styles', undefined as unknown as FabricStyles);
    delete next.fontFamily;
  }

  if (Object.keys(next).length > 0) {
    obj.set(next as Parameters<typeof obj.set>[0]);
  }

  const runs = obj.textStyleRuns;
  if (runs?.length) {
    const updated = runs.map((run) => {
      const merged = { ...run };
      if (typeof patch.fill === 'string') merged.fill = patch.fill;
      if (typeof patch.fontWeight === 'string') merged.fontWeight = patch.fontWeight;
      if (typeof patch.fontStyle === 'string') merged.fontStyle = patch.fontStyle;
      if (typeof patch.fontSize === 'number') merged.fontSize = patch.fontSize;
      if (typeof patch.underline === 'boolean') {
        (merged as TextStyleRun & { underline?: boolean }).underline = patch.underline;
      }
      return merged;
    });
    obj.textStyleRuns = updated;
    hydrateTextObjectStyles(obj);
  } else if (typeof patch.fontFamily !== 'string') {
    obj.setCoords?.();
  }
}

export function collectFontFamiliesFromTextField(o: Record<string, unknown>, out: Set<string>): void {
  const ff = o.fontFamily;
  if (typeof ff === 'string' && ff.trim()) out.add(ff.trim());
  const runs = o.textStyleRuns;
  if (Array.isArray(runs)) {
    for (const run of runs) {
      if (run && typeof run === 'object' && typeof (run as TextStyleRun).fontFamily === 'string') {
        const family = (run as TextStyleRun).fontFamily!.trim();
        if (family) out.add(family);
      }
    }
  }
  const styles = o.styles;
  if (!styles || typeof styles !== 'object' || Array.isArray(styles)) return;
  for (const line of Object.values(styles as Record<string, unknown>)) {
    const lineRec = asRecord(line);
    if (!lineRec) continue;
    for (const style of Object.values(lineRec)) {
      const styleRec = asRecord(style);
      if (!styleRec) continue;
      const segFont = styleRec.fontFamily;
      if (typeof segFont === 'string' && segFont.trim()) out.add(segFont.trim());
    }
  }
}

function walkFabricJsonObjects(
  objects: unknown[],
  visit: (obj: Record<string, unknown>) => void,
): void {
  for (const item of objects) {
    const o = asRecord(item);
    if (!o) continue;
    visit(o);
    if (Array.isArray(o.objects)) {
      walkFabricJsonObjects(o.objects as unknown[], visit);
    }
  }
}

export function dehydrateTextObjectsInFabricJSON(fabricJSON: Record<string, unknown>): void {
  const objects = fabricJSON.objects;
  if (!Array.isArray(objects)) return;
  walkFabricJsonObjects(objects, (o) => {
    if (!isFabricTextObjectType(o.type)) return;
    const text = String(o.text ?? '');
    if ((!o.textStyleRuns || !Array.isArray(o.textStyleRuns) || !(o.textStyleRuns as unknown[]).length)
      && o.styles) {
      const runs = extractRunsFromFabricStyles(text, o.styles as FabricStyles);
      if (runs.length > 0) o.textStyleRuns = runs;
    }
    delete o.styles;
  });
}

export function migrateAndHydrateTextObject(obj: FabricObject): void {
  if (!isFabricTextObjectType(obj.type)) return;
  const textObj = obj as TextLikeObject;
  hydrateTextObjectStyles(textObj);
  normalizeImportedSingleLineTextboxWidth(textObj);
  lockTemplateImportedTextPosition(textObj);
}

export function prepareTextObjectsOnCanvas(objects: FabricObject[]): void {
  for (const obj of objects) {
    migrateAndHydrateTextObject(obj);
    const group = obj as { getObjects?: () => FabricObject[] };
    if (typeof group.getObjects === 'function') {
      prepareTextObjectsOnCanvas(group.getObjects());
    }
  }
}

export function patchTextStyleRunsFontInFabricJSON(
  fabricJSON: Record<string, unknown>,
  fontFamily: string,
): Record<string, unknown> {
  const next = structuredClone(fabricJSON) as Record<string, unknown>;
  const objects = next.objects;
  if (!Array.isArray(objects)) return next;
  walkFabricJsonObjects(objects, (o) => {
    if (!isFabricTextObjectType(o.type)) return;
    o.fontFamily = fontFamily;
    delete o.textStyleRuns;
    delete o.styles;
  });
  return next;
}

export function finishTextEditOnObject(
  obj: TextLikeObject,
  textBefore: string | undefined,
): void {
  const textAfter = String(obj.text ?? '');
  if (textBefore != null && textBefore !== textAfter) {
    obj.textStyleRuns = reconcileRunsAfterTextChange(
      textBefore,
      textAfter,
      obj.textStyleRuns,
    );
  }
  hydrateTextObjectStyles(obj);
}
