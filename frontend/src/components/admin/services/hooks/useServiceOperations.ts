import { useCallback } from 'react';
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
  const createService = useCallback(
    async (payload: {
      name: string;
      type: string;
      unit: string;
      rate: number;
      isActive: boolean;
      hasVariants?: boolean;
    }) => {
      try {
        if (!payload.name.trim() || !payload.unit.trim()) {
          onError?.('Заполните обязательные поля: название, единица');
          return null;
        }

        const createdService = await createPricingService({
          name: payload.name.trim(),
          type: payload.type || 'postprint',
          unit: payload.unit || 'item',
          rate: Number.isFinite(payload.rate) ? payload.rate : 0,
          isActive: payload.isActive,
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
            onServiceCreated?.(createdService.id);
          } catch (variantError) {
            console.error('Ошибка создания варианта:', variantError);
            // Не показываем ошибку пользователю, т.к. услуга уже создана
          }
        }

        onSuccess?.('Услуга создана');
        await onReload?.();
        return createdService;
      } catch (e: unknown) {
        console.error('Error creating service:', e);
        onError?.(`Ошибка создания услуги: ${getErrorMessage(e)}`);
        return null;
      }
    },
    [onSuccess, onError, onReload, onServiceCreated]
  );

  const updateService = useCallback(
    async (id: number, payload: UpdatePricingServicePayload) => {
      try {
        await updatePricingService(id, payload);
        onSuccess?.('Услуга обновлена');
        await onReload?.();
      } catch (err) {
        onError?.('Ошибка обновления услуги');
      }
    },
    [onSuccess, onError, onReload]
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
        onSuccess?.('Услуга удалена');
        await onReload?.();
      } catch (e: unknown) {
        console.error('Error deleting service:', e);
        onError?.(`Ошибка удаления услуги: ${getErrorMessage(e)}`);
      }
    },
    [onSuccess, onError, onReload]
  );

  return {
    createService,
    updateService,
    deleteService,
  };
}
