import { useState, useCallback, useMemo } from 'react';
import { ProductServiceLink } from '../../../services/products';
import { addProductServiceLink, removeProductServiceLink, getProductServicesLinks } from '../../../services/products';

export const useProductServices = (productId: number | null) => {
  const [productServicesLinks, setProductServicesLinks] = useState<ProductServiceLink[]>([]);
  const [servicesError, setServicesError] = useState<string | null>(null);
  const [serviceAction, setServiceAction] = useState<{ id: number; mode: 'add' | 'remove' } | null>(null);

  const refreshProductServices = useCallback(async () => {
    if (!productId) return;
    try {
      const linked = await getProductServicesLinks(productId);
      setProductServicesLinks(linked);
      setServicesError(null);
    } catch (error) {
      console.error('Ошибка обновления услуг продукта:', error);
      setServicesError('Не удалось обновить список услуг');
    }
  }, [productId]);

  const handleAddService = useCallback(async (serviceId: number) => {
    if (!productId) return;
    try {
      setServicesError(null);
      setServiceAction({ id: serviceId, mode: 'add' });
      await addProductServiceLink(productId, { service_id: serviceId });
      await refreshProductServices();
    } catch (error) {
      console.error('Ошибка добавления услуги к продукту:', error);
      setServicesError('Не удалось добавить услугу');
    } finally {
      setServiceAction(null);
    }
  }, [productId, refreshProductServices]);

  const handleRemoveService = useCallback(async (serviceId: number) => {
    if (!productId) return;
    const confirmRemove = window.confirm('Удалить услугу из продукта?');
    if (!confirmRemove) return;
    try {
      setServicesError(null);
      setServiceAction({ id: serviceId, mode: 'remove' });
      await removeProductServiceLink(productId, serviceId);
      await refreshProductServices();
    } catch (error) {
      console.error('Ошибка удаления услуги из продукта:', error);
      setServicesError('Не удалось удалить услугу');
    } finally {
      setServiceAction(null);
    }
  }, [productId, refreshProductServices]);

  return {
    productServicesLinks,
    servicesError,
    serviceAction,
    refreshProductServices,
    handleAddService,
    handleRemoveService,
  };
};

