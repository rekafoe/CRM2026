import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ConfirmDialog } from '../../components/common';
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
import { usePublicDesignPageActions } from './usePublicDesignPageActions';
import { usePublicDesignPhotoLibrary } from './usePublicDesignPhotoLibrary';
import { rememberPageThumbnail } from '../../pages/admin/designEditor/designPageThumbnailCache';
import { usePublicDesignThumbnailPrefetch } from './usePublicDesignThumbnailPrefetch';
import { useSpreadLayoutNormalize } from './useSpreadLayoutNormalize';
import { isEditorSpreadModeActive } from '../../pages/admin/designEditor/editorSpreadMode';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  PublicDesignEditorMobileDock,
  type PublicDesignMobilePanel,
} from './PublicDesignEditorMobileDock';
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

interface PublicDesignEditorProps {
  templateId: number;
  initialDraftToken?: string | null;
  onDraftTokenChange?: (token: string) => void;
  adapter?: PublicDesignEditorAdapter;
  autosaveDelayMs?: number;
  showFinalizeButton?: boolean;
  documentMode?: PublicDesignDocumentMode;
  onReadyForCart?: (draftToken: string) => void;
}

export const PublicDesignEditor: React.FC<PublicDesignEditorProps> = ({
  templateId,
  initialDraftToken,
  onDraftTokenChange,
  adapter = crmPreviewPublicDesignEditorAdapter,
  autosaveDelayMs = 1200,
  showFinalizeButton = false,
  documentMode = 'single',
  onReadyForCart,
}) => {
  const bootstrapKey = `${documentMode}:${templateId}`;
  const bootstrapDraftTokenRef = useRef<{ key: string; token: string | null } | null>(null);
  if (!bootstrapDraftTokenRef.current || bootstrapDraftTokenRef.current.key !== bootstrapKey) {
    bootstrapDraftTokenRef.current = { key: bootstrapKey, token: initialDraftToken ?? null };
  }
  const bootstrapDraftToken = bootstrapDraftTokenRef.current.token;
  const canvasHandleRef = useRef<DesignEditorCanvasHandle | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fitScalerRef = useRef<HTMLDivElement>(null);

  const [draftToken, setDraftToken] = useState<string | null>(bootstrapDraftToken);
  const [pages, setPages] = useState<DesignPage[]>([{ ...EMPTY_PAGE }]);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedObj, setSelectedObj] = useState<SelectedObjProps | null>(null);
  const [textFloatingAnchor, setTextFloatingAnchor] = useState<{ x: number; y: number } | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [stripCollapsed, setStripCollapsed] = useState(false);
  const [guides, setGuides] = useState<GuideLine[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const [dirtyVersion, setDirtyVersion] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [textFillHint, setTextFillHint] = useState<string | null>(null);
  const [activeTaskTab, setActiveTaskTab] = useState<PublicDesignTaskTab>('photo');
  const suppressDirtyRef = useRef(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedLibraryPhotoId, setSelectedLibraryPhotoId] = useState<string | null>(null);
  const [checkoutPreviewOpen, setCheckoutPreviewOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<PublicDesignMobilePanel>('canvas');
  const isMobile = useMediaQuery('(max-width: 760px)');
  const [pendingDeletePage, setPendingDeletePage] = useState<number | null>(null);
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
  const preflight = useMemo(
    () => analyzePublicDesignPages(pages, saveState, {
      pageWidthPx: sceneGeometry.pageWidthPx,
      pageHeightPx: sceneGeometry.pageHeightPx,
      safeZonePx: sceneGeometry.safeZonePx,
    }),
    [pages, saveState, sceneGeometry.pageWidthPx, sceneGeometry.pageHeightPx, sceneGeometry.safeZonePx],
  );
  const currentStripItem = navigation.stripItems.find((item) => item.pages.includes(currentPage));
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
    + (isMobile ? { canvas: 0, photos: 1, text: 2, check: 3 }[mobilePanel] ?? 0 : 0) * 4;

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
    setDraftToken(bootstrapDraftToken);
    setCurrentPage(0);
    setSelectedObj(null);
    setTextFloatingAnchor(null);
    setThumbnails({});
    setGuides([]);
    setCanUndo(false);
    setCanRedo(false);
    setZoom(1);
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
  } = usePublicDesignDraftActions({
    adapter,
    autosaveDelayMs,
    canvasHandleRef,
    coverPages,
    currentPage,
    customerForm,
    dirtyVersion,
    documentMode,
    draftToken,
    loading,
    navigation,
    pageSpec,
    pages,
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
    onDraftTokenChange,
    onReadyForCart,
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

  useEffect(() => {
    if (!textFillHint) return undefined;
    const timer = window.setTimeout(() => setTextFillHint(null), 8000);
    return () => window.clearTimeout(timer);
  }, [textFillHint]);

  const {
    saveCurrentCanvasPage,
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
    pageSpec,
    spreadMode: editorSpreadMode,
    coverPages,
    minimumPageCount,
    setPages,
    setCurrentPage,
    setPageSpec,
    setThumbnails,
    markDirty,
  });

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
    onReadyForCart: () => setCheckoutPreviewOpen(true),
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
    setActiveTaskTab(tab);
    if (isMobile && tab === 'check') setMobilePanel('check');
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || activeTaskTab !== 'check') return;
    setMobilePanel('check');
  }, [activeTaskTab, isMobile]);

  const handleRequestReadyForCart = useCallback(() => {
    if (preflight.hasBlockingIssues) {
      void handleReadyForCart();
      return;
    }
    setCheckoutPreviewOpen(true);
  }, [handleReadyForCart, preflight.hasBlockingIssues]);

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
  const handleZoomIn = useCallback(() => {
    const handle = canvasHandleRef.current;
    if (!handle) return;
    handle.setZoom(handle.getZoom() * 1.15);
  }, []);
  const handleZoomOut = useCallback(() => {
    const handle = canvasHandleRef.current;
    if (!handle) return;
    handle.setZoom(handle.getZoom() / 1.15);
  }, []);
  const handleZoomReset = useCallback(() => {
    canvasHandleRef.current?.setZoom(1);
  }, []);

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
      zoom={zoom}
      spreadMode={editorSpreadMode}
      collapsed={isMobile ? false : stripCollapsed}
      pageStatuses={pageStatuses}
      showWhenSingle
      canAddPages={documentMode === 'multipage' || pageSpec.pageCount > 1}
      canAddSpread={documentMode === 'multipage' && !isMobile}
      canDeletePages={(documentMode === 'multipage' || pageSpec.pageCount > 1) && pageSpec.pageCount > minimumPageCount}
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
    />
  );

  const canvasStageColumn = (
    <div className="public-design-editor__canvas-column">
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
          zoom,
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
          onZoomOut: handleZoomOut,
          onZoomIn: handleZoomIn,
          onZoomReset: handleZoomReset,
          onSelectionChange: setSelectedObj,
          onHistoryChange: (u, r) => {
            setCanUndo(u);
            setCanRedo(r);
            if (u || r) markDirty();
          },
          onZoomChange: setZoom,
          onPageThumbReady: handlePageThumbReady,
          onTextFloatingAnchor: isMobile ? undefined : setTextFloatingAnchor,
          onTextFillHint: handleTextFillHint,
          onTextEditCommitted: () => {
            void saveCurrentCanvasPage();
          },
          onDropRemoteImageUrl: handleImageUrlSubmit,
          onSidebarPhotoDropped: removeSidebarPhoto,
          resolveImageFileUrl,
        }}
      />
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
            onBeforeCheckTab={() => {
              void saveCurrentCanvasPage();
            }}
          />
        )}

        {!isMobile ? (
          <div className="public-design-editor__main-column">
            {canvasStageColumn}
            <footer className="public-design-editor__page-chrome" aria-label="Навигация по макету">
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
    </div>
  );
};

export default PublicDesignEditor;
