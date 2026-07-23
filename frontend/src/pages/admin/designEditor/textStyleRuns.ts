import type { Canvas, FabricObject } from 'fabric';
import { isFabricTextObjectType } from './patchFabricTextObjects';
import { PUBLIC_EDITOR_DEV, isTextPositionDebugEnabled, isTextWidthDebugEnabled } from '../../../features/publicDesignEditor/publicEditorPerf';
import {
  resolveDesignedTextboxAbsoluteMaxWidth,
} from './designEditorTextPageClamp';
import { isPlaceholderTemplateText, normalizeTextForPlaceholderCheck } from './designEditorTextPlaceholder';
import { isTemplateTextLayerId } from './spreadPageObjectIds';

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

export type TextLikeObject = FabricObject & {
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  width?: number;
  id?: string;
  textFieldClientAdded?: boolean;
  textFieldUserEdited?: boolean;
  textFieldUserLayoutWidth?: boolean;
  textFieldLayoutWidth?: number;
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

type TextWidthDebugExtra = Record<string, unknown>;

/** Снимок ширины textbox для отладки в консоли браузера ([TEXT-WIDTH]). */
export function logTextWidthDebug(
  stage: string,
  obj: TextLikeObject,
  extra?: TextWidthDebugExtra,
): void {
  if (!isTextWidthDebugEnabled()) return;
  const anyObj = obj as unknown as Record<string, unknown>;
  const normalized = normalizeTextForPlaceholderCheck(obj.text);
  const payload: Record<string, unknown> = {
    stage,
    id: String(obj.id ?? ''),
    text: String(obj.text ?? '').slice(0, 60),
    placeholder: Boolean(normalized) && isPlaceholderTemplateText(normalized),
    singleLine: isDesignedSingleLineTextbox(obj),
    designed: isDesignedTemplateText(obj),
    clientAdded: obj.textFieldClientAdded === true,
    userEdited: obj.textFieldUserEdited === true,
    w: Number(obj.width ?? 0),
    layoutW: Number(obj.textFieldLayoutWidth ?? 0),
    sacredW: Number((obj as { _sacredWidth?: number })._sacredWidth ?? 0),
    floor: Number(anyObj._editLayoutWidthFloor ?? 0),
    sessionW: Number(anyObj._editSessionLayoutWidth ?? 0),
    originX: (obj as { originX?: string }).originX ?? 'left',
    isEditing: (obj as { isEditing?: boolean }).isEditing === true,
    ...extra,
  };
  if (extra?.contentW == null && extra?.skipContentMeasure !== true) {
    try {
      payload.contentW = measureStableTextboxContentWidth(obj);
    } catch {
      payload.contentW = null;
    }
  }
  console.log('[TEXT-WIDTH]', payload);
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
    const patch: Record<string, unknown> = {};
    if (seg.fontFamily) patch.fontFamily = seg.fontFamily;
    if (seg.fontWeight) patch.fontWeight = seg.fontWeight;
    if (seg.fontStyle) patch.fontStyle = seg.fontStyle;
    if (seg.fill) patch.fill = seg.fill;
    if (seg.fontSize != null && seg.fontSize > baseFontSizePx + 0.5) {
      patch.fontSize = Math.max(6, seg.fontSize);
    }
    if (Object.keys(patch).length === 0) continue;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const lineStart = lineStartOffsets[lineIndex]!;
      const lineText = lines[lineIndex] ?? '';
      const lineEnd = lineStart + lineText.length;
      if (seg.end <= lineStart || seg.start >= lineEnd) continue;
      const from = Math.max(0, seg.start - lineStart);
      const to = Math.min(lineText.length, seg.end - lineStart);
      if (to <= from) continue;
      out[lineIndex] ??= {};
      for (let charIndex = from; charIndex < to; charIndex += 1) {
        out[lineIndex]![charIndex] = { ...patch };
      }
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
  const clampedFallback = (): TextStyleRun[] | undefined => {
    if (runs.length === 1 && runs[0]!.start === 0) {
      return [{ ...runs[0]!, start: 0, end: newText.length }];
    }
    return clampTextStyleRuns(newText, runs);
  };
  if (!secondaryRuns.length) return clampedFallback();

  const lastRun = secondaryRuns[secondaryRuns.length - 1]!;
  const oldSlice = oldText.slice(lastRun.start, lastRun.end);
  if (!oldSlice) return clampedFallback();

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
  if (newStart < 0 || newEnd < 0) return clampedFallback();
  const next: TextStyleRun[] = [];
  const first = runs[0];
  if (first && first.start === 0) {
    next.push({ ...first, end: Math.min(first.end, newStart > 0 ? newStart : newEnd) });
  }
  next.push({ ...lastRun, start: newStart, end: newEnd });
  return next.length > 0 ? next : undefined;
}

function ensureFabricStylesLinesForText(
  styles: FabricStyles | undefined,
  text: string,
): FabricStyles {
  const lines = text.split('\n');
  const next: FabricStyles = styles && typeof styles === 'object' && !Array.isArray(styles)
    ? { ...styles }
    : {};
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const lineStyles = next[lineIndex];
    if (!lineStyles || typeof lineStyles !== 'object' || Array.isArray(lineStyles)) {
      next[lineIndex] = {};
    }
  }
  for (const key of Object.keys(next)) {
    const lineIndex = Number(key);
    if (Number.isFinite(lineIndex) && lineIndex >= lines.length) {
      delete next[lineIndex];
    }
  }
  return next;
}

