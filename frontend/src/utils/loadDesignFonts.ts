import { API_BASE_URL } from '../config/constants';
import { APP_CONFIG } from '../types';
import {
  collectFontNameAliases,
  cssFontWeightToken,
  linkedFontPropsFromStored,
  readFontFaceVariant,
  readFontMetadataFromBuffer,
  type FontFaceVariant,
} from './fontFileMetadata';
import { fontFamilyCompactKey, fontFamilyBaseCompactKey, fontFamilyLooseMatchName, normalizeFontFamilyName } from './fontFamilyNormalize';

export type RequiredFontSpecEntry = {
  family: string;
  source?: 'global' | 'bundled' | 'missing';
  url?: string;
  format?: string;
  fontId?: number;
  name_aliases?: string[];
  weight?: string;
  style?: string;
};

export type CrmLibraryFont = {
  id: number;
  family_name: string;
  name_aliases?: string[];
  url?: string;
  format?: string;
  weight?: string;
  style?: string;
};

/** Сопоставление family из макета с записью библиотеки CRM (family_name + алиасы). */
export function findCrmFontByFamily(
  family: string,
  libraryFonts: CrmLibraryFont[],
): CrmLibraryFont | undefined {
  const keys = [fontFamilyCompactKey(family), fontFamilyBaseCompactKey(family)].filter(Boolean);
  if (keys.length === 0) return undefined;
  return libraryFonts.find((font) => {
    const names = [font.family_name, ...(font.name_aliases ?? [])];
    return names.some((name) => {
      const nameKeys = [fontFamilyCompactKey(name), fontFamilyBaseCompactKey(name)].filter(Boolean);
      return keys.some((key) => nameKeys.includes(key));
    });
  });
}

const FONT_LOAD_TIMEOUT_MS = 8000;

type FontReadyListener = () => void;
const fontReadyListeners = new Set<FontReadyListener>();

/** CRM / spec догрузили шрифты — подписчики перерисовывают Fabric-текст. */
export function onDesignFontsReady(listener: FontReadyListener): () => void {
  fontReadyListeners.add(listener);
  return () => fontReadyListeners.delete(listener);
}

function notifyDesignFontsReady(): void {
  for (const listener of fontReadyListeners) listener();
}

const registeredFontIds = new Set<number>();
const registeredFamilyKeys = new Set<string>();
const loadedVariantByKey = new Map<string, FontFaceVariant>();

export function rememberFontVariant(family: string, variant: FontFaceVariant): void {
  for (const key of [fontFamilyCompactKey(family), fontFamilyBaseCompactKey(family)]) {
    if (key) loadedVariantByKey.set(key, variant);
  }
}

/** Начертание уже загруженного файла. null — обычный regular, его не переписываем. */
export function linkedFontProps(family: string): { fontWeight: string; fontStyle: string } | null {
  const variant = loadedVariantByKey.get(fontFamilyCompactKey(family))
    ?? loadedVariantByKey.get(fontFamilyBaseCompactKey(family));
  if (!variant) return null;
  return linkedFontPropsFromStored(variant.weight, variant.style);
}

function variantAlreadyApplied(
  weight: unknown,
  style: unknown,
  linked: { fontWeight: string; fontStyle: string },
): boolean {
  const currentStyle = style === 'italic' || style === 'oblique' ? 'italic' : 'normal';
  return cssFontWeightToken(weight ?? '400') === linked.fontWeight && currentStyle === linked.fontStyle;
}

type FontVariantTarget = {
  fontFamily?: unknown;
  fontWeight?: unknown;
  fontStyle?: unknown;
  fontVariantPinned?: unknown;
  styles?: unknown;
  textStyleRuns?: unknown;
  set?: (props: Record<string, unknown>) => void;
};

function applyLinkedVariant(record: Record<string, unknown>, family: string, explicit: boolean): void {
  const linked = linkedFontProps(family);
  if (!linked || !explicit) return;
  if (variantAlreadyApplied(record.fontWeight, record.fontStyle, linked)) return;
  record.fontWeight = linked.fontWeight;
  record.fontStyle = linked.fontStyle;
}

