import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { DesignEditorCanvasHandle } from '../../pages/admin/designEditor/DesignEditorCanvas';
import {
  buildDesignState,
} from '../../pages/admin/designEditor/designEditorState';
import type { DesignPage, DesignPrepressConfig, DesignState } from '../../pages/admin/designEditor/types';
import { analyzePublicDesignPages } from './publicDesignPreflight';
import type { PublicDesignEditorAdapter } from './publicDesignEditorAdapter';
import type { PublicEditorDraftFile } from '../../api';
import type { PublicDesignDocumentMode } from './useDesignDocumentNavigation';
import type { PublicDesignPageSpec } from './usePublicDesignPageActions';
import { isDraftVersionConflictError } from './draftConflict';
import {
  extractDesignStateFromDraftPayload,
  normalizePrepressFromDesignState,
  resolvePagesFromDesignState,
} from './applyPublicDesignState';
import {
  recordPublicEditorPerfMetric,
  startPublicEditorPerfSpan,
} from './publicEditorPerf';
import { buildProductionDesignState } from './productionDesignState';
import { reconcileDesignPagesTextLoss } from '../../pages/admin/designEditor/fabricSnapshotReconcile';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface CustomerFormState {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
}

interface UsePublicDesignDraftActionsInput {
  adapter: PublicDesignEditorAdapter;
  autosaveDelayMs: number;
  canvasHandleRef: RefObject<DesignEditorCanvasHandle | null>;
  coverPages: number;
  customerForm: CustomerFormState;
  dirtyVersion: number;
  documentMode: PublicDesignDocumentMode;
  /** Режим в editor_drafts.mode (например souvenir_3d). По умолчанию = documentMode. */
  draftMode?: string;
  /** Доп. поля в payload draft (editorKind, printAreas). */
  draftPayloadExtras?: Record<string, unknown>;
  draftToken: string | null;
  loading: boolean;
  pageSpec: PublicDesignPageSpec;
  pages: DesignPage[];
  getLatestPages?: () => DesignPage[];
  prepressConfig: DesignPrepressConfig;
  saving: boolean;
  spreadMode: boolean;
  templateId: number;
  setActiveTaskTab: (tab: 'photo' | 'text' | 'check') => void;
  setDraftToken: (token: string) => void;
  setError: (message: string | null) => void;
  setPages: Dispatch<SetStateAction<DesignPage[]>>;
  setSaveState: (state: SaveState) => void;
  setSaving: (saving: boolean) => void;
  setStatus: (message: string | null) => void;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  setPageSpec: Dispatch<SetStateAction<PublicDesignPageSpec>>;
  setSpreadMode: Dispatch<SetStateAction<boolean>>;
  setCoverPages: Dispatch<SetStateAction<number>>;
  setPrepressConfig: Dispatch<SetStateAction<DesignPrepressConfig>>;
  onDraftTokenChange?: (token: string) => void;
  onReadyForCart?: (draftToken: string) => void;
  /**
   * Перед preflight/export: commit text sheet + saveCurrentPage в pages[].
   * Без этого свежие правки с live-холста не попадают в заказ.
   */
  preparePagesForCart?: () => Promise<DesignPage[] | null>;
  selectedParams?: Record<string, unknown>;
}

interface PersistDraftOptions {
  skipExpectedVersion?: boolean;
  pagesOverride?: DesignPage[];
  skipCanvasFlush?: boolean;
  forcePersist?: boolean;
}

/** Для export/заказа: свежий saveCurrentPage важнее устаревшего React state. */
export function pickPagesForCartExport<T>(
  preparedPages: T[] | null | undefined,
  statePages: T[],
): T[] {
  return preparedPages ?? statePages;
}

interface QueuedPersistRequest {
  silent: boolean;
  options?: PersistDraftOptions;
  waiters: Array<{
    resolve: () => void;
    reject: (error: unknown) => void;
  }>;
}

function hashPayloadRaw(raw: string): string {
  let hash = 2_166_136_261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 1_677_761_9);
  }
  return `${raw.length}:${(hash >>> 0).toString(36)}`;
}

