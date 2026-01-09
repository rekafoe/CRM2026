import { useState, useCallback } from 'react';
import { ServiceVolumeTier } from '../../../../../types/pricing';

export interface TierFormState {
  minQuantity: string;
  rate: string;
  isActive: boolean;
}

const emptyForm: TierFormState = {
  minQuantity: '',
  rate: '',
  isActive: true,
};

const parsePositiveNumber = (value: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return NaN;
  return parsed;
};

/**
 * Хук для управления формой создания/редактирования tier
 */
export function useTierForm() {
  const [createForm, setCreateForm] = useState<TierFormState>(emptyForm);
  const [editForm, setEditForm] = useState<TierFormState>(emptyForm);
  const [editingTierId, setEditingTierId] = useState<number | null>(null);

  const resetCreateForm = useCallback(() => {
    setCreateForm(emptyForm);
  }, []);

  const resetEditForm = useCallback(() => {
    setEditingTierId(null);
    setEditForm(emptyForm);
  }, []);

  const startEditing = useCallback((tier: ServiceVolumeTier) => {
    setEditingTierId(tier.id);
    setEditForm({
      minQuantity: tier.minQuantity === null ? '' : String(tier.minQuantity),
      rate: tier.rate === null ? '' : String(tier.rate),
      isActive: tier.isActive,
    });
  }, []);

  const updateCreateForm = useCallback((updates: Partial<TierFormState>) => {
    setCreateForm((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateEditForm = useCallback((updates: Partial<TierFormState>) => {
    setEditForm((prev) => ({ ...prev, ...updates }));
  }, []);

  const validateCreateForm = useCallback((): { valid: boolean; error?: string } => {
    const minQuantity = parsePositiveNumber(createForm.minQuantity);
    const rate = parsePositiveNumber(createForm.rate);

    if (!createForm.minQuantity || Number.isNaN(minQuantity) || minQuantity <= 0) {
      return { valid: false, error: 'Укажите минимальное количество (> 0)' };
    }

    if (!createForm.rate || Number.isNaN(rate) || rate <= 0) {
      return { valid: false, error: 'Укажите цену за единицу (> 0)' };
    }

    return { valid: true };
  }, [createForm]);

  const validateEditForm = useCallback((): { valid: boolean; error?: string } => {
    const minQuantity = parsePositiveNumber(editForm.minQuantity);
    const rate = parsePositiveNumber(editForm.rate);

    if (!editForm.minQuantity || Number.isNaN(minQuantity) || minQuantity <= 0) {
      return { valid: false, error: 'Минимальное количество должно быть больше 0' };
    }

    if (!editForm.rate || Number.isNaN(rate) || rate <= 0) {
      return { valid: false, error: 'Цена должна быть больше 0' };
    }

    return { valid: true };
  }, [editForm]);

  const getCreatePayload = useCallback(() => {
    return {
      minQuantity: parsePositiveNumber(createForm.minQuantity),
      rate: parsePositiveNumber(createForm.rate),
      isActive: createForm.isActive,
    };
  }, [createForm]);

  const getEditPayload = useCallback(() => {
    return {
      minQuantity: parsePositiveNumber(editForm.minQuantity),
      rate: parsePositiveNumber(editForm.rate),
      isActive: editForm.isActive,
    };
  }, [editForm]);

  return {
    createForm,
    editForm,
    editingTierId,
    resetCreateForm,
    resetEditForm,
    startEditing,
    updateCreateForm,
    updateEditForm,
    validateCreateForm,
    validateEditForm,
    getCreatePayload,
    getEditPayload,
  };
}
