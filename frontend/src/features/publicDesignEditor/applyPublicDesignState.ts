import { EMPTY_PAGE } from '../../pages/admin/designEditor/constants';
import type { DesignPage, DesignPrepressConfig, DesignState } from '../../pages/admin/designEditor/types';
import { ensureEvenInnerSpreadPages } from '../../pages/admin/designEditor/spreadUtils';
import type { PublicDesignDocumentMode } from './useDesignDocumentNavigation';
import { DEFAULT_PUBLIC_DESIGN_PREPRESS_CONFIG } from './usePublicDesignBootstrap';

export function extractDesignStateFromDraftPayload(
  payload: Record<string, unknown> | undefined,
): DesignState | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload.designState ?? payload;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as DesignState;
}

export function resolvePagesFromDesignState(
  designState: DesignState,
  documentMode: PublicDesignDocumentMode,
  coverPages: number,
): { pages: DesignPage[]; pageCount: number } {
  const count = Math.max(1, Math.min(99, Number(designState.pageCount) || designState.pages?.length || 1));
  const spreadMode = documentMode === 'multipage' && designState.spread_mode === true;
  const cover = documentMode === 'multipage'
    ? Math.max(1, Math.min(3, Number(designState.cover_pages ?? coverPages)))
    : Math.max(0, Math.min(3, Number(designState.cover_pages ?? coverPages)));
  const sourcePages = designState.pages ?? [];
  const loadedPages = Array.from({ length: count }, (_, index) => sourcePages[index] ?? { ...EMPTY_PAGE });
  if (!spreadMode) {
    return { pages: loadedPages, pageCount: count };
  }
  const spreadLayout = ensureEvenInnerSpreadPages(loadedPages, count, cover, () => ({ ...EMPTY_PAGE }));
  return { pages: spreadLayout.pages, pageCount: spreadLayout.pageCount };
}

export function normalizePrepressFromDesignState(input: unknown): DesignPrepressConfig {
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
