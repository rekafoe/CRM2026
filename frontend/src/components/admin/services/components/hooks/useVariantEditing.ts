import { useState, useCallback } from 'react';

/**
 * Хук для управления редактированием названий и параметров вариантов
 */
export function useVariantEditing() {
  const [editingVariantName, setEditingVariantName] = useState<number | null>(null);
  const [editingVariantNameValue, setEditingVariantNameValue] = useState('');
  const [editingVariantParams, setEditingVariantParams] = useState<number | null>(null);
  const [editingVariantParamsValue, setEditingVariantParamsValue] = useState<Record<string, any>>({});

  const startEditingName = useCallback((variantId: number, currentName: string) => {
    setEditingVariantName(variantId);
    setEditingVariantNameValue(currentName);
  }, []);

  const cancelEditingName = useCallback(() => {
    setEditingVariantName(null);
    setEditingVariantNameValue('');
  }, []);

  const startEditingParams = useCallback((variantId: number, currentParams: Record<string, any>) => {
    setEditingVariantParams(variantId);
    setEditingVariantParamsValue(currentParams);
  }, []);

  const cancelEditingParams = useCallback(() => {
    setEditingVariantParams(null);
    setEditingVariantParamsValue({});
  }, []);

  return {
    editingVariantName,
    editingVariantNameValue,
    editingVariantParams,
    editingVariantParamsValue,
    setEditingVariantName,
    setEditingVariantNameValue,
    setEditingVariantParams,
    setEditingVariantParamsValue,
    startEditingName,
    cancelEditingName,
    startEditingParams,
    cancelEditingParams,
  };
}
