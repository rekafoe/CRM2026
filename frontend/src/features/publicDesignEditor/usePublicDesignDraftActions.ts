import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { DesignEditorCanvasHandle } from '../../pages/admin/designEditor/DesignEditorCanvas';
import {
  buildDesignState,
  mergeSavedEditorPages,
} from '../../pages/admin/designEditor/designEditorState';
import type { PageSaveSnapshot } from '../../pages/admin/designEditor/mergePagesSnapshot';
import type { DesignPage, DesignPrepressConfig } from '../../pages/admin/designEditor/types';
import { analyzePublicDesignPages } from './publicDesignPreflight';
import type { PublicDesignEditorAdapter } from './publicDesignEditorAdapter';
import type { PublicEditorDraftFile } from '../../api';
import type { PublicDesignDocumentMode } from './useDesignDocumentNavigation';
import type { PublicDesignPageSpec } from './usePublicDesignPageActions';

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
  currentPage: number;
  customerForm: CustomerFormState;
  dirtyVersion: number;
  documentMode: PublicDesignDocumentMode;
  draftToken: string | null;
  loading: boolean;
  navigation: { leftPageIdx: number; rightPageIdx: number };
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
  onDraftTokenChange?: (token: string) => void;
  onReadyForCart?: (draftToken: string) => void;
}

export function usePublicDesignDraftActions({
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
}: UsePublicDesignDraftActionsInput) {
  const savedDirtyVersionRef = useRef(0);
  const draftVersionRef = useRef<number | null>(null);

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
  }, [
    canvasHandleRef,
    coverPages,
    currentPage,
    documentMode,
    navigation.leftPageIdx,
    navigation.rightPageIdx,
    pageSpec,
    pages,
    prepressConfig,
    spreadMode,
    templateId,
  ]);

  const handleSaveDraft = useCallback(async (silent = false) => {
    try {
      setSaving(true);
      setSaveState('saving');
      if (!silent) setStatus(null);
      const token = await ensureDraft();
      const { pages: updatedPages, designState } = await buildCurrentDesignState();
      const savedDraft = await adapter.updateDraft(token, {
        designState,
        ...(draftVersionRef.current ? { expectedVersion: draftVersionRef.current } : {}),
      });
      if (savedDraft && typeof savedDraft.version === 'number') draftVersionRef.current = savedDraft.version;
      setPages(updatedPages);
      savedDirtyVersionRef.current = dirtyVersion;
      setSaveState('saved');
      if (!silent) setStatus('Макет сохранён.');
    } catch (err) {
      setSaveState('error');
      setError(err instanceof Error ? err.message : 'Не удалось сохранить макет');
    } finally {
      setSaving(false);
    }
  }, [
    adapter,
    buildCurrentDesignState,
    dirtyVersion,
    ensureDraft,
    setError,
    setPages,
    setSaveState,
    setSaving,
    setStatus,
  ]);

  useEffect(() => {
    if (dirtyVersion === 0 || loading || saving) return;
    if (dirtyVersion === savedDirtyVersionRef.current) return;
    const timer = window.setTimeout(() => {
      void handleSaveDraft(true);
    }, autosaveDelayMs);
    return () => window.clearTimeout(timer);
  }, [autosaveDelayMs, dirtyVersion, handleSaveDraft, loading, saving]);

  const resolveImageAsset = useCallback(async (
    file: File,
    onProgress?: (progress: number) => void,
  ): Promise<PublicEditorDraftFile> => {
    const token = await ensureDraft();
    return adapter.uploadDraftFile(token, file, onProgress);
  }, [adapter, ensureDraft]);

  const resolveImageFileUrl = useCallback(async (file: File) => {
    const uploaded = await resolveImageAsset(file);
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
  };
}
