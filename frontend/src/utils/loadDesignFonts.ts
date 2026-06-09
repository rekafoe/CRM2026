export type RequiredFontSpecEntry = {
  family: string;
  source?: 'global' | 'bundled' | 'missing';
  url?: string;
  format?: string;
  fontId?: number;
};

const FONT_LOAD_TIMEOUT_MS = 8000;

/** Blob URL держим в памяти — revoke ломает FontFace. */
const retainedFontBlobUrls = new Set<string>();

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

async function loadFontFace(family: string, src: string, format?: string): Promise<void> {
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
): Promise<boolean> {
  try {
    await loadFontFace(family, src, format);
    return true;
  } catch {
    return false;
  }
}

async function fetchLibraryFontBlobUrl(fontId: number): Promise<string> {
  const { api } = await import('../api');
  const res = await api.get(`/design-fonts/public/${fontId}/content`, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(res.data as Blob);
  retainedFontBlobUrls.add(blobUrl);
  return blobUrl;
}

/** Одна запись из библиотеки CRM — для превью в админке (обходит CORS через API). */
export async function loadDesignFontFromLibrary(font: {
  id?: number;
  family_name: string;
  url?: string;
  format?: string;
}): Promise<boolean> {
  const family = font.family_name?.trim();
  if (!family) return false;
  if (isFontFamilyLoaded(family)) return true;

  if (font.id) {
    try {
      const blobUrl = await fetchLibraryFontBlobUrl(font.id);
      return await loadFontFaceFromSource(family, blobUrl, font.format);
    } catch {
      return false;
    }
  }

  if (!font.url) return false;
  const src = resolveFontAssetUrl(font.url);
  return loadFontFaceFromSource(family, src, font.format);
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
    if (isFontFamilyLoaded(family)) {
      loaded.push(family);
      continue;
    }
    const src = resolveFontAssetUrl(entry.url);
    const ok = await loadFontFaceFromSource(family, src, entry.format);
    if (ok) loaded.push(family);
    else missing.push(family);
  }

  return { loaded, missing };
}
