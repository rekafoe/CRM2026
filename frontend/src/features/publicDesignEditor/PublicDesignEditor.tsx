import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ConfirmDialog, Modal } from '../../components/common';
import type { DesignEditorCanvasHandle } from '../../pages/admin/designEditor/DesignEditorCanvas';
import type { GuideLine } from '../../pages/admin/designEditor/CanvasRulers';
import { EMPTY_PAGE, MM_TO_PX } from '../../pages/admin/designEditor/constants';
import { createDesignSceneGeometry } from '../../pages/admin/designEditor/designGeometry';
import type { DesignPage, DesignPrepressConfig, SelectedObjProps } from '../../pages/admin/designEditor/types';
import { useDesignEditorViewport } from '../../pages/admin/designEditor/useDesignEditorViewport';
import {
  crmPreviewPublicDesignEditorAdapter,
  type PublicDesignEditorAdapter,
} from './publicDesignEditorAdapter';
import {
  type PublicDesignDocumentMode,
  useDesignDocumentNavigation,
} from './useDesignDocumentNavigation';
import { PublicDesignTaskPanel, type PublicDesignTaskTab } from './PublicDesignTaskPanel';
import { PublicDesignInspector, type PublicDesignInspectorPanel } from './PublicDesignInspector';
import { PublicDesignClientAside } from './PublicDesignClientAside';
import { PublicDesignAdvancedTools } from './PublicDesignAdvancedTools';
import { PublicDesignEditorAlerts } from './PublicDesignEditorAlerts';
import { PublicDesignFinalizeForm } from './PublicDesignFinalizeForm';
import { PublicDesignCheckoutPreview } from './PublicDesignCheckoutPreview';
import { PublicDesignTextFloatingControls } from './PublicDesignTextFloatingControls';
import { PublicDesignTextMobileToolbar } from './PublicDesignTextMobileToolbar';
import { EditorCanvasStage } from '../designEditorShell/EditorCanvasStage';
import { EditorPageNavigator } from '../designEditorShell/EditorPageNavigator';
import { EditorTopBar } from '../designEditorShell/EditorTopBar';
import type { EditorViewOptions } from '../designEditorShell/EditorViewControls';
import {
  analyzePublicDesignPages,
  analyzePublicDesignPage,
  buildPublicDesignPreflightSummary,
  type PublicEditorPreflightPageAnalysis,
} from './publicDesignPreflight';
import {
  buildPublicDesignFragmentSummary,
  filterPublicDesignPreflightByPages,
} from './publicDesignFragment';
import { buildPublicDesignPageStatuses } from './publicDesignPageProgress';
import { resolvePublicEditorNextAction } from './publicDesignTaskFlow';
import {
  DEFAULT_PUBLIC_DESIGN_PREPRESS_CONFIG,
  usePublicDesignBootstrap,
} from './usePublicDesignBootstrap';
import { usePublicDesignDraftActions } from './usePublicDesignDraftActions';
import { usePublicDesignGuidedActions } from './usePublicDesignGuidedActions';
import {
  resolveAllowedPageCountIncrease,
  usePublicDesignPageActions,
  type PublicDesignPageCountAdjustment,
} from './usePublicDesignPageActions';
import { usePublicDesignPhotoLibrary } from './usePublicDesignPhotoLibrary';
import {
  clearThumbnailCacheForPage,
  rememberPageThumbnail,
} from '../../pages/admin/designEditor/designPageThumbnailCache';
import { findStripItemForPage } from '../../pages/admin/designEditor/spreadUtils';
import type { PublicDesignPageCountLimits } from './usePublicDesignPageActions';
import { onDesignFontsReady } from '../../utils/loadDesignFonts';
import { usePublicDesignThumbnailPrefetch } from './usePublicDesignThumbnailPrefetch';
import { useSpreadLayoutNormalize } from './useSpreadLayoutNormalize';
import { isEditorSpreadModeActive } from '../../pages/admin/designEditor/editorSpreadMode';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  PublicDesignEditorMobileDock,
  type PublicDesignMobilePanel,
} from './PublicDesignEditorMobileDock';
import { PublicDesignDraftConflictDialog } from './PublicDesignDraftConflictDialog';
import { PUBLIC_EDITOR_FEATURE_FLAGS } from './publicEditorFeatureFlags';
import { startPublicEditorPerfSpan } from './publicEditorPerf';
import '../../pages/admin/DesignEditorPage.css';
import '../../pages/admin/designEditor/designEditorGlassTheme.css';
import '../designEditorShell/editorShell.css';
import './publicDesignEditor.css';
import './publicDesignClientShell.css';
import './publicDesignInspector.css';
import './publicDesignClientAside.css';
import './publicDesignPageStrip.css';

const DEFAULT_VIEW_OPTIONS: EditorViewOptions = {
  showRulers: true,
  showGuides: true,
  showBleed: true,
  showTrim: true,
  showSafeZone: true,
};

function canApplyPageCount(
  count: number,
  limits: PublicDesignPageCountLimits | undefined,
  minimumPageCount: number,
): boolean {
  const next = Math.floor(Number(count));
  if (!Number.isFinite(next) || next < 1) return false;
  const min = Math.max(minimumPageCount, Math.floor(Number(limits?.min) || 0));
  if (next < min) return false;
  const max = Math.floor(Number(limits?.max) || 0);
  if (max > 0 && next > max) return false;
  const step = Math.floor(Number(limits?.step) || 0);
  if (step > 1 && next % step !== 0) return false;
  return true;
}

function canIncreasePageCount(
  currentCount: number,
  requestedAddCount: number,
  limits: PublicDesignPageCountLimits | undefined,
  minimumPageCount: number,
): boolean {
  return resolveAllowedPageCountIncrease({
    currentCount,
    requestedAddCount,
    limits,
    minimumPageCount,
  }).ok;
}

function formatPageCountRu(count: number): string {
  const normalized = Math.abs(Math.floor(count));
  const mod10 = normalized % 10;
  const mod100 = normalized % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} страница`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} страницы`;
  return `${count} страниц`;
}

