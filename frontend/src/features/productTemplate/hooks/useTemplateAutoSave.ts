import { useEffect, useRef, useState } from 'react';
import { useDebounce } from '../../../hooks/useDebounce';

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseTemplateAutoSaveParams {
  stateForAutoSave: unknown;
  loading: boolean;
  saving: boolean;
  productId?: number;
  persistTemplateConfig: (message: string) => Promise<void>;
}

interface UseTemplateAutoSaveResult {
  autoSaveStatus: AutoSaveStatus;
  hasUnsavedChanges: boolean;
  triggerManualSave: (message: string) => Promise<void>;
}

export function useTemplateAutoSave({
  stateForAutoSave,
  loading,
  saving,
  productId,
  persistTemplateConfig,
}: UseTemplateAutoSaveParams): UseTemplateAutoSaveResult {
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const isInitialLoadRef = useRef(true);
  const lastSavedStateRef = useRef<string>('');
  const autoSaveInProgressRef = useRef(false);

  const debouncedState = useDebounce(stateForAutoSave, 2500);

  useEffect(() => {
    if (isInitialLoadRef.current) {
      if (!loading) {
        isInitialLoadRef.current = false;
        lastSavedStateRef.current = JSON.stringify(debouncedState);
      }
      return;
    }

    if (loading || saving || !productId || autoSaveInProgressRef.current) return;

    const currentStateString = JSON.stringify(debouncedState);
    const hasChanges = currentStateString !== lastSavedStateRef.current;
    setHasUnsavedChanges(hasChanges);
    if (!hasChanges) return;

    const autoSave = async () => {
      if (autoSaveInProgressRef.current) return;
      try {
        autoSaveInProgressRef.current = true;
        setAutoSaveStatus('saving');
        await persistTemplateConfig('');
        lastSavedStateRef.current = currentStateString;
        setHasUnsavedChanges(false);
        setAutoSaveStatus('saved');
        setTimeout(() => {
          setAutoSaveStatus((prev) => (prev === 'saved' ? 'idle' : prev));
        }, 2000);
      } catch (error) {
        console.error('Auto-save failed:', error);
        setAutoSaveStatus('error');
        setTimeout(() => setAutoSaveStatus('idle'), 3000);
      } finally {
        autoSaveInProgressRef.current = false;
      }
    };

    void autoSave();
  }, [debouncedState, loading, saving, productId, persistTemplateConfig]);

  const triggerManualSave = async (message: string) => {
    setAutoSaveStatus('saving');
    await persistTemplateConfig(message);
    lastSavedStateRef.current = JSON.stringify(debouncedState);
    setHasUnsavedChanges(false);
    setAutoSaveStatus('saved');
    setTimeout(() => setAutoSaveStatus('idle'), 2000);
  };

  return {
    autoSaveStatus,
    hasUnsavedChanges,
    triggerManualSave,
  };
}