function resolveDesignedTextboxLayoutFloor(obj: TextLikeObject): number {
  const candidates: number[] = [];
  const add = (value: unknown) => {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) candidates.push(n);
  };
  add(obj.width);
  add((obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth);
  add((obj as { _sacredWidth?: number })._sacredWidth);
  add((obj as { _editLayoutWidthFloor?: number })._editLayoutWidthFloor);
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

/** Floor без «раздувания» Fabric во время inline-edit и устаревшей ширины шаблона. */
function resolveEffectiveDesignedTextboxLayoutFloor(obj: TextLikeObject): number {
  const floor = resolveDesignedTextboxLayoutFloor(obj);
  if (isDesignedMultilineTextbox(obj)) {
    const sensible = resolveDesignedMultilineTextboxWidth(obj);
    if (floor > sensible + 8) return sensible;
    return floor > 0 ? floor : sensible;
  }
  if (!isDesignedSingleLineTextbox(obj)) {
    return floor;
  }
  const contentW = measureStableTextboxContentWidth(obj);
  if (floor > contentW + 8) {
    return contentW;
  }
  if (floor > 0 && floor < contentW - 8) {
    return floor;
  }
  return floor > 0 ? floor : contentW;
}

/** Запоминает ширину шаблона при входе в edit — Fabric exitEditing может сузить textbox. */
function captureDesignedTextboxLayoutFloor(obj: TextLikeObject): void {
  if (!isDesignedTemplateText(obj) || obj.type !== 'textbox') return;
  const beforeLayoutW = Number(obj.textFieldLayoutWidth ?? 0);
  const floor = resolveEffectiveDesignedTextboxLayoutFloor(obj);
  if (floor <= 0) return;
  const anyObj = obj as unknown as Record<string, unknown>;
  anyObj._editLayoutWidthFloor = floor;
  const layoutW = Number(obj.textFieldLayoutWidth) || 0;
  if (floor > layoutW) {
    obj.set({ textFieldLayoutWidth: floor } as Parameters<typeof obj.set>[0]);
  } else if (isDesignedSingleLineTextbox(obj) && layoutW > floor + 0.5) {
    obj.set({ textFieldLayoutWidth: floor } as Parameters<typeof obj.set>[0]);
  }
  logTextWidthDebug('capture-floor', obj, {
    rawFloor: resolveDesignedTextboxLayoutFloor(obj),
    floor,
    beforeLayoutW,
    afterLayoutW: Number(obj.textFieldLayoutWidth ?? 0),
    skipContentMeasure: false,
  });
}

function ensureDesignedTextboxLayoutFloor(obj: TextLikeObject): void {
  if (!isDesignedTemplateText(obj) || obj.type !== 'textbox') return;
  const floor = resolveEffectiveDesignedTextboxLayoutFloor(obj);
  const currentW = Number(obj.width ?? 0);
  if (floor > 0 && (!Number.isFinite(currentW) || currentW + 0.5 < floor)) {
    logTextWidthDebug('ensure-floor:widen', obj, { currentW, floor, skipContentMeasure: false });
    widenTextboxPreservingDesignedOrigin(obj, floor);
    obj.setCoords?.();
  }
}

/** Готовит styles к inline-редактированию: repair + пустые объекты на каждую строку (Fabric onInput/newline). */
export function prepareTextStylesForEditing(obj: TextLikeObject): void {
  logTextWidthDebug('prepare-edit:start', obj);
  if (isDesignedSingleLineTextbox(obj)) {
    const contentW = syncDesignedSingleLineTextboxWidthToContent(obj);
    if (contentW != null) {
      (obj as { _editSessionLayoutWidth?: number })._editSessionLayoutWidth = contentW;
    }
  } else if (isDesignedTemplateText(obj) && obj.type === 'textbox') {
    const w = Number(obj.width ?? 0);
    if (Number.isFinite(w) && w > 0) {
      (obj as { _editSessionLayoutWidth?: number })._editSessionLayoutWidth = w;
    }
  }
  captureDesignedTextboxLayoutFloor(obj);
  const text = String(obj.text ?? '');
  repairTextObjectStyles(obj);
  obj.set('styles', ensureFabricStylesLinesForText(obj.styles, text));
  logTextWidthDebug('prepare-edit:end', obj);
}

/** @deprecated Не обнуляйте styles — Fabric insertNewlineStyleObject падает на undefined[line]. */
export function stripFabricStylesForEditing(obj: TextLikeObject): void {
  prepareTextStylesForEditing(obj);
}

function normalizeTextContent(text: unknown): string {
  return String(text ?? '').replace(/\u200b/g, '');
}

export function clampTextStyleRuns(
  text: string,
  runs: TextStyleRun[] | undefined,
): TextStyleRun[] | undefined {
  if (!runs?.length) return runs;
  const len = text.length;
  const clamped = runs
    .map((run) => ({
      ...run,
      start: Math.max(0, Math.min(run.start, len)),
      end: Math.max(0, Math.min(run.end, len)),
    }))
    .filter((run) => run.end > run.start);
  return clamped.length > 0 ? clamped : undefined;
}

/** Убирает style-индексы, не соответствующие строкам/символам текста (Fabric removeStyleFromTo). */
function repairStylesRecord(
  text: string,
  styles: FabricStyles | undefined,
): { styles: FabricStyles | undefined; runs: TextStyleRun[] | undefined } {
  const lines = text.split('\n');
  if (!styles || typeof styles !== 'object' || Array.isArray(styles)) {
    return { styles: undefined, runs: undefined };
  }

  const repaired: FabricStyles = {};
  let changed = false;
  for (const [lineKey, lineStyles] of Object.entries(styles)) {
    const lineIndex = Number(lineKey);
    if (!Number.isFinite(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) {
      changed = true;
      continue;
    }
    const lineLen = lines[lineIndex]?.length ?? 0;
    const nextLine: Record<number, Record<string, unknown>> = {};
    if (lineStyles && typeof lineStyles === 'object') {
      for (const [charKey, patch] of Object.entries(lineStyles)) {
        const charIndex = Number(charKey);
        if (!Number.isFinite(charIndex) || charIndex < 0 || charIndex >= lineLen) {
          changed = true;
          continue;
        }
        if (patch && typeof patch === 'object') {
          nextLine[charIndex] = patch as Record<string, unknown>;
        }
      }
    }
    if (Object.keys(nextLine).length > 0) {
      repaired[lineIndex] = nextLine;
    } else if (lineStyles) {
      changed = true;
    }
  }

  const nextStyles = Object.keys(repaired).length > 0 ? repaired : undefined;
  if (changed || nextStyles !== styles) {
    return { styles: nextStyles, runs: undefined };
  }
  return { styles, runs: undefined };
}

export function repairTextObjectStyles(obj: TextLikeObject): void {
  const text = String(obj.text ?? '');
  const result = repairStylesRecord(text, obj.styles);
  if (result.styles !== obj.styles) {
    obj.set('styles', result.styles as unknown as FabricStyles);
  }
  obj.textStyleRuns = clampTextStyleRuns(text, obj.textStyleRuns);
}

export function repairTextObjectForPersistence(obj: TextLikeObject): void {
  const text = normalizeTextContent(obj.text);
  obj.textStyleRuns = clampTextStyleRuns(text, obj.textStyleRuns);
  repairTextObjectStyles(obj);
}

/** Подготовка к сериализации live-объекта: только coords, без мутации геометрии/styles. */
export function prepareTextObjectForSerialization(obj: TextLikeObject): void {
  obj.setCoords?.();
}

function repairTextObjectInFabricJson(o: Record<string, unknown>): void {
  const text = normalizeTextContent(o.text);
  o.text = text;
  const repaired = repairStylesRecord(text, o.styles as FabricStyles | undefined);
  if (repaired.styles !== o.styles) {
    if (repaired.styles) o.styles = repaired.styles;
    else delete o.styles;
  }
  const clamped = clampTextStyleRuns(text, o.textStyleRuns as TextStyleRun[] | undefined);
  if (clamped?.length) o.textStyleRuns = clamped;
  else delete o.textStyleRuns;
}

function estimateEditedDesignedTextboxWidthFromRecord(
  record: Record<string, unknown>,
): number | undefined {
  if (record.textFieldUserEdited !== true) return undefined;
  if (String(record.type ?? '').toLowerCase() !== 'textbox') return undefined;
  const text = String(record.text ?? '');
  if (!text) return undefined;
  const fontSize = Math.max(6, Number(record.fontSize) || 16);
  const lines = text.split('\n');
  const longestLine = lines.reduce((max, line) => (line.length > max.length ? line : max), '');
  const widthFactor = 0.72;
  const padding = fontSize * 1.1;
  return Math.max(120, longestLine.length * fontSize * widthFactor + padding);
}

function resolvePersistedDesignedTextboxWidth(
  fabricW: number,
  layoutW: number,
): number | undefined {
  const w = Number.isFinite(fabricW) && fabricW > 0 ? fabricW : 0;
  const lw = Number.isFinite(layoutW) && layoutW > 0 ? layoutW : 0;
  const max = Math.max(w, lw);
  return max > 0 ? max : undefined;
}

function prepareDesignedTextObjectJson(o: Record<string, unknown>): void {
  if (!isDesignedTemplateText(o)) return;
  repairTextObjectInFabricJson(o);
  if (o.originX == null) o.originX = 'left';
  if (o.originY == null) o.originY = 'top';
  if (o.angle == null) o.angle = 0;
  const fabricW = Number(o.width);
  const layoutW = Number(o.textFieldLayoutWidth);
  const floorW = Number(o._editLayoutWidthFloor);
  let persistW = resolvePersistedDesignedTextboxWidth(fabricW, layoutW);
  if (Number.isFinite(floorW) && floorW > 0) {
    persistW = persistW != null ? Math.max(persistW, floorW) : floorW;
  }
  if (persistW != null && Number.isFinite(persistW) && persistW > 0) {
    o.width = persistW;
    o.textFieldLayoutWidth = persistW;
  }
}

export function readDesignedTextboxPersistedWidth(
  obj: TextLikeObject | Record<string, unknown>,
): number | undefined {
  const record = obj as TextLikeObject & {
    textFieldLayoutWidth?: number;
    _sacredWidth?: number;
    _editLayoutWidthFloor?: number;
  };
  const candidates: number[] = [];
  const add = (value: unknown) => {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) candidates.push(n);
  };
  add(record.width);
  add(record.textFieldLayoutWidth);
  add(record._sacredWidth);
  add(record._editLayoutWidthFloor);
  return candidates.length > 0 ? Math.max(...candidates) : undefined;
}

export function applyDesignedTextLayoutToFabricJsonRecord(
  record: Record<string, unknown>,
  width: number,
): void {
  if (!isDesignedTemplateText(record)) return;
  if (!Number.isFinite(width) || width <= 0) return;
  record.width = width;
  record.textFieldLayoutWidth = width;
}

export function normalizeDesignedTextInFabricJSON(fabricJSON: Record<string, unknown>): Record<string, unknown> {
  let clone: Record<string, unknown>;
  try {
    clone = JSON.parse(JSON.stringify(fabricJSON)) as Record<string, unknown>;
  } catch {
    clone = { ...fabricJSON };
  }
  prepareTextObjectsInFabricJSON(clone);
  return clone;
}

export function prepareTextObjectsInFabricJSON(fabricJSON: Record<string, unknown>): void {
  const objects = fabricJSON.objects;
  if (!Array.isArray(objects)) return;
  walkFabricJsonObjects(objects, (o) => {
    if (!isFabricTextObjectType(o.type)) return;
    if (isDesignedTemplateText(o)) {
      prepareDesignedTextObjectJson(o);
      return;
    }
    repairTextObjectInFabricJson(o);
  });
}

export function applyTextContentSafely(
  obj: TextLikeObject,
  nextText: string,
  textBeforeEdit?: string,
): void {
  const before = textBeforeEdit ?? normalizeTextContent(obj.text);
  const editable = obj as TextLikeObject & { isEditing?: boolean; exitEditing?: () => void };
  if (editable.isEditing && typeof editable.exitEditing === 'function') {
    editable.exitEditing();
    obj.set({ editable: false } as Parameters<typeof obj.set>[0]);
  }
  obj.set('text', nextText);
  finishTextEditOnObject(obj, before);
  repairTextObjectForPersistence(obj);
  obj.setCoords?.();
}

export function markTextFieldUserEdited(obj: TextLikeObject): void {
  (obj as { textFieldUserEdited?: boolean }).textFieldUserEdited = true;
}

export function isDesignedTemplateText(obj: TextLikeObject | Record<string, unknown>): boolean {
  const o = obj as { id?: string; textFieldClientAdded?: boolean };
  // На развороте id = `p7:text_*` — смотрим базовый id без префикса.
  return isTemplateTextLayerId(o.id) && o.textFieldClientAdded !== true;
}

export function isImmutableDesignedTemplateText(obj: TextLikeObject): boolean {
  // Default for all text_* from template: unedited until user changes content or formatting.
  return isDesignedTemplateText(obj) && obj.textFieldUserEdited !== true;
}

function shouldPreserveDesignedTemplateGeometry(obj: TextLikeObject): boolean {
  return isDesignedTemplateText(obj);
}

export function refreshSacredGeometryAfterUserEdit(obj: TextLikeObject): void {
  if (!isDesignedTemplateText(obj)) return;
  captureSacredTemplateTextGeometry(obj, { overwrite: true });
}

export type DesignedTextLayoutSnapshot = {
  left: number;
  top: number;
  width: number;
  height?: number;
  angle: number;
  originX: string;
  originY: string;
  textFieldLayoutWidth?: number;
};

function resolveDesignedTextboxWidth(
  obj: TextLikeObject,
  snapshot?: DesignedTextLayoutSnapshot,
): number | undefined {
  const candidates: number[] = [];
  const layoutW = Number((obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth);
  if (Number.isFinite(layoutW) && layoutW > 0) candidates.push(layoutW);
  const w = Number(obj.width ?? 0);
  if (Number.isFinite(w) && w > 0) candidates.push(w);
  if (snapshot) {
    const snapLayout = Number(snapshot.textFieldLayoutWidth);
    if (Number.isFinite(snapLayout) && snapLayout > 0) candidates.push(snapLayout);
    const snapW = Number(snapshot.width);
    if (Number.isFinite(snapW) && snapW > 0) candidates.push(snapW);
  }
  return candidates.length > 0 ? Math.max(...candidates) : undefined;
}

function withUnconstrainedTextboxWidth<T>(obj: TextLikeObject, measure: () => T): T {
  const prevWidth = Number(obj.width ?? 0);
  const prevLayout = Number((obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth ?? 0);
  const UNCONSTRAINED = 12000;
  obj.set({ width: UNCONSTRAINED } as Parameters<typeof obj.set>[0]);
  try {
    return measure();
  } finally {
    const restore = Number.isFinite(prevWidth) && prevWidth > 0
      ? prevWidth
      : (Number.isFinite(prevLayout) && prevLayout > 0 ? prevLayout : 120);
    obj.set({ width: restore } as Parameters<typeof obj.set>[0]);
  }
}

/** Минимальная ширина textbox под текущий текст (измерение + эвристика по самой длинной строке). */
function resolveContentRequiredDesignedTextboxWidth(obj: TextLikeObject): number | undefined {
  if (obj.type !== 'textbox') return undefined;
  const text = String(obj.text ?? '');
  if (!text) return undefined;
  const fontSize = Math.max(6, Number(obj.fontSize) || 16);
  const lines = text.split('\n');
  const longestLine = lines.reduce((max, line) => (line.length > max.length ? line : max), '');
  const runs = obj.textStyleRuns;
  const hasMixedFonts = Array.isArray(runs) && runs.some(
    (run) => run.fontFamily && run.fontFamily !== obj.fontFamily,
  );
  const widthFactor = hasMixedFonts ? 0.72 : 0.68;
  const padding = hasMixedFonts ? fontSize * 1.4 : fontSize * 1.1;
  const heuristic = Math.max(120, longestLine.length * fontSize * widthFactor + padding);
  const { measuredLine, measuredTotal } = withUnconstrainedTextboxWidth(obj, () => ({
    measuredLine: measureMaxTextboxLineWidth(obj),
    measuredTotal: measureTextboxContentWidth(obj),
  }));
  const isMultiline = lines.length > 1 || text.includes('\n');
  const measured = isMultiline
    ? measuredLine
    : Math.max(measuredLine, measuredTotal ?? 0);
  const contentBase = measured > 0 ? Math.max(measured, heuristic) : heuristic;
  let required = contentBase + fontSize * 0.25;
  const absoluteMax = resolveDesignedTextboxAbsoluteMaxWidth(obj);
  if (absoluteMax != null) required = Math.min(required, absoluteMax);
  return required;
}

function hasFilledDesignedTemplateText(obj: TextLikeObject): boolean {
  if (!isDesignedTemplateText(obj) || obj.type !== 'textbox') return false;
  if (Math.abs(Number(obj.angle ?? 0)) > 0.5) return false;
  const text = normalizeTextForPlaceholderCheck(obj.text);
  return Boolean(text) && !isPlaceholderTemplateText(text);
}

/** Однострочный шаблонный textbox (включая placeholder) — для tight-width при edit. */
function isDesignedSingleLineTextbox(obj: TextLikeObject): boolean {
  if (!isDesignedTemplateText(obj) || obj.type !== 'textbox') return false;
  if (Math.abs(Number(obj.angle ?? 0)) > 0.5) return false;
  const text = String(obj.text ?? '').replace(/\u200b/g, '');
  return Boolean(text) && !text.includes('\n');
}

/** Многострочный шаблонный textbox с явными \\n — ширина по строкам, без раздувания под calcTextWidth. */
function isDesignedMultilineTextbox(obj: TextLikeObject): boolean {
  if (!isDesignedTemplateText(obj) || obj.type !== 'textbox') return false;
  if (Math.abs(Number(obj.angle ?? 0)) > 0.5) return false;
  return String(obj.text ?? '').replace(/\u200b/g, '').includes('\n');
}

function measureDesignedMultilineLongestLineWidth(obj: TextLikeObject): number {
  const fontSize = Math.max(6, Number(obj.fontSize) || 16);
  const looksScript = looksLikeScriptTextbox(obj);
  const padding = Math.max(2, fontSize * (looksScript ? 0.85 : 0.25));
  let measuredLine = 0;
  measuredLine = withUnconstrainedTextboxWidth(obj, () => measureMaxTextboxLineWidth(obj));
  const visualLine = measureMaxVisualTextLineWidth(obj);
  if (visualLine > measuredLine) measuredLine = visualLine;
  if (measuredLine <= 0) {
    measuredLine = estimateTightTextboxWidthFromChars(obj);
  }
  return Math.max(TIGHT_TEXTBOX_MIN_WIDTH_PX, Math.ceil(measuredLine + padding));
}

/** Сохранённая ширина multiline layout (session/layout/floor, без раздутого current width). */
function resolveDesignedMultilineSessionWidth(obj: TextLikeObject): number {
  const anyObj = obj as unknown as Record<string, unknown>;
  const persisted = [
    Number(anyObj._editSessionLayoutWidth),
    Number(obj.textFieldLayoutWidth),
    Number(anyObj._editLayoutWidthFloor),
    Number((obj as { _sacredWidth?: number })._sacredWidth),
  ].filter((n) => Number.isFinite(n) && n > 0);
  if (persisted.length > 0) return Math.max(...persisted);
  const current = Number(obj.width ?? 0);
  return Number.isFinite(current) && current > 0 ? current : 0;
}

/** Ширина multiline: сохраняем layout сессии, расширяем только если строка длиннее. */
function resolveDesignedMultilineTextboxWidth(obj: TextLikeObject): number {
  const sessionW = resolveDesignedMultilineSessionWidth(obj);
  const longestLineW = measureDesignedMultilineLongestLineWidth(obj);
  let target = longestLineW > sessionW + 8 ? longestLineW : (sessionW > 0 ? sessionW : longestLineW);
  const absoluteMax = resolveDesignedTextboxAbsoluteMaxWidth(obj);
  if (absoluteMax != null) target = Math.min(target, absoluteMax);
  return target;
}

function syncDesignedMultilineTextboxWidth(obj: TextLikeObject): number {
  const beforeW = Number(obj.width ?? 0);
  const targetW = resolveDesignedMultilineTextboxWidth(obj);
  if (Math.abs(beforeW - targetW) > 0.5) {
    setDesignedTextboxWidthPreservingOrigin(obj, targetW);
    logTextWidthDebug('sync-multiline', obj, { beforeW, afterW: targetW, sessionW: (obj as unknown as Record<string, unknown>)._editSessionLayoutWidth, skipContentMeasure: true });
  }
  return targetW;
}

/** После перехода single-line → multiline сбрасываем унаследованную ширину одной строки. */
function resetDesignedMultilineWidthAfterSingleLineTransition(obj: TextLikeObject): void {
  if (!isDesignedMultilineTextbox(obj)) return;
  const longestLineW = measureDesignedMultilineLongestLineWidth(obj);
  const anyObj = obj as unknown as Record<string, unknown>;
  anyObj._editSessionLayoutWidth = longestLineW;
  (obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth = longestLineW;
  anyObj._editLayoutWidthFloor = longestLineW;
  (obj as { _sacredWidth?: number })._sacredWidth = longestLineW;
  setDesignedTextboxWidthPreservingOrigin(obj, longestLineW);
  logTextWidthDebug('reset-single-to-multiline', obj, { longestLineW, skipContentMeasure: true });
}

function finalizeDesignedMultilineTextboxWidth(obj: TextLikeObject): void {
  if (obj.type !== 'textbox' || !isDesignedTemplateText(obj)) return;
  const beforeW = Number(obj.width ?? 0);
  const targetW = syncDesignedMultilineTextboxWidth(obj);
  const anyObj = obj as unknown as Record<string, unknown>;
  anyObj._sacredWidth = targetW;
  (obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth = targetW;
  if (obj.textFieldUserEdited === true) {
    anyObj._editLayoutWidthFloor = targetW;
  }
  logTextWidthDebug('finalize-multiline', obj, { beforeW, afterW: Number(obj.width ?? 0), targetW, skipContentMeasure: true });
}

function scrubDesignedSingleLineStaleWidth(obj: TextLikeObject, contentW: number): void {
  if (obj.textFieldUserEdited !== true && !hasTrustedTextMetrics(obj)) return;
  const layoutW = Number((obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth ?? 0);
  const anyObj = obj as unknown as Record<string, unknown>;
  const floor = Number(anyObj._editLayoutWidthFloor ?? 0);
  const sacredW = Number((obj as { _sacredWidth?: number })._sacredWidth ?? 0);
  const scrubbed: string[] = [];
  if (layoutW > contentW + 0.5) {
    obj.set({ textFieldLayoutWidth: contentW } as Parameters<typeof obj.set>[0]);
    scrubbed.push('layoutW');
  }
  if (floor > contentW + 0.5) {
    anyObj._editLayoutWidthFloor = contentW;
    scrubbed.push('floor');
  }
  if (sacredW > contentW + 0.5 && obj.textFieldUserEdited !== true) {
    (obj as { _sacredWidth?: number })._sacredWidth = contentW;
    scrubbed.push('sacredW');
  }
  if (scrubbed.length > 0) {
    logTextWidthDebug('scrub-stale-width', obj, { contentW, scrubbed, skipContentMeasure: true });
  }
}

function syncDesignedSingleLineTextboxWidthToContent(obj: TextLikeObject): number | undefined {
  if (!isDesignedSingleLineTextbox(obj)) return undefined;
  const beforeW = Number(obj.width ?? 0);
  const contentW = measureStableTextboxContentWidth(obj);
  if (!Number.isFinite(contentW) || contentW <= 0) return undefined;
  const current = Number(obj.width ?? 0);
  if (Math.abs(current - contentW) > 0.5) {
    setTextboxWidthPreservingOrigin(obj, contentW);
    logTextWidthDebug('sync-single-line', obj, { beforeW, afterW: contentW, contentW, skipContentMeasure: true });
  }
  scrubDesignedSingleLineStaleWidth(obj, contentW);
  return contentW;
}

function resolveFilledDesignedTextboxContentWidth(obj: TextLikeObject): number | undefined {
  if (!hasFilledDesignedTemplateText(obj)) return undefined;
  const contentW = measureStableTextboxContentWidth(obj);
  return Number.isFinite(contentW) && contentW > 0 ? contentW : undefined;
}

function hasTrustedTextMetrics(obj: TextLikeObject): boolean {
  return (obj as { _textMetricsTrusted?: boolean })._textMetricsTrusted === true;
}

/** После document.fonts + paint — можно сужать/пересчитывать unedited designed по content. */
export function markTextObjectMetricsTrusted(obj: TextLikeObject): void {
  (obj as { _textMetricsTrusted?: boolean })._textMetricsTrusted = true;
}

export function markCanvasTextMetricsTrusted(objects: FabricObject[]): void {
  for (const obj of objects) {
    if (isFabricTextObjectType(obj.type)) {
      markTextObjectMetricsTrusted(obj as TextLikeObject);
    }
    const group = obj as { getObjects?: () => FabricObject[] };
    if (typeof group.getObjects === 'function') {
      markCanvasTextMetricsTrusted(group.getObjects());
    }
  }
}

/** Максимум из сохранённой геометрии и ширины под текущий текст (для edited — приоритет контенту). */
function resolveAuthoritativeDesignedWidth(
  obj: TextLikeObject,
  snapshot?: DesignedTextLayoutSnapshot,
): number | undefined {
  if (isDesignedSingleLineTextbox(obj)) {
    const contentW = measureStableTextboxContentWidth(obj);
    const tightW = Math.max(TIGHT_TEXTBOX_MIN_WIDTH_PX, contentW);
    if (obj.textFieldUserEdited === true) {
      return tightW;
    }
    const current = Number(obj.width ?? 0);
    const layoutW = Number((obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth ?? 0);
    const snapW = Number(snapshot?.width ?? 0);
    const snapLayout = Number(snapshot?.textFieldLayoutWidth ?? 0);
    const editFloor = Number((obj as { _editLayoutWidthFloor?: number })._editLayoutWidthFloor ?? 0);
    const persisted = Math.max(current, layoutW, snapW, snapLayout, editFloor);
    const metricsTrusted = hasTrustedTextMetrics(obj);
    // До trusted remeasure (cold cache) не сужаем JSON/layout до fallback-content —
    // иначе sacred залипает на узкой ширине, и рамка остаётся уже глифов скрипта.
    // После trusted: обычный text можно сузить; скрипт — не ниже автора;
    // короткие глифы (цифры) — вообще не трогаем (ни shrink, ни expand по pad).
    if (persisted > contentW + 8) {
      if (!metricsTrusted) return persisted > 0 ? persisted : tightW;
      if (shouldFreezeAuthoredUneditedTextboxWidth(obj)) {
        return persisted > 0 ? persisted : tightW;
      }
      if (shouldAvoidShrinkAuthoredUneditedTextboxWidth(obj)) {
        return Math.max(persisted, tightW);
      }
      return tightW;
    }
    // После trusted font metrics контент (скрипт) часто шире узкого JSON/fallback —
    // обязаны expand. До trusted оставляем persisted (intentional-narrow / cold).
    // Короткие глифы: не expand — авторская ширина уже учитывает overhang.
    if (persisted > 0 && persisted < contentW - 8) {
      if (shouldFreezeAuthoredUneditedTextboxWidth(obj)) return persisted;
      return metricsTrusted ? Math.max(persisted, tightW) : persisted;
    }
    return persisted > 0 ? persisted : tightW;
  }

  if (isDesignedMultilineTextbox(obj)) {
    if (obj.textFieldUserEdited === true) {
      return resolveDesignedMultilineTextboxWidth(obj);
    }
    const contentW = measureDesignedMultilineLongestLineWidth(obj);
    const session = resolveDesignedMultilineSessionWidth(obj);
    // Unedited: после trusted metrics не держим раздутый import/layout estimate.
    if (hasTrustedTextMetrics(obj)) {
      if (session > contentW * 1.08) return contentW;
      if (session > 0 && session < contentW - 8) return contentW;
      return session > 0 ? session : contentW;
    }
    if (session > 0) return session;
    return contentW;
  }

  const candidates: number[] = [];
  const layoutW = Number((obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth);
  if (Number.isFinite(layoutW) && layoutW > 0) candidates.push(layoutW);
  const editFloor = Number((obj as { _editLayoutWidthFloor?: number })._editLayoutWidthFloor);
  if (Number.isFinite(editFloor) && editFloor > 0) candidates.push(editFloor);
  const sacredW = Number((obj as { _sacredWidth?: number })._sacredWidth);
  if (Number.isFinite(sacredW) && sacredW > 0) candidates.push(sacredW);
  const curW = Number(obj.width ?? 0);
  if (Number.isFinite(curW) && curW > 0) candidates.push(curW);
  if (snapshot) {
    const snapLayout = Number(snapshot.textFieldLayoutWidth);
    if (Number.isFinite(snapLayout) && snapLayout > 0) candidates.push(snapLayout);
    const snapW = Number(snapshot.width);
    if (Number.isFinite(snapW) && snapW > 0) candidates.push(snapW);
  }
  if (obj.textFieldUserEdited === true) {
    const contentW = resolveContentRequiredDesignedTextboxWidth(obj);
    if (contentW != null) candidates.push(contentW);
    const jsonEst = estimateEditedDesignedTextboxWidthFromRecord(obj as unknown as Record<string, unknown>);
    if (jsonEst != null) candidates.push(jsonEst);
  }
  return candidates.length > 0 ? Math.max(...candidates) : undefined;
}

export function extractDesignedTextLayoutsFromFabricJson(
  fabricJSON: Record<string, unknown>,
): Map<string, DesignedTextLayoutSnapshot> {
  const out = new Map<string, DesignedTextLayoutSnapshot>();
  const objects = fabricJSON.objects;
  if (!Array.isArray(objects)) return out;
  walkFabricJsonObjects(objects, (o) => {
    if (!isFabricTextObjectType(o.type) || !isDesignedTemplateText(o)) return;
    const id = String(o.id ?? '');
    if (!id) return;
    let width = readDesignedTextboxPersistedWidth(o);
    if (width == null) return;
    out.set(id, {
      left: Number(o.left ?? 0),
      top: Number(o.top ?? 0),
      width,
      height: Number.isFinite(Number(o.height)) ? Number(o.height) : undefined,
      angle: Number(o.angle ?? 0),
      originX: String(o.originX ?? 'left'),
      originY: String(o.originY ?? 'top'),
      textFieldLayoutWidth: width,
    });
  });
  return out;
}

export function applyDesignedTextLayoutSnapshot(
  obj: TextLikeObject,
  snapshot: DesignedTextLayoutSnapshot,
): void {
  if (!isDesignedTemplateText(obj)) return;
  const layoutW = resolvePersistedDesignedTextboxWidth(
    Number(snapshot.width),
    Number(snapshot.textFieldLayoutWidth ?? snapshot.width),
  ) ?? snapshot.width;
  const patch: Record<string, unknown> = {
    left: snapshot.left,
    top: snapshot.top,
    width: layoutW,
    angle: snapshot.angle,
    originX: snapshot.originX,
    originY: snapshot.originY,
    textFieldLayoutWidth: layoutW,
  };
  if (snapshot.height != null && Number.isFinite(snapshot.height)) {
    patch.height = snapshot.height;
  }
  obj.set(patch as Parameters<typeof obj.set>[0]);
  (obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth = layoutW;
}

/** Захват геометрии из loadFromJSON до любых force-origin / hydrate мутаций. */
export function captureSacredTemplateTextGeometry(
  obj: TextLikeObject,
  options?: { overwrite?: boolean; jsonSnapshot?: DesignedTextLayoutSnapshot },
): void {
  if (!isDesignedTemplateText(obj)) return;
  const anyObj = obj as unknown as Record<string, unknown>;
  const overwrite = options?.overwrite === true;
  const snapshot = options?.jsonSnapshot;
  // До trusted metrics — только JSON/persisted, без content-замера (cold fallback).
  const preferPersistedOnly =
    obj.textFieldUserEdited !== true
    && !hasTrustedTextMetrics(obj);
  const layoutWidth = preferPersistedOnly
    ? resolveDesignedTextboxWidth(obj, snapshot)
    : (overwrite
      ? resolveAuthoritativeDesignedWidth(obj, snapshot)
      : resolveDesignedTextboxWidth(obj, snapshot));
  if (layoutWidth != null && (overwrite || typeof anyObj._sacredWidth !== 'number')) {
    obj.set({ width: layoutWidth, textFieldLayoutWidth: layoutWidth } as Parameters<typeof obj.set>[0]);
  }

  const assignNum = (key: string, value: number) => {
    if (!Number.isFinite(value)) return;
    if (overwrite || typeof anyObj[key] !== 'number') {
      anyObj[key] = value;
    }
  };

  const left = snapshot != null ? snapshot.left : Number(obj.left);
  const top = snapshot != null ? snapshot.top : Number(obj.top);
  const angle = snapshot != null ? snapshot.angle : Number(obj.angle ?? 0);
  const height = snapshot?.height ?? Number((obj as { height?: number }).height);

  assignNum('_sacredLeft', left);
  assignNum('_sacredTop', top);
  assignNum('_sacredAngle', angle);
  if (layoutWidth != null) assignNum('_sacredWidth', layoutWidth);
  assignNum('_sacredHeight', height);

  if (overwrite || typeof anyObj._sacredOriginX !== 'string') {
    anyObj._sacredOriginX = snapshot?.originX ?? String((obj as { originX?: string }).originX ?? 'left');
  }
  if (overwrite || typeof anyObj._sacredOriginY !== 'string') {
    anyObj._sacredOriginY = snapshot?.originY ?? String((obj as { originY?: string }).originY ?? 'top');
  }
}

function maybeRestoreSacredGeometryDuringHydrate(obj: TextLikeObject): void {
  if (isDesignedTemplateText(obj) && obj.textFieldUserEdited === true) return;
  restoreSacredPosition(obj);
}

/** После переноса на canvas — обновить только позицию в sacred, ширину не трогать. */
function syncSacredTemplateTextPositionFromObject(obj: TextLikeObject): void {
  if (!isDesignedTemplateText(obj)) return;
  const anyObj = obj as unknown as Record<string, unknown>;
  const left = Number(obj.left);
  const top = Number(obj.top);
  const angle = Number(obj.angle ?? 0);
  if (Number.isFinite(left)) anyObj._sacredLeft = left;
  if (Number.isFinite(top)) anyObj._sacredTop = top;
  if (Number.isFinite(angle)) anyObj._sacredAngle = angle;
}

function syncEditedDesignedTextLayoutWidthFromContent(obj: TextLikeObject): void {
  if (!isDesignedTemplateText(obj) || obj.textFieldUserEdited !== true) return;
  if (obj.type !== 'textbox') return;
  const text = String(obj.text ?? '');
  const isMultiline = text.includes('\n');
  let targetW: number;
  if (isMultiline) {
    targetW = resolveDesignedMultilineTextboxWidth(obj);
    setDesignedTextboxWidthPreservingOrigin(obj, targetW);
  } else {
    targetW = measureStableTextboxContentWidth(obj);
    const absoluteMax = resolveDesignedTextboxAbsoluteMaxWidth(obj);
    if (absoluteMax != null) targetW = Math.min(targetW, absoluteMax);
    setDesignedTextboxWidthPreservingOrigin(obj, targetW);
  }
  obj.setCoords?.();
}

export function hydrateTextObjectStyles(obj: TextLikeObject): void {
  const id = String(obj.id ?? '');
  const isTpl = isTemplateTextLayerId(id);
  const text = String(obj.text ?? '');
  const baseFontSize = Math.max(6, Number(obj.fontSize) || 16);

  const applyRunsIfStylesMissing = (): boolean => {
    const hadIncomingStyles = !!obj.styles && typeof obj.styles === 'object' && !Array.isArray(obj.styles)
      && Object.keys(obj.styles as object).length > 0;
    if (hadIncomingStyles) return false;
    const runs = clampTextStyleRuns(text, obj.textStyleRuns);
    if (!runs?.length) return false;
    const styles = buildFabricStylesFromRuns(text, runs, baseFontSize);
    if (styles) obj.set('styles', styles);
    const first = runs[0];
    const patch: Record<string, unknown> = {};
    // При материализации runs → styles всегда поднимаем базовые props с первого run
    // (иначе остаётся Arial/дефолт, а в styles раньше попадал только 1-й символ).
    if (first?.fontFamily) patch.fontFamily = first.fontFamily;
    if (first?.fill) {
      const currentFill = String(obj.fill ?? '').trim().toLowerCase();
      if (!currentFill || currentFill === '#111827') {
        patch.fill = first.fill;
      }
    }
    if (first?.fontWeight) patch.fontWeight = first.fontWeight;
    if (first?.fontStyle) patch.fontStyle = first.fontStyle;
    if (Object.keys(patch).length > 0) {
      obj.set(patch as Parameters<typeof obj.set>[0]);
    }
    return true;
  };

  if (isImmutableDesignedTemplateText(obj)) {
    applyRunsIfStylesMissing();
    restoreSacredPosition(obj);
    obj.setCoords?.();
    if (isTpl && isTextPositionDebugEnabled()) {
      console.log(`[TEXT-POS] hydrate skip (immutable) id=${id} left=${obj.left} top=${obj.top} w=${obj.width} angle=${obj.angle ?? 0}`);
    }
    return;
  }

  if (shouldPreserveDesignedTemplateGeometry(obj)) {
    maybeRestoreSacredGeometryDuringHydrate(obj);
  } else if (isTpl) {
    forceTemplateOriginLeft(obj);
    forceTemplateOriginTop(obj);
    restoreSacredPosition(obj);
  }
  if (isTpl && isTextPositionDebugEnabled()) {
    console.log(`[TEXT-POS] hydrate start id=${id} left=${obj.left} top=${obj.top} w=${obj.width} angle=${obj.angle ?? 0}`);
  }
  const hadIncomingStyles = !!obj.styles && typeof obj.styles === 'object' && !Array.isArray(obj.styles)
    && Object.keys(obj.styles as object).length > 0;
  let runs = clampTextStyleRuns(text, obj.textStyleRuns);
  if ((!runs || runs.length === 0) && hadIncomingStyles) {
    runs = extractRunsFromFabricStyles(text, obj.styles!);
    if (runs.length > 0) {
      (obj as { textStyleRuns?: TextStyleRun[] }).textStyleRuns = runs;
    }
  }
  if (!runs?.length) {
    // For designed template texts (text_*), do not destroy existing styles on re-hydrate.
    // Their "оформление" (italic/script fonts etc) may live in the styles map or base props.
    // Clearing them was causing loss of formatting on font reload / second render pass.
    const isDesigned = isDesignedTemplateText(obj);
    if (obj.styles && !isDesigned) {
      obj.set('styles', undefined as unknown as FabricStyles);
    }
    if (isTpl && isTextPositionDebugEnabled()) console.log(`[TEXT-POS] hydrate no-runs id=${id} left=${obj.left} angle=${obj.angle ?? 0}`);
    if (!shouldPreserveDesignedTemplateGeometry(obj)) {
      forceTemplateOriginLeft(obj);
      forceTemplateOriginTop(obj);
    }
    maybeRestoreSacredGeometryDuringHydrate(obj);
    obj.setCoords?.();
    return;
  }
  // For designed template texts that arrived with their original rich styles (from SVG/Corel import),
  // prefer to keep the detailed incoming styles verbatim. Re-building from our TextStyleRun model
  // can lose per-char оформление (fontStyle, specific families for script, sizes etc) on page flips.
  // If styles map is empty but runs exist (typical SVG import) — materialize styles from runs.
  const isDesigned = isDesignedTemplateText(obj);
  if (isDesigned && !obj.textFieldUserEdited) {
    if (!hadIncomingStyles) {
      const styles = buildFabricStylesFromRuns(text, runs, baseFontSize);
      if (styles) obj.set('styles', styles);
    }
    obj.setCoords?.();
    restoreSacredPosition(obj);
    if (isTpl && isTextPositionDebugEnabled()) {
      console.log(`[TEXT-POS] hydrate end (kept designed) id=${id} left=${obj.left} top=${obj.top} w=${obj.width} angle=${obj.angle ?? 0}`);
    }
    return;
  }
  if (isDesigned && hadIncomingStyles) {
    obj.setCoords?.();
    maybeRestoreSacredGeometryDuringHydrate(obj);
  if (isTpl && isTextPositionDebugEnabled()) {
    console.log(`[TEXT-POS] hydrate end (kept incoming styles) id=${id} left=${obj.left} top=${obj.top} w=${obj.width} angle=${obj.angle ?? 0}`);
  }
    return;
  }
  // Client-added or no original detailed styles: (re)assemble from runs.
  const styles = buildFabricStylesFromRuns(text, runs, baseFontSize);
  if (styles) {
    obj.set('styles', styles);
  } else {
    obj.set('styles', undefined as unknown as FabricStyles);
  }
  obj.setCoords?.();
  maybeRestoreSacredGeometryDuringHydrate(obj);
  if (isTpl && isTextPositionDebugEnabled()) {
    console.log(`[TEXT-POS] hydrate end   id=${id} left=${obj.left} top=${obj.top} w=${obj.width} angle=${obj.angle ?? 0}`);
  }
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

function widenTextboxPreservingDesignedOrigin(obj: TextLikeObject, nextWidth: number): void {
  const id = String(obj.id ?? '');
  const beforeLeft = obj.left;
  const originX = (obj as { originX?: string }).originX ?? 'left';
  const originY = (obj as { originY?: string }).originY ?? 'top';
  const currentW = Number(obj.width ?? 0);
  const floor = resolveEffectiveDesignedTextboxLayoutFloor(obj);
  let targetW = Math.max(nextWidth, Number.isFinite(currentW) ? currentW : 0, floor);
  const absoluteMax = resolveDesignedTextboxAbsoluteMaxWidth(obj);
  if (absoluteMax != null) targetW = Math.min(targetW, absoluteMax);
  obj.set({ width: targetW, originX, originY, textFieldLayoutWidth: targetW } as Parameters<typeof obj.set>[0]);
  if (isDesignedTemplateText(obj)) {
    const anyObj = obj as { _sacredWidth?: number; _editLayoutWidthFloor?: number };
    anyObj._sacredWidth = targetW;
    if (obj.textFieldUserEdited === true) {
      anyObj._editLayoutWidthFloor = targetW;
    }
  }
  if (isTemplateTextLayerId(id) && isTextPositionDebugEnabled()) {
    console.log(`[TEXT-POS] width-expand id=${id} beforeLeft=${beforeLeft} afterLeft=${obj.left} targetW=${nextWidth} originX=${originX}`);
  }
}

function measureMaxTextboxLineWidth(obj: TextLikeObject): number {
  const text = String(obj.text ?? '');
  const lines = text.split('\n');
  const extended = obj as TextLikeObject & {
    _getLineWidth?: (lineIndex: number) => number;
    calcTextWidth?: () => number;
  };
  let maxLineW = 0;
  if (typeof extended._getLineWidth === 'function') {
    for (let i = 0; i < lines.length; i++) {
      const lineW = Number(extended._getLineWidth(i));
      if (Number.isFinite(lineW) && lineW > maxLineW) maxLineW = lineW;
    }
  }
  if (maxLineW <= 0 && typeof extended.calcTextWidth === 'function') {
    const measured = Number(extended.calcTextWidth());
    if (Number.isFinite(measured) && measured > 0) maxLineW = measured;
  }
  return maxLineW;
}

const TIGHT_TEXTBOX_MIN_WIDTH_PX = 32;

/** Декоративные/скриптовые семейства (в т.ч. Ceremonious One — без слова "script" в имени). */
const SCRIPT_FONT_FAMILY_RE = /script|cursive|hand|calligraph|wedding|signature|swan|elegant|flourish|ceremonious|allura|vibes|pinyon|brush|sacramento|dancing|corsiva|champagne|ballet|romant|amatic|pacifico|satisfy|yellowtail|arizonia|alex|monsieur|tangerine|great.?vibes|free.?hand|handwrit/i;

function estimateTightTextboxWidthFromChars(obj: TextLikeObject): number {
  const fontSize = Math.max(6, Number(obj.fontSize) || 16);
  const lines = String(obj.text ?? '').split('\n');
  const longest = lines.reduce((max, line) => (line.length > max.length ? line : max), '');
  return longest.length * fontSize * 0.55;
}

function looksLikeScriptTextbox(obj: TextLikeObject): boolean {
  const style = String((obj as { fontStyle?: string }).fontStyle ?? '').toLowerCase();
  const family = String(obj.fontFamily ?? '').toLowerCase();
  return style.includes('italic') || SCRIPT_FONT_FAMILY_RE.test(family);
}

/**
 * Unedited designed: не сужать авторскую ширину для скриптов / коротких глифов.
 * На iOS Safari content-measure часто занижает ink bounds → shrink даёт визуальный
 * overflow (цифра у края холста, налезание на соседний текст). На desktop метрики
 * обычно точнее — баг почти не виден.
 */
function shouldAvoidShrinkAuthoredUneditedTextboxWidth(obj: TextLikeObject): boolean {
  if (obj.textFieldUserEdited === true) return false;
  if (!isDesignedTemplateText(obj)) return false;
  const text = String(obj.text ?? '').trim();
  if (text.length > 0 && text.length <= 3) return true;
  return looksLikeScriptTextbox(obj);
}

/**
 * Короткие глифы (цифры 5–8 и т.п.): замораживаем авторскую ширину целиком.
 * Expand по pad/measure тоже сдвигает правый край и даёт налезание / выход за холст.
 */
function shouldFreezeAuthoredUneditedTextboxWidth(obj: TextLikeObject): boolean {
  if (obj.textFieldUserEdited === true) return false;
  if (!isDesignedTemplateText(obj)) return false;
  const text = String(obj.text ?? '').trim();
  return text.length > 0 && text.length <= 3;
}

/**
 * Визуальная ширина строки по ink bounds (actualBoundingBox*), не по advance.
 * Fabric calcTextWidth даёт advance — у скриптов выносные элементы вылезают за рамку.
 */
function measureCanvasGlyphBoundsWidth(obj: TextLikeObject, line: string): number {
  if (!line || typeof document === 'undefined') return 0;
  try {
    const canvasEl = document.createElement('canvas');
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return 0;
    const fontSize = Math.max(6, Number(obj.fontSize) || 16);
    const family = String(obj.fontFamily ?? 'sans-serif').trim() || 'sans-serif';
    const weight = String((obj as { fontWeight?: string | number }).fontWeight ?? 'normal');
    const style = String((obj as { fontStyle?: string }).fontStyle ?? 'normal');
    ctx.font = `${style} ${weight} ${fontSize}px ${family}`;
    const metrics = ctx.measureText(line);
    const left = Number(metrics.actualBoundingBoxLeft);
    const right = Number(metrics.actualBoundingBoxRight);
    if (Number.isFinite(left) && Number.isFinite(right)) {
      const visual = Math.abs(left) + Math.abs(right);
      if (visual > 0) return visual;
    }
    const advance = Number(metrics.width);
    return Number.isFinite(advance) && advance > 0 ? advance : 0;
  } catch {
    return 0;
  }
}

function measureMaxVisualTextLineWidth(obj: TextLikeObject): number {
  const lines = String(obj.text ?? '').split('\n');
  let maxW = 0;
  for (const line of lines) {
    if (!line) continue;
    maxW = Math.max(maxW, measureCanvasGlyphBoundsWidth(obj, line));
  }
  return maxW;
}

/** Ширина textbox вплотную под контент; для wrap без \\n — по самой длинной перенесённой строке. */
export function measureStableTextboxContentWidth(obj: TextLikeObject): number {
  if (obj.type !== 'textbox') return TIGHT_TEXTBOX_MIN_WIDTH_PX;
  const text = String(obj.text ?? '');
  if (!text) return TIGHT_TEXTBOX_MIN_WIDTH_PX;
  const fontSize = Math.max(6, Number(obj.fontSize) || 16);
  // Fabric calcTextWidth ≈ advance width; скрипты/italics часто рисуют за пределы advance,
  // из‑за чего рамка выделения визуально уже глифов.
  const looksScript = looksLikeScriptTextbox(obj);
  const padFactor = looksScript ? 0.85 : 0.28;

  let measuredLine = 0;
  measuredLine = withUnconstrainedTextboxWidth(obj, () => measureMaxTextboxLineWidth(obj));
  const visualLine = measureMaxVisualTextLineWidth(obj);
  if (visualLine > measuredLine) measuredLine = visualLine;

  if (measuredLine <= 0) {
    measuredLine = estimateTightTextboxWidthFromChars(obj);
  }
  const padding = Math.max(4, fontSize * padFactor, measuredLine * (looksScript ? 0.12 : 0.03));
  return Math.max(TIGHT_TEXTBOX_MIN_WIDTH_PX, Math.ceil(measuredLine + padding));
}

/** @deprecated Используйте measureStableTextboxContentWidth */
export function measureTightTextboxContentWidth(obj: TextLikeObject): number {
  return measureStableTextboxContentWidth(obj);
}

function setTextboxWidthPreservingOrigin(obj: TextLikeObject, nextWidth: number): void {
  const originX = (obj as { originX?: string }).originX ?? 'left';
  const originY = (obj as { originY?: string }).originY ?? 'top';
  obj.set({ width: nextWidth, originX, originY } as Parameters<typeof obj.set>[0]);
  obj.setCoords?.();
}

/** Во время inline-edit Fabric раздувает textbox — возвращаем ширину под контент. */
export function pinDesignedTextboxWidthDuringInlineEdit(obj: TextLikeObject): void {
  const editing = (obj as { isEditing?: boolean }).isEditing === true;
  if (!editing || obj.type !== 'textbox') return;

  const beforeW = Number(obj.width ?? 0);

  if (obj.textFieldClientAdded === true) {
    const pinned = preserveClientTextboxLayoutWidth(obj);
    const afterW = Number(obj.width ?? 0);
    if (pinned || Math.abs(beforeW - afterW) > 0.5) {
      logTextWidthDebug('pin-inline:client-added', obj, {
        beforeW,
        afterW,
        layoutW: readClientTextboxLayoutWidth(obj),
        skipContentMeasure: true,
      });
    }
    return;
  }

  if (isDesignedSingleLineTextbox(obj)) {
    syncDesignedSingleLineTextboxWidthToContent(obj);
    const afterW = Number(obj.width ?? 0);
    if (Math.abs(beforeW - afterW) > 0.5 || beforeW > measureStableTextboxContentWidth(obj) + 8) {
      logTextWidthDebug('pin-inline:single-line', obj, { beforeW, afterW, skipContentMeasure: false });
    }
    return;
  }

  if (isDesignedMultilineTextbox(obj)) {
    syncDesignedMultilineTextboxWidth(obj);
    const afterW = Number(obj.width ?? 0);
    if (Math.abs(beforeW - afterW) > 0.5) {
      logTextWidthDebug('pin-inline:multiline', obj, { beforeW, afterW, skipContentMeasure: true });
    }
    return;
  }

  const contentW = measureStableTextboxContentWidth(obj);
  const current = Number(obj.width ?? 0);
  if (!Number.isFinite(contentW) || contentW <= 0) return;
  if (current > contentW + 0.5) {
    setTextboxWidthPreservingOrigin(obj, contentW);
    logTextWidthDebug('pin-inline:shrink-to-content', obj, { beforeW: current, afterW: contentW, contentW, skipContentMeasure: true });
  }
}

function finalizeDesignedSingleLineTextboxWidth(obj: TextLikeObject): void {
  if (obj.type !== 'textbox' || !isDesignedTemplateText(obj)) return;
  const beforeW = Number(obj.width ?? 0);
  const contentW = measureStableTextboxContentWidth(obj);
  setDesignedTextboxWidthPreservingOrigin(obj, contentW);
  const anyObj = obj as unknown as Record<string, unknown>;
  anyObj._sacredWidth = contentW;
  (obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth = contentW;
  if (obj.textFieldUserEdited === true) {
    anyObj._editLayoutWidthFloor = contentW;
  } else {
    delete anyObj._editLayoutWidthFloor;
  }
  logTextWidthDebug('finalize-single-line', obj, { beforeW, afterW: Number(obj.width ?? 0), contentW, skipContentMeasure: true });
}

function setDesignedTextboxWidthPreservingOrigin(obj: TextLikeObject, nextWidth: number): void {
  const originX = (obj as { originX?: string }).originX ?? 'left';
  const originY = (obj as { originY?: string }).originY ?? 'top';
  let targetW = Math.max(TIGHT_TEXTBOX_MIN_WIDTH_PX, nextWidth);
  const absoluteMax = resolveDesignedTextboxAbsoluteMaxWidth(obj);
  if (absoluteMax != null) targetW = Math.min(targetW, absoluteMax);
  obj.set({
    width: targetW,
    originX,
    originY,
    textFieldLayoutWidth: targetW,
  } as Parameters<typeof obj.set>[0]);
  if (isDesignedTemplateText(obj)) {
    const anyObj = obj as { _sacredWidth?: number; _editLayoutWidthFloor?: number };
    anyObj._sacredWidth = targetW;
    if (obj.textFieldUserEdited === true) {
      anyObj._editLayoutWidthFloor = targetW;
    }
  }
  obj.setCoords?.();
}

export function hasUserLockedClientTextboxLayout(obj: TextLikeObject): boolean {
  if (obj.textFieldClientAdded !== true) return false;
  return obj.textFieldUserLayoutWidth === true;
}

function readClientTextboxLayoutWidth(obj: TextLikeObject): number | null {
  if (obj.textFieldClientAdded !== true || obj.type !== 'textbox') return null;
  const layoutW = Number((obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth ?? 0);
  if (Number.isFinite(layoutW) && layoutW > 0) return layoutW;
  if (hasUserLockedClientTextboxLayout(obj)) {
    const current = Number(obj.width ?? 0);
    return Number.isFinite(current) && current > 0 ? current : null;
  }
  return null;
}

/**
 * Клиентский textbox (+текст): держим фиксированную ширину (ручной resize / lock),
 * перенос строк вниз через initDimensions, без горизонтального auto-grow.
 */
export function preserveClientTextboxLayoutWidth(obj: TextLikeObject): boolean {
  const targetW = readClientTextboxLayoutWidth(obj);
  if (targetW == null) return false;
  const current = Number(obj.width ?? 0);
  const needsWidthPin = !Number.isFinite(current) || Math.abs(current - targetW) > 0.5;
  if (needsWidthPin) {
    setTextboxWidthPreservingOrigin(obj, targetW);
    (obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth = targetW;
  }
  try {
    (obj as TextLikeObject & { initDimensions?: () => void }).initDimensions?.();
  } catch {
    /* noop */
  }
  obj.setCoords?.();
  return needsWidthPin;
}

/** Фиксирует ширину клиентского textbox после создания или ручного resize. */
export function lockClientTextboxLayoutWidth(obj: TextLikeObject): void {
  if (obj.textFieldClientAdded !== true || obj.type !== 'textbox') return;
  const width = Number(obj.width ?? 0);
  if (!Number.isFinite(width) || width <= 0) return;
  obj.set({
    width,
    textFieldLayoutWidth: width,
    textFieldUserLayoutWidth: true,
  } as Parameters<typeof obj.set>[0]);
  (obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth = width;
  obj.textFieldUserLayoutWidth = true;
  try {
    (obj as TextLikeObject & { initDimensions?: () => void }).initDimensions?.();
  } catch {
    /* noop */
  }
  obj.setCoords?.();
}

export function isAnyTextObjectEditingOnCanvas(canvas: Canvas): boolean {
  let editing = false;
  const visit = (objects: FabricObject[]) => {
    for (const obj of objects) {
      if (isFabricTextObjectType(obj.type)) {
        const text = obj as TextLikeObject & { isEditing?: boolean };
        if (text.isEditing === true) {
          editing = true;
          return;
        }
      }
      const group = obj as { getObjects?: () => FabricObject[] };
      if (typeof group.getObjects === 'function') {
        visit(group.getObjects());
        if (editing) return;
      }
    }
  };
  visit(canvas.getObjects());
  return editing;
}

export function fitTextboxWidthToContent(
  obj: TextLikeObject,
  options?: {
    shrinkOnly?: boolean;
    expandOnly?: boolean;
    minWidth?: number;
    maxWidth?: number;
    designedTemplate?: boolean;
  },
): boolean {
  if (obj.type !== 'textbox') return false;
  let target = measureStableTextboxContentWidth(obj);
  if (options?.minWidth != null) target = Math.max(target, options.minWidth);
  if (options?.maxWidth != null) target = Math.min(target, options.maxWidth);
  const current = Number(obj.width ?? 0);
  if (options?.expandOnly && target <= current + 0.5) return false;
  if (options?.shrinkOnly && target >= current - 0.5) return false;
  if (Math.abs(current - target) <= 0.5) return false;
  if (options?.designedTemplate || isDesignedTemplateText(obj)) {
    setDesignedTextboxWidthPreservingOrigin(obj, target);
  } else {
    setTextboxWidthPreservingOrigin(obj, target);
  }
  return true;
}

export function fitClientTextboxWidthToContent(
  obj: TextLikeObject,
  minWidth?: number,
  options?: { expandOnly?: boolean; shrinkOnly?: boolean },
): boolean {
  if (hasUserLockedClientTextboxLayout(obj)) return false;
  const absoluteMax = resolveDesignedTextboxAbsoluteMaxWidth(obj);
  return fitTextboxWidthToContent(obj, {
    maxWidth: absoluteMax ?? undefined,
    minWidth,
    expandOnly: options?.expandOnly,
    shrinkOnly: options?.shrinkOnly,
  });
}

/** Сужает ширину textbox под контент при загрузке драфта (без расширения). */
export function tightenDraftTextboxWidthOnLoad(obj: TextLikeObject): void {
  if (obj.type !== 'textbox') return;
  if (Math.abs(Number(obj.angle ?? 0)) > 0.5) return;
  const text = normalizeTextForPlaceholderCheck(obj.text);
  if (!text || isPlaceholderTemplateText(text)) return;

  if (obj.textFieldClientAdded === true) {
    if (hasUserLockedClientTextboxLayout(obj)) return;
    fitTextboxWidthToContent(obj, { shrinkOnly: true });
    lockClientTextboxLayoutWidth(obj);
    return;
  }

  if (!isDesignedTemplateText(obj)) return;

  const layoutW = Number((obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth ?? 0);
  // Unedited: сужаем только после trusted font remeasure (иначе cold fallback уже скрипта).
  if (obj.textFieldUserEdited !== true && !hasTrustedTextMetrics(obj)) {
    return;
  }
  // Скрипт / короткие глифы: оставляем авторскую ширину (см. shouldAvoidShrink…).
  if (obj.textFieldUserEdited !== true && shouldAvoidShrinkAuthoredUneditedTextboxWidth(obj)) {
    return;
  }

  fitTextboxWidthToContent(obj, {
    shrinkOnly: true,
    designedTemplate: true,
  });
  const measuredW = Number(obj.width ?? 0);
  const anyObj = obj as unknown as Record<string, unknown>;

  // Unedited: content width is authoritative. Do NOT re-expand via inflated
  // textFieldLayoutWidth from SVG import (maxLineLen * 0.7), or the box stays
  // wide until the user clicks (prepare-edit sync).
  if (obj.textFieldUserEdited !== true) {
    if (!(Number.isFinite(measuredW) && measuredW > 0)) return;
    anyObj._sacredWidth = measuredW;
    (obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth = measuredW;
    delete anyObj._editLayoutWidthFloor;
    return;
  }

  const floorW = Number(anyObj._editLayoutWidthFloor ?? 0);
  const width = Math.max(
    Number.isFinite(measuredW) && measuredW > 0 ? measuredW : 0,
    Number.isFinite(layoutW) && layoutW > 0 ? layoutW : 0,
    Number.isFinite(floorW) && floorW > 0 ? floorW : 0,
  );
  if (!Number.isFinite(width) || width <= 0) return;
  if (width > measuredW + 0.5) {
    setDesignedTextboxWidthPreservingOrigin(obj, width);
  }
  anyObj._sacredWidth = width;
  (obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth = width;
  anyObj._editLayoutWidthFloor = width;
}

/** Подгоняет ширину шаблонного textbox под контент и обновляет sacred-геометрию. */
export function stabilizeDesignedTextboxWidthFromContent(obj: TextLikeObject): boolean {
  if (!isDesignedTemplateText(obj) || obj.type !== 'textbox') return false;
  const angle = Math.abs(Number(obj.angle ?? 0));
  if (angle > 0.5) return false;

  try {
    (obj as TextLikeObject & { initDimensions?: () => void }).initDimensions?.();
  } catch {
    /* noop */
  }

  const text = String(obj.text ?? '');
  const isMultiline = text.includes('\n');
  const targetW = isMultiline
    ? measureDesignedMultilineLongestLineWidth(obj)
    : measureStableTextboxContentWidth(obj);
  const absoluteMax = resolveDesignedTextboxAbsoluteMaxWidth(obj);
  let finalW = absoluteMax != null ? Math.min(targetW, absoluteMax) : targetW;
  const current = Number(obj.width ?? 0);
  const layoutW = Number((obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth ?? 0);

  if (isMultiline && obj.textFieldUserEdited === true) {
    finalW = resolveDesignedMultilineTextboxWidth(obj);
    if (Math.abs(current - finalW) <= 0.5) return false;
    setDesignedTextboxWidthPreservingOrigin(obj, finalW);
    return true;
  }

  if (finalW >= current - 0.5 && obj.textFieldUserEdited !== true && !hasFilledDesignedTemplateText(obj)) {
    return false;
  }

  // До trusted font remeasure — вообще не сужаем unedited (layoutW=0 / мягкий fallback
  // раньше всё равно проходили через 0.85-guard и отравляли sacred).
  if (
    finalW < current - 0.5
    && obj.textFieldUserEdited !== true
    && !hasTrustedTextMetrics(obj)
  ) {
    return false;
  }

  // Короткие глифы (цифры): не меняем авторскую ширину ни shrink, ни expand.
  if (
    obj.textFieldUserEdited !== true
    && shouldFreezeAuthoredUneditedTextboxWidth(obj)
  ) {
    return false;
  }

  // Скрипт: только expand (не сужаем авторскую ширину на mobile).
  if (
    finalW < current - 0.5
    && obj.textFieldUserEdited !== true
    && shouldAvoidShrinkAuthoredUneditedTextboxWidth(obj)
  ) {
    return false;
  }

  // Unedited: layoutW из import/JSON часто больше контента — не даём ему блокировать shrink
  // через последующий restoreSacred (sacred/layout должны совпасть с finalW).
  if (
    finalW < current - 0.5
    && obj.textFieldUserEdited !== true
    && Number.isFinite(layoutW)
    && layoutW > finalW + 0.5
  ) {
    (obj as { textFieldLayoutWidth?: number }).textFieldLayoutWidth = finalW;
  }

  if (Math.abs(current - finalW) <= 0.5) return false;
  setDesignedTextboxWidthPreservingOrigin(obj, finalW);
  return true;
}

export function stabilizeAllTextboxWidthsOnCanvas(canvas: Canvas): void {
  const visit = (objects: FabricObject[]) => {
    for (const obj of objects) {
      if (isFabricTextObjectType(obj.type)) {
        const textObj = obj as TextLikeObject;
        if (textObj.type !== 'textbox') continue;
        if (isDesignedTemplateText(textObj)) {
          // Authored template text: keep master/import geometry until user edits.
          if (textObj.textFieldUserEdited === true) {
            stabilizeDesignedTextboxWidthFromContent(textObj);
          }
        } else if (textObj.textFieldClientAdded === true) {
          /* Клиентский textbox — фиксированная ширина, без auto-grow к краю страницы. */
        }
      }
      const group = obj as { getObjects?: () => FabricObject[] };
      if (typeof group.getObjects === 'function') {
        visit(group.getObjects());
      }
    }
  };
  visit(canvas.getObjects());
}

function expandTextboxWidthForEditedContent(obj: TextLikeObject, _textBefore: string): void {
  syncEditedDesignedTextLayoutWidthFromContent(obj);
}

function adjustTextboxWidthPreservingOrigin(obj: TextLikeObject, nextWidth: number): void {
  if (shouldPreserveDesignedTemplateGeometry(obj)) {
    widenTextboxPreservingDesignedOrigin(obj, nextWidth);
    obj.setCoords?.();
    return;
  }
  const id = String(obj.id ?? '');
  const beforeLeft = obj.left;
  obj.set({ width: nextWidth, originX: 'left' as any, originY: 'top' as any });
  if (isTemplateTextLayerId(id)) {
    (obj as any)._sacredWidth = Number(nextWidth);
  }
  if (isTemplateTextLayerId(id) && isTextPositionDebugEnabled()) {
    console.log(`[TEXT-POS] width-fit id=${id} beforeLeft=${beforeLeft} afterLeft=${obj.left} beforeW=${obj.width} targetW=${nextWidth} angle=${obj.angle ?? 0}`);
  }
}

function ensureEditedDesignedMultilineTextboxWidth(obj: TextLikeObject): void {
  syncEditedDesignedTextLayoutWidthFromContent(obj);
}

function ensureEditedDesignedSingleLineTextboxWidth(obj: TextLikeObject): void {
  syncEditedDesignedTextLayoutWidthFromContent(obj);
}

function ensureTextboxWidthFitsContent(obj: TextLikeObject): void {
  if (isDesignedTemplateText(obj)) return;
  if (obj.type !== 'textbox') return;
  if (obj.textFieldClientAdded === true) return;
  const id = String(obj.id ?? '');
  if (!isTemplateTextLayerId(id)) return;
  const text = String(obj.text ?? '');
  if (!text || text.includes('\n')) return;
  const minWidth = computeMinTextboxWidth(obj, text);
  const width = Number(obj.width ?? 0);
  if (Number.isFinite(width) && width + 1 >= minWidth) return;
  adjustTextboxWidthPreservingOrigin(obj, minWidth);
  obj.setCoords?.();
}

function formatPatchAffectsTextboxWidth(patch: Record<string, unknown>): boolean {
  return typeof patch.fontSize === 'number'
    || typeof patch.fontFamily === 'string'
    || typeof patch.fontWeight === 'string'
    || typeof patch.fontStyle === 'string'
    || typeof patch.charSpacing === 'number'
    || typeof patch.letterSpacing === 'number';
}

/** После смены кегля/шрифта поджимает или расширяет textbox под новый контент. */
function syncDesignedTextboxWidthAfterFormatChange(obj: TextLikeObject): void {
  if (obj.type !== 'textbox' || !isDesignedTemplateText(obj)) return;
  if (Math.abs(Number(obj.angle ?? 0)) > 0.5) return;

  try {
    (obj as TextLikeObject & { initDimensions?: () => void }).initDimensions?.();
  } catch {
    /* noop */
  }

  if (isDesignedMultilineTextbox(obj)) {
    const longestLineW = measureDesignedMultilineLongestLineWidth(obj);
    const sessionW = resolveDesignedMultilineSessionWidth(obj);
    let targetW: number;
    if (longestLineW > sessionW + 8) {
      targetW = longestLineW;
    } else if (sessionW > longestLineW + 8) {
      targetW = longestLineW;
    } else {
      targetW = sessionW > 0 ? sessionW : longestLineW;
    }
    const absoluteMax = resolveDesignedTextboxAbsoluteMaxWidth(obj);
    if (absoluteMax != null) targetW = Math.min(targetW, absoluteMax);
    setDesignedTextboxWidthPreservingOrigin(obj, targetW);
    const anyObj = obj as unknown as Record<string, unknown>;
    anyObj._editSessionLayoutWidth = targetW;
    logTextWidthDebug('sync-after-format:multiline', obj, { longestLineW, sessionW, targetW, skipContentMeasure: true });
    return;
  }

  if (isDesignedSingleLineTextbox(obj)) {
    syncDesignedSingleLineTextboxWidthToContent(obj);
    logTextWidthDebug('sync-after-format:single-line', obj, { skipContentMeasure: true });
    return;
  }

  stabilizeDesignedTextboxWidthFromContent(obj);
}

function normalizeImportedSingleLineTextboxWidth(obj: TextLikeObject): void {
  ensureTextboxWidthFitsContent(obj);
}

export function applyFormatToTextField(
  obj: TextLikeObject,
  patch: Record<string, unknown>,
): void {
  markTextFieldUserEdited(obj);
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

  if (typeof patch.fontSize === 'number') {
    next.scaleX = 1;
    next.scaleY = 1;
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

  if (obj.type === 'textbox' && formatPatchAffectsTextboxWidth(patch)) {
    if (isDesignedTemplateText(obj)) {
      syncDesignedTextboxWidthAfterFormatChange(obj);
    } else if (obj.textFieldClientAdded === true) {
      fitClientTextboxWidthToContent(obj);
    } else {
      fitTextboxWidthToContent(obj, { shrinkOnly: true });
    }
  }

  refreshSacredGeometryAfterUserEdit(obj);
  restoreSacredPosition(obj);
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

function appendFontLoadSpec(
  out: Set<string>,
  family: string,
  fontSize: number,
  fontWeight?: unknown,
  fontStyle?: unknown,
): void {
  const escaped = family.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const size = Math.max(6, fontSize || 16);
  const parts: string[] = [];
  const style = typeof fontStyle === 'string' ? fontStyle.trim() : '';
  const weight = typeof fontWeight === 'string' || typeof fontWeight === 'number'
    ? String(fontWeight).trim()
    : '';
  if (style && style !== 'normal') parts.push(style);
  if (weight && weight !== 'normal' && weight !== '400') parts.push(weight);
  parts.push(`${size}px`);
  parts.push(`"${escaped}"`);
  out.add(parts.join(' '));
  out.add(`16px "${escaped}"`);
}

/** Спеки для document.fonts.load — семейство, размер, weight/style из styles и runs. */
export function collectFontLoadSpecsFromTextField(o: Record<string, unknown>): string[] {
  const specs = new Set<string>();
  const baseSize = Math.max(6, Number(o.fontSize) || 16);
  const families = new Set<string>();
  collectFontFamiliesFromTextField(o, families);
  for (const family of families) {
    appendFontLoadSpec(specs, family, baseSize, o.fontWeight, o.fontStyle);
  }
  const styles = o.styles;
  if (styles && typeof styles === 'object' && !Array.isArray(styles)) {
    for (const line of Object.values(styles as Record<string, unknown>)) {
      const lineRec = asRecord(line);
      if (!lineRec) continue;
      for (const style of Object.values(lineRec)) {
        const styleRec = asRecord(style);
        if (!styleRec) continue;
        const segFamily = styleRec.fontFamily;
        if (typeof segFamily !== 'string' || !segFamily.trim()) continue;
        appendFontLoadSpec(
          specs,
          segFamily.trim(),
          Number(styleRec.fontSize) || baseSize,
          styleRec.fontWeight,
          styleRec.fontStyle,
        );
      }
    }
  }
  const runs = o.textStyleRuns;
  if (Array.isArray(runs)) {
    for (const run of runs) {
      if (!run || typeof run !== 'object') continue;
      const r = run as TextStyleRun;
      if (!r.fontFamily?.trim()) continue;
      appendFontLoadSpec(
        specs,
        r.fontFamily.trim(),
        Number(r.fontSize) || baseSize,
        r.fontWeight,
        r.fontStyle,
      );
    }
  }
  return [...specs];
}

function cloneFabricStyles(styles: FabricStyles): FabricStyles {
  const out: FabricStyles = {};
  for (const [lineKey, lineStyles] of Object.entries(styles)) {
    if (!lineStyles) continue;
    const lineIndex = Number(lineKey);
    if (!Number.isFinite(lineIndex)) continue;
    out[lineIndex] = {};
    for (const [charKey, patch] of Object.entries(lineStyles)) {
      const charIndex = Number(charKey);
      if (!Number.isFinite(charIndex) || !patch) continue;
      out[lineIndex]![charIndex] = { ...patch };
    }
  }
  return out;
}

/** Сброс кэша Fabric и повторный layout после document.fonts (без hydrate). */
export function kickTextObjectFontRerender(obj: TextLikeObject): void {
  const textObj = obj as TextLikeObject & {
    _clearCache?: () => void;
    dirty?: boolean;
    styles?: FabricStyles;
  };
  try {
    textObj._clearCache?.();
  } catch {
    /* noop */
  }
  const styles = textObj.styles;
  if (styles && typeof styles === 'object' && !Array.isArray(styles) && Object.keys(styles).length > 0) {
    textObj.set('styles', cloneFabricStyles(styles));
  }
  const family = String(textObj.fontFamily ?? '').trim();
  if (family) {
    textObj.set({ fontFamily: family });
  }
  if (!shouldSkipInitDimensionsForTemplateText(textObj)) {
    try {
      textObj.initDimensions?.();
    } catch {
      /* noop */
    }
  }
  textObj.dirty = true;
  textObj.setCoords?.();
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
    // For designed template texts keep the original detailed `styles` (if present) so that
    // on page reload we don't rely on lossy extract/build roundtrip for rich оформление.
    // textStyleRuns are still kept as metadata.
    if (!isDesignedTemplateText(o as any)) {
      delete o.styles;
    }
  });
}

export function forceTemplateOriginLeft(obj: TextLikeObject): void {
  const id = String(obj.id ?? '');
  if (!isTemplateTextLayerId(id) || (obj as any).textFieldClientAdded === true) return;
  const cur = String((obj as any).originX ?? '');
  if (cur !== 'left') {
    const beforeLeft = obj.left;
    obj.set({ originX: 'left' as any });
    if (cur && isTextPositionDebugEnabled()) {
      console.log(`[TEXT-POS] FORCE originX left id=${id} was=${cur} left=${beforeLeft} -> ${obj.left} angle=${obj.angle ?? 0}`);
    }
  }
}

export function forceTemplateOriginTop(obj: TextLikeObject): void {
  const id = String(obj.id ?? '');
  if (!isTemplateTextLayerId(id) || (obj as any).textFieldClientAdded === true) return;
  const cur = String((obj as any).originY ?? '');
  if (cur !== 'top') {
    const beforeTop = obj.top;
    obj.set({ originY: 'top' as any });
    if (cur && isTextPositionDebugEnabled()) {
      console.log(`[TEXT-POS] FORCE originY top id=${id} was=${cur} top=${beforeTop} -> ${obj.top} angle=${obj.angle ?? 0}`);
    }
  }
}

function captureSacredPositionIfNeeded(obj: TextLikeObject): void {
  const id = String(obj.id ?? '');
  if (!isTemplateTextLayerId(id) || (obj as any).textFieldClientAdded === true) return;
  if (shouldPreserveDesignedTemplateGeometry(obj)) {
    captureSacredTemplateTextGeometry(obj, { overwrite: true });
    return;
  }
  forceTemplateOriginLeft(obj);
  forceTemplateOriginTop(obj);
  const anyObj = obj as any;
  if (typeof anyObj._sacredLeft !== 'number') {
    anyObj._sacredLeft = Number(obj.left);
    anyObj._sacredTop = Number(obj.top);
    anyObj._sacredOriginX = 'left';
    anyObj._sacredOriginY = 'top';
  }
  // Capture rotation and fixed textbox dimensions so that page flips / rehydrates / font loads
  // do not drop angle (vertical text) or change wrap width for multi-line template texts.
  if (typeof anyObj._sacredAngle !== 'number') {
    anyObj._sacredAngle = Number(obj.angle ?? 0);
  }
  if (typeof anyObj._sacredWidth !== 'number') {
    const w = Number(obj.width);
    if (Number.isFinite(w)) anyObj._sacredWidth = w;
  }
  if (typeof anyObj._sacredHeight !== 'number') {
    const h = Number((obj as any).height);
    if (Number.isFinite(h)) anyObj._sacredHeight = h;
  }
}

function shouldSkipInitDimensionsForTemplateText(obj: TextLikeObject): boolean {
  if (shouldPreserveDesignedTemplateGeometry(obj)) return true;
  const text = String(obj.text ?? '');
  const sacredAngle = (obj as { _sacredAngle?: number })._sacredAngle;
  const angle = Number(sacredAngle ?? obj.angle ?? 0);
  if (Math.abs(angle) > 0.001) return true;
  if (obj.type === 'textbox' && text.includes('\n')) return true;
  return false;
}

function restoreSacredPosition(obj: TextLikeObject): void {
  const id = String(obj.id ?? '');
  if (!isTemplateTextLayerId(id) || (obj as any).textFieldClientAdded === true) return;
  const anyObj = obj as unknown as Record<string, unknown>;
  if (shouldPreserveDesignedTemplateGeometry(obj)) {
    const ox = anyObj._sacredOriginX;
    const oy = anyObj._sacredOriginY;
    if (typeof ox === 'string') obj.set({ originX: ox as 'left' | 'center' | 'right' });
    if (typeof oy === 'string') obj.set({ originY: oy as 'top' | 'center' | 'bottom' });
  } else {
    forceTemplateOriginLeft(obj);
    forceTemplateOriginTop(obj);
  }
  const sl = anyObj._sacredLeft;
  const st = anyObj._sacredTop;
  const sa = anyObj._sacredAngle;
  const sw = shouldPreserveDesignedTemplateGeometry(obj)
    ? resolveAuthoritativeDesignedWidth(obj)
    : (typeof anyObj._sacredWidth === 'number'
      ? anyObj._sacredWidth
      : resolveDesignedTextboxWidth(obj));
  const sh = anyObj._sacredHeight;
  const epsA = 0.001;
  const epsD = 0.1;
  let changed = false;
  // Always force the sacred geometry values for designed template texts.
  // This defeats any drift introduced by set('styles'), initDimensions, font re-measure, or layout passes
  // especially important for multi-line (wrap width) and rotated text.
  if (typeof sa === 'number') {
    const curA = Number(obj.angle ?? 0);
    if (Math.abs(curA - sa) > epsA) {
      if (isTextPositionDebugEnabled()) console.log(`[TEXT-POS] LOCK angle ${id} ${obj.angle} -> ${sa}`);
      changed = true;
    }
    obj.set({ angle: sa });
  }
  if (typeof sw === 'number' && Number.isFinite(sw)) {
    const curW = Number(obj.width ?? 0);
    const targetW = sw;
    if (Math.abs(curW - targetW) > epsD) {
      if (isTextPositionDebugEnabled()) console.log(`[TEXT-POS] LOCK width ${id} ${obj.width} -> ${targetW}`);
      changed = true;
    }
    obj.set({ width: targetW, textFieldLayoutWidth: targetW } as Parameters<typeof obj.set>[0]);
    anyObj._sacredWidth = targetW;
  }
  if (typeof sh === 'number' && Number.isFinite(sh)) {
    const curH = Number((obj as any).height ?? 0);
    if (Math.abs(curH - sh) > epsD) {
      if (isTextPositionDebugEnabled()) console.log(`[TEXT-POS] LOCK height ${id} ${(obj as any).height} -> ${sh}`);
      changed = true;
    }
    obj.set({ height: sh } as any);
  }
  if (typeof sl === 'number') {
    if (obj.left !== sl) {
      if (isTextPositionDebugEnabled()) console.log(`[TEXT-POS] LOCK left ${id} ${obj.left} -> ${sl}`);
      changed = true;
    }
    obj.set({ left: sl });
  }
  if (typeof st === 'number') {
    if (obj.top !== st) {
      if (isTextPositionDebugEnabled()) console.log(`[TEXT-POS] LOCK top ${id} ${obj.top} -> ${st}`);
      changed = true;
    }
    obj.set({ top: st });
  }
  obj.setCoords?.();
  if (!shouldSkipInitDimensionsForTemplateText(obj)) {
    try { (obj as any).initDimensions?.(); } catch {}
  }
  // Re-assert after layout to make absolutely sure multi-line wrap and position stick.
  if (typeof sw === 'number' && Number.isFinite(sw)) {
    obj.set({ width: sw, textFieldLayoutWidth: sw } as Parameters<typeof obj.set>[0]);
  }
  if (typeof sl === 'number') obj.set({ left: sl });
  if (typeof st === 'number') obj.set({ top: st });
  if (typeof sa === 'number') obj.set({ angle: sa });
  if (changed) {
    obj.setCoords?.();
  }
  if (isTextPositionDebugEnabled()) {
    console.log(`[TEXT-POS] RESTORE-APPLIED id=${id} left=${obj.left} top=${obj.top} w=${obj.width} angle=${obj.angle ?? 0} (sacredA=${sa} sacredW=${sw})`);
  }
}

export function migrateAndHydrateTextObject(
  obj: FabricObject,
  options?: { preserveLayout?: boolean },
): void {
  if (!isFabricTextObjectType(obj.type)) return;
  const textObj = obj as TextLikeObject;
  const id = String(textObj.id ?? '');
  const isTemplateText = isTemplateTextLayerId(id);
  if (isTemplateText && isTextPositionDebugEnabled()) {
    console.log(`[TEXT-POS] migrate start id=${id} left=${textObj.left} top=${textObj.top} w=${textObj.width} angle=${textObj.angle ?? 0} originX=${textObj.originX}`);
  }

  // client_png / order export: не трогаем left/top/width — только материализуем styles для глифов.
  if (options?.preserveLayout) {
    hydrateTextObjectStyles(textObj);
    textObj.setCoords?.();
    if (isTemplateText && isTextPositionDebugEnabled()) {
      console.log(`[TEXT-POS] migrate end (preserve) id=${id} left=${textObj.left} top=${textObj.top} w=${textObj.width}`);
    }
    return;
  }

  if (isDesignedTemplateText(textObj)) {
    // SVG import often has textStyleRuns without Fabric styles map — materialize on load,
    // otherwise fonts/colors only appear after click (prepareTextStylesForEditing).
    hydrateTextObjectStyles(textObj);
    if (textObj.type === 'textbox') {
      if (textObj.textFieldUserEdited === true) {
        tightenDraftTextboxWidthOnLoad(textObj);
        stabilizeDesignedTextboxWidthFromContent(textObj);
        captureDesignedTextboxLayoutFloor(textObj);
        ensureDesignedTextboxLayoutFloor(textObj);
        captureSacredTemplateTextGeometry(textObj, { overwrite: true });
      } else {
        // Soft-load authored template text: keep left/top/width from fabricJSON / sacred.
        captureDesignedTextboxLayoutFloor(textObj);
        captureSacredTemplateTextGeometry(textObj, { overwrite: false });
      }
    } else {
      captureSacredTemplateTextGeometry(textObj, {
        overwrite: textObj.textFieldUserEdited === true,
      });
    }
    textObj.setCoords?.();
    restoreSacredPosition(textObj);
    if (isTemplateText && isTextPositionDebugEnabled()) {
      const tag = textObj.textFieldUserEdited ? 'designed-edited' : 'designed-soft';
      console.log(`[TEXT-POS] migrate end (${tag}) id=${id} left=${textObj.left} top=${textObj.top} w=${textObj.width} angle=${textObj.angle ?? 0}`);
    }
    return;
  }

  captureSacredPositionIfNeeded(textObj);
  hydrateTextObjectStyles(textObj);
  tightenDraftTextboxWidthOnLoad(textObj);
  normalizeImportedSingleLineTextboxWidth(textObj);
  restoreSacredPosition(textObj);
  if (isTemplateText && isTextPositionDebugEnabled()) {
    console.log(`[TEXT-POS] migrate end   id=${id} left=${textObj.left} top=${textObj.top} w=${textObj.width} angle=${textObj.angle ?? 0}`);
  }
}

export function prepareTextObjectsOnCanvas(
  objects: FabricObject[],
  options?: { preserveLayout?: boolean },
): void {
  for (const obj of objects) {
    migrateAndHydrateTextObject(obj, options);
    const group = obj as { getObjects?: () => FabricObject[] };
    if (typeof group.getObjects === 'function') {
      prepareTextObjectsOnCanvas(group.getObjects(), options);
    }
  }
}

/**
 * Пересчитать ширину textbox после document.fonts.
 * Для designed: hydrate только материализует runs→styles если styles пустой (не затирает оформление).
 */
export function remeasureTextObjectsAfterFontLoad(objects: FabricObject[]): void {
  for (const obj of objects) {
    if (isFabricTextObjectType(obj.type)) {
      const textObj = obj as TextLikeObject;
      if (isDesignedTemplateText(textObj)) {
        hydrateTextObjectStyles(textObj);
        if (textObj.type === 'textbox') {
          if (textObj.textFieldUserEdited !== true && hasTrustedTextMetrics(textObj)) {
            tightenDraftTextboxWidthOnLoad(textObj);
          }
          stabilizeDesignedTextboxWidthFromContent(textObj);
          captureSacredTemplateTextGeometry(textObj, { overwrite: true });
        }
      } else {
        textObj.initDimensions?.();
        normalizeImportedSingleLineTextboxWidth(textObj);
      }
      textObj.setCoords?.();
    }
    const group = obj as { getObjects?: () => FabricObject[] };
    if (typeof group.getObjects === 'function') {
      remeasureTextObjectsAfterFontLoad(group.getObjects());
    }
  }
}

export function restoreDesignedTextLayoutsAfterCanvasLoad(
  canvas: Canvas,
  fabricJson: Record<string, unknown>,
): void {
  const layoutSnapshots = extractDesignedTextLayoutsFromFabricJson(fabricJson);
  canvas.getObjects().forEach((o) => {
    if (!isFabricTextObjectType(o.type)) return;
    const textObj = o as TextLikeObject;
    if (!isDesignedTemplateText(textObj)) return;
    const id = String(textObj.id ?? '');
    const snap = layoutSnapshots.get(id);
    if (snap) applyDesignedTextLayoutSnapshot(textObj, snap);
    if (textObj.type === 'textbox') {
      tightenDraftTextboxWidthOnLoad(textObj);
      stabilizeDesignedTextboxWidthFromContent(textObj);
    }
    captureSacredTemplateTextGeometry(textObj, { overwrite: true, jsonSnapshot: snap });
  });
}

/** Обновить sacred-геометрию одного текстового объекта (без обхода всего canvas). */
export function lockSacredTextPositionForObject(obj: FabricObject): void {
  if (!isFabricTextObjectType(obj.type)) return;
  const t = obj as TextLikeObject;
  if (shouldPreserveDesignedTemplateGeometry(t)) {
    if (t.type === 'textbox') {
      ensureDesignedTextboxLayoutFloor(t);
    }
    syncSacredTemplateTextPositionFromObject(t);
    restoreSacredPosition(t);
  } else {
    forceTemplateOriginLeft(t);
    forceTemplateOriginTop(t);
    captureSacredPositionIfNeeded(t);
    restoreSacredPosition(t);
  }
}

/** Завершить inline-edit и зафиксировать ширину перед сериализацией страницы (flip/save). */
export function finalizeCanvasTextEditingBeforeSave(
  canvas: Canvas,
  options?: {
    preserveActiveEditing?: boolean;
    movedTextObject?: FabricObject;
    /** Order/export: не пересчитывать ширину text_* — только exitEditing + lock sacred. */
    preserveLayout?: boolean;
  },
): void {
  if (options?.preserveActiveEditing && isAnyTextObjectEditingOnCanvas(canvas)) {
    return;
  }
  if (options?.movedTextObject && isFabricTextObjectType(options.movedTextObject.type)) {
    const text = options.movedTextObject as TextLikeObject & { isEditing?: boolean; exitEditing?: () => void };
    if (text.isEditing && typeof text.exitEditing === 'function') {
      text.exitEditing();
    }
    lockSacredTextPositionForObject(options.movedTextObject);
    return;
  }
  const visit = (objects: FabricObject[]) => {
    for (const obj of objects) {
      if (isFabricTextObjectType(obj.type)) {
        const text = obj as TextLikeObject & { isEditing?: boolean; exitEditing?: () => void };
        if (text.isEditing && typeof text.exitEditing === 'function') {
          text.exitEditing();
        }
      }
      const group = obj as { getObjects?: () => FabricObject[] };
      if (typeof group.getObjects === 'function') {
        visit(group.getObjects());
      }
    }
  };
  visit(canvas.getObjects());
  if (!options?.preserveLayout) {
    stabilizeAllTextboxWidthsOnCanvas(canvas);
  }
  lockSacredTextPositions(canvas);
}

export function lockSacredTextPositions(canvas: Canvas): void {
  if (isTextPositionDebugEnabled()) {
    const textCount = canvas.getObjects().filter((o: any) => isTemplateTextLayerId(o.id)).length;
    if (textCount > 0) console.log(`[TEXT-POS] lockSacredTextPositions start, text_* count=${textCount}`);
  }
  const objs = canvas.getObjects();
  for (const obj of objs) {
    if (!isFabricTextObjectType(obj.type)) continue;
    const t = obj as TextLikeObject;
    if (shouldPreserveDesignedTemplateGeometry(t)) {
      if (t.type === 'textbox') {
        ensureDesignedTextboxLayoutFloor(t);
      }
      syncSacredTemplateTextPositionFromObject(t);
      restoreSacredPosition(t);
    } else {
      forceTemplateOriginLeft(t);
      forceTemplateOriginTop(t);
      captureSacredPositionIfNeeded(t);
      restoreSacredPosition(t);
    }
    const group = obj as { getObjects?: () => FabricObject[] };
    if (typeof group.getObjects === 'function') {
      for (const child of group.getObjects()) {
        if (isFabricTextObjectType(child.type)) {
          const ct = child as TextLikeObject;
          if (shouldPreserveDesignedTemplateGeometry(ct)) {
            if (ct.type === 'textbox') {
              ensureDesignedTextboxLayoutFloor(ct);
            }
            syncSacredTemplateTextPositionFromObject(ct);
            restoreSacredPosition(ct);
          } else {
            forceTemplateOriginLeft(ct);
            forceTemplateOriginTop(ct);
            captureSacredPositionIfNeeded(ct);
            restoreSacredPosition(ct);
          }
        }
      }
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
  const before = textBefore ?? '';
  const textChanged = textBefore != null && textBefore !== textAfter;
  const widthBefore = Number(obj.width ?? 0);

  logTextWidthDebug('finish-edit:start', obj, { textChanged, widthBefore, textBeforeLen: before.length, textAfterLen: textAfter.length });

  if (textChanged) {
    markTextFieldUserEdited(obj);
    obj.textStyleRuns = reconcileRunsAfterTextChange(
      before,
      textAfter,
      obj.textStyleRuns,
    );
  } else if (textBefore == null && textAfter && isDesignedTemplateText(obj)) {
    captureDesignedTextboxLayoutFloor(obj);
  }

  hydrateTextObjectStyles(obj);
  logTextWidthDebug('finish-edit:after-hydrate', obj, { textChanged, skipContentMeasure: false });

  const becameMultiline = textChanged
    && !before.replace(/\u200b/g, '').includes('\n')
    && textAfter.replace(/\u200b/g, '').includes('\n');

  if (isDesignedTemplateText(obj) && obj.type === 'textbox') {
    const intentionalNarrowUnchanged = (() => {
      if (textChanged || obj.textFieldUserEdited === true) return false;
      if (!isDesignedSingleLineTextbox(obj)) return false;
      const contentW = measureStableTextboxContentWidth(obj);
      const currentW = Number(obj.width ?? 0);
      return currentW + 8 < contentW;
    })();

    if (becameMultiline) {
      resetDesignedMultilineWidthAfterSingleLineTransition(obj);
    }

    if (isDesignedSingleLineTextbox(obj) && !intentionalNarrowUnchanged) {
      logTextWidthDebug('finish-edit:finalize-single-line', obj, { intentionalNarrowUnchanged, skipContentMeasure: false });
      finalizeDesignedSingleLineTextboxWidth(obj);
    } else if (textChanged && isDesignedMultilineTextbox(obj)) {
      logTextWidthDebug('finish-edit:finalize-multiline', obj, { intentionalNarrowUnchanged, skipContentMeasure: false });
      finalizeDesignedMultilineTextboxWidth(obj);
    } else if (textChanged) {
      logTextWidthDebug('finish-edit:branch-changed-multiline-or-narrow', obj, { intentionalNarrowUnchanged, skipContentMeasure: false });
      captureDesignedTextboxLayoutFloor(obj);
      syncEditedDesignedTextLayoutWidthFromContent(obj);
      ensureDesignedTextboxLayoutFloor(obj);
    } else {
      logTextWidthDebug('finish-edit:branch-unchanged', obj, { intentionalNarrowUnchanged, skipContentMeasure: false });
      if (isDesignedMultilineTextbox(obj)) {
        finalizeDesignedMultilineTextboxWidth(obj);
      } else {
        captureDesignedTextboxLayoutFloor(obj);
        ensureDesignedTextboxLayoutFloor(obj);
      }
    }
    if (textChanged) {
      refreshSacredGeometryAfterUserEdit(obj);
    }
    restoreSacredPosition(obj);
  } else if (obj.textFieldClientAdded === true && obj.type === 'textbox') {
    preserveClientTextboxLayoutWidth(obj);
  } else if (textChanged) {
    expandTextboxWidthForEditedContent(obj, before);
    ensureTextboxWidthFitsContent(obj);
  } else {
    ensureTextboxWidthFitsContent(obj);
  }

  if (isDesignedTemplateText(obj) && obj.type === 'textbox') {
    delete (obj as unknown as Record<string, unknown>)._editSessionLayoutWidth;
  }

  logTextWidthDebug('finish-edit:end', obj, {
    textChanged,
    widthBefore,
    widthAfter: Number(obj.width ?? 0),
    skipContentMeasure: false,
  });
}