interface PublicDesignEditorProps {
  templateId: number;
  initialDraftToken?: string | null;
  onDraftTokenChange?: (token: string) => void;
  adapter?: PublicDesignEditorAdapter;
  autosaveDelayMs?: number;
  showFinalizeButton?: boolean;
  documentMode?: PublicDesignDocumentMode;
  onReadyForCart?: (draftToken: string) => void;
  selectedParams?: Record<string, unknown>;
  pageCountLimits?: PublicDesignPageCountLimits;
  onPageCountChange?: (pageCount: number) => void;
}

export const PublicDesignEditor: React.FC<PublicDesignEditorProps> = ({
  templateId,
  initialDraftToken,
  onDraftTokenChange,
  adapter = crmPreviewPublicDesignEditorAdapter,
  autosaveDelayMs = 30000,
  showFinalizeButton = false,
  documentMode = 'single',
  onReadyForCart,
  selectedParams,
  pageCountLimits,
  onPageCountChange,
}) => {
  const bootstrapKey = `${documentMode}:${templateId}`;
  const bootstrapDraftTokenRef = useRef<{ key: string; token: string | null } | null>(null);
  if (!bootstrapDraftTokenRef.current || bootstrapDraftTokenRef.current.key !== bootstrapKey) {
    bootstrapDraftTokenRef.current = { key: bootstrapKey, token: initialDraftToken ?? null };
  }
  const bootstrapDraftToken = bootstrapDraftTokenRef.current.token;
  const canvasHandleRef = useRef<DesignEditorCanvasHandle | null>(null);
  const latestPagesRef = useRef<DesignPage[]>([{ ...EMPTY_PAGE }]);
  const commitCanvasToPagesRef = useRef<() => Promise<DesignPage[] | null>>(() => Promise.resolve(null));
  const preflightPageCacheRef = useRef(new Map<number, {
    pageRef: DesignPage | undefined;
    boundsKey: string;
    analysis: PublicEditorPreflightPageAnalysis;
  }>());
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fitScalerRef = useRef<HTMLDivElement>(null);

  const [draftToken, setDraftToken] = useState<string | null>(bootstrapDraftToken);
  const [pages, setPages] = useState<DesignPage[]>([{ ...EMPTY_PAGE }]);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedObj, setSelectedObj] = useState<SelectedObjProps | null>(null);
  const [textFloatingAnchor, setTextFloatingAnchor] = useState<{ x: number; y: number } | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [stripCollapsed, setStripCollapsed] = useState(true);
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [pageTransitionBusy, setPageTransitionBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const [dirtyVersion, setDirtyVersion] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [textFillHint, setTextFillHint] = useState<string | null>(null);
  const [activeTaskTab, setActiveTaskTab] = useState<PublicDesignTaskTab>('photo');
  const suppressDirtyRef = useRef(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [clientAsideCollapsed, setClientAsideCollapsed] = useState(false);
  const [selectedLibraryPhotoId, setSelectedLibraryPhotoId] = useState<string | null>(null);
  const [checkoutPreviewOpen, setCheckoutPreviewOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<PublicDesignMobilePanel>('canvas');
  const isMobile = useMediaQuery('(max-width: 760px)');
  const [pendingDeletePage, setPendingDeletePage] = useState<number | null>(null);
  const [pageCountNotice, setPageCountNotice] = useState<string | null>(null);
  const [customerForm, setCustomerForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
  });
  const [pageSpec, setPageSpec] = useState({ pageWidth: 90, pageHeight: 55, pageCount: 1, scale: 1 });
  const [spreadMode, setSpreadMode] = useState(() => documentMode === 'multipage');
  /** На телефоне всегда одна страница на канвасе; spread_mode в draft не трогаем. */
  const editorSpreadMode = isEditorSpreadModeActive(spreadMode, isMobile);
  const [coverPages, setCoverPages] = useState(1);
  const [prepressConfig, setPrepressConfig] = useState<DesignPrepressConfig>(DEFAULT_PUBLIC_DESIGN_PREPRESS_CONFIG);
  const [viewOptions, setViewOptions] = useState<EditorViewOptions>(DEFAULT_VIEW_OPTIONS);

  useEffect(() => {
    latestPagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    if (!isMobile) return;
    setViewOptions((prev) => ({
      ...prev,
      showRulers: false,
      showGuides: false,
    }));
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || documentMode !== 'multipage') return;
    if (mobilePanel === 'canvas') setStripCollapsed(false);
  }, [documentMode, isMobile, mobilePanel]);
  const {
    loading,
    minimumPageCount,
    organizationLogoError,
    organizationLogoUrl,
    setOrganizationLogoError,
    template,
    fontsLoadedTick,
  } = usePublicDesignBootstrap({
    adapter,
    documentMode,
    initialDraftToken: bootstrapDraftToken,
    templateId,
    setCoverPages,
    setError,
    setPageSpec,
    setPages,
    setPrepressConfig,
    setSaveState,
    setSpreadMode,
  });
  const navigation = useDesignDocumentNavigation({
    mode: documentMode,
    pageCount: pageSpec.pageCount,
    currentPage,
    spreadMode: editorSpreadMode,
    coverPages,
  });
  const sceneGeometry = useMemo(
    () => createDesignSceneGeometry({
      pageWidthMm: pageSpec.pageWidth,
      pageHeightMm: pageSpec.pageHeight,
      safeZoneMm: prepressConfig.safeZoneMm,
      bleedMm: prepressConfig.bleedMm,
      scale: pageSpec.scale,
    }),
    [pageSpec.pageWidth, pageSpec.pageHeight, pageSpec.scale, prepressConfig.safeZoneMm, prepressConfig.bleedMm],
  );
  const preflightBounds = useMemo(
    () => ({
      pageWidthPx: sceneGeometry.pageWidthPx,
      pageHeightPx: sceneGeometry.pageHeightPx,
      safeZonePx: sceneGeometry.safeZonePx,
    }),
    [sceneGeometry.pageHeightPx, sceneGeometry.pageWidthPx, sceneGeometry.safeZonePx],
  );
  const preflightBoundsKey = `${preflightBounds.pageWidthPx}x${preflightBounds.pageHeightPx}:${preflightBounds.safeZonePx}`;
  const preflight = useMemo(
    () => {
      if (!PUBLIC_EDITOR_FEATURE_FLAGS.incrementalPreflight) {
        return analyzePublicDesignPages(pages, saveState, preflightBounds);
      }
      const stop = startPublicEditorPerfSpan('preflight.total.ms', {
        pageCount: pages.length,
        mode: 'incremental',
      });
      try {
        const cache = preflightPageCacheRef.current;
        const analyses: PublicEditorPreflightPageAnalysis[] = [];
        for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
          const page = pages[pageIndex];
          const cached = cache.get(pageIndex);
          if (
            cached
            && cached.pageRef === page
            && cached.boundsKey === preflightBoundsKey
          ) {
            analyses.push(cached.analysis);
            continue;
          }
          const analysis = analyzePublicDesignPage(page, pageIndex, preflightBounds);
          cache.set(pageIndex, {
            pageRef: page,
            boundsKey: preflightBoundsKey,
            analysis,
          });
          analyses.push(analysis);
        }
        for (const key of Array.from(cache.keys())) {
          if (key >= pages.length) {
            cache.delete(key);
          }
        }
        return buildPublicDesignPreflightSummary(analyses);
      } finally {
        stop({ saveState });
      }
    },
    [pages, preflightBounds, preflightBoundsKey, saveState],
  );
  const activeStripIndex = useMemo(
    () => findStripItemForPage(navigation.stripItems, currentPage),
    [currentPage, navigation.stripItems],
  );
  const currentStripItem = activeStripIndex >= 0 ? navigation.stripItems[activeStripIndex] : null;
  const prevStripItem = activeStripIndex > 0 ? navigation.stripItems[activeStripIndex - 1] : null;
  const nextStripItem = activeStripIndex >= 0 && activeStripIndex < navigation.stripItems.length - 1
    ? navigation.stripItems[activeStripIndex + 1]
    : null;
  const currentFragmentPages = currentStripItem?.pages ?? [currentPage];
  const currentFragment = useMemo(
    () => buildPublicDesignFragmentSummary({
      documentMode,
      pageCount: pageSpec.pageCount,
      currentPage,
      fragmentPages: currentFragmentPages,
      spreadMode: editorSpreadMode,
      coverPages,
      preflight,
    }),
    [coverPages, currentFragmentPages, currentPage, documentMode, editorSpreadMode, pageSpec.pageCount, preflight],
  );
  const fragmentPreflight = useMemo(
    () => filterPublicDesignPreflightByPages(preflight, currentFragment.pageIndexes),
    [currentFragment.pageIndexes, preflight],
  );
  const fragmentNextAction = useMemo(
    () => resolvePublicEditorNextAction(fragmentPreflight),
    [fragmentPreflight],
  );
  const globalNextAction = useMemo(
    () => resolvePublicEditorNextAction(preflight),
    [preflight],
  );
  const editorNextAction = fragmentNextAction.kind === 'readyForCart' ? globalNextAction : fragmentNextAction;
  const pageStatuses = useMemo(
    () => buildPublicDesignPageStatuses(pageSpec.pageCount, preflight),
    [pageSpec.pageCount, preflight],
  );
  const canAddSinglePage = useMemo(() => canIncreasePageCount(pageSpec.pageCount, 1, pageCountLimits, minimumPageCount), [
    minimumPageCount,
    pageCountLimits,
    pageSpec.pageCount,
  ]);
  const canAddSpread = useMemo(() => canIncreasePageCount(pageSpec.pageCount, 2, pageCountLimits, minimumPageCount), [
    minimumPageCount,
    pageCountLimits,
    pageSpec.pageCount,
  ]);
  const canDeleteSinglePage = useMemo(() => canApplyPageCount(pageSpec.pageCount - 1, pageCountLimits, minimumPageCount), [
    minimumPageCount,
    pageCountLimits,
    pageSpec.pageCount,
  ]);

  const visibleShowBleed = prepressConfig.showBleed && viewOptions.showBleed && viewOptions.showGuides;
  const visibleShowTrim = prepressConfig.showTrim && viewOptions.showTrim && viewOptions.showGuides;
  const visibleShowSafeZone = prepressConfig.showSafeZone && viewOptions.showSafeZone && viewOptions.showGuides;
  const guideLinesPx = useMemo(
    () => guides.map((guide) => ({
      axis: guide.axis,
      pos: guide.posMM * MM_TO_PX * pageSpec.scale,
    })),
    [guides, pageSpec.scale],
  );

  const mobileTextToolbarOpen = isMobile && selectedObj?.type === 'IText';
  const viewportLayoutTrigger =
    (mobileTextToolbarOpen ? 1 : 0)
    + (isMobile ? { canvas: 0, photos: 1, text: 2, check: 3 }[mobilePanel] ?? 0 : 0) * 4
    + (!isMobile && stripCollapsed ? 1 : 0) * 16
    + (!isMobile && clientAsideCollapsed ? 1 : 0) * 32;

  const { fitZoom, viewportReady: fitReady, rulerOrigin, layoutWidthPx, layoutHeightPx } = useDesignEditorViewport({
    viewportRef,
    fallbackRef: scrollAreaRef,
    pageWidthPx: sceneGeometry.pageWidthPx,
    pageHeightPx: sceneGeometry.pageHeightPx,
    bleedPx: sceneGeometry.bleedPx,
    showBleed: visibleShowBleed,
    isSpreadView: navigation.isSpreadView,
    compactPadding: isMobile,
    layoutTrigger: viewportLayoutTrigger,
  });

  const markDirty = useCallback(() => {
    if (suppressDirtyRef.current) return;
    setSaveState('dirty');
    setDirtyVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    if (loading) {
      suppressDirtyRef.current = true;
      return undefined;
    }
    const timer = window.setTimeout(() => {
      suppressDirtyRef.current = false;
    }, 500);
    return () => window.clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (loading || documentMode !== 'multipage') return;
    onPageCountChange?.(pageSpec.pageCount);
  }, [documentMode, loading, onPageCountChange, pageSpec.pageCount]);

  const thumbnailCacheScope = useMemo(() => {
    if (!template) return null;
    return {
      templateId,
      draftToken,
      pageWidthPx: sceneGeometry.pageWidthPx,
      pageHeightPx: sceneGeometry.pageHeightPx,
    };
  }, [draftToken, sceneGeometry.pageHeightPx, sceneGeometry.pageWidthPx, template, templateId]);

  const handlePageThumbReady = useCallback((pageIdx: number, dataUrl: string) => {
    if (thumbnailCacheScope) {
      rememberPageThumbnail(thumbnailCacheScope, pageIdx, pages[pageIdx], dataUrl);
    }
    setThumbnails((prev) => (prev[pageIdx] === dataUrl ? prev : { ...prev, [pageIdx]: dataUrl }));
  }, [pages, thumbnailCacheScope]);

  const handleHydrateThumbnails = useCallback((cached: Record<number, string>) => {
    setThumbnails((prev) => {
      const next = { ...prev };
      let changed = false;
      Object.entries(cached).forEach(([rawIndex, url]) => {
        const index = Number(rawIndex);
        if (!Number.isFinite(index) || next[index] === url) return;
        next[index] = url;
        changed = true;
      });
      return changed ? next : prev;
    });
  }, []);

  useSpreadLayoutNormalize({
    enabled: !loading && Boolean(template),
    documentMode,
    spreadMode: editorSpreadMode,
    coverPages,
    pageCount: pageSpec.pageCount,
    pages,
    setPages,
    setPageCount: (count) => setPageSpec((spec) => ({ ...spec, pageCount: count })),
    suppressDirtyRef,
  });

  usePublicDesignThumbnailPrefetch({
    enabled: !loading && Boolean(template),
    templateId,
    draftToken,
    pages,
    pageCount: pageSpec.pageCount,
    template,
    pageWidthPx: sceneGeometry.pageWidthPx,
    pageHeightPx: sceneGeometry.pageHeightPx,
    onThumb: handlePageThumbReady,
    onHydrate: handleHydrateThumbnails,
  });

  const prevPageCountRef = useRef(pageSpec.pageCount);
  useEffect(() => {
    const prevCount = prevPageCountRef.current;
    const nextCount = pageSpec.pageCount;
    if (nextCount <= prevCount) {
      prevPageCountRef.current = nextCount;
      return;
    }
    const addedIndexes = Array.from({ length: nextCount - prevCount }, (_, idx) => prevCount + idx);
    if (thumbnailCacheScope) {
      addedIndexes.forEach((pageIndex) => clearThumbnailCacheForPage(thumbnailCacheScope, pageIndex));
    }
    setThumbnails((prev) => {
      let changed = false;
      const next = { ...prev };
      addedIndexes.forEach((pageIndex) => {
        if (!(pageIndex in next)) return;
        delete next[pageIndex];
        changed = true;
      });
      return changed ? next : prev;
    });
    prevPageCountRef.current = nextCount;
  }, [pageSpec.pageCount, thumbnailCacheScope]);

  useEffect(() => {
    const el = fitScalerRef.current;
    if (!el) return;
    el.dataset.ready = fitReady ? 'true' : 'false';

    if (!fitReady) {
      el.style.removeProperty('width');
      el.style.removeProperty('height');
      el.style.setProperty('--de-fit-zoom', '1');
      return;
    }

    el.style.zoom = '';
    el.style.setProperty('--de-content-w', String(layoutWidthPx));
    el.style.setProperty('--de-content-h', String(layoutHeightPx));

    const scaledW = Math.max(1, Math.round(layoutWidthPx * fitZoom));
    const scaledH = Math.max(1, Math.round(layoutHeightPx * fitZoom));
    el.style.width = `${scaledW}px`;
    el.style.height = `${scaledH}px`;
    el.style.setProperty('--de-fit-zoom', String(fitZoom));
  }, [fitZoom, fitReady, layoutWidthPx, layoutHeightPx, currentPage, navigation.pageLoadKey]);

  useEffect(() => {
    if (!fitReady) return;
    const id = requestAnimationFrame(() => {
      canvasHandleRef.current?.syncCanvasOffset();
      canvasHandleRef.current?.setSelectionDisplayScale(fitZoom);
    });
    return () => cancelAnimationFrame(id);
  }, [fitZoom, fitReady, currentPage, navigation.pageLoadKey]);

  useEffect(() => {
    const el = scrollAreaRef.current;
    const sync = () => {
      canvasHandleRef.current?.syncTextFloatingAnchor?.();
      canvasHandleRef.current?.syncCanvasOffset();
    };
    el?.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    return () => {
      el?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  useEffect(() => {
    if (loading || !fitReady) return;
    const id = requestAnimationFrame(() => {
      canvasHandleRef.current?.syncCanvasOffset();
      canvasHandleRef.current?.setSelectionDisplayScale(fitZoom);
    });
    return () => cancelAnimationFrame(id);
  }, [fitReady, fitZoom, loading, templateId]);

  useEffect(() => {
    if (!fontsLoadedTick) return;
    requestAnimationFrame(() => {
      void canvasHandleRef.current?.reloadTextFonts();
    });
  }, [fontsLoadedTick]);

  useEffect(() => {
    const reload = () => {
      requestAnimationFrame(() => {
        void canvasHandleRef.current?.reloadTextFonts();
      });
    };
    return onDesignFontsReady(reload);
  }, []);

  useEffect(() => {
    setDraftToken(bootstrapDraftToken);
    setCurrentPage(0);
    setSelectedObj(null);
    setTextFloatingAnchor(null);
    setThumbnails({});
    setGuides([]);
    setCanUndo(false);
    setCanRedo(false);
  }, [bootstrapDraftToken, documentMode, templateId]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveState !== 'dirty' && saveState !== 'saving') return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveState]);

  const {
    handleFinalize,
    handleReadyForCart,
    handleSaveDraft,
    resolveImageAsset,
    resolveImageFileUrl,
    draftConflictOpen,
    handleDismissDraftConflict,
    handleReloadDraftFromServer,
    handleForceSaveDraft,
  } = usePublicDesignDraftActions({
    adapter,
    autosaveDelayMs,
    canvasHandleRef,
    coverPages,
    customerForm,
    dirtyVersion,
    documentMode,
    draftToken,
    loading,
    pageSpec,
    pages,
    getLatestPages: () => latestPagesRef.current,
    prepressConfig,
    saving,
    spreadMode,
    templateId,
    setActiveTaskTab,
    setDraftToken,
    setError,
    setPages,
    setSaveState,
    setSaving,
    setStatus,
    setCurrentPage,
    setPageSpec,
    setSpreadMode,
    setCoverPages,
    setPrepressConfig,
    onDraftTokenChange,
    onReadyForCart,
    selectedParams,
  });

  const {
    sidebarPhotos,
    addSidebarPhotos,
    removeSidebarPhoto,
    retrySidebarPhoto,
    markSidebarPhotoUsed,
    handleLibraryPhotoClick,
    handleImageUrlSubmit,
  } = usePublicDesignPhotoLibrary({
    canvasHandleRef,
    resolveImageAsset,
    markDirty,
    setError,
  });

  const handleTextFillHint = useCallback((message: string) => {
    setTextFillHint(message);
  }, []);

  const handlePageCountAdjusted = useCallback((adjustment: PublicDesignPageCountAdjustment) => {
    setPageCountNotice(
      `Было добавлено ${formatPageCountRu(adjustment.addedPages)}, потому что количество страниц для данного типа переплёта должно быть кратно ${adjustment.step}.`,
    );
  }, []);

  useEffect(() => {
    if (!textFillHint) return undefined;
    const timer = window.setTimeout(() => setTextFillHint(null), 8000);
    return () => window.clearTimeout(timer);
  }, [textFillHint]);

  const {
    saveCurrentCanvasPage,
    commitCanvasToPages,
    handleGoToPage,
    handleAddClientPage,
    handleInsertClientPage,
    handleAddClientSpread,
    handleDeleteClientLast,
    handleDeleteClientPage,
  } = usePublicDesignPageActions({
    canvasHandleRef,
    currentPage,
    documentMode,
    navigation,
    pages,
    pageSpec,
    spreadMode: editorSpreadMode,
    coverPages,
    minimumPageCount,
    setPages,
    setCurrentPage,
    setPageSpec,
    setThumbnails,
    markDirty,
    pageCountLimits,
    onPageCountRejected: setError,
    onPageCountAdjusted: handlePageCountAdjusted,
  });

  commitCanvasToPagesRef.current = () => {
    return commitCanvasToPages().then((committedPages) => {
      if (committedPages) latestPagesRef.current = committedPages;
      return committedPages;
    });
  };

  const openCheckoutPreviewAfterFlush = useCallback(() => {
    void (async () => {
      await canvasHandleRef.current?.flushPendingDocumentCommit?.();
      const latestPreflight = buildPublicDesignPreflightSummary(
        latestPagesRef.current.map((page, pageIndex) => analyzePublicDesignPage(page, pageIndex, preflightBounds)),
      );
      if (latestPreflight.hasBlockingIssues) {
        setActiveTaskTab('check');
        setError('Перед возвратом в корзину исправьте ошибки проверки макета.');
        if (isMobile) setMobilePanel('check');
        return;
      }
      setCheckoutPreviewOpen(true);
    })();
  }, [
    canvasHandleRef,
    isMobile,
    preflightBounds,
    setActiveTaskTab,
    setError,
  ]);

  const {
    handleFieldFocus,
    handlePhotoReplace,
    handleIssueFocus,
    handleNextAction,
  } = usePublicDesignGuidedActions({
    canvasHandleRef,
    currentPage,
    navigation,
    preflight,
    editorNextAction,
    setActiveTaskTab,
    setError,
    onGoToPage: handleGoToPage,
    onReadyForCart: openCheckoutPreviewAfterFlush,
  });

  const selectedLibraryPhoto = useMemo(
    () => sidebarPhotos.find((photo) => photo.id === selectedLibraryPhotoId) ?? null,
    [selectedLibraryPhotoId, sidebarPhotos],
  );

  const handlePlaceSelectedPhoto = useCallback(async (field: typeof preflight.photoFields[number]) => {
    const photo = selectedLibraryPhoto;
    if (!photo) {
      setActiveTaskTab('photo');
      setError('Сначала выберите фото в библиотеке.');
      return;
    }
    try {
      setError(null);
      const needsPageSwitch = !navigation.stripItems.some((item) =>
        item.pages.includes(currentPage) && item.pages.includes(field.pageIndex));
      if (needsPageSwitch) await handleGoToPage(field.pageIndex);
      window.setTimeout(async () => {
        const handle = canvasHandleRef.current;
        if (!handle) return;
        const placed = photo.url && photo.uploadStatus === 'ready'
          ? await handle.fillPhotoFieldFromUrl(field.id, photo.url, photo.name)
          : photo.file
            ? await handle.fillPhotoFieldFromFile(field.id, photo.file)
            : false;
        if (!placed) {
          setError('Не удалось поставить выбранное фото в поле.');
          return;
        }
        markSidebarPhotoUsed(photo.id);
        markDirty();
        if (isMobile) setMobilePanel('canvas');
      }, needsPageSwitch ? 220 : 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось поставить выбранное фото.');
    }
  }, [
    canvasHandleRef,
    currentPage,
    handleGoToPage,
    isMobile,
    markDirty,
    markSidebarPhotoUsed,
    navigation.stripItems,
    selectedLibraryPhoto,
  ]);

  const handleMobileFilesSelected = useCallback((files: File[]) => {
    addSidebarPhotos(files);
    if (isMobile) setMobilePanel('photos');
  }, [addSidebarPhotos, isMobile]);

  const handleMobileFieldFocus = useCallback((
    field: Parameters<typeof handleFieldFocus>[0],
    kind: Parameters<typeof handleFieldFocus>[1],
  ) => {
    if (isMobile) setMobilePanel('canvas');
    handleFieldFocus(field, kind);
  }, [handleFieldFocus, isMobile]);

  const handleCheckoutIssueFocus = useCallback((issue: Parameters<typeof handleIssueFocus>[0]) => {
    if (isMobile) setMobilePanel('canvas');
    handleIssueFocus(issue);
  }, [handleIssueFocus, isMobile]);

  const handleTaskTabChange = useCallback((tab: PublicDesignTaskTab) => {
    if (tab === 'check') {
      void canvasHandleRef.current?.flushPendingDocumentCommit?.();
    }
    setActiveTaskTab(tab);
    if (isMobile && tab === 'check') setMobilePanel('check');
  }, [canvasHandleRef, isMobile]);

  useEffect(() => {
    if (!isMobile || activeTaskTab !== 'check') return;
    setMobilePanel('check');
  }, [activeTaskTab, isMobile]);

  const handleRequestReadyForCart = useCallback(() => {
    openCheckoutPreviewAfterFlush();
  }, [openCheckoutPreviewAfterFlush]);

  const handleConfirmReadyForCart = useCallback(() => {
    setCheckoutPreviewOpen(false);
    void handleReadyForCart();
  }, [handleReadyForCart]);

  const isMultipageDocument = documentMode === 'multipage';
  const isTwoSidedDocument = !isMultipageDocument && pageSpec.pageCount === 2;
  const documentLabel = isMultipageDocument
    ? 'Многостраничный макет'
    : isTwoSidedDocument
      ? 'Двухсторонний макет'
      : 'Одностраничный макет';
  const navigationLabel = isMultipageDocument
    ? (editorSpreadMode ? 'Развороты' : 'Страницы')
    : isTwoSidedDocument
      ? 'Стороны'
      : 'Страница';
  const showOrganizationLogo = organizationLogoUrl && !organizationLogoError;

  const missingPhotoCount = Math.max(0, fragmentPreflight.photoTotal - fragmentPreflight.photoReady);
  const missingTextCount = Math.max(0, fragmentPreflight.textTotal - fragmentPreflight.textReady);

  const inspectorPanel: PublicDesignInspectorPanel = mobilePanel === 'photos'
      ? 'photos'
      : mobilePanel === 'text'
        ? 'text'
        : 'photos';

  const checkIssueCount = preflight.issues.length;

  const handleMobileNextAction = useCallback(() => {
    if (editorNextAction.kind === 'replacePhoto') {
      setMobilePanel('photos');
    } else {
      setMobilePanel('canvas');
    }
    handleNextAction();
  }, [editorNextAction, handleNextAction]);

  if (loading) return <div className="public-design-editor__state">Загрузка редактора...</div>;
  if (!template) return <Alert type="error">{error ?? 'Шаблон не найден'}</Alert>;

  const editorRootClassName = [
    'public-design-editor',
    'public-design-editor--client',
    `public-design-editor--${isMultipageDocument ? 'multipage' : 'single'}`,
    clientAsideCollapsed && !isMobile ? 'public-design-editor--aside-collapsed' : '',
    isMobile ? 'public-design-editor--mobile' : '',
    isMobile ? `public-design-editor--mobile-panel-${mobilePanel}` : '',
  ].filter(Boolean).join(' ');

  const workspaceClassName = [
    'public-design-editor__workspace',
    !isMobile ? 'public-design-editor__workspace--desktop' : '',
    isMobile ? `public-design-editor__workspace--panel-${mobilePanel}` : '',
  ].filter(Boolean).join(' ');

  const workspaceLayoutProps = !isMobile
    ? ({ 'data-pde-layout': 'client-desktop' } as const)
    : undefined;

  const pageNavigator = (
    <EditorPageNavigator
      pageCount={pageSpec.pageCount}
      navigationLabel={navigationLabel}
      navigation={navigation}
      currentPage={currentPage}
      thumbnails={thumbnails}
      thumbW={sceneGeometry.pageWidthPx}
      thumbH={sceneGeometry.pageHeightPx}
      pageWidth={pageSpec.pageWidth}
      pageHeight={pageSpec.pageHeight}
      zoom={1}
      spreadMode={editorSpreadMode}
      collapsed={isMobile ? false : stripCollapsed}
      pageStatuses={pageStatuses}
      showWhenSingle
      canAddPages={(documentMode === 'multipage' || pageSpec.pageCount > 1) && canAddSinglePage}
      canAddSpread={documentMode === 'multipage' && !isMobile && canAddSpread}
      canDeletePages={(documentMode === 'multipage' || pageSpec.pageCount > 1) && pageSpec.pageCount > minimumPageCount && canDeleteSinglePage}
      titleLabel="Страницы"
      appearance="client"
      showInfoLine={false}
      labels={{
        addPage: 'Добавить страницу',
        addSpread: 'Добавить разворот',
        deletePage: 'Убрать добавленную',
        deleteSpread: 'Убрать добавленный разворот',
        pagesMode: 'Страницы',
        spreadsMode: 'Развороты',
        collapse: 'Свернуть страницы',
        expand: 'Показать страницы',
      }}
      onGoTo={(pageIndex) => void handleGoToPage(pageIndex)}
      onAddPage={() => void handleAddClientPage()}
      onInsertPage={(pageIndex) => void handleInsertClientPage(pageIndex)}
      onDeletePage={setPendingDeletePage}
      onAddSpread={() => void handleAddClientSpread()}
      onDeleteLast={() => void handleDeleteClientLast()}
      onSpreadModeToggle={() => {
        if (documentMode === 'multipage' && !isMobile) setSpreadMode((value) => !value);
      }}
      onCollapse={() => setStripCollapsed((value) => !value)}
      compact={isMobile}
      mobilePagesOnlyHint={
        isMobile && spreadMode && documentMode === 'multipage'
          ? 'На телефоне — по одной странице. Развороты редактируются на компьютере.'
          : undefined
      }
      transitionBusy={pageTransitionBusy}
    />
  );

  const canvasStageColumn = (
    <div className={`public-design-editor__canvas-column${!isMobile && navigation.stripItems.length > 1 ? ' public-design-editor__canvas-column--with-edge-nav' : ''}`}>
      {!isMobile && navigation.stripItems.length > 1 && (
        <button
          type="button"
          className="public-design-editor__edge-page-nav public-design-editor__edge-page-nav--prev"
          disabled={!prevStripItem || pageTransitionBusy}
          aria-label="Предыдущая страница"
          onClick={() => {
            if (!prevStripItem) return;
            void handleGoToPage(prevStripItem.goToPage);
          }}
        >
          ‹
        </button>
      )}
      <EditorCanvasStage
        template={template}
        editorMode="basic"
        refs={{
          canvasHandleRef,
          scrollAreaRef,
          viewportRef,
          fitScalerRef,
        }}
        fragment={{
          fragmentLabel: currentFragment.label,
          fragmentDetail: currentFragment.detail,
          issueCount: currentFragment.issueCount,
        }}
        navigation={navigation}
        document={{
          currentPage,
          pages,
          setPages,
        }}
        geometry={{
          pageWidthPx: sceneGeometry.pageWidthPx,
          pageHeightPx: sceneGeometry.pageHeightPx,
          canvasWidthPx: navigation.isSpreadView ? sceneGeometry.pageWidthPx * 2 : sceneGeometry.pageWidthPx,
          safeZonePx: sceneGeometry.safeZonePx,
          bleedPx: sceneGeometry.bleedPx,
          pageWidthMm: pageSpec.pageWidth,
          pageHeightMm: pageSpec.pageHeight,
          sceneScale: pageSpec.scale,
        }}
        view={{
          showBleed: visibleShowBleed,
          showTrim: visibleShowTrim,
          showSafeZone: visibleShowSafeZone,
          viewOptions,
          guides,
          guideLinesPx,
          fitZoom,
          rulerOrigin,
        }}
        history={{
          canUndo,
          canRedo,
        }}
        toolsSlot={(
          <PublicDesignAdvancedTools
            canvasHandleRef={canvasHandleRef}
            selectedObj={selectedObj}
            pages={pages}
            setPages={setPages}
            currentPage={currentPage}
            leftPageIdx={navigation.leftPageIdx}
            rightPageIdx={navigation.rightPageIdx}
            onDirty={markDirty}
          />
        )}
        stageClassName={
          isMobile && selectedObj?.type === 'IText'
            ? 'public-design-editor__stage--text-toolbar'
            : undefined
        }
        textToolbarSlot={
          isMobile && selectedObj?.type === 'IText' ? (
            <PublicDesignTextMobileToolbar
              canvasHandleRef={canvasHandleRef}
              selectedObj={selectedObj}
            />
          ) : null
        }
        guideSlot={null}
        assets={{
          showOrganizationLogo: showOrganizationLogo && !isMobile,
          organizationLogoUrl,
          sidebarPhotos,
        }}
        handlers={{
          onOrganizationLogoError: () => setOrganizationLogoError(true),
          onViewOptionsChange: setViewOptions,
          onGuidesChange: setGuides,
          onUndo: () => canvasHandleRef.current?.undo(),
          onRedo: () => canvasHandleRef.current?.redo(),
          onSelectionChange: setSelectedObj,
          onHistoryChange: (u, r) => {
            setCanUndo(u);
            setCanRedo(r);
            if (u || r) markDirty();
          },
          onZoomChange: () => undefined,
          onPageThumbReady: handlePageThumbReady,
          onTextFloatingAnchor: isMobile ? undefined : setTextFloatingAnchor,
          onTextFillHint: handleTextFillHint,
          onCanvasDocumentCommit: () => {
            return commitCanvasToPagesRef.current().then(() => undefined);
          },
          onPageTransitionBusyChange: setPageTransitionBusy,
          onDropRemoteImageUrl: handleImageUrlSubmit,
          onSidebarPhotoDropped: removeSidebarPhoto,
          resolveImageFileUrl,
        }}
      />
      {!isMobile && navigation.stripItems.length > 1 && (
        <button
          type="button"
          className="public-design-editor__edge-page-nav public-design-editor__edge-page-nav--next"
          disabled={!nextStripItem || pageTransitionBusy}
          aria-label="Следующая страница"
          onClick={() => {
            if (!nextStripItem) return;
            void handleGoToPage(nextStripItem.goToPage);
          }}
        >
          ›
        </button>
      )}
    </div>
  );

  const editorRootDevProps = import.meta.env.DEV
    ? ({ 'data-pde-build': 'client-desktop-main-column' } as const)
    : undefined;

  return (
    <div className={editorRootClassName} {...editorRootDevProps}>
      {!isMobile && (
        <EditorTopBar
          templateName={template.name}
          documentLabel={documentLabel}
          saving={saving}
          saveState={saveState}
          helpOpen={helpOpen}
          onSaveRetry={() => void handleSaveDraft(false)}
          onHelpToggle={() => setHelpOpen((open) => !open)}
        />
      )}

      <PublicDesignEditorAlerts
        status={status}
        error={error}
        textHint={textFillHint}
        onStatusClose={() => setStatus(null)}
        onErrorClose={() => setError(null)}
        onTextHintClose={() => setTextFillHint(null)}
      />

      <div className={workspaceClassName} {...workspaceLayoutProps}>
        {!isMobile && (
          <PublicDesignClientAside
            collapsed={clientAsideCollapsed}
            fragmentLabel={currentFragment.label}
            fragmentPreflight={fragmentPreflight}
            globalPreflight={preflight}
            saving={saving}
            nextAction={editorNextAction}
            pageCount={pages.length}
            pageStatuses={pageStatuses}
            sidebarPhotos={sidebarPhotos}
            selectedPhotoId={selectedLibraryPhotoId}
            helpOpen={helpOpen}
            onFilesSelected={handleMobileFilesSelected}
            onPhotoClick={handleLibraryPhotoClick}
            onPhotoSelect={setSelectedLibraryPhotoId}
            onPhotoRemove={removeSidebarPhoto}
            onPhotoRetry={retrySidebarPhoto}
            onNextAction={handleNextAction}
            onFieldFocus={handleFieldFocus}
            onPhotoReplace={handlePhotoReplace}
            onPlaceSelectedPhoto={selectedLibraryPhoto ? handlePlaceSelectedPhoto : undefined}
            onIssueFocus={handleIssueFocus}
            onCollapsedChange={setClientAsideCollapsed}
            onBeforeCheckTab={() => {
              void canvasHandleRef.current?.flushPendingDocumentCommit?.();
            }}
          />
        )}

        {!isMobile ? (
          <div className="public-design-editor__main-column">
            {canvasStageColumn}
            <footer
              className={`public-design-editor__page-chrome public-design-editor__page-chrome--${stripCollapsed ? 'collapsed' : 'expanded'}`}
              aria-label="Навигация по макету"
            >
              {pageNavigator}
            </footer>
          </div>
        ) : (
          <>
            {canvasStageColumn}
            {mobilePanel === 'check' ? (
              <PublicDesignTaskPanel
                activeTab={activeTaskTab}
                onTabChange={handleTaskTabChange}
                preflight={fragmentPreflight}
                checkPreflight={preflight}
                saving={saving}
                nextAction={editorNextAction}
                showNextAction={false}
                showOrderBar={false}
                onReadyForCart={handleRequestReadyForCart}
                onNextAction={handleNextAction}
                onFieldFocus={handleMobileFieldFocus}
                onPhotoReplace={handlePhotoReplace}
                onPlaceSelectedPhoto={selectedLibraryPhoto ? handlePlaceSelectedPhoto : undefined}
                onIssueFocus={handleCheckoutIssueFocus}
              />
            ) : (
              <PublicDesignInspector
                fragmentLabel={currentFragment.label}
                fragmentPreflight={fragmentPreflight}
                panel={inspectorPanel}
                saving={saving}
                nextAction={editorNextAction}
                sidebarPhotos={sidebarPhotos}
                selectedPhotoId={selectedLibraryPhotoId}
                helpOpen={helpOpen}
                onFilesSelected={handleMobileFilesSelected}
                onPhotoClick={handleLibraryPhotoClick}
                onPhotoSelect={setSelectedLibraryPhotoId}
                onPhotoRemove={removeSidebarPhoto}
                onPhotoRetry={retrySidebarPhoto}
                onNextAction={handleNextAction}
                onFieldFocus={handleMobileFieldFocus}
                onPhotoReplace={handlePhotoReplace}
                onPlaceSelectedPhoto={selectedLibraryPhoto ? handlePlaceSelectedPhoto : undefined}
              />
            )}
          </>
        )}
      </div>

      {isMobile && (
        <footer className="public-design-editor__mobile-chrome" aria-label="Навигация по макету">
          {pageNavigator}
          <PublicDesignEditorMobileDock
            activePanel={mobilePanel}
            photoCount={sidebarPhotos.length}
            missingPhotoCount={missingPhotoCount}
            textFieldCount={fragmentPreflight.textTotal}
            missingTextCount={missingTextCount}
            checkIssueCount={checkIssueCount}
            nextAction={editorNextAction}
            onPanelChange={setMobilePanel}
            onNextAction={handleMobileNextAction}
          />
        </footer>
      )}

      {showFinalizeButton && (
        <PublicDesignFinalizeForm
          form={customerForm}
          saving={saving}
          onChange={setCustomerForm}
          onSubmit={() => void handleFinalize()}
        />
      )}
      {!isMobile && (
        <PublicDesignTextFloatingControls
          anchor={textFloatingAnchor}
          canvasHandleRef={canvasHandleRef}
          selectedObj={selectedObj}
        />
      )}
      <PublicDesignCheckoutPreview
        open={checkoutPreviewOpen}
        stripItems={navigation.stripItems}
        thumbnails={thumbnails}
        preflight={preflight}
        saving={saving}
        onClose={() => setCheckoutPreviewOpen(false)}
        onConfirm={handleConfirmReadyForCart}
        onIssueFocus={handleCheckoutIssueFocus}
      />
      <ConfirmDialog
        isOpen={pendingDeletePage != null}
        onClose={() => setPendingDeletePage(null)}
        title="Удалить страницу?"
        message="Вы действительно хотите удалить страницу? Данное действие отменить будет нельзя."
        confirmText="Удалить страницу"
        cancelText="Отмена"
        variant="danger"
        onConfirm={() => {
          if (pendingDeletePage == null) return;
          void handleDeleteClientPage(pendingDeletePage);
        }}
      />
      <Modal
        isOpen={pageCountNotice != null}
        onClose={() => setPageCountNotice(null)}
        title="Страницы добавлены"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-primary">{pageCountNotice}</p>
          <div className="flex justify-end border-t border-color pt-4">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setPageCountNotice(null)}
            >
              Понятно
            </button>
          </div>
        </div>
      </Modal>
      <PublicDesignDraftConflictDialog
        isOpen={draftConflictOpen}
        onClose={handleDismissDraftConflict}
        onReloadFromServer={() => void handleReloadDraftFromServer()}
        onForceSave={() => void handleForceSaveDraft()}
      />
    </div>
  );
};

export default PublicDesignEditor;
