import { useCallback, useRef } from 'react';
import {
  PricingService,
  UpdatePricingServicePayload,
} from '../../../../types/pricing';
import {
  createPricingService,
  updatePricingService,
  deletePricingService,
  createServiceVariant,
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
        });

        // Если услуга сложная (hasVariants = true), создаем первый вариант-тип
        if (payload.hasVariants) {
          try {
            await createServiceVariant(createdService.id, {
              variantName: 'Новый тип',
              parameters: {},
              sortOrder: 0,
              isActive: true,
            });
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
    updateService,
    deleteService,
  };
}
