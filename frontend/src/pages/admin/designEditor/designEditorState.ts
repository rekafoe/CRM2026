import type { DesignTemplate } from '../../../api';
import type { DesignPage, DesignPrepressConfig, DesignState } from './types';
import type { PageSaveSnapshot } from './mergePagesSnapshot';
import { mergePagesWithSavedSnapshot } from './mergePagesSnapshot';

export type DesignTemplateSpec = {
  width_mm?: number;
  height_mm?: number;
  page_count?: number;
  spread_mode?: boolean;
  cover_pages?: number;
  prepress?: unknown;
  designState?: DesignState;
  [key: string]: unknown;
};

export function readDesignTemplateSpec(template: Pick<DesignTemplate, 'spec'> | null): DesignTemplateSpec {
  if (!template?.spec) return {};
  const rawSpec = template.spec as unknown;
  try {
    return typeof rawSpec === 'string'
      ? JSON.parse(rawSpec) as DesignTemplateSpec
      : rawSpec && typeof rawSpec === 'object' ? { ...(rawSpec as DesignTemplateSpec) } : {};
  } catch {
    return {};
  }
}

export function mergeSavedEditorPages(
  pages: DesignPage[],
  saved: PageSaveSnapshot,
  currentPage: number,
  leftPageIdx: number,
  rightPageIdx: number,
): DesignPage[] {
  return mergePagesWithSavedSnapshot(pages, saved, {
    currentPage,
    leftPageIdx,
    rightPageIdx,
  });
}

export function buildEmptyDesignState(input: {
  pageWidth?: number;
  pageHeight?: number;
  pageCount?: number;
  sceneScale?: number;
}): DesignState {
  const pageWidth = Number.isFinite(input.pageWidth) && (input.pageWidth ?? 0) > 0 ? input.pageWidth! : 90;
  const pageHeight = Number.isFinite(input.pageHeight) && (input.pageHeight ?? 0) > 0 ? input.pageHeight! : 55;
  const pageCount = Math.max(1, Math.min(99, Number(input.pageCount) || 1));
  const sceneScale = Number(input.sceneScale);
  return {
    templateId: null,
    pageWidth,
    pageHeight,
    pageCount,
    sceneScale: Number.isFinite(sceneScale) && sceneScale > 0 ? sceneScale : 1,
    pages: Array.from({ length: pageCount }, () => ({ fabricJSON: {} })),
    spread_mode: false,
    cover_pages: 1,
  };
}

/** Подтянуть мм из карточки шаблона в designState (после правки размеров без повторного входа в редактор). */
export function syncDesignStateDimensions(
  designState: DesignState,
  patch: { pageWidth?: number; pageHeight?: number; pageCount?: number },
): DesignState {
  const pageWidth = patch.pageWidth != null && patch.pageWidth > 0 ? patch.pageWidth : designState.pageWidth;
  const pageHeight = patch.pageHeight != null && patch.pageHeight > 0 ? patch.pageHeight : designState.pageHeight;
  const targetCount = patch.pageCount != null && patch.pageCount > 0
    ? Math.max(1, Math.min(99, patch.pageCount))
    : designState.pageCount;
  const pages = [...designState.pages];
  while (pages.length < targetCount) {
    pages.push({ fabricJSON: {} });
  }
  if (pages.length > targetCount) {
    pages.length = targetCount;
  }
  return {
    ...designState,
    pageWidth,
    pageHeight,
    pageCount: targetCount,
    pages,
  };
}

export function buildDesignState(input: {
  templateId: string | undefined;
  pageWidth: number;
  pageHeight: number;
  pageCount: number;
  sceneScale?: number;
  prepressConfig: DesignPrepressConfig;
  pages: DesignPage[];
  spreadMode: boolean;
  coverPages: number;
}): DesignState {
  return {
    templateId: input.templateId ? parseInt(input.templateId, 10) : null,
    pageWidth: input.pageWidth,
    pageHeight: input.pageHeight,
    pageCount: input.pageCount,
    sceneScale: input.sceneScale,
    prepress: input.prepressConfig,
    pages: input.pages,
    spread_mode: input.spreadMode,
    cover_pages: input.coverPages,
  };
}

export function buildTemplateSpecWithDesignState(
  currentSpec: DesignTemplateSpec,
  designState: DesignState,
): DesignTemplateSpec {
  return {
    ...currentSpec,
    width_mm: designState.pageWidth,
    height_mm: designState.pageHeight,
    page_count: designState.pageCount,
    spread_mode: designState.spread_mode,
    cover_pages: designState.cover_pages,
    prepress: designState.prepress,
    designState,
  };
}
