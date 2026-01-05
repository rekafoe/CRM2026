/**
 * Сервис для работы с услугами продуктов
 */

import { api } from '../../api/client';
import { ProductServiceLink } from './types';
import { apiRequestSafe, extractData } from './utils/apiHelpers';

/**
 * Получить связи услуг с продуктом
 */
export async function getProductServicesLinks(productId: number): Promise<ProductServiceLink[]> {
  const data = await apiRequestSafe<any[]>(
    () => api.get(`/products/${productId}/services`),
    `загрузки услуг продукта ${productId}`,
    []
  );

  return data.map((svc: any) => ({
    link_id: svc.link_id ?? svc.id ?? null,
    product_id: svc.product_id ?? productId,
    service_id: svc.service_id ?? svc.id,
    service_name: svc.service_name ?? svc.name ?? '',
    service_type: svc.service_type ?? svc.type ?? 'generic',
    unit: svc.unit ?? '',
    price_per_unit: Number(svc.price_per_unit ?? svc.rate ?? 0),
    is_active: svc.is_active !== undefined ? !!svc.is_active : true,
    is_required: svc.is_required !== undefined ? !!svc.is_required : undefined,
    default_quantity: svc.default_quantity !== undefined ? Number(svc.default_quantity) : undefined
  }));
}

/**
 * Добавить связь услуги с продуктом
 */
export async function addProductServiceLink(
  productId: number,
  payload: { service_id: number; is_required?: boolean; default_quantity?: number }
): Promise<void> {
  await api.post(`/products/${productId}/services`, payload);
}

/**
 * Удалить связь услуги с продуктом
 */
export async function removeProductServiceLink(
  productId: number,
  serviceId: number
): Promise<void> {
  await api.delete(`/products/${productId}/services/${serviceId}`);
}

