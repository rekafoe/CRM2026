import { useCallback, useRef } from 'react';
import {
  ServiceVolumeTierPayload,
} from '../../../../types/pricing';
import {
  getServiceVolumeTiers,
  createServiceVolumeTier,
  updateServiceVolumeTier,
  deleteServiceVolumeTier,
} from '../../../../services/pricing';
import { getErrorMessage } from '../../../../utils/errorUtils';

interface UseTierOperationsProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
  onTiersLoaded?: (serviceId: number, tiers: any[]) => void;
  onTiersLoading?: (serviceId: number, loading: boolean) => void;
}

/**
 * Хук для операций с диапазонами цен (tiers)
 */
export function useTierOperations({
  onSuccess,
  onError,
  onTiersLoaded,
  onTiersLoading,
}: UseTierOperationsProps) {
  // Используем refs для стабильных ссылок на колбэки, чтобы избежать рекурсии
  const callbacksRef = useRef({ onSuccess, onError, onTiersLoaded, onTiersLoading });
  callbacksRef.current = { onSuccess, onError, onTiersLoaded, onTiersLoading };

  const loadTiers = useCallback(
    async (serviceId: number) => {
      try {
        callbacksRef.current.onTiersLoading?.(serviceId, true);
        const tiers = await getServiceVolumeTiers(serviceId);
        callbacksRef.current.onTiersLoaded?.(serviceId, tiers);
      } catch (err) {
        console.error(err);
        callbacksRef.current.onError?.('Не удалось загрузить диапазоны цен для услуги');
      } finally {
        callbacksRef.current.onTiersLoading?.(serviceId, false);
      }
    },
    [] // Колбэки через ref, не добавляем в зависимости
  );

  const createTier = useCallback(
    async (serviceId: number, payload: ServiceVolumeTierPayload) => {
      try {
        await createServiceVolumeTier(serviceId, payload);
        await loadTiers(serviceId);
        callbacksRef.current.onSuccess?.('Диапазон цены добавлен');
      } catch (e: unknown) {
        console.error(e);
        callbacksRef.current.onError?.(`Ошибка создания диапазона: ${getErrorMessage(e)}`);
        throw e;
      }
    },
    [loadTiers] // Колбэки через ref
  );

  const updateTier = useCallback(
    async (
      serviceId: number,
      tierId: number,
      payload: ServiceVolumeTierPayload
    ) => {
      try {
        await updateServiceVolumeTier(serviceId, tierId, payload);
        await loadTiers(serviceId);
        callbacksRef.current.onSuccess?.('Диапазон обновлён');
      } catch (e: unknown) {
        console.error(e);
        callbacksRef.current.onError?.(`Ошибка обновления диапазона: ${getErrorMessage(e)}`);
        throw e;
      }
    },
    [loadTiers] // Колбэки через ref
  );

  const deleteTier = useCallback(
    async (serviceId: number, tierId: number) => {
      try {
        await deleteServiceVolumeTier(serviceId, tierId);
        await loadTiers(serviceId);
        callbacksRef.current.onSuccess?.('Диапазон удалён');
      } catch (e: unknown) {
        console.error(e);
        callbacksRef.current.onError?.(`Ошибка удаления диапазона: ${getErrorMessage(e)}`);
        throw e;
      }
    },
    [loadTiers] // Колбэки через ref
  );

  return {
    loadTiers,
    createTier,
    updateTier,
    deleteTier,
  };
}
