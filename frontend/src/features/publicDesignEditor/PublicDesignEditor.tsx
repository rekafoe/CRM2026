import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import { analyzePublicDesignPages } from './publicDesignPreflight';
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
      setSaveState('saved');
      if (!silent) setStatus('Вариация макета сохранена в draft.');
    } catch (err) {
      setSaveState('error');
      setError(err instanceof Error ? err.message : 'Не удалось сохранить draft');
    } finally {
      setSaving(false);
    }
  }, [adapter, buildCurrentDesignState, ensureDraft]);

  useEffect(() => {
    if (dirtyVersion === 0 || loading || saving) return;
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
      markDirty();
    },
    [currentPage, markDirty, navigation.leftPageIdx, navigation.rightPageIdx],
  );

  const saveStateLabel = {
    idle: 'Draft ещё не создан',
    dirty: 'Есть несохранённые изменения',
    saving: 'Сохраняем...',
    saved: 'Сохранено',
    error: 'Ошибка сохранения',
  }[saveState];

  if (loading) return <div className="public-design-editor__state">Загрузка редактора...</div>;
  if (!template) return <Alert type="error">{error ?? 'Шаблон не найден'}</Alert>;

  return (
    <div className="public-design-editor">
      <div className="public-design-editor__toolbar">
        <strong>{template.name}</strong>
        <span className="public-design-editor__hint">
          {documentMode === 'multipage' ? 'Многостраничный макет' : 'Листовой макет'} · master-шаблон не меняется
        </span>
        <span className={`public-design-editor__save-state public-design-editor__save-state--${saveState}`}>
          {saveStateLabel}
        </span>
        <span className="public-design-editor__draft-state">
          {draftResumeState === 'restored' ? 'Открыт сохранённый draft' : 'Новый draft'}
        </span>
        <Button variant="secondary" onClick={() => canvasHandleRef.current?.undo()} disabled={!canUndo}>Отменить</Button>
        <Button variant="secondary" onClick={() => canvasHandleRef.current?.redo()} disabled={!canRedo}>Повторить</Button>
        <Button variant="secondary" onClick={() => void handleSaveDraft(false)} disabled={saving}>{saving ? 'Сохранение...' : 'Сохранить draft'}</Button>
      </div>
      {status && <Alert type="success" onClose={() => setStatus(null)}>{status}</Alert>}
      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      <div className="public-design-editor__workspace">
        <PublicDesignTaskPanel
          activeTab={activeTaskTab}
          onTabChange={setActiveTaskTab}
          preflight={preflight}
          saveStateLabel={saveStateLabel}
          saving={saving}
          onSaveDraft={() => void handleSaveDraft(false)}
          onReadyForCart={() => void handleReadyForCart()}
        />
        <div className="design-editor-scroll-area public-design-editor__scroll" ref={scrollAreaRef}>
          <CanvasRulers
            widthMM={navigation.isSpreadView ? pageSpec.pageWidth * 2 : pageSpec.pageWidth}
            heightMM={pageSpec.pageHeight}
            fitZoom={fitZoom}
            originX={rulerOrigin.x}
            originY={rulerOrigin.y}
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
                    markDirty();
                  }}
                  onZoomChange={setZoom}
                  resolveImageFileUrl={resolveImageFileUrl}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      {pageSpec.pageCount > 1 && (
        <div className="public-design-editor__pages">
          {documentMode === 'multipage' ? (
            navigation.stripItems.map((item) => (
              <Button
                key={item.label}
                variant={item.pages.includes(currentPage) ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => void handleGoToPage(item.goToPage)}
              >
                {item.label}
              </Button>
            ))
          ) : (
            <>
              <Button variant="secondary" disabled={currentPage <= 0} onClick={() => void handleGoToPage(Math.max(0, currentPage - 1))}>Назад</Button>
              <span>{currentPage + 1} / {pageSpec.pageCount} · {Math.round(zoom * 100)}%</span>
              <Button variant="secondary" disabled={currentPage >= pageSpec.pageCount - 1} onClick={() => void handleGoToPage(Math.min(pageSpec.pageCount - 1, currentPage + 1))}>Вперёд</Button>
            </>
          )}
        </div>
      )}
      {selectedObj?.type === 'IText' && <div className="public-design-editor__hint">Текст можно редактировать прямо на макете.</div>}
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
