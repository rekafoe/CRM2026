import { useCallback } from 'react';
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
  const loadTiers = useCallback(
    async (serviceId: number) => {
      try {
        onTiersLoading?.(serviceId, true);
        const tiers = await getServiceVolumeTiers(serviceId);
        onTiersLoaded?.(serviceId, tiers);
      } catch (err) {
        console.error(err);
        onError?.('Не удалось загрузить диапазоны цен для услуги');
      } finally {
        onTiersLoading?.(serviceId, false);
      }
    },
    [onError, onTiersLoaded, onTiersLoading]
  );

  const createTier = useCallback(
    async (serviceId: number, payload: ServiceVolumeTierPayload) => {
      try {
        await createServiceVolumeTier(serviceId, payload);
        await loadTiers(serviceId);
        onSuccess?.('Диапазон цены добавлен');
      } catch (e: unknown) {
        console.error(e);
        onError?.(`Ошибка создания диапазона: ${getErrorMessage(e)}`);
        throw e;
      }
    },
    [loadTiers, onSuccess, onError]
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
        onSuccess?.('Диапазон обновлён');
      } catch (e: unknown) {
        console.error(e);
        onError?.(`Ошибка обновления диапазона: ${getErrorMessage(e)}`);
        throw e;
      }
    },
    [loadTiers, onSuccess, onError]
  );

  const deleteTier = useCallback(
    async (serviceId: number, tierId: number) => {
      try {
        await deleteServiceVolumeTier(serviceId, tierId);
        await loadTiers(serviceId);
        onSuccess?.('Диапазон удалён');
      } catch (e: unknown) {
        console.error(e);
        onError?.(`Ошибка удаления диапазона: ${getErrorMessage(e)}`);
        throw e;
      }
    },
    [loadTiers, onSuccess, onError]
  );

  return {
    loadTiers,
    createTier,
    updateTier,
    deleteTier,
  };
}
