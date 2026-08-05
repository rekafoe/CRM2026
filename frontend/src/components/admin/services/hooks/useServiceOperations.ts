import { useCallback, useRef } from 'react';
import {
  PricingService,
  UpdatePricingServicePayload,
} from '../../../../types/pricing';
import {
  createPricingService,
  createBindingService,
  updatePricingService,
  deletePricingService,
  createServiceVariant,
  addRangeBoundary,
} from '../../../../services/pricing';
import { getErrorMessage } from '../../../../utils/errorUtils';

interface UseServiceOperationsProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
  onReload?: () => Promise<void>;
  onServiceCreated?: (serviceId: number) => void;
}

/**
 * Хук для операций CRUD с услугами
 */
export function useServiceOperations({
  onSuccess,
  onError,
  onReload,
  onServiceCreated,
}: UseServiceOperationsProps) {
  // Используем refs для стабильных ссылок на колбэки, чтобы избежать рекурсии
  const callbacksRef = useRef({ onSuccess, onError, onReload, onServiceCreated });
  callbacksRef.current = { onSuccess, onError, onReload, onServiceCreated };

  const createService = useCallback(
    async (payload: {
      name: string;
      type: string;
      unit: string;
      rate: number;
      isActive: boolean;
      hasVariants?: boolean;
      operationType?: string;
      minQuantity?: number;
      maxQuantity?: number;
      operator_percent?: number;
      categoryId?: number | null;
      material_id?: number | null;
      qty_per_item?: number | null;
      consumption_mode?: 'fixed' | 'roll_feed' | null;
      meter_basis?: 'knife_path' | 'feed' | null;
    }) => {
      try {
        if (!payload.name.trim() || !payload.unit.trim()) {
          callbacksRef.current.onError?.('Заполните обязательные поля: название, единица');
          return null;
        }

        const createdService = await createPricingService({
          name: payload.name.trim(),
          type: payload.type || 'postprint',
          unit: payload.unit || 'item',
          rate: Number.isFinite(payload.rate) ? payload.rate : 0,
          isActive: payload.isActive,
          operationType: payload.operationType || 'other',
          minQuantity: payload.minQuantity,
          maxQuantity: payload.maxQuantity,
          operator_percent: payload.operator_percent,
          categoryId: payload.categoryId,
          material_id: payload.material_id,
          qty_per_item: payload.qty_per_item,
          consumption_mode: payload.consumption_mode,
          meter_basis: payload.meter_basis,
        });

        // Если услуга сложная (hasVariants = true), создаем первый вариант-тип и диапазон «от 1»
        if (payload.hasVariants) {
          try {
            await createServiceVariant(createdService.id, {
              variantName: 'Новый тип',
              parameters: {},
              sortOrder: 0,
              isActive: true,
            });
            try {
              await addRangeBoundary(createdService.id, payload.minQuantity ?? 1);
            } catch {
              // Бэкенд мог уже создать диапазон при createServiceVariant
            }
            callbacksRef.current.onServiceCreated?.(createdService.id);
          } catch (variantError) {
            console.error('Ошибка создания варианта:', variantError);
            // Не показываем ошибку пользователю, т.к. услуга уже создана
          }
        }

        callbacksRef.current.onSuccess?.('Услуга создана');
        await callbacksRef.current.onReload?.();
        return createdService;
      } catch (e: unknown) {
        console.error('Error creating service:', e);
        callbacksRef.current.onError?.(`Ошибка создания услуги: ${getErrorMessage(e)}`);
        return null;
      }
    },
    [] // Колбэки через ref, не добавляем в зависимости
  );

  const updateService = useCallback(
    async (id: number, payload: UpdatePricingServicePayload) => {
      try {
        await updatePricingService(id, payload);
        callbacksRef.current.onSuccess?.('Услуга обновлена');
        await callbacksRef.current.onReload?.();
      } catch (err) {
        callbacksRef.current.onError?.('Ошибка обновления услуги');
      }
    },
    [] // Колбэки через ref, не добавляем в зависимости
  );

  const createBinding = useCallback(
    async (payload: {
      name: string;
      unit: string;
      rate: number;
      isActive: boolean;
      hasVariants?: boolean;
      minQuantity?: number;
      maxQuantity?: number;
      operator_percent?: number;
      categoryId?: number | null;
      material_id?: number | null;
      qty_per_item?: number | null;
      consumption_mode?: 'fixed' | 'roll_feed' | null;
      meter_basis?: 'knife_path' | 'feed' | null;
    }) => {
      try {
        if (!payload.name.trim() || !payload.unit.trim()) {
          callbacksRef.current.onError?.('Заполните обязательные поля: название, единица');
          return null;
        }

        const createdService = await createBindingService({
          name: payload.name.trim(),
          type: 'postprint',
          unit: payload.unit || 'item',
          rate: Number.isFinite(payload.rate) ? payload.rate : 0,
          isActive: payload.isActive,
          operationType: 'bind',
          minQuantity: payload.minQuantity,
          maxQuantity: payload.maxQuantity,
          operator_percent: payload.operator_percent,
          categoryId: payload.categoryId,
          material_id: payload.material_id,
          qty_per_item: payload.qty_per_item,
          consumption_mode: payload.consumption_mode,
          meter_basis: payload.meter_basis,
        });

        if (payload.hasVariants) {
          try {
            await createServiceVariant(createdService.id, {
              variantName: 'Новый тип',
              parameters: {},
              sortOrder: 0,
              isActive: true,
            });
            try {
              await addRangeBoundary(createdService.id, payload.minQuantity ?? 1);
            } catch {
              // диапазон мог уже существовать
            }
            callbacksRef.current.onServiceCreated?.(createdService.id);
          } catch (variantError) {
            console.error('Ошибка создания варианта переплёта:', variantError);
          }
        }

        callbacksRef.current.onSuccess?.('Переплёт создан');
        await callbacksRef.current.onReload?.();
        return createdService;
      } catch (e: unknown) {
        console.error('Error creating binding:', e);
        callbacksRef.current.onError?.(`Ошибка создания переплёта: ${getErrorMessage(e)}`);
        return null;
      }
    },
    []
  );

  const deleteService = useCallback(
    async (id: number, serviceName: string) => {
      if (
        !confirm(
          `Удалить услугу "${serviceName}"? Это действие нельзя отменить.`
        )
      ) {
        return;
      }
      try {
        await deletePricingService(id);
        callbacksRef.current.onSuccess?.('Услуга удалена');
        await callbacksRef.current.onReload?.();
      } catch (e: unknown) {
        console.error('Error deleting service:', e);
        callbacksRef.current.onError?.(`Ошибка удаления услуги: ${getErrorMessage(e)}`);
      }
    },
    [] // Колбэки через ref, не добавляем в зависимости
  );

  return {
    createService,
    createBinding,
    updateService,
    deleteService,
  };
}
