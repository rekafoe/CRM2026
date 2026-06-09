import { useEffect, useMemo, useState } from 'react';
import { getDesignFonts, getPublicDesignFonts, type DesignFont } from '../api';
import type { FontCatalogEntry } from '../pages/admin/designEditor/fontsCatalog';
import { loadDesignFontFromLibrary } from '../utils/loadDesignFonts';
import { fontFamilyCompactKey } from '../utils/fontFamilyNormalize';

let fontsCache: DesignFont[] | null = null;
let fontsCachePromise: Promise<DesignFont[]> | null = null;

async function loadCrmFontsList(): Promise<DesignFont[]> {
  if (fontsCache) return fontsCache;
  if (!fontsCachePromise) {
    fontsCachePromise = (async () => {
      try {
        const res = await getDesignFonts();
        return (Array.isArray(res.data) ? res.data : []).filter((f) => f.is_active);
      } catch {
        try {
          const res = await getPublicDesignFonts();
          return Array.isArray(res.data) ? res.data : [];
        } catch {
          return [];
        }
      }
    })();
  }
  fontsCache = await fontsCachePromise;
  return fontsCache;
}

export function invalidateCrmDesignFontsCache(): void {
  fontsCache = null;
  fontsCachePromise = null;
}

export function mergeFontSelectOptions(
  base: Array<{ value: string; label: string }>,
  crm: Array<{ value: string; label: string }>,
): Array<{ value: string; label: string }> {
  const seen = new Set(base.map((f) => fontFamilyCompactKey(f.value)));
  const extra = crm.filter((f) => !seen.has(fontFamilyCompactKey(f.value)));
  return [...extra, ...base];
}

export function useCrmDesignFonts() {
  const [fonts, setFonts] = useState<DesignFont[]>(fontsCache ?? []);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await loadCrmFontsList();
      if (cancelled) return;
      setFonts(list);
      for (const font of list) {
        await loadDesignFontFromLibrary(font);
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const catalogEntries = useMemo((): FontCatalogEntry[] => (
    fonts.map((font) => ({
      value: font.family_name,
      label: font.label || font.family_name,
      category: 'display' as const,
      cyrillic: true,
    }))
  ), [fonts]);

  const selectOptions = useMemo(
    () => catalogEntries.map((f) => ({ value: f.value, label: f.label })),
    [catalogEntries],
  );

  return { fonts, catalogEntries, selectOptions, ready };
}