/** Ставит тексту вес и стиль файла, иначе браузер рисует другое начертание при верном имени. */
export function alignTextObjectFontVariant(obj: FontVariantTarget): void {
  if (obj.fontVariantPinned === true) return;
  const family = typeof obj.fontFamily === 'string' ? obj.fontFamily.trim() : '';
  if (family) {
    const linked = linkedFontProps(family);
    if (linked && !variantAlreadyApplied(obj.fontWeight, obj.fontStyle, linked)) {
      if (typeof obj.set === 'function') obj.set({ fontWeight: linked.fontWeight, fontStyle: linked.fontStyle });
      else {
        obj.fontWeight = linked.fontWeight;
        obj.fontStyle = linked.fontStyle;
      }
    }
  }
  const runs = obj.textStyleRuns;
  if (Array.isArray(runs)) {
    for (const run of runs) {
      if (!run || typeof run !== 'object') continue;
      const rec = run as Record<string, unknown>;
      const runFamily = typeof rec.fontFamily === 'string' && rec.fontFamily.trim()
        ? rec.fontFamily.trim()
        : family;
      applyLinkedVariant(rec, runFamily, rec.fontWeight != null || rec.fontStyle != null || Boolean(rec.fontFamily));
    }
  }
  const styles = obj.styles;
  if (!styles || typeof styles !== 'object' || Array.isArray(styles)) return;
  for (const line of Object.values(styles as Record<string, unknown>)) {
    if (!line || typeof line !== 'object' || Array.isArray(line)) continue;
    for (const style of Object.values(line as Record<string, unknown>)) {
      if (!style || typeof style !== 'object' || Array.isArray(style)) continue;
      const rec = style as Record<string, unknown>;
      const styleFamily = typeof rec.fontFamily === 'string' && rec.fontFamily.trim()
        ? rec.fontFamily.trim()
        : family;
      applyLinkedVariant(rec, styleFamily, rec.fontWeight != null || rec.fontStyle != null || Boolean(rec.fontFamily));
    }
  }
}

function markFontRegistered(family: string, fontId?: number): void {
  const key = fontFamilyCompactKey(family);
  if (key) registeredFamilyKeys.add(key);
  if (fontId) registeredFontIds.add(fontId);
}

function isFontRegisteredAndReady(family: string): boolean {
  const key = fontFamilyCompactKey(family);
  if (!key || !registeredFamilyKeys.has(key)) return false;
  return isFontFamilyLoaded(family);
}
/** Blob URL держим в памяти — revoke ломает FontFace / @font-face. */
const retainedFontBlobUrls = new Set<string>();

/** Кэш blob для превью в админке (ключ: id + updated_at). */
const previewFontBlobCache = new Map<string, string>();

function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Уникальное имя для превью — не пересекается с family_name в редакторе и другими карточками. */
export function getDesignFontPreviewFamily(id: number, updatedAt?: string): string {
  const stamp = (updatedAt ?? '').replace(/\D/g, '').slice(-12) || '0';
  return `CRMFontPreview${id}x${stamp}`;
}

function resolveFontAssetUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
  const origin = apiBase.replace(/\/api\/?$/, '') || window.location.origin;
  if (url.startsWith('/api/')) return `${origin}${url}`;
  if (url.startsWith('/')) return `${origin}/api${url}`;
  return url;
}

function cssFontFormat(format?: string): string {
  switch ((format ?? '').toLowerCase()) {
    case 'woff2': return 'woff2';
    case 'woff': return 'woff';
    case 'otf': return 'opentype';
    case 'ttf': return 'truetype';
    default: return 'woff2';
  }
}

