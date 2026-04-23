import { useState, useRef, useEffect, useMemo, useCallback, type Dispatch, type SetStateAction } from 'react';
import { PriceRange } from '../../../../../hooks/usePriceRanges';
import { useServiceVariants } from './useServiceVariants';
import { useVariantOperations } from './useVariantOperations';
import { useLocalRangeChanges, PendingChanges } from './useLocalRangeChanges';
import {
  groupVariantsByType,
  calculateCommonRanges,
} from '../ServiceVariantsTable.utils';
import { VariantsByType } from '../ServiceVariantsTable.types';

/** Меньше всплесков запросов к API (429 на проде при массовом сохранении) */
const AUTO_SAVE_MS = 2400;

const staggerMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Пауза между последовательными запросами в одном батче сохранения */
const BATCH_STAGGER_MS = 70;

export interface UseVariantsTableResult {
  loading: boolean;
  error: string | null;
  setError: (msg: string | null) => void;
  reload: () => Promise<void>;
  invalidateCache: () => void;
  operations: ReturnType<typeof useVariantOperations>;
  localChanges: ReturnType<typeof useLocalRangeChanges>;
  variants: ReturnType<typeof useLocalRangeChanges>['localVariants'];
  commonRangesAsPriceRanges: PriceRange[];
  groupedVariants: VariantsByType;
  typeNames: string[];
  getNextTypeName: () => string;
  isSaving: boolean;
  autoSaveHint: 'idle' | 'saving' | 'saved';
  setAutoSaveHint: Dispatch<SetStateAction<'idle' | 'saving' | 'saved'>>;
  clearAutoSaveTimer: () => void;
  handleToolbarSaveNow: () => Promise<void>;
  handleToolbarCancel: () => void;
}

