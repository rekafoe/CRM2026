import { useEffect, useState } from 'react';
import { getPublicDesignTemplate, getPublicEditorBranding, type DesignTemplate } from '../../api';
import { EMPTY_PAGE, SAFE_ZONE_MM } from '../../pages/admin/designEditor/constants';
import { readDesignTemplateSpec, resolveDesignSceneScale } from '../../pages/admin/designEditor/designEditorState';
import type { DesignPage, DesignPrepressConfig } from '../../pages/admin/designEditor/types';
import type { PublicDesignEditorAdapter } from './publicDesignEditorAdapter';
import { ensureEvenInnerSpreadPages } from '../../pages/admin/designEditor/spreadUtils';
import type { PublicDesignDocumentMode } from './useDesignDocumentNavigation';
import type { PublicDesignPageSpec } from './usePublicDesignPageActions';
import { loadDesignFontsForEditor } from '../../utils/loadDesignFonts';

export const DEFAULT_PUBLIC_DESIGN_PREPRESS_CONFIG: DesignPrepressConfig = {
  bleedMm: 2,
  safeZoneMm: SAFE_ZONE_MM,
  showBleed: true,
  showTrim: true,
  showSafeZone: true,
  cutMarks: true,
};

export interface PublicDesignBlankPageSpec {
  widthMm?: number;
  heightMm?: number;
  pageCount?: number;
  bleedMm?: number;
  safeZoneMm?: number;
  title?: string;
}

interface UsePublicDesignBootstrapInput {
  adapter: PublicDesignEditorAdapter;
  documentMode: PublicDesignDocumentMode;
  initialDraftToken?: string | null;
  templateId?: number | null;
  blankPageSpec?: PublicDesignBlankPageSpec;
  setCoverPages: (value: number) => void;
  setError: (message: string | null) => void;
  setPageSpec: (value: PublicDesignPageSpec) => void;
  setPages: (pages: DesignPage[]) => void;
  setPrepressConfig: (value: DesignPrepressConfig) => void;
  setSaveState: (value: 'idle' | 'dirty' | 'saving' | 'saved' | 'error') => void;
  setSpreadMode: (value: boolean) => void;
}

