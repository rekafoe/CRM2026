export type RequiredFontSpecEntry = {
  family: string;
  source?: 'global' | 'bundled' | 'missing';
  url?: string;
  format?: string;
};

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

/** Одна запись из библиотеки CRM (design_fonts). */
export async function loadDesignFontFromLibrary(font: {
  family_name: string;
  url: string;
  format?: string;
}): Promise<boolean> {
  const family = font.family_name?.trim();
  if (!family || !font.url) return false;
  try {
    const src = resolveFontAssetUrl(font.url);
    const face = new FontFace(
      family,
      `url(${src}) format('${cssFontFormat(font.format)}')`,
    );
    await face.load();
    document.fonts.add(face);
    return true;
  } catch {
    return false;
  }
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
    try {
      const src = resolveFontAssetUrl(entry.url);
      const face = new FontFace(
        family,
        `url(${src}) format('${cssFontFormat(entry.format)}')`,
      );
      await face.load();
      document.fonts.add(face);
      loaded.push(family);
    } catch {
      missing.push(family);
    }
  }

  if (loaded.length > 0) {
    await document.fonts.ready;
  }

  return { loaded, missing };
}
