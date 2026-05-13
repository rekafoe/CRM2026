import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getPublicEditorBranding,
  getPublicDesignTemplate,
  type DesignTemplate,
} from '../../api';
import { Alert, Button } from '../../components/common';
import { API_BASE_URL } from '../../config/constants';
import { DesignEditorCanvas, type DesignEditorCanvasHandle } from '../../pages/admin/designEditor/DesignEditorCanvas';
import { CanvasRulers } from '../../pages/admin/designEditor/CanvasRulers';
import { EMPTY_PAGE, SAFE_ZONE_MM } from '../../pages/admin/designEditor/constants';
import { createDesignSceneGeometry } from '../../pages/admin/designEditor/designGeometry';
import {
  buildDesignState,
  mergeSavedEditorPages,
  readDesignTemplateSpec,
} from '../../pages/admin/designEditor/designEditorState';
import type { PageSaveSnapshot } from '../../pages/admin/designEditor/mergePagesSnapshot';
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
import {
  analyzePublicDesignPages,
  type PublicEditorPreflightField,
  type PublicEditorPreflightIssue,
} from './publicDesignPreflight';
import '../../pages/admin/DesignEditorPage.css';
import '../../pages/admin/designEditor/designEditorGlassTheme.css';
import './publicDesignEditor.css';

const DEFAULT_PREPRESS_CONFIG: DesignPrepressConfig = {
  bleedMm: 2,
  safeZoneMm: SAFE_ZONE_MM,
  showBleed: true,
  showTrim: true,
  showSafeZone: true,
  cutMarks: true,
};