export function usePublicDesignBootstrap({
  adapter,
  documentMode,
  initialDraftToken,
  templateId,
  blankPageSpec,
  setCoverPages,
  setError,
  setPageSpec,
  setPages,
  setPrepressConfig,
  setSaveState,
  setSpreadMode,
}: UsePublicDesignBootstrapInput) {
  const [template, setTemplate] = useState<DesignTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(null);
  const [organizationLogoError, setOrganizationLogoError] = useState(false);
  const [minimumPageCount, setMinimumPageCount] = useState(1);
  const [fontsLoadedTick, setFontsLoadedTick] = useState(0);
  const [fontsBootstrapDone, setFontsBootstrapDone] = useState(false);

  const blankWidthMm = blankPageSpec?.widthMm;
  const blankHeightMm = blankPageSpec?.heightMm;
  const blankPageCount = blankPageSpec?.pageCount;
  const blankBleedMm = blankPageSpec?.bleedMm;
  const blankSafeZoneMm = blankPageSpec?.safeZoneMm;
  const blankTitle = blankPageSpec?.title;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setFontsBootstrapDone(false);
        setError(null);
        const hasTemplateId = templateId != null && Number.isFinite(templateId) && templateId > 0;
        let t: DesignTemplate;
        if (hasTemplateId) {
          const res = await getPublicDesignTemplate(templateId);
          if (cancelled) return;
          t = res.data;
        } else {
          const defaultW = Number.isFinite(Number(blankWidthMm)) && Number(blankWidthMm) > 0 ? Number(blankWidthMm) : 90;
          const defaultH = Number.isFinite(Number(blankHeightMm)) && Number(blankHeightMm) > 0 ? Number(blankHeightMm) : 50;
          const defaultPages = Number.isFinite(Number(blankPageCount)) && Number(blankPageCount) > 0
            ? Math.floor(Number(blankPageCount))
            : (documentMode === 'multipage' ? 4 : 1);
          t = {
            id: 0,
            design_code: '',
            name: blankTitle?.trim() || 'Конструктор макета',
            description: null,
            category_id: null,
            category: null,
            preview_url: null,
            site_preview_url: null,
            spec: JSON.stringify({
              width_mm: defaultW,
              height_mm: defaultH,
              page_count: defaultPages,
              prepress: {
                ...(Number.isFinite(Number(blankBleedMm)) ? { bleedMm: Number(blankBleedMm) } : {}),
                ...(Number.isFinite(Number(blankSafeZoneMm)) ? { safeZoneMm: Number(blankSafeZoneMm) } : {}),
              },
            }),
            is_active: 1,
            sort_order: 0,
          };
        }
        const spec = readDesignTemplateSpec(t);
        const ds = spec.designState;
        const sourceState = initialDraftToken
          ? (adapter ? (await adapter.getDraft(initialDraftToken)).payloadParsed?.designState as typeof ds | undefined : undefined) ?? ds
          : ds;
        if (cancelled) return;
        const w = sourceState?.pageWidth ?? spec.width_mm ?? 90;
        const h = sourceState?.pageHeight ?? spec.height_mm ?? 55;
        const statePageCount = Number(sourceState?.pageCount ?? spec.page_count ?? 1);
        const sourcePages = sourceState?.pages?.length ? sourceState.pages : [];
        const requestedPageCount = Math.max(
          sourcePages.length,
          Number.isFinite(statePageCount) ? statePageCount : 1,
          Number(spec.page_count) || 1,
        );
        const count = Math.max(1, Math.min(99, requestedPageCount));
        const scale = resolveDesignSceneScale(sourceState);
        const savedSpreadMode = sourceState?.spread_mode;
        const nextSpreadMode = documentMode === 'multipage'
          && (typeof savedSpreadMode === 'boolean' ? savedSpreadMode : true);
        const nextCoverPages = documentMode === 'multipage'
          ? Math.max(1, Math.min(3, Number(sourceState?.cover_pages ?? spec.cover_pages ?? 1)))
          : Math.max(0, Math.min(3, Number(sourceState?.cover_pages ?? spec.cover_pages ?? 1)));
        const loadedPages = Array.from({ length: count }, (_, index) => sourcePages[index] ?? { ...EMPTY_PAGE });
        const spreadLayout = nextSpreadMode
          ? ensureEvenInnerSpreadPages(loadedPages, count, nextCoverPages, () => ({ ...EMPTY_PAGE }))
          : { pages: loadedPages, pageCount: count };
        setMinimumPageCount(1);
        setTemplate(t);
        setSaveState(initialDraftToken ? 'saved' : 'idle');
        setPageSpec({
          pageWidth: w,
          pageHeight: h,
          pageCount: spreadLayout.pageCount,
          scale,
        });
        setSpreadMode(nextSpreadMode);
        setCoverPages(nextCoverPages);
        setPrepressConfig(normalizePrepressConfig(sourceState?.prepress ?? spec.prepress));
        setPages(spreadLayout.pages);
        try {
          const fontResult = await loadDesignFontsForEditor({
            spec,
            pages: spreadLayout.pages,
          });
          if (!cancelled && fontResult.loaded.length > 0) {
            setFontsLoadedTick((tick) => tick + 1);
          }
        } catch {
          /* шрифты не должны блокировать монтирование холста */
        } finally {
          if (!cancelled) setFontsBootstrapDone(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось открыть клиентский редактор');
        if (!cancelled) setFontsBootstrapDone(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [
    adapter,
    blankBleedMm,
    blankHeightMm,
    blankPageCount,
    blankSafeZoneMm,
    blankTitle,
    blankWidthMm,
    documentMode,
    initialDraftToken,
    setCoverPages,
    setError,
    setPageSpec,
    setPages,
    setPrepressConfig,
    setSaveState,
    setSpreadMode,
    templateId,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getPublicEditorBranding();
        if (cancelled) return;
        setOrganizationLogoUrl(resolveEditorLogoUrl(res.data?.logoUrl));
        setOrganizationLogoError(false);
      } catch {
        if (!cancelled) setOrganizationLogoUrl(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return {
    loading,
    minimumPageCount,
    organizationLogoError,
    organizationLogoUrl,
    setOrganizationLogoError,
    template,
    fontsLoadedTick,
    fontsBootstrapDone,
  };
}

function resolveEditorLogoUrl(rawLogoUrl: unknown): string | null {
  if (typeof rawLogoUrl !== 'string') return null;
  const logoUrl = rawLogoUrl.trim();
  if (logoUrl.length <= 10) return null;
  if (logoUrl.startsWith('data:') || logoUrl.startsWith('http://') || logoUrl.startsWith('https://') || logoUrl.startsWith('blob:')) {
    return logoUrl;
  }
  if (logoUrl.startsWith('/')) return `${window.location.origin}${logoUrl}`;
  return null;
}

function normalizePrepressConfig(input: unknown): DesignPrepressConfig {
  const raw = input && typeof input === 'object' ? input as Partial<DesignPrepressConfig> : {};
  const num = (value: unknown, fallback: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  const bool = (value: unknown, fallback: boolean) =>
    typeof value === 'boolean' ? value : fallback;

  return {
    bleedMm: num(raw.bleedMm, DEFAULT_PUBLIC_DESIGN_PREPRESS_CONFIG.bleedMm),
    safeZoneMm: num(raw.safeZoneMm, DEFAULT_PUBLIC_DESIGN_PREPRESS_CONFIG.safeZoneMm),
    showBleed: bool(raw.showBleed, DEFAULT_PUBLIC_DESIGN_PREPRESS_CONFIG.showBleed),
    showTrim: bool(raw.showTrim, DEFAULT_PUBLIC_DESIGN_PREPRESS_CONFIG.showTrim),
    showSafeZone: bool(raw.showSafeZone, DEFAULT_PUBLIC_DESIGN_PREPRESS_CONFIG.showSafeZone),
    cutMarks: bool(raw.cutMarks, DEFAULT_PUBLIC_DESIGN_PREPRESS_CONFIG.cutMarks),
  };
}
