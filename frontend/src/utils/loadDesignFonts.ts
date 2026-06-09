import { collectFontNameAliases, readFontMetadataFromBuffer } from './fontFileMetadata';
import { fontFamilyCompactKey, normalizeFontFamilyName } from './fontFamilyNormalize';

export type RequiredFontSpecEntry = {
  family: string;
  source?: 'global' | 'bundled' | 'missing';
  url?: string;
  format?: string;
  fontId?: number;
  name_aliases?: string[];
};

export type CrmLibraryFont = {
  id: number;
  family_name: string;
  name_aliases?: string[];
  url?: string;
  format?: string;
};

/** Сопоставление family из макета с записью библиотеки CRM (family_name + алиасы). */
export function findCrmFontByFamily(
  family: string,
  libraryFonts: CrmLibraryFont[],
): CrmLibraryFont | undefined {
  const key = fontFamilyCompactKey(family);
  if (!key) return undefined;
  return libraryFonts.find((font) => {
    const names = [font.family_name, ...(font.name_aliases ?? [])];
    return names.some((name) => fontFamilyCompactKey(name) === key);
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

function isFontFamilyLoaded(family: string): boolean {
  try {
    const escaped = family.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return document.fonts.check(`16px "${escaped}"`);
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

async function loadFontFace(
  family: string,
  src: string,
  format?: string,
  fontId?: number,
): Promise<void> {
  const descriptors = [
    `url(${JSON.stringify(src)}) format('${cssFontFormat(format)}')`,
    `url(${JSON.stringify(src)})`,
  ];
  let lastError: unknown;
  for (const descriptor of descriptors) {
    try {
      const face = new FontFace(family, descriptor);
      const loaded = await withTimeout(face.load(), FONT_LOAD_TIMEOUT_MS);
      if (!loaded) throw new Error('Font load timeout');
      document.fonts.add(face);
      markFontRegistered(family, fontId);
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
): Promise<boolean> {
  try {
    await loadFontFace(family, src, format, fontId);
    return true;
  } catch {
    return false;
  }
}

async function fetchFontBlob(path: string): Promise<Blob> {
  const { api } = await import('../api');
  const res = await api.get(path, { responseType: 'blob' });
  return res.data as Blob;
}

async function fetchFontBlobUrl(path: string): Promise<string> {
  const blob = await fetchFontBlob(path);
  const blobUrl = URL.createObjectURL(blob);
  retainedFontBlobUrls.add(blobUrl);
  return blobUrl;
}

async function loadFontFaceAliases(
  families: string[],
  blobUrl: string,
  format?: string,
  fontId?: number,
): Promise<boolean> {
  const unique = [...new Set(families.map((name) => name.trim()).filter(Boolean))];
  let anyOk = false;
  for (const familyName of unique) {
    const ok = await loadFontFaceFromSource(familyName, blobUrl, format, fontId);
    if (ok) anyOk = true;
  }
  return anyOk;
}

function collectFontRegistrationNames(
  family: string,
  nameAliases: string[] | undefined,
  blob: Blob,
): Promise<string[]> {
  return blob.arrayBuffer().then((buffer) => {
    const detected = collectFontNameAliases(readFontMetadataFromBuffer(buffer));
    return [...new Set([family, ...(nameAliases ?? []), ...detected].map((n) => n.trim()).filter(Boolean))];
  });
}

async function fetchLibraryFontBlobUrl(fontId: number): Promise<string> {
  return fetchFontBlobUrl(`/design-fonts/public/${fontId}/content`);
}

async function fetchAdminFontBlobUrl(fontId: number): Promise<string> {
  return fetchFontBlobUrl(`/design-fonts/${fontId}/content`);
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
      blobUrl = await fetchAdminFontBlobUrl(font.id);
      previewFontBlobCache.set(cacheKey, blobUrl);
    }
    const css = buildDesignFontPreviewCss(font, previewFamily, blobUrl);
    await loadFontFace(previewFamily, blobUrl, font.format);
    await document.fonts.load(`22px "${escapeCssString(previewFamily)}"`);
    await document.fonts.ready;
    const ok = document.fonts.check(`22px "${escapeCssString(previewFamily)}"`);
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
}): Promise<boolean> {
  const family = font.family_name?.trim();
  if (!family) return false;
  if (font.id && registeredFontIds.has(font.id) && isFontFamilyLoaded(family)) return true;
  if (!font.id && isFontRegisteredAndReady(family)) return true;

  let ok = false;
  try {
    const blob = font.id
      ? await fetchFontBlob(`/design-fonts/${font.id}/content`).catch(() => fetchFontBlob(`/design-fonts/public/${font.id}/content`))
      : null;
    if (blob) {
      const names = await collectFontRegistrationNames(family, font.name_aliases, blob);
      const blobUrl = URL.createObjectURL(blob);
      retainedFontBlobUrls.add(blobUrl);
      ok = await loadFontFaceAliases(names, blobUrl, font.format, font.id);
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
    });
    if (ok) return true;
  }
  return isFontFamilyLoaded(name);
}

/** Догружает шрифты из fabricJSON страниц (после обновления библиотеки CRM). */
export async function loadDesignFontsFromPages(
  pages: Array<{ fabricJSON: Record<string, unknown> }>,
  libraryFonts: CrmLibraryFont[],
): Promise<void> {
  const { extractUsedFontFamiliesFromPages } = await import(
    '../pages/admin/designEditor/patchFabricTextObjects'
  );
  const families = extractUsedFontFamiliesFromPages(pages);
  for (const family of families) {
    await ensureDesignFontLoaded(family, libraryFonts);
  }
  if (families.length > 0) notifyDesignFontsReady();
}

/** Загружает шрифты из spec.requiredFonts в document.fonts (перед отрисовкой Fabric). */
export async function loadDesignFontsFromSpec(
  spec: Record<string, unknown> | null | undefined,
): Promise<{ loaded: string[]; missing: string[] }> {
  const entries = Array.isArray(spec?.requiredFonts)
    ? spec!.requiredFonts as RequiredFontSpecEntry[]
    : [];
  const loaded: string[] = [];
  const missing: string[] = [];

  for (const entry of entries) {
    const family = entry?.family?.trim();
    if (!family) continue;
    if (entry.source === 'missing' || !entry.url) {
      missing.push(family);
      continue;
    }
    if (isFontRegisteredAndReady(family)) {
      loaded.push(family);
      continue;
    }

    let ok = false;
    if (entry.source === 'global' && entry.fontId) {
      ok = await loadDesignFontFromLibrary({
        id: entry.fontId,
        family_name: family,
        name_aliases: entry.name_aliases,
        url: entry.url,
        format: entry.format,
      });
    }
    if (!ok && entry.url) {
      const src = resolveFontAssetUrl(entry.url);
      ok = await loadFontFaceFromSource(family, src, entry.format, entry.fontId);
    }

    if (ok) loaded.push(family);
    else missing.push(family);
  }

  if (loaded.length > 0) notifyDesignFontsReady();
  return { loaded, missing };
}
