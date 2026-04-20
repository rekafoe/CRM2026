import { useRef, useCallback } from 'react';
import { useLocalRangeChanges } from './useLocalRangeChanges';
import { useVariantEditing } from './useVariantEditing';

type LocalChangesApi = ReturnType<typeof useLocalRangeChanges>;
type VariantEditingApi = ReturnType<typeof useVariantEditing>;

export interface VariantGridStableActionsContext {
  localChanges: LocalChangesApi;
  editing: VariantEditingApi;
  setError: (msg: string | null) => void;
  getNextTypeName: () => string;
}

/**
 * Стабильные ссылки на колбэки (пустой deps) для таблицы вариантов:
 * актуальные localChanges/editing читаются из ref на каждом вызове.
 */
export function useVariantGridStableActions(
  localChanges: LocalChangesApi,
  editing: VariantEditingApi,
  setError: (msg: string | null) => void,
  getNextTypeName: () => string
) {
  const ctxRef = useRef<VariantGridStableActionsContext>({
    localChanges,
    editing,
    setError,
    getNextTypeName,
  });
  ctxRef.current = { localChanges, editing, setError, getNextTypeName };

  const removeRange = useCallback((rangeIndex: number) => {
    if (!confirm('Удалить этот диапазон для всех вариантов?')) return;
    ctxRef.current.localChanges.removeRange(rangeIndex);
  }, []);

  const onParamsChange = useCallback((key: string, value: unknown) => {
    const e = ctxRef.current.editing;
    e.setEditingVariantParamsValue({ ...e.editingVariantParamsValue, [key]: value });
  }, []);

  const level0NameSave = useCallback((firstVariantId: number) => {
    const { localChanges: lc, editing: ed } = ctxRef.current;
    if (ed.editingVariantNameValue.trim()) {
      lc.updateVariantName(firstVariantId, ed.editingVariantNameValue.trim());
      ed.cancelEditingName();
    }
  }, []);

  const level0NameEditStart = useCallback((variantId: number, name: string) => {
    ctxRef.current.editing.startEditingName(variantId, name);
  }, []);

  const level0CreateChild = useCallback((typeName: string) => {
    try {
      const { localChanges: lc, editing: ed } = ctxRef.current;
      const nv = lc.createVariant(typeName, { type: 'Новый тип' });
      ed.startEditingParams(nv.id, { type: 'Новый тип' });
    } catch {
      ctxRef.current.setError('Не удалось создать вариант');
    }
  }, []);

  const level0CreateSibling = useCallback(() => {
    try {
      const { localChanges: lc, editing: ed, getNextTypeName: next } = ctxRef.current;
      const nv = lc.createVariant(next(), {});
      ed.startEditingName(nv.id, nv.variantName);
    } catch {
      ctxRef.current.setError('Не удалось создать вариант');
    }
  }, []);

  const level0Delete = useCallback((typeName: string, variantIds: number[]) => {
    if (!confirm(`Удалить тип "${typeName}" и все его варианты?`)) return;
    const lc = ctxRef.current.localChanges;
    variantIds.forEach((id) => lc.deleteVariant(id));
  }, []);

  const level1ParamsEditStart = useCallback((variantId: number, initialType: string) => {
    ctxRef.current.editing.startEditingParams(variantId, { type: initialType });
  }, []);

  const level1ParamsSave = useCallback((variantId: number) => {
    const { localChanges: lc, editing: ed } = ctxRef.current;
    const v = lc.localVariants.find((x) => x.id === variantId);
    lc.updateVariantParams(variantId, {
      ...(v?.parameters ?? {}),
      ...ed.editingVariantParamsValue,
      type: ed.editingVariantParamsValue.type || '',
    });
    ed.cancelEditingParams();
  }, []);

  const level1CreateChild = useCallback((typeName: string, parentId: number) => {
    try {
      const { localChanges: lc, editing: ed } = ctxRef.current;
      const nv = lc.createVariant(typeName, { parentVariantId: parentId, subType: '' });
      ed.startEditingParams(nv.id, { parentVariantId: parentId, subType: '' });
    } catch {
      ctxRef.current.setError('Не удалось создать вариант');
    }
  }, []);

  const level1CreateSibling = useCallback((typeName: string) => {
    try {
      const { localChanges: lc, editing: ed } = ctxRef.current;
      const nv = lc.createVariant(typeName, { type: 'Новый тип' });
      ed.startEditingParams(nv.id, { type: 'Новый тип' });
    } catch {
      ctxRef.current.setError('Не удалось создать вариант');
    }
  }, []);

  const level1Delete = useCallback((variantId: number, level2ChildIds: number[]) => {
    if (!confirm('Удалить этот вариант и все его дочерние варианты?')) return;
    const lc = ctxRef.current.localChanges;
    lc.deleteVariant(variantId);
    level2ChildIds.forEach((id) => lc.deleteVariant(id));
  }, []);

  const level2ParamsEditStart = useCallback((variantId: number, initialSubType: string) => {
    ctxRef.current.editing.startEditingParams(variantId, { subType: initialSubType });
  }, []);

  const level2ParamsSave = useCallback((variantId: number) => {
    const { localChanges: lc, editing: ed } = ctxRef.current;
    const v = lc.localVariants.find((x) => x.id === variantId);
    lc.updateVariantParams(variantId, {
      ...(v?.parameters ?? {}),
      ...ed.editingVariantParamsValue,
      subType: ed.editingVariantParamsValue.subType || '',
    });
    ed.cancelEditingParams();
  }, []);

  const level2PriceChange = useCallback((variantId: number, minQty: number, newPrice: number) => {
    ctxRef.current.localChanges.changePrice(variantId, minQty, newPrice);
  }, []);

  const level2CreateSibling = useCallback((typeName: string, parentVariantId: number | string | undefined) => {
    try {
      const { localChanges: lc, editing: ed } = ctxRef.current;
      const nv = lc.createVariant(typeName, { parentVariantId, subType: '' });
      ed.startEditingParams(nv.id, { parentVariantId, subType: '' });
    } catch {
      ctxRef.current.setError('Не удалось создать вариант');
    }
  }, []);

  const level2Delete = useCallback((variantId: number) => {
    if (!confirm('Удалить этот вариант?')) return;
    ctxRef.current.localChanges.deleteVariant(variantId);
  }, []);

  return {
    removeRange,
    onParamsChange,
    level0NameSave,
    level0NameEditStart,
    level0CreateChild,
    level0CreateSibling,
    level0Delete,
    level1ParamsEditStart,
    level1ParamsSave,
    level1CreateChild,
    level1CreateSibling,
    level1Delete,
    level2ParamsEditStart,
    level2ParamsSave,
    level2PriceChange,
    level2CreateSibling,
    level2Delete,
  };
}