function normalizeFaceFamily(family: string): string {
  return family.replace(/^['"]+|['"]+$/g, '').trim().toLowerCase();
}

/** FontFace, который мы сами добавили и дождались. */
function hasLoadedFontFace(family: string): boolean {
  if (typeof document === 'undefined' || !document.fonts) return false;
  const target = normalizeFaceFamily(family);
  if (!target) return false;
  for (const face of document.fonts) {
    if (face.status !== 'loaded') continue;
    if (normalizeFaceFamily(face.family) === target) return true;
  }
  return false;
}

/**
 * Системный шрифт меняет ширину строки хотя бы против одного из двух запасных.
 * Неизвестное имя даёт ту же ширину, что и запасной.
 */
function fontFamilyChangesMetrics(family: string): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const sample = 'АаБбWwMmlli 0123';
  const width = (stack: string) => {
    ctx.font = `72px ${stack}`;
    return ctx.measureText(sample).width;
  };
  const quoted = `"${family.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  return width(`${quoted}, monospace`) !== width('monospace')
    || width(`${quoted}, sans-serif`) !== width('sans-serif');
}

/**
 * document.fonts.check() в Chrome отвечает true и для семьи, которой в документе нет.
 * Считаем шрифт готовым, только если загружен его FontFace или это настоящий системный шрифт.
 */
function isFontFamilyLoaded(family: string): boolean {
  if (hasLoadedFontFace(family)) return true;
  try {
    return fontFamilyChangesMetrics(family);
  } catch {
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => { setTimeout(() => resolve(null), ms); }),
  ]);
}

function fontFaceInits(
  variant?: FontFaceVariant | null,
  stretch = false,
): Array<{ weight: string; style: string }> {
  if (stretch) {
    return [
      { weight: '100 900', style: 'normal' },
      { weight: '100 900', style: 'italic' },
    ];
  }
  const weight = variant?.weight ?? '400';
  const style = variant?.style ?? 'normal';
  if (weight === '400' && style === 'normal') return [{ weight: '400', style: 'normal' }];
  const faces = [
    { weight, style },
    { weight: '100 900', style },
  ];
  if (style === 'italic') faces.push({ weight: '100 900', style: 'normal' });
  return faces;
}

async function loadFontFace(
  family: string,
  src: string,
  format?: string,
  fontId?: number,
  variant?: FontFaceVariant | null,
  stretch = false,
): Promise<void> {
  const descriptors = [
    `url(${JSON.stringify(src)}) format('${cssFontFormat(format)}')`,
    `url(${JSON.stringify(src)})`,
  ];
  let lastError: unknown;
  for (const descriptor of descriptors) {
    try {
      const faces = fontFaceInits(variant, stretch).map((init) => new FontFace(family, descriptor, init));
      const loaded = await Promise.all(faces.map((face) => withTimeout(face.load(), FONT_LOAD_TIMEOUT_MS)));
      if (loaded.some((face) => !face)) throw new Error('Font load timeout');
      for (const face of loaded) {
        if (face) document.fonts.add(face);
      }
      markFontRegistered(family, fontId);
      if (variant) rememberFontVariant(family, variant);
      return;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function loadFontFaceFromSource(
  family: string,
  src: string,
  format?: string,
  fontId?: number,
  variant?: FontFaceVariant | null,
): Promise<boolean> {
  try {
    await loadFontFace(family, src, format, fontId, variant);
    return true;
  } catch {
    return false;
  }
}

function readAuthToken(): string | null {
  try {
    return localStorage.getItem(APP_CONFIG?.storage?.token || '') || localStorage.getItem('crmToken');
  } catch {
    return null;
  }
}

/** Бинарники через fetch: axios + gzip на sendFile давал ERR_CONTENT_DECODING_FAILED. */
async function fetchFontBlob(path: string): Promise<Blob> {
  const base = API_BASE_URL.replace(/\/$/, '');
  const rel = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${rel}`;
  const headers: HeadersInit = {};
  const token = readAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers, credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Font HTTP ${res.status}`);
  return res.blob();
}

async function fetchFontBlobById(fontId: number): Promise<Blob> {
  const hasAuth = Boolean(readAuthToken());
  const paths = hasAuth
    ? [`/design-fonts/${fontId}/content`, `/design-fonts/public/${fontId}/content`]
    : [`/design-fonts/public/${fontId}/content`, `/design-fonts/${fontId}/content`];
  let lastError: unknown;
  for (const path of paths) {
    try {
      return await fetchFontBlob(path);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error('Font fetch failed');
}

async function loadFontFaceAliases(
  families: string[],
  blobUrl: string,
  format?: string,
  fontId?: number,
  variant?: FontFaceVariant | null,
): Promise<boolean> {
  const unique = [...new Set(families.map((name) => name.trim()).filter(Boolean))];
  let anyOk = false;
  for (const familyName of unique) {
    const ok = await loadFontFaceFromSource(familyName, blobUrl, format, fontId, variant);
    if (ok) anyOk = true;
  }
  return anyOk;
}

function collectFontRegistrationNamesFromBuffer(
  family: string,
  nameAliases: string[] | undefined,
  buffer: ArrayBuffer,
): string[] {
  const detected = collectFontNameAliases(readFontMetadataFromBuffer(buffer));
  const names = [...new Set([family, ...(nameAliases ?? []), ...detected].map((n) => n.trim()).filter(Boolean))];
  for (const name of [...names]) {
    const loose = fontFamilyLooseMatchName(name);
    if (loose) names.push(loose);
  }
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))];
}

async function fetchFontBlobUrlById(fontId: number): Promise<string> {
  const blob = await fetchFontBlobById(fontId);
  const blobUrl = URL.createObjectURL(blob);
  retainedFontBlobUrls.add(blobUrl);
  return blobUrl;
}

export function buildDesignFontPreviewCss(
  font: { id: number; format?: string },
  previewFamily: string,
  blobUrl: string,
): string {
  const family = escapeCssString(previewFamily);
  const fmt = cssFontFormat(font.format);
  return (
    `@font-face{font-family:"${family}";src:url("${blobUrl}") format('${fmt}');font-display:block;}\n`
    + `.design-fonts-card--id-${font.id} .design-fonts-card__preview{`
    + `font-family:"${family}",sans-serif!important;`
    + `}`
  );
}

export type DesignFontPreviewResult = {
  ok: boolean;
  previewFamily: string;
  css: string;
};

/**
 * Превью в библиотеке шрифтов: отдельное имя на каждый файл, без ложного isFontFamilyLoaded
 * по family_name (коллизии и устаревший FontFace после замены файла).
 */
export async function loadDesignFontForPreview(font: {
  id: number;
  format?: string;
  updated_at?: string;
}): Promise<DesignFontPreviewResult> {
  const previewFamily = getDesignFontPreviewFamily(font.id, font.updated_at);
  const cacheKey = `${font.id}:${font.updated_at ?? ''}`;
  try {
    let blobUrl = previewFontBlobCache.get(cacheKey);
    if (!blobUrl) {
      blobUrl = await fetchFontBlobUrlById(font.id);
      previewFontBlobCache.set(cacheKey, blobUrl);
    }
    const css = buildDesignFontPreviewCss(font, previewFamily, blobUrl);
    await loadFontFace(previewFamily, blobUrl, font.format, undefined, null, true);
    await document.fonts.load(`22px "${escapeCssString(previewFamily)}"`);
    await document.fonts.ready;
    const ok = hasLoadedFontFace(previewFamily);
    return { ok, previewFamily, css };
  } catch {
    return { ok: false, previewFamily, css: '' };
  }
}

/** Одна запись из библиотеки CRM — для редактора и превью (blob через API). */
export async function loadDesignFontFromLibrary(font: {
  id?: number;
  family_name: string;
  name_aliases?: string[];
  url?: string;
  format?: string;
  weight?: string;
  style?: string;
}): Promise<boolean> {
  const family = font.family_name?.trim();
  if (!family) return false;
  if (font.id && registeredFontIds.has(font.id) && isFontFamilyLoaded(family)) return true;
  if (!font.id && isFontRegisteredAndReady(family)) return true;

  let ok = false;
  try {
    const blob = font.id ? await fetchFontBlobById(font.id) : null;
    if (blob) {
      const buffer = await blob.arrayBuffer();
      const fromFile = readFontFaceVariant(buffer);
      const stored = linkedFontPropsFromStored(font.weight, font.style);
      const variant = fromFile ?? (stored
        ? { weight: stored.fontWeight, style: stored.fontStyle as 'normal' | 'italic' }
        : null);
      const names = collectFontRegistrationNamesFromBuffer(family, font.name_aliases, buffer);
      if (variant) {
        for (const name of names) rememberFontVariant(name, variant);
      }
      const blobUrl = URL.createObjectURL(blob);
      retainedFontBlobUrls.add(blobUrl);
      ok = await loadFontFaceAliases(names, blobUrl, font.format, font.id, variant);
    }
  } catch {
    ok = false;
  }
  if (!ok && font.url) {
    const src = resolveFontAssetUrl(font.url);
    ok = await loadFontFaceFromSource(family, src, font.format, font.id);
  }
  if (ok) notifyDesignFontsReady();
  return ok;
}

/** Перед сменой шрифта в UI — дождаться FontFace (family_name как в макете). */
export async function ensureDesignFontLoaded(
  family: string,
  libraryFonts?: CrmLibraryFont[],
): Promise<boolean> {
  const name = normalizeFontFamilyName(family);
  if (!name) return false;
  if (isFontRegisteredAndReady(name)) return true;
  const match = libraryFonts ? findCrmFontByFamily(name, libraryFonts) : undefined;
  if (match) {
    const ok = await loadDesignFontFromLibrary({
      id: match.id,
      family_name: match.family_name,
      name_aliases: match.name_aliases,
      url: match.url,
      format: match.format,
      weight: match.weight,
      style: match.style,
    });
    if (ok) return true;
  }
  return isFontFamilyLoaded(name);
}

/** Догружает шрифты из fabricJSON страниц (после обновления библиотеки CRM). */
export async function loadDesignFontsFromPages(
  pages: Array<{ fabricJSON: Record<string, unknown> }>,
  libraryFonts: CrmLibraryFont[],
): Promise<string[]> {
  const { extractUsedFontFamiliesFromPages } = await import(
    '../pages/admin/designEditor/patchFabricTextObjects'
  );
  const families = extractUsedFontFamiliesFromPages(pages);
  const loaded: string[] = [];
  for (const family of families) {
    const ok = await ensureDesignFontLoaded(family, libraryFonts);
    if (ok) loaded.push(family);
  }
  if (loaded.length > 0) notifyDesignFontsReady();
  return loaded;
}

let editorLibraryFontsCache: CrmLibraryFont[] | null = null;

/** Список шрифтов CRM для редактора (admin или public API). */
export async function fetchCrmLibraryFontsForEditor(): Promise<CrmLibraryFont[]> {
  if (editorLibraryFontsCache) return editorLibraryFontsCache;
  try {
    const { getDesignFonts, getPublicDesignFonts } = await import('../api');
    try {
      const res = await getDesignFonts();
      editorLibraryFontsCache = (Array.isArray(res.data) ? res.data : [])
        .filter((font) => font.is_active)
        .map((font) => ({
          id: font.id,
          family_name: font.family_name,
          name_aliases: font.name_aliases,
          url: font.url,
          format: font.format,
          weight: font.weight,
          style: font.style,
        }));
    } catch {
      const res = await getPublicDesignFonts();
      editorLibraryFontsCache = (Array.isArray(res.data) ? res.data : []).map((font) => ({
        id: font.id,
        family_name: font.family_name,
        name_aliases: font.name_aliases,
        url: font.url,
        format: font.format,
        weight: font.weight,
        style: font.style,
      }));
    }
  } catch {
    editorLibraryFontsCache = [];
  }
  return editorLibraryFontsCache;
}

export function invalidateEditorLibraryFontsCache(): void {
  editorLibraryFontsCache = null;
}

/** Загружает шрифты из spec.requiredFonts в document.fonts (перед отрисовкой Fabric). */
export async function loadDesignFontsFromSpec(
  spec: Record<string, unknown> | null | undefined,
  libraryFonts?: CrmLibraryFont[],
): Promise<{ loaded: string[]; missing: string[] }> {
  const entries = Array.isArray(spec?.requiredFonts)
    ? spec!.requiredFonts as RequiredFontSpecEntry[]
    : [];
  const loaded: string[] = [];
  const missing: string[] = [];
  let libs = libraryFonts;

  for (const entry of entries) {
    const family = entry?.family?.trim();
    if (!family) continue;
    if (isFontRegisteredAndReady(family)) {
      loaded.push(family);
      continue;
    }

    let ok = false;
    const storedLinked = linkedFontPropsFromStored(entry.weight, entry.style);
    const entryVariant: FontFaceVariant | null = storedLinked
      ? { weight: storedLinked.fontWeight, style: storedLinked.fontStyle as 'normal' | 'italic' }
      : (entry.weight || entry.style)
        ? {
          weight: cssFontWeightToken(entry.weight ?? '400'),
          style: entry.style === 'italic' ? 'italic' : 'normal',
        }
        : null;
    if (entry.source !== 'missing' && entry.url) {
      if (entry.source === 'global' && entry.fontId) {
        ok = await loadDesignFontFromLibrary({
          id: entry.fontId,
          family_name: family,
          name_aliases: entry.name_aliases,
          url: entry.url,
          format: entry.format,
          weight: entry.weight,
          style: entry.style,
        });
      }
      if (!ok && entry.url) {
        const src = resolveFontAssetUrl(entry.url);
        const names = [family, ...(entry.name_aliases ?? [])].map((n) => n.trim()).filter(Boolean);
        ok = names.length > 1
          ? await loadFontFaceAliases(names, src, entry.format, entry.fontId, entryVariant)
          : await loadFontFaceFromSource(family, src, entry.format, entry.fontId, entryVariant);
      }
    }

    if (!ok) {
      if (!libs) libs = await fetchCrmLibraryFontsForEditor();
      ok = await ensureDesignFontLoaded(family, libs);
    }

    if (ok) loaded.push(family);
    else missing.push(family);
  }

  if (loaded.length > 0) notifyDesignFontsReady();
  return { loaded, missing };
}

/**
 * Полная загрузка шрифтов редактора: requiredFonts из spec + семейства из fabricJSON
 * через библиотеку CRM (актуально после ручного добавления шрифтов в админке).
 */
export async function loadDesignFontsForEditor(input: {
  spec?: Record<string, unknown> | null;
  pages?: Array<{ fabricJSON: Record<string, unknown> }>;
  libraryFonts?: CrmLibraryFont[];
}): Promise<{ loaded: string[]; missing: string[] }> {
  const libraryFonts = input.libraryFonts ?? await fetchCrmLibraryFontsForEditor();
  const specResult = await loadDesignFontsFromSpec(input.spec, libraryFonts);
  const pages = input.pages ?? [];
  if (pages.length > 0 && libraryFonts.length > 0) {
    const fromPages = await loadDesignFontsFromPages(pages, libraryFonts);
    for (const family of fromPages) {
      if (!specResult.loaded.includes(family)) specResult.loaded.push(family);
    }
  }

  const stillMissing: string[] = [];
  for (const family of specResult.missing) {
    const ok = await ensureDesignFontLoaded(family, libraryFonts);
    if (ok) {
      if (!specResult.loaded.includes(family)) specResult.loaded.push(family);
    } else {
      stillMissing.push(family);
    }
  }

  return { loaded: specResult.loaded, missing: stillMissing };
}
