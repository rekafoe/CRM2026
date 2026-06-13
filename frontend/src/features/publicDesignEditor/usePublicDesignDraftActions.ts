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
  draftToken: string | null;
  loading: boolean;
  pageSpec: PublicDesignPageSpec;
  pages: DesignPage[];
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
}

export function usePublicDesignDraftActions({
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
}: UsePublicDesignDraftActionsInput) {
  const savedDirtyVersionRef = useRef(0);
  const draftVersionRef = useRef<number | null>(null);
  const [draftConflictOpen, setDraftConflictOpen] = useState(false);
  const autosavePausedRef = useRef(false);

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

  const ensureDraft = useCallback(async () => {
    if (draftToken) return draftToken;
    const res = await adapter.createDraft({
      designTemplateId: templateId,
      mode: documentMode,
      payload: {},
    });
    const token = res.token;
    if (!token) throw new Error('Не удалось подготовить макет.');
    draftVersionRef.current = typeof res.version === 'number' ? res.version : null;
    setDraftToken(token);
    onDraftTokenChange?.(token);
    return token;
  }, [adapter, documentMode, draftToken, onDraftTokenChange, setDraftToken, templateId]);

  const buildCurrentDesignState = useCallback(() => {
    const updatedPages = pages;
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
  }, [
    coverPages,
    documentMode,
    pageSpec,
    pages,
    prepressConfig,
    spreadMode,
    templateId,
  ]);

  const persistDraft = useCallback(async (
    silent: boolean,
    options?: { skipExpectedVersion?: boolean },
  ) => {
    setSaving(true);
    setSaveState('saving');
    if (!silent) setStatus(null);
    const token = await ensureDraft();
    const { pages: updatedPages, designState } = buildCurrentDesignState();
    const patch: Record<string, unknown> = { designState };
    if (!options?.skipExpectedVersion && draftVersionRef.current) {
      patch.expectedVersion = draftVersionRef.current;
    }
    const savedDraft = await adapter.updateDraft(token, patch);
    if (savedDraft && typeof savedDraft.version === 'number') draftVersionRef.current = savedDraft.version;
    setPages(updatedPages);
    savedDirtyVersionRef.current = dirtyVersion;
    setSaveState('saved');
    if (!silent) setStatus('Макет сохранён.');
  }, [
    adapter,
    buildCurrentDesignState,
    dirtyVersion,
    ensureDraft,
    setPages,
    setSaveState,
    setSaving,
    setStatus,
  ]);

  const handleSaveDraft = useCallback(async (silent = false) => {
    if (draftConflictOpen || autosavePausedRef.current) return;
    try {
      await persistDraft(silent);
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
    } finally {
      setSaving(false);
    }
  }, [draftConflictOpen, persistDraft, setError, setSaveState, setStatus]);

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
      await persistDraft(true, { skipExpectedVersion: true });
      setStatus('Ваша версия макета сохранена на сервере.');
      setError(null);
    } catch (err) {
      setSaveState('error');
      setError(err instanceof Error ? err.message : 'Не удалось сохранить макет');
    } finally {
      setSaving(false);
    }
  }, [persistDraft, setError, setSaveState, setStatus]);

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
      const { pages: updatedPages } = buildCurrentDesignState();
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
      setStatus('Макет готов к заказу.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось подготовить заказ');
    }
  }, [
    buildCurrentDesignState,
    ensureDraft,
    handleSaveDraft,
    onReadyForCart,
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