function buildAutosavePayloadDigest(input: {
  designState: Record<string, unknown>;
  productionDesignState: Record<string, unknown>;
  selectedParams: Record<string, unknown> | undefined;
}): {
  hash: string;
  bytes: number;
} {
  const designStateRaw = JSON.stringify(input.designState);
  const productionDesignStateRaw = JSON.stringify(input.productionDesignState);
  const selectedParamsRaw = input.selectedParams ? JSON.stringify(input.selectedParams) : '';
  const raw = selectedParamsRaw
    ? `${designStateRaw}|${productionDesignStateRaw}|${selectedParamsRaw}`
    : `${designStateRaw}|${productionDesignStateRaw}`;
  return {
    hash: hashPayloadRaw(raw),
    bytes: raw.length * 2,
  };
}

function mergePersistOptions(
  left?: PersistDraftOptions,
  right?: PersistDraftOptions,
): PersistDraftOptions | undefined {
  if (!left && !right) return undefined;
  return {
    skipExpectedVersion: Boolean(left?.skipExpectedVersion || right?.skipExpectedVersion),
    skipCanvasFlush: Boolean(left?.skipCanvasFlush || right?.skipCanvasFlush),
    forcePersist: Boolean(left?.forcePersist || right?.forcePersist),
    pagesOverride: right?.pagesOverride ?? left?.pagesOverride,
  };
}