export function useVariantsTable(serviceId: number): UseVariantsTableResult {
  const { variants: serverVariants, loading, error, setError, reload, invalidateCache, setVariants } =
    useServiceVariants(serviceId);
  const operations = useVariantOperations(serviceId, serverVariants, setVariants, setError, reload, invalidateCache);

  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [autoSaveHint, setAutoSaveHint] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Актуальные localVariants на момент save (очередь variantChanges может отставать от UI). */
  const localChangesRef = useRef<ReturnType<typeof useLocalRangeChanges>>(null!);

  const clearAutoSaveTimer = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
  }, []);

  const saveChangesToServer = useCallback(
    async (pending: PendingChanges) => {
      setIsSaving(true);
      isSavingRef.current = true;
      try {
        const { variantChanges, rangeChanges, priceChanges } = pending;

        for (const change of variantChanges) {
          switch (change.type) {
            case 'create':
              if (change.variantName) {
                const local =
                  change.variantId !== undefined
                    ? localChangesRef.current?.localVariants.find((v) => v.id === change.variantId)
                    : undefined;
                const params = { ...(change.parameters ?? {}), ...(local?.parameters ?? {}) };
                await operations.createVariant(change.variantName, params);
              }
              break;
            case 'update':
              if (change.variantId) {
                // Имя: не требуем oldVariantName — операция сама берёт текущее имя из состояния сервера.
                // Иначе при undefined в очереди API не вызывался, reload() подтягивал старое «Новый тип».
                if (change.variantName != null) {
                  await operations.updateVariantName(change.variantId, change.variantName);
                }
                if (change.parameters) {
                  if (change.variantName != null) {
                    await staggerMs(BATCH_STAGGER_MS);
                  }
                  await operations.updateVariantParams(change.variantId, change.parameters);
                }
              }
              break;
            case 'delete':
              if (change.variantId) {
                await operations.deleteVariant(change.variantId, true);
              }
              break;
          }
          await staggerMs(BATCH_STAGGER_MS);
        }

        const removeChanges = rangeChanges.filter((c) => c.type === 'remove' && c.rangeIndex !== undefined);
        for (const change of removeChanges) {
          await operations.removeRange(change.rangeIndex!);
          await staggerMs(BATCH_STAGGER_MS);
        }
        const addChanges = rangeChanges.filter((c) => c.type === 'add' && c.boundary);
        for (const c of addChanges) {
          await operations.addRangeBoundary(c.boundary!);
          await staggerMs(BATCH_STAGGER_MS);
        }
        const editChanges = rangeChanges.filter(
          (c) => c.type === 'edit' && c.rangeIndex !== undefined && c.newBoundary !== undefined
        );
        for (const change of editChanges) {
          await operations.editRangeBoundary(change.rangeIndex!, change.newBoundary!);
          await staggerMs(BATCH_STAGGER_MS);
        }

        if (priceChanges.length > 0) {
          for (const c of priceChanges) {
            await operations.savePriceImmediate(c.variantId, c.minQty, c.newPrice);
            await staggerMs(BATCH_STAGGER_MS);
          }
        }

        invalidateCache();
        await reload();
      } finally {
        setIsSaving(false);
        isSavingRef.current = false;
      }
    },
    [operations, reload, invalidateCache]
  );

  const localChanges = useLocalRangeChanges(serverVariants, saveChangesToServer);

  const prevServerVariantsRef = useRef<string>('');
  const syncWithExternalRef = useRef(localChanges.syncWithExternal);

  syncWithExternalRef.current = localChanges.syncWithExternal;
  localChangesRef.current = localChanges;

  useEffect(() => {
    const currentVariantsStr = JSON.stringify(serverVariants);
    if (prevServerVariantsRef.current !== currentVariantsStr) {
      prevServerVariantsRef.current = currentVariantsStr;
      const current = localChangesRef.current;
      const empty =
        current.pendingChanges.rangeChanges.length === 0 &&
        current.pendingChanges.priceChanges.length === 0 &&
        current.pendingChanges.variantChanges.length === 0;
      if (!current.hasUnsavedChanges && empty) {
        syncWithExternalRef.current(serverVariants);
      } else {
        const p = current.pendingChanges;
        // Пока есть несохранённые правки по вариантам — не подмешиваем tiers с сервера (меньше гонок с UI).
        if (
          p.priceChanges.length === 0 &&
          p.rangeChanges.length === 0 &&
          p.variantChanges.length === 0
        ) {
          current.mergeTiersFromServer(serverVariants);
        }
      }
    }
  }, [serverVariants]);

  const pendingSnapshot = useMemo(() => JSON.stringify(localChanges.pendingChanges), [localChanges.pendingChanges]);

  useEffect(() => {
    if (!localChanges.hasUnsavedChanges) return;
    const p = localChanges.pendingChanges;
    if (p.variantChanges.length === 0 && p.rangeChanges.length === 0 && p.priceChanges.length === 0) {
      return;
    }

    clearAutoSaveTimer();
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      void (async () => {
        const cur = localChangesRef.current;
        const pending = cur.pendingChanges;
        if (
          !cur.hasUnsavedChanges ||
          (pending.variantChanges.length === 0 &&
            pending.rangeChanges.length === 0 &&
            pending.priceChanges.length === 0)
        ) {
          return;
        }
        if (isSavingRef.current) return;
        try {
          setAutoSaveHint('saving');
          await cur.saveChanges();
          setAutoSaveHint('saved');
          window.setTimeout(() => setAutoSaveHint('idle'), 1800);
        } catch {
          setAutoSaveHint('idle');
          setError('Не удалось сохранить изменения');
        }
      })();
    }, AUTO_SAVE_MS);

    return clearAutoSaveTimer;
  }, [localChanges.hasUnsavedChanges, pendingSnapshot, clearAutoSaveTimer, setError]);

  useEffect(() => () => clearAutoSaveTimer(), [clearAutoSaveTimer]);

  const variants = localChanges.localVariants;

  const commonRanges = useMemo(() => calculateCommonRanges(variants), [variants]);
  const commonRangesAsPriceRanges: PriceRange[] = useMemo(
    () =>
      commonRanges.map((r) => ({
        minQty: r.min_qty,
        maxQty: r.max_qty,
        price: 0,
      })),
    [commonRanges]
  );

  const groupedVariants = useMemo(() => groupVariantsByType(variants), [variants]);
  const typeNames = useMemo(() => Object.keys(groupedVariants), [groupedVariants]);

  const getNextTypeName = useCallback(() => {
    const baseName = 'Новый тип';
    if (!typeNames.includes(baseName)) {
      return baseName;
    }
    let index = 2;
    let candidate = `${baseName} ${index}`;
    while (typeNames.includes(candidate)) {
      index += 1;
      candidate = `${baseName} ${index}`;
    }
    return candidate;
  }, [typeNames]);

  const handleToolbarSaveNow = useCallback(async () => {
    clearAutoSaveTimer();
    try {
      setAutoSaveHint('saving');
      await localChangesRef.current.saveChanges();
      setError(null);
      setAutoSaveHint('saved');
      window.setTimeout(() => setAutoSaveHint('idle'), 1800);
    } catch {
      setAutoSaveHint('idle');
      setError('Не удалось сохранить изменения');
    }
  }, [clearAutoSaveTimer, setError]);

  const handleToolbarCancel = useCallback(() => {
    if (!confirm('Отменить все несохраненные изменения?')) return;
    clearAutoSaveTimer();
    localChangesRef.current.cancelChanges();
    setAutoSaveHint('idle');
  }, [clearAutoSaveTimer]);

  return {
    loading,
    error,
    setError,
    reload,
    invalidateCache,
    operations,
    localChanges,
    variants,
    commonRangesAsPriceRanges,
    groupedVariants,
    typeNames,
    getNextTypeName,
    isSaving,
    autoSaveHint,
    setAutoSaveHint,
    clearAutoSaveTimer,
    handleToolbarSaveNow,
    handleToolbarCancel,
  };
}