type PendingTaskAction = {
  type: 'focus' | 'replacePhoto';
  fieldId?: string;
  fieldKind?: 'photo' | 'text';
  pageIndex: number;
};

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
    bleedMm: num(raw.bleedMm, DEFAULT_PREPRESS_CONFIG.bleedMm),
    safeZoneMm: num(raw.safeZoneMm, DEFAULT_PREPRESS_CONFIG.safeZoneMm),
    showBleed: bool(raw.showBleed, DEFAULT_PREPRESS_CONFIG.showBleed),
    showTrim: bool(raw.showTrim, DEFAULT_PREPRESS_CONFIG.showTrim),
    showSafeZone: bool(raw.showSafeZone, DEFAULT_PREPRESS_CONFIG.showSafeZone),
    cutMarks: bool(raw.cutMarks, DEFAULT_PREPRESS_CONFIG.cutMarks),
  };
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
  const canvasHandleRef = useRef<DesignEditorCanvasHandle | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const fitScalerRef = useRef<HTMLDivElement>(null);
  const savedDirtyVersionRef = useRef(0);

  const [template, setTemplate] = useState<DesignTemplate | null>(null);
  const [draftToken, setDraftToken] = useState<string | null>(initialDraftToken ?? null);
  const [pages, setPages] = useState<DesignPage[]>([{ ...EMPTY_PAGE }]);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedObj, setSelectedObj] = useState<SelectedObjProps | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle');
  const [draftResumeState, setDraftResumeState] = useState<'new' | 'restored'>(initialDraftToken ? 'restored' : 'new');
  const [dirtyVersion, setDirtyVersion] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTaskTab, setActiveTaskTab] = useState<PublicDesignTaskTab>('photo');
  const [helpOpen, setHelpOpen] = useState(false);
  const [organizationLogoUrl, setOrganizationLogoUrl] = useState<string | null>(null);
  const [organizationLogoError, setOrganizationLogoError] = useState(false);
  const [pendingTaskAction, setPendingTaskAction] = useState<PendingTaskAction | null>(null);
  const [customerForm, setCustomerForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
  });
  const [pageSpec, setPageSpec] = useState({ pageWidth: 90, pageHeight: 55, pageCount: 1, scale: 1 });
  const [spreadMode, setSpreadMode] = useState(false);
  const [coverPages, setCoverPages] = useState(1);
  const [prepressConfig, setPrepressConfig] = useState<DesignPrepressConfig>(DEFAULT_PREPRESS_CONFIG);
  const navigation = useDesignDocumentNavigation({
    mode: documentMode,
    pageCount: pageSpec.pageCount,
    currentPage,
    spreadMode,
    coverPages,
  });
  const preflight = useMemo(() => analyzePublicDesignPages(pages, saveState), [pages, saveState]);

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

  const { fitZoom, viewportReady: fitReady, rulerOrigin } = useDesignEditorViewport({
    viewportRef,
    fallbackRef: scrollAreaRef,
    pageWidthPx: sceneGeometry.pageWidthPx,
    pageHeightPx: sceneGeometry.pageHeightPx,
    bleedPx: sceneGeometry.bleedPx,
    showBleed: prepressConfig.showBleed,
    isSpreadView: navigation.isSpreadView,
  });

  const markDirty = useCallback(() => {
    setSaveState('dirty');
    setDirtyVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const el = fitScalerRef.current;
    if (!el) return;
    el.style.setProperty('--de-fit-zoom', String(fitZoom));
    el.dataset.ready = fitReady ? 'true' : 'false';
  }, [fitZoom, fitReady]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveState !== 'dirty' && saveState !== 'saving') return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveState]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await getPublicDesignTemplate(templateId);
        if (cancelled) return;
        const t = res.data;
        const spec = readDesignTemplateSpec(t);
        const ds = spec.designState;
        const sourceState = initialDraftToken
          ? (adapter ? (await adapter.getDraft(initialDraftToken)).payloadParsed?.designState as typeof ds | undefined : undefined) ?? ds
          : ds;
        const w = sourceState?.pageWidth ?? spec.width_mm ?? 90;
        const h = sourceState?.pageHeight ?? spec.height_mm ?? 55;
        const count = sourceState?.pages?.length
          ? Math.max(1, Math.min(99, sourceState.pages.length))
          : Math.max(1, Math.min(99, Number(spec.page_count) || 1));
        const scale = Number(sourceState?.sceneScale ?? 1);
        const nextSpreadMode = !!sourceState?.spread_mode && documentMode === 'multipage';
        const nextCoverPages = Math.max(0, Math.min(3, Number(sourceState?.cover_pages ?? spec.cover_pages ?? 1)));
        setTemplate(t);
        setDraftResumeState(initialDraftToken ? 'restored' : 'new');
        setSaveState(initialDraftToken ? 'saved' : 'idle');
        setPageSpec({ pageWidth: w, pageHeight: h, pageCount: count, scale: Number.isFinite(scale) && scale > 0 ? scale : 1 });
        setSpreadMode(nextSpreadMode);
        setCoverPages(nextCoverPages);
        setPrepressConfig(normalizePrepressConfig(sourceState?.prepress ?? spec.prepress));
        setPages(sourceState?.pages?.length ? sourceState.pages : Array.from({ length: count }, () => ({ ...EMPTY_PAGE })));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось открыть клиентский редактор');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [adapter, templateId, initialDraftToken, documentMode]);

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

  const ensureDraft = useCallback(async () => {
    if (draftToken) return draftToken;
    const res = await adapter.createDraft({
      designTemplateId: templateId,
      mode: documentMode,
      payload: {},
    });
    const token = res.token;
    if (!token) throw new Error('Draft не создан');
    setDraftToken(token);
    onDraftTokenChange?.(token);
    return token;
  }, [adapter, documentMode, draftToken, onDraftTokenChange, templateId]);

  const buildCurrentDesignState = useCallback(async () => {
    const handle = canvasHandleRef.current;
    const saved = handle ? await handle.saveCurrentPage() : { kind: 'single', json: {} };
    const updatedPages = mergeSavedEditorPages(
      pages,
      saved as PageSaveSnapshot,
      currentPage,
      navigation.leftPageIdx,
      navigation.rightPageIdx,
    );
    return {
      pages: updatedPages,
      designState: buildDesignState({
        templateId: String(templateId),
        pageWidth: pageSpec.pageWidth,
        pageHeight: pageSpec.pageHeight,
        pageCount: pageSpec.pageCount,
        sceneScale: pageSpec.scale,
        prepressConfig,
        pages: updatedPages,
        spreadMode: documentMode === 'multipage' && spreadMode,
        coverPages,
      }),
    };
  }, [coverPages, currentPage, documentMode, navigation.leftPageIdx, navigation.rightPageIdx, pageSpec, pages, prepressConfig, spreadMode, templateId]);

  const handleSaveDraft = useCallback(async (silent = false) => {
    try {
      setSaving(true);
      setSaveState('saving');
      if (!silent) setStatus(null);
      const token = await ensureDraft();
      const { pages: updatedPages, designState } = await buildCurrentDesignState();
      await adapter.updateDraft(token, { designState });
      setPages(updatedPages);
      savedDirtyVersionRef.current = dirtyVersion;
      setSaveState('saved');
      if (!silent) setStatus('Вариация макета сохранена в draft.');
    } catch (err) {
      setSaveState('error');
      setError(err instanceof Error ? err.message : 'Не удалось сохранить draft');
    } finally {
      setSaving(false);
    }
  }, [adapter, buildCurrentDesignState, dirtyVersion, ensureDraft]);

  useEffect(() => {
    if (dirtyVersion === 0 || loading || saving) return;
    if (dirtyVersion === savedDirtyVersionRef.current) return;
    const timer = window.setTimeout(() => {
      void handleSaveDraft(true);
    }, autosaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [autosaveDelayMs, dirtyVersion, handleSaveDraft, loading, saving]);

  const resolveImageFileUrl = useCallback(async (file: File) => {
    const token = await ensureDraft();
    const uploaded = await adapter.uploadDraftFile(token, file);
    markDirty();
    return uploaded.url;
  }, [adapter, ensureDraft, markDirty]);

  const handleFinalize = useCallback(async () => {
    try {
      const customerName = customerForm.customerName.trim();
      const customerPhone = customerForm.customerPhone.trim();
      const customerEmail = customerForm.customerEmail.trim();
      if (!customerName && !customerPhone) {
        setError('Укажите имя или телефон клиента');
        return;
      }
      setError(null);
      await handleSaveDraft(true);
      const token = await ensureDraft();
      if (!adapter.finalizeDraft) throw new Error('Finalize не настроен для этого редактора');
      await adapter.finalizeDraft(token, {
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerEmail: customerEmail || undefined,
      });
      setSaveState('saved');
      setStatus('Draft финализирован в заказ source=website.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось оформить заказ из draft');
    }
  }, [adapter, customerForm, ensureDraft, handleSaveDraft]);

  const handleReadyForCart = useCallback(async () => {
    try {
      setError(null);
      const { pages: updatedPages } = await buildCurrentDesignState();
      const nextPreflight = analyzePublicDesignPages(updatedPages, 'saved');
      setPages(updatedPages);
      if (nextPreflight.hasBlockingIssues) {
        setActiveTaskTab('check');
        setError('Перед возвратом в корзину исправьте ошибки проверки макета.');
        return;
      }
      await handleSaveDraft(true);
      const token = await ensureDraft();
      onReadyForCart?.(token);
      setStatus('Макет сохранён. Можно вернуться в корзину сайта.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось подготовить макет к корзине');
    }
  }, [buildCurrentDesignState, ensureDraft, handleSaveDraft, onReadyForCart]);

  const handleGoToPage = useCallback(
    async (pageIndex: number) => {
      const handle = canvasHandleRef.current;
      if (handle) {
        const saved = await handle.saveCurrentPage();
        setPages((currentPages) => mergeSavedEditorPages(
          currentPages,
          saved as PageSaveSnapshot,
          currentPage,
          navigation.leftPageIdx,
          navigation.rightPageIdx,
        ));
      }
      setCurrentPage(pageIndex);
    },
    [currentPage, navigation.leftPageIdx, navigation.rightPageIdx],
  );

  const runTaskAction = useCallback((action: PendingTaskAction) => {
    const handle = canvasHandleRef.current;
    if (!handle) return false;
    if (action.type === 'replacePhoto' && action.fieldId) {
      return handle.replacePhotoField(action.fieldId);
    }
    if (action.fieldId) {
      return handle.focusDesignObject(action.fieldId, { editText: action.fieldKind === 'text' });
    }
    return false;
  }, []);

  const requestTaskAction = useCallback(async (action: PendingTaskAction) => {
    setError(null);
    const needsPageSwitch = !navigation.stripItems.some((item) => item.pages.includes(currentPage) && item.pages.includes(action.pageIndex));
    if (needsPageSwitch) {
      setPendingTaskAction(action);
      await handleGoToPage(action.pageIndex);
      return;
    }
    window.setTimeout(() => {
      if (!runTaskAction(action)) setError('Не удалось найти поле на текущем макете.');
    }, 0);
  }, [currentPage, handleGoToPage, navigation.stripItems, runTaskAction]);

  useEffect(() => {
    if (!pendingTaskAction) return;
    const currentStrip = navigation.stripItems.find((item) => item.pages.includes(currentPage));
    if (!currentStrip?.pages.includes(pendingTaskAction.pageIndex)) return;
    const timer = window.setTimeout(() => {
      if (!runTaskAction(pendingTaskAction)) setError('Не удалось найти поле на текущем макете.');
      setPendingTaskAction(null);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [currentPage, navigation.stripItems, pendingTaskAction, runTaskAction]);

  const handleFieldFocus = useCallback((field: PublicEditorPreflightField, kind: 'photo' | 'text') => {
    void requestTaskAction({
      type: 'focus',
      fieldId: field.id,
      fieldKind: kind,
      pageIndex: field.pageIndex,
    });
  }, [requestTaskAction]);

  const handlePhotoReplace = useCallback((field: PublicEditorPreflightField) => {
    void requestTaskAction({
      type: 'replacePhoto',
      fieldId: field.id,
      fieldKind: 'photo',
      pageIndex: field.pageIndex,
    });
  }, [requestTaskAction]);

  const handleIssueFocus = useCallback((issue: PublicEditorPreflightIssue) => {
    const photoField = preflight.photoFields.find((field) => field.pageIndex === issue.pageIndex && issue.id === `photo-${field.id}`);
    if (photoField) {
      handleFieldFocus(photoField, 'photo');
      return;
    }
    const textField = preflight.textFields.find((field) => field.pageIndex === issue.pageIndex && field.status !== 'ready');
    if (textField) {
      handleFieldFocus(textField, 'text');
      return;
    }
    void handleGoToPage(issue.pageIndex);
  }, [handleFieldFocus, handleGoToPage, preflight.photoFields, preflight.textFields]);

  const saveStateLabel = {
    idle: 'Draft ещё не создан',
    dirty: 'Есть несохранённые изменения',
    saving: 'Сохраняем...',
    saved: 'Сохранено',
    error: 'Ошибка сохранения',
  }[saveState];
  const isMultipageDocument = documentMode === 'multipage';
  const isTwoSidedDocument = !isMultipageDocument && pageSpec.pageCount === 2;
  const documentLabel = isMultipageDocument
    ? 'Многостраничный макет'
    : isTwoSidedDocument
      ? 'Двухсторонний макет'
      : 'Одностраничный макет';
  const navigationLabel = isMultipageDocument
    ? (spreadMode ? 'Развороты' : 'Страницы')
    : isTwoSidedDocument
      ? 'Стороны'
      : 'Страница';
  const currentStripItem = navigation.stripItems.find((item) => item.pages.includes(currentPage));
  const currentPageLabel = currentStripItem?.label ?? `${currentPage + 1} / ${pageSpec.pageCount}`;
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

  if (loading) return <div className="public-design-editor__state">Загрузка редактора...</div>;
  if (!template) return <Alert type="error">{error ?? 'Шаблон не найден'}</Alert>;

  return (
    <div className={`public-design-editor public-design-editor--${isMultipageDocument ? 'multipage' : 'single'}`}>
      <header className="public-design-editor__topbar">
        <div className="public-design-editor__brand">
          <div className="public-design-editor__logo" aria-label="PrintCore">
            <span className="public-design-editor__logo-mark">P</span>
            <span className="public-design-editor__logo-text">PrintCore Studio</span>
          </div>
          <div className="public-design-editor__title">
            <span className="public-design-editor__eyebrow">Онлайн-редактор макета</span>
            <h1>{template.name}</h1>
          </div>
        </div>
        <div className="public-design-editor__meta">
          <span className="public-design-editor__document-badge">{documentLabel}</span>
          <span className={`public-design-editor__save-state public-design-editor__save-state--${saveState}`}>
            {saveStateLabel}
          </span>
          <span className="public-design-editor__draft-state">
            {draftResumeState === 'restored' ? 'Открыт draft' : 'Новый draft'}
          </span>
        </div>
        <div className="public-design-editor__top-actions">
          <Button variant="secondary" onClick={() => setHelpOpen((open) => !open)}>
            Помощь
          </Button>
          <Button variant="secondary" onClick={() => void handleSaveDraft(false)} disabled={saving}>
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </Button>
          <Button onClick={() => void handleReadyForCart()} disabled={saving}>
            В корзину
          </Button>
        </div>
      </header>

      {(status || error) && (
        <div className="public-design-editor__alerts">
          {status && <Alert type="success" onClose={() => setStatus(null)}>{status}</Alert>}
          {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
        </div>
      )}

      <div className="public-design-editor__workspace">
        <section className="public-design-editor__stage" aria-label="Рабочая область макета">
          <div className="public-design-editor__stage-toolbar">
            <div className="public-design-editor__page-caption">
              <strong>{navigationLabel}</strong>
              <span>{currentPageLabel}</span>
            </div>
            <div className="public-design-editor__canvas-actions">
              <Button variant="secondary" size="sm" onClick={() => canvasHandleRef.current?.undo()} disabled={!canUndo}>Отменить</Button>
              <Button variant="secondary" size="sm" onClick={() => canvasHandleRef.current?.redo()} disabled={!canRedo}>Повторить</Button>
              <Button variant="secondary" size="sm" onClick={handleZoomOut}>−</Button>
              <button type="button" className="public-design-editor__zoom-value" onClick={handleZoomReset}>
                {Math.round(zoom * 100)}%
              </button>
              <Button variant="secondary" size="sm" onClick={handleZoomIn}>+</Button>
            </div>
          </div>
          <div className="design-editor-scroll-area public-design-editor__scroll" ref={scrollAreaRef}>
            {showOrganizationLogo && (
              <img
                className="public-design-editor__stage-logo"
                src={organizationLogoUrl}
                alt=""
                aria-hidden="true"
                onError={() => setOrganizationLogoError(true)}
              />
            )}
            <CanvasRulers
              widthMM={navigation.isSpreadView ? pageSpec.pageWidth * 2 : pageSpec.pageWidth}
              heightMM={pageSpec.pageHeight}
              fitZoom={fitZoom}
              sceneScale={pageSpec.scale}
              originX={rulerOrigin.x}
              originY={rulerOrigin.y}
              coordinateOrigin="trim"
              guides={[]}
              onGuidesChange={() => {}}
            />
            <div className="design-editor-viewport" ref={viewportRef}>
              <div ref={fitScalerRef} className="design-editor-fit-scaler" data-ready="false">
                <div className="design-editor-canvas-wrap">
                  <DesignEditorCanvas
                    ref={canvasHandleRef}
                    template={template}
                    pageWidthPx={sceneGeometry.pageWidthPx}
                    canvasWidthPx={navigation.isSpreadView ? sceneGeometry.pageWidthPx * 2 : sceneGeometry.pageWidthPx}
                    pageHeightPx={sceneGeometry.pageHeightPx}
                    safeZonePx={sceneGeometry.safeZonePx}
                    bleedPx={sceneGeometry.bleedPx}
                    showBleed={prepressConfig.showBleed}
                    showTrim={prepressConfig.showTrim}
                    showSafeZone={prepressConfig.showSafeZone}
                    pages={pages}
                    setPages={setPages}
                    currentPage={currentPage}
                    pageLoadKey={navigation.pageLoadKey}
                    spreadPairPages={navigation.spreadPairPages}
                    showGuides
                    apiBaseUrl={API_BASE_URL}
                    mode="basic"
                    onSelectionChange={setSelectedObj}
                    onHistoryChange={(u, r) => {
                      setCanUndo(u);
                      setCanRedo(r);
                      if (u || r) markDirty();
                    }}
                    onZoomChange={setZoom}
                    resolveImageFileUrl={resolveImageFileUrl}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="public-design-editor__sidepanel" aria-label="Инструменты макета">
          <section className="public-design-editor__prep-card">
            <span className="public-design-editor__prep-kicker">Подготовка к печати</span>
            <strong>{preflight.hasBlockingIssues ? 'Нужно проверить макет' : 'Макет выглядит готовым'}</strong>
            <div className="public-design-editor__prep-stats">
              <span>{preflight.photoReady}/{preflight.photoTotal} фото</span>
              <span>{preflight.textReady}/{preflight.textTotal} текст</span>
            </div>
          </section>
          <PublicDesignTaskPanel
            activeTab={activeTaskTab}
            onTabChange={setActiveTaskTab}
            preflight={preflight}
            saveStateLabel={saveStateLabel}
            saving={saving}
            onSaveDraft={() => void handleSaveDraft(false)}
            onReadyForCart={() => void handleReadyForCart()}
            onFieldFocus={handleFieldFocus}
            onPhotoReplace={handlePhotoReplace}
            onIssueFocus={handleIssueFocus}
          />
          {helpOpen && (
            <section className="public-design-editor__help">
              <h2>Как пользоваться редактором</h2>
              <ul>
                <li>Выберите фото или текст на макете, чтобы заменить содержимое.</li>
                <li>Перетаскивайте элементы внутри безопасной зоны.</li>
                <li>Используйте масштаб, если нужно точно поставить кадр.</li>
                <li>Перед корзиной проверьте вкладку «Проверка».</li>
              </ul>
            </section>
          )}
          {selectedObj?.type === 'IText' && (
            <div className="public-design-editor__selection-hint">
              Текст можно редактировать прямо на макете.
            </div>
          )}
        </aside>
      </div>

      {pageSpec.pageCount > 1 && (
        <nav className="public-design-editor__page-rail" aria-label={navigationLabel}>
          <div className="public-design-editor__page-rail-title">{navigationLabel}</div>
          <div className="public-design-editor__page-rail-items">
            {navigation.stripItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`public-design-editor__page-chip${item.pages.includes(currentPage) ? ' public-design-editor__page-chip--active' : ''}`}
                onClick={() => void handleGoToPage(item.goToPage)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      )}
      {showFinalizeButton && (
        <form
          className="public-design-editor__finalize"
          onSubmit={(event) => {
            event.preventDefault();
            void handleFinalize();
          }}
        >
          <div className="public-design-editor__finalize-title">Оформить тестовый заказ</div>
          <label>
            <span>Имя</span>
            <input
              type="text"
              value={customerForm.customerName}
              onChange={(event) => setCustomerForm((form) => ({ ...form, customerName: event.target.value }))}
              placeholder="Иван Петров"
            />
          </label>
          <label>
            <span>Телефон</span>
            <input
              type="tel"
              value={customerForm.customerPhone}
              onChange={(event) => setCustomerForm((form) => ({ ...form, customerPhone: event.target.value }))}
              placeholder="+375..."
            />
          </label>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={customerForm.customerEmail}
              onChange={(event) => setCustomerForm((form) => ({ ...form, customerEmail: event.target.value }))}
              placeholder="client@example.com"
            />
          </label>
          <Button variant="secondary" type="submit" disabled={saving}>
            Создать заказ из draft
          </Button>
        </form>
      )}
    </div>
  );
};

export default PublicDesignEditor;