export function usePublicDesignDraftActions({
  adapter,
  autosaveDelayMs,
  canvasHandleRef,
  coverPages,
  customerForm,
  dirtyVersion,
  documentMode,
  draftMode,
  draftPayloadExtras,
  draftToken,
  loading,
  pageSpec,
  pages,
  getLatestPages,
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
  preparePagesForCart,
  selectedParams,
}: UsePublicDesignDraftActionsInput) {
  const savedDirtyVersionRef = useRef(0);
  const draftVersionRef = useRef<number | null>(null);
  const [draftConflictOpen, setDraftConflictOpen] = useState(false);
  const autosavePausedRef = useRef(false);
  const persistDrainRunningRef = useRef(false);
  const queuedPersistRef = useRef<QueuedPersistRequest | null>(null);
  const versionHydrationPromiseRef = useRef<Promise<void> | null>(null);
  const lastSavedPayloadHashRef = useRef<string | null>(null);
  const lastSavedPayloadTokenRef = useRef<string | null>(null);
  /** Последний успешно ушедший на сервер pages[] — защита от PATCH с пустыми text. */
  const lastPersistedPagesRef = useRef<DesignPage[] | null>(null);

  const applyDesignStateFromServer = useCallback(async (designState: DesignState) => {
    const spreadModeActive = documentMode === 'multipage' && designState.spread_mode === true;
    const nextCoverPages = documentMode === 'multipage'
      ? Math.max(1, Math.min(3, Number(designState.cover_pages ?? coverPages)))
      : Math.max(0, Math.min(3, Number(designState.cover_pages ?? coverPages)));
    const { pages: nextPages, pageCount } = resolvePagesFromDesignState(
      designState,
      documentMode,
      nextCoverPages,
    );
    const scale = Number(designState.sceneScale);
    setPages(nextPages);
    setPageSpec({
      pageWidth: designState.pageWidth,
      pageHeight: designState.pageHeight,
      pageCount,
      scale: Number.isFinite(scale) && scale > 0 ? scale : pageSpec.scale,
    });
    setSpreadMode(spreadModeActive);
    setCoverPages(nextCoverPages);
    setPrepressConfig(normalizePrepressFromDesignState(designState.prepress));
    setCurrentPage(0);
    lastPersistedPagesRef.current = nextPages;
    await canvasHandleRef.current?.whenPageTransitionIdle?.();
    await canvasHandleRef.current?.applyEditorViewState(nextPages);
  }, [
    canvasHandleRef,
    coverPages,
    documentMode,
    pageSpec.scale,
    setCoverPages,
    setCurrentPage,
    setPageSpec,
    setPages,
    setPrepressConfig,
    setSpreadMode,
  ]);

  useEffect(() => {
    draftVersionRef.current = null;
    lastSavedPayloadHashRef.current = null;
    lastSavedPayloadTokenRef.current = null;
    lastPersistedPagesRef.current = null;
    versionHydrationPromiseRef.current = null;
  }, [draftToken]);

  const ensureDraft = useCallback(async () => {
    if (draftToken) return draftToken;
    const res = await adapter.createDraft({
      designTemplateId: templateId,
      mode: draftMode || documentMode,
      payload: { ...(draftPayloadExtras ?? {}) },
    });
    const token = res.token;
    if (!token) throw new Error('Не удалось подготовить макет.');
    draftVersionRef.current = typeof res.version === 'number' ? res.version : null;
    setDraftToken(token);
    onDraftTokenChange?.(token);
    return token;
  }, [adapter, documentMode, draftMode, draftPayloadExtras, draftToken, onDraftTokenChange, setDraftToken, templateId]);

  const hydrateDraftVersion = useCallback(async (token: string) => {
    if (!token) return;
    if (draftVersionRef.current != null) return;
    if (versionHydrationPromiseRef.current) {
      await versionHydrationPromiseRef.current;
      return;
    }
    versionHydrationPromiseRef.current = (async () => {
      try {
        const draft = await adapter.getDraft(token);
        if (typeof draft.version === 'number' && draft.version > 0) {
          draftVersionRef.current = draft.version;
        }
      } finally {
        versionHydrationPromiseRef.current = null;
      }
    })();
    await versionHydrationPromiseRef.current;
  }, [adapter]);

  useEffect(() => {
    if (!draftToken || loading || draftVersionRef.current != null) return;
    void hydrateDraftVersion(draftToken).catch(() => undefined);
  }, [draftToken, hydrateDraftVersion, loading]);

  const buildCurrentDesignState = useCallback((pagesOverride?: DesignPage[]) => {
    const updatedPages = pagesOverride ?? getLatestPages?.() ?? pages;
    const nextSelectedParams = documentMode === 'multipage'
      ? { ...(selectedParams ?? {}), pages: pageSpec.pageCount }
      : selectedParams;
    return {
      pages: updatedPages,
      selectedParams: nextSelectedParams,
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
  }, [
    coverPages,
    documentMode,
    getLatestPages,
    pageSpec,
    pages,
    prepressConfig,
    selectedParams,
    spreadMode,
    templateId,
  ]);

  const persistDraft = useCallback(async (
    silent: boolean,
    options?: PersistDraftOptions,
  ) => {
    const stopPersist = startPublicEditorPerfSpan('autosave.persist.total.ms', {
      silent,
    });
    setSaveState('saving');
    if (!silent) setStatus(null);
    try {
      if (!options?.skipCanvasFlush) {
        await canvasHandleRef.current?.flushPendingDocumentCommit?.();
        await canvasHandleRef.current?.whenPageTransitionIdle?.();
      }
      const token = await ensureDraft();
      if (!options?.skipExpectedVersion) {
        await hydrateDraftVersion(token).catch(() => undefined);
      }
      const built = buildCurrentDesignState(options?.pagesOverride);
      const safePages = reconcileDesignPagesTextLoss(
        lastPersistedPagesRef.current ?? undefined,
        built.pages,
      );
      const { designState, selectedParams: nextSelectedParams } = safePages === built.pages
        ? built
        : buildCurrentDesignState(safePages);
      if (safePages !== built.pages) {
        recordPublicEditorPerfMetric('autosave.textReconcile.count', 1, { token });
        setPages(safePages);
      }
      const productionDesignState = buildProductionDesignState(designState);
      const digest = buildAutosavePayloadDigest({
        designState: designState as unknown as Record<string, unknown>,
        productionDesignState: productionDesignState as unknown as Record<string, unknown>,
        selectedParams: nextSelectedParams,
      });
      recordPublicEditorPerfMetric('autosave.payload.bytes', digest.bytes, {
        token,
      });
      if (
        !options?.forcePersist
        && !options?.skipExpectedVersion
        && lastSavedPayloadTokenRef.current === token
        && lastSavedPayloadHashRef.current === digest.hash
      ) {
        recordPublicEditorPerfMetric('autosave.skippedUnchanged.count', 1, { token });
        savedDirtyVersionRef.current = dirtyVersion;
        setSaveState('saved');
        if (!silent) setStatus('Изменений нет, макет уже сохранён.');
        return;
      }

      const patch: Record<string, unknown> = {
        designState,
        productionDesignState,
        ...(draftPayloadExtras ?? {}),
      };
      if (nextSelectedParams) patch.selectedParams = nextSelectedParams;
      if (!options?.skipExpectedVersion && draftVersionRef.current != null) {
        patch.expectedVersion = draftVersionRef.current;
      }
      const stopPatch = startPublicEditorPerfSpan('autosave.persist.patch.ms', { token });
      let savedDraft: Awaited<ReturnType<PublicDesignEditorAdapter['updateDraft']>>;
      try {
        savedDraft = await adapter.updateDraft(token, patch);
      } finally {
        stopPatch();
      }
      if (savedDraft && typeof savedDraft.version === 'number') {
        draftVersionRef.current = savedDraft.version;
      }
      lastSavedPayloadHashRef.current = digest.hash;
      lastSavedPayloadTokenRef.current = token;
      lastPersistedPagesRef.current = designState.pages ?? safePages;
      savedDirtyVersionRef.current = dirtyVersion;
      setSaveState('saved');
      if (!silent) setStatus('Макет сохранён.');
    } finally {
      stopPersist();
    }
  }, [
    adapter,
    buildCurrentDesignState,
    canvasHandleRef,
    dirtyVersion,
    draftPayloadExtras,
    ensureDraft,
    hydrateDraftVersion,
    setPages,
    setSaveState,
    setStatus,
  ]);

  const executePersistRequest = useCallback(async (
    silent: boolean,
    options?: PersistDraftOptions,
  ) => {
    if (draftConflictOpen || autosavePausedRef.current) return;
    setSaving(true);
    try {
      await persistDraft(silent, options);
    } finally {
      setSaving(false);
    }
  }, [draftConflictOpen, persistDraft, setSaving]);

  const enqueuePersistDraft = useCallback((
    silent: boolean,
    options?: PersistDraftOptions,
  ): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      const waiter = { resolve, reject };
      const mergeInto = (target: QueuedPersistRequest) => {
        target.silent = target.silent && silent;
        target.options = mergePersistOptions(target.options, options);
        target.waiters.push(waiter);
      };

      if (persistDrainRunningRef.current) {
        if (queuedPersistRef.current) {
          mergeInto(queuedPersistRef.current);
        } else {
          queuedPersistRef.current = {
            silent,
            options,
            waiters: [waiter],
          };
        }
        return;
      }

      persistDrainRunningRef.current = true;
      let current: QueuedPersistRequest | null = {
        silent,
        options,
        waiters: [waiter],
      };
      void (async () => {
        try {
          while (current) {
            try {
              await executePersistRequest(current.silent, current.options);
              current.waiters.forEach((entry) => entry.resolve());
            } catch (error) {
              current.waiters.forEach((entry) => entry.reject(error));
            }
            current = queuedPersistRef.current;
            queuedPersistRef.current = null;
          }
        } finally {
          persistDrainRunningRef.current = false;
        }
      })();
    });
  }, [executePersistRequest]);

  const handleSaveDraft = useCallback(async (
    silent = false,
    options?: PersistDraftOptions,
  ) => {
    if (draftConflictOpen || autosavePausedRef.current) return;
    try {
      await enqueuePersistDraft(silent, options);
    } catch (err) {
      if (isDraftVersionConflictError(err)) {
        setDraftConflictOpen(true);
        autosavePausedRef.current = true;
        setSaveState('dirty');
        if (!silent) setStatus(null);
        return;
      }
      setSaveState('error');
      setError(err instanceof Error ? err.message : 'Не удалось сохранить макет');
    }
  }, [draftConflictOpen, enqueuePersistDraft, setError, setSaveState, setStatus]);

  const handleDismissDraftConflict = useCallback(() => {
    setDraftConflictOpen(false);
    autosavePausedRef.current = false;
    setSaveState('dirty');
  }, [setSaveState]);

  const handleReloadDraftFromServer = useCallback(async () => {
    try {
      setSaving(true);
      const token = await ensureDraft();
      const draft = await adapter.getDraft(token);
      if (typeof draft.version === 'number') draftVersionRef.current = draft.version;
      const designState = extractDesignStateFromDraftPayload(draft.payloadParsed);
      if (!designState) throw new Error('На сервере нет данных макета.');
      await applyDesignStateFromServer(designState);
      setDraftConflictOpen(false);
      autosavePausedRef.current = false;
      savedDirtyVersionRef.current = dirtyVersion;
      setSaveState('saved');
      setStatus('Загружена версия макета с сервера.');
      setError(null);
    } catch (err) {
      setSaveState('error');
      setError(err instanceof Error ? err.message : 'Не удалось загрузить макет с сервера');
    } finally {
      setSaving(false);
    }
  }, [
    adapter,
    applyDesignStateFromServer,
    dirtyVersion,
    ensureDraft,
    setError,
    setSaveState,
    setSaving,
    setStatus,
  ]);

  const handleForceSaveDraft = useCallback(async () => {
    try {
      setDraftConflictOpen(false);
      autosavePausedRef.current = false;
      await enqueuePersistDraft(true, { skipExpectedVersion: true });
      setStatus('Ваша версия макета сохранена на сервере.');
      setError(null);
    } catch (err) {
      setSaveState('error');
      setError(err instanceof Error ? err.message : 'Не удалось сохранить макет');
    }
  }, [enqueuePersistDraft, setError, setSaveState, setStatus]);

  useEffect(() => {
    if (dirtyVersion === 0 || loading || saving || draftConflictOpen || autosavePausedRef.current) return;
    if (dirtyVersion === savedDirtyVersionRef.current) return;
    const timer = window.setTimeout(() => {
      void handleSaveDraft(true);
    }, autosaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [autosaveDelayMs, dirtyVersion, draftConflictOpen, handleSaveDraft, loading, saving]);

  const resolveImageAsset = useCallback(async (
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<PublicEditorDraftFile> => {
    const token = await ensureDraft();
    return adapter.uploadDraftFile(token, file, onProgress);
  }, [adapter, ensureDraft]);

  const resolveImageFileUrl = useCallback(async (
    file: File,
    onProgress?: (progress: number) => void,
  ) => {
    const uploaded = await resolveImageAsset(file, onProgress);
    return uploaded.url;
  }, [resolveImageAsset]);

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
      if (!adapter.finalizeDraft) throw new Error('Оформление заказа пока не настроено.');
      await adapter.finalizeDraft(token, {
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        customerEmail: customerEmail || undefined,
      });
      setSaveState('saved');
      setStatus('Заявка отправлена.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось оформить заказ');
    }
  }, [adapter, customerForm, ensureDraft, handleSaveDraft, setError, setSaveState, setStatus]);

  const handleReadyForCart = useCallback(async () => {
    try {
      setError(null);
      // Text sheet → canvas, затем явный saveCurrentPage в pages[] до сохранения/заказа.
      await canvasHandleRef.current?.commitPendingTextEditSheet?.({ force: true });
      await canvasHandleRef.current?.flushPendingDocumentCommit?.();
      const preparedPages = preparePagesForCart
        ? await preparePagesForCart()
        : null;
      const { pages: statePages } = buildCurrentDesignState();
      const updatedPages = pickPagesForCartExport(preparedPages, statePages);
      const nextPreflight = analyzePublicDesignPages(updatedPages, 'saved');
      setPages(updatedPages);
      if (nextPreflight.hasBlockingIssues) {
        setActiveTaskTab('check');
        setError('Перед возвратом в корзину исправьте ошибки проверки макета.');
        return;
      }
      await handleSaveDraft(true, {
        pagesOverride: updatedPages,
        skipCanvasFlush: true,
        forcePersist: true,
      });
      const token = await ensureDraft();
      onReadyForCart?.(token);
      setStatus('Макет готов к заказу.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось подготовить заказ');
    }
  }, [
    buildCurrentDesignState,
    canvasHandleRef,
    ensureDraft,
    handleSaveDraft,
    onReadyForCart,
    preparePagesForCart,
    setActiveTaskTab,
    setError,
    setPages,
    setStatus,
  ]);

  return {
    handleFinalize,
    handleReadyForCart,
    handleSaveDraft,
    resolveImageAsset,
    resolveImageFileUrl,
    draftConflictOpen,
    handleDismissDraftConflict,
    handleReloadDraftFromServer,
    handleForceSaveDraft,
  };
}
