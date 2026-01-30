import { api } from '../../api/client';
import {
  PricingService,
  ServiceVolumeTier,
  ServiceVolumeTierPayload,
  CreatePricingServicePayload,
  UpdatePricingServicePayload,
  ServiceVariant,
  ServiceVariantPayload,
} from '../../types/pricing';

export interface CalculatePriceRequest {
  product_id: number;
  quantity: number;
  channel?: 'online' | 'manager' | 'promo' | 'rush';
  params: Record<string, any>;
}

export interface CalculatePriceResponse {
  price_total: number;
  breakdown?: Array<{ code: string; name: string; qty: number; unit?: string; unit_price: number; subtotal: number }>;
  warnings?: string[];
  currency?: string;
  version?: string;
  finalPrice?: number;
  pricePerUnit?: number;
  materialPicked?: any;
  resolverDetails?: any;
  materials?: any[];
  operations?: any[];
}

const mapService = (svc: any): PricingService => ({
  id: svc.id,
  name: svc.service_name ?? svc.name ?? '',
  type: svc.service_type ?? svc.type ?? 'generic',
  unit: svc.unit ?? '',
  priceUnit: svc.price_unit ?? svc.priceUnit,
  rate: Number(svc.price_per_unit ?? svc.rate ?? 0),
  isActive: svc.is_active !== undefined ? !!svc.is_active : true,
  operationType: svc.operation_type ?? svc.operationType,
  minQuantity: svc.min_quantity ?? svc.minQuantity ?? undefined,
  maxQuantity: svc.max_quantity ?? svc.maxQuantity ?? undefined,
  operator_percent: svc.operator_percent ?? svc.operatorPercent ?? undefined,
});

const mapTier = (tier: any): ServiceVolumeTier => ({
  id: tier.id,
  serviceId: tier.service_id ?? tier.serviceId,
  minQuantity: Number(tier.min_quantity ?? tier.minQuantity ?? 0),
  rate: Number(tier.price_per_unit ?? tier.rate ?? 0),
  isActive: tier.is_active !== undefined ? !!tier.is_active : true,
});

export async function getPricingServices(): Promise<PricingService[]> {
  const response = await api.get('/pricing/services');
  const payload: any = (response.data as any)?.data ?? response.data ?? [];
  const list = Array.isArray(payload) ? payload : [];
  return list.map(mapService);
}

export async function createPricingService(payload: CreatePricingServicePayload): Promise<PricingService> {
  // Совместимость с существующей формой: поле unit в UI иногда содержит per_cut/per_sheet (это price_unit)
  const isPriceUnit = ['per_cut', 'per_sheet', 'per_item', 'fixed', 'per_order'].includes(payload.unit);
  const resolvedUnit = isPriceUnit ? 'item' : payload.unit;
  const resolvedPriceUnit = payload.priceUnit ?? (isPriceUnit ? payload.unit : undefined);

  const response = await api.post('/pricing/services', {
    name: payload.name,
    service_type: payload.type,
    unit: resolvedUnit,
    price_unit: resolvedPriceUnit,
    rate: payload.rate,
    is_active: payload.isActive ?? true,
    operation_type: payload.operationType || 'other',
    ...(payload.minQuantity !== undefined ? { min_quantity: payload.minQuantity } : {}),
    ...(payload.maxQuantity !== undefined ? { max_quantity: payload.maxQuantity } : {}),
    ...(payload.operator_percent !== undefined && Number.isFinite(Number(payload.operator_percent)) ? { operator_percent: Number(payload.operator_percent) } : {}),
  });
  const data = (response.data as any)?.data ?? response.data;
  return mapService(data);
}

export async function updatePricingService(id: number, payload: UpdatePricingServicePayload): Promise<PricingService> {
  const isPriceUnit = payload.unit ? ['per_cut', 'per_sheet', 'per_item', 'fixed', 'per_order'].includes(payload.unit) : false;
  const resolvedUnit = payload.unit ? (isPriceUnit ? 'item' : payload.unit) : undefined;
  const resolvedPriceUnit = payload.priceUnit ?? (isPriceUnit ? payload.unit : undefined);

  const response = await api.put(`/pricing/services/${id}`, {
    name: payload.name,
    service_type: payload.type,
    unit: resolvedUnit,
    price_unit: resolvedPriceUnit,
    rate: payload.rate,
    is_active: payload.isActive,
    ...(payload.operationType !== undefined ? { operation_type: payload.operationType } : {}),
    ...(payload.minQuantity !== undefined ? { min_quantity: payload.minQuantity } : {}),
    ...(payload.maxQuantity !== undefined ? { max_quantity: payload.maxQuantity } : {}),
    ...(payload.operator_percent !== undefined ? { operator_percent: Number(payload.operator_percent) } : {}),
  });
  const data = (response.data as any)?.data ?? response.data;
  return mapService(data);
}

export async function deletePricingService(id: number): Promise<void> {
  await api.delete(`/pricing/services/${id}`);
}

export async function getServiceVolumeTiers(serviceId: number): Promise<ServiceVolumeTier[]> {
  const response = await api.get(`/pricing/services/${serviceId}/tiers`);
  const payload: any = (response.data as any)?.data ?? response.data ?? [];
  const list = Array.isArray(payload) ? payload : [];
  return list.map(mapTier);
}

export async function createServiceVolumeTier(serviceId: number, payload: ServiceVolumeTierPayload): Promise<ServiceVolumeTier> {
  const requestBody: any = {
    min_quantity: payload.minQuantity,
    price_per_unit: payload.rate,
    is_active: payload.isActive ?? true,
  };
  // Если есть variantId, используем специальный роут для варианта
  if (payload.variantId !== undefined) {
    // 🆕 Нормализуем variantId
    const normalizedVariantId = typeof payload.variantId === 'string' 
      ? parseInt(String(payload.variantId).split(':')[0], 10) 
      : Number(payload.variantId);
    
    if (isNaN(normalizedVariantId)) {
      throw new Error(`Invalid variantId: ${payload.variantId}`);
    }
    
    const response = await api.post(`/pricing/services/${serviceId}/variants/${normalizedVariantId}/tiers`, requestBody);
    const data = (response.data as any)?.data ?? response.data;
    return mapTier(data);
  }
  const response = await api.post(`/pricing/services/${serviceId}/tiers`, requestBody);
  const data = (response.data as any)?.data ?? response.data;
  return mapTier(data);
}

export async function updateServiceVolumeTier(serviceId: number, tierId: number, payload: ServiceVolumeTierPayload): Promise<ServiceVolumeTier> {
  const response = await api.put(`/pricing/services/${serviceId}/tiers/${tierId}`, {
    min_quantity: payload.minQuantity,
    price_per_unit: payload.rate,
    is_active: payload.isActive,
  });
  const data = (response.data as any)?.data ?? response.data;
  return mapTier(data);
}

export async function deleteServiceVolumeTier(serviceId: number, tierId: number): Promise<void> {
  await api.delete(`/pricing/services/${serviceId}/tiers/${tierId}`);
}

export async function calculatePrice(payload: CalculatePriceRequest): Promise<CalculatePriceResponse> {
  try {
    const adapted: any = {
      productId: payload.product_id,
      configuration: payload.params || {},
      quantity: payload.quantity,
    };
    if (payload.channel) {
      adapted.pricingType = payload.channel;
    }
    const response = await api.post('/pricing/calculate', adapted);
    return (response.data as any)?.data || response.data;
  } catch (error) {
    throw error;
  }
}

// Service Variants API
const mapVariant = (data: any): ServiceVariant => {
  // 🆕 Нормализуем id - извлекаем только числовую часть (на случай, если пришла строка типа "154:1")
  const rawId = data.id ?? data.variant_id;
  const normalizedId = typeof rawId === 'string' 
    ? parseInt(rawId.split(':')[0], 10) 
    : Number(rawId);
  
  return {
    id: isNaN(normalizedId) ? 0 : normalizedId,
    serviceId: data.serviceId ?? data.service_id,
    variantName: data.variantName ?? data.variant_name ?? '',
    parameters: typeof data.parameters === 'string' ? JSON.parse(data.parameters) : (data.parameters || {}),
    sortOrder: data.sortOrder ?? data.sort_order ?? 0,
    isActive: data.isActive ?? data.is_active ?? true,
    createdAt: data.createdAt ?? data.created_at,
    updatedAt: data.updatedAt ?? data.updated_at,
  };
};

export async function getServiceVariants(serviceId: number): Promise<ServiceVariant[]> {
  const response = await api.get(`/pricing/services/${serviceId}/variants`);
  const payload: any = (response.data as any)?.data ?? response.data ?? [];
  const list = Array.isArray(payload) ? payload : [];
  return list.map(mapVariant);
}

export async function createServiceVariant(serviceId: number, payload: ServiceVariantPayload): Promise<ServiceVariant> {
  const response = await api.post(`/pricing/services/${serviceId}/variants`, {
    variant_name: payload.variantName,
    parameters: payload.parameters ?? {},
    sort_order: payload.sortOrder ?? 0,
    is_active: payload.isActive ?? true,
  });
  const data = (response.data as any)?.data ?? response.data;
  return mapVariant(data);
}

export async function updateServiceVariant(serviceId: number, variantId: number | string, payload: ServiceVariantPayload): Promise<ServiceVariant> {
  // 🆕 Нормализуем variantId - извлекаем только числовую часть (на случай, если пришла строка типа "154:1")
  const normalizedVariantId = typeof variantId === 'string' 
    ? parseInt(String(variantId).split(':')[0], 10) 
    : Number(variantId);
  
  if (isNaN(normalizedVariantId)) {
    throw new Error(`Invalid variantId: ${variantId}`);
  }
  
  const response = await api.put(`/pricing/services/${serviceId}/variants/${normalizedVariantId}`, {
    variant_name: payload.variantName,
    parameters: payload.parameters,
    sort_order: payload.sortOrder,
    is_active: payload.isActive,
  });
  const data = (response.data as any)?.data ?? response.data;
  return mapVariant(data);
}

export async function deleteServiceVariant(serviceId: number, variantId: number | string): Promise<void> {
  // 🆕 Нормализуем variantId
  const normalizedVariantId = typeof variantId === 'string' 
    ? parseInt(String(variantId).split(':')[0], 10) 
    : Number(variantId);
  
  if (isNaN(normalizedVariantId)) {
    throw new Error(`Invalid variantId: ${variantId}`);
  }
  
  await api.delete(`/pricing/services/${serviceId}/variants/${normalizedVariantId}`);
}

export async function getServiceVariantTiers(serviceId: number, variantId: number | string): Promise<ServiceVolumeTier[]> {
  // 🆕 Нормализуем variantId
  const normalizedVariantId = typeof variantId === 'string' 
    ? parseInt(String(variantId).split(':')[0], 10) 
    : Number(variantId);
  
  if (isNaN(normalizedVariantId)) {
    throw new Error(`Invalid variantId: ${variantId}`);
  }
  
  const response = await api.get(`/pricing/services/${serviceId}/variants/${normalizedVariantId}/tiers`);
  const payload: any = (response.data as any)?.data ?? response.data ?? [];
  const list = Array.isArray(payload) ? payload : [];
  return list.map(mapTier);
}

/**
 * Batch запрос: получить все tiers для всех вариантов услуги одним запросом
 * Оптимизация: вместо N запросов делаем один
 */
export async function getAllVariantTiers(serviceId: number): Promise<Record<number, ServiceVolumeTier[]>> {
  // Увеличиваем таймаут для batch запроса до 30 секунд
  const response = await api.get(`/pricing/services/${serviceId}/variants/tiers`, {
    timeout: 30000,
  });
  const data = response.data || {};
  
  // Преобразуем объект с ключами-строками в объект с числовыми ключами
  const result: Record<number, ServiceVolumeTier[]> = {};
  for (const [variantIdStr, tiers] of Object.entries(data)) {
    const variantId = Number(variantIdStr);
    if (!isNaN(variantId)) {
      const tiersList = Array.isArray(tiers) ? tiers : [];
      result[variantId] = tiersList.map(mapTier);
    }
  }
  
  return result;
}

export async function createServiceVariantTier(serviceId: number, variantId: number | string, payload: ServiceVolumeTierPayload): Promise<ServiceVolumeTier> {
  // 🆕 Нормализуем variantId
  const normalizedVariantId = typeof variantId === 'string' 
    ? parseInt(String(variantId).split(':')[0], 10) 
    : Number(variantId);
  
  if (isNaN(normalizedVariantId)) {
    throw new Error(`Invalid variantId: ${variantId}`);
  }
  
  const response = await api.post(`/pricing/services/${serviceId}/variants/${normalizedVariantId}/tiers`, {
    min_quantity: payload.minQuantity,
    price_per_unit: payload.rate,
    is_active: payload.isActive ?? true,
  });
  const data = (response.data as any)?.data ?? response.data;
  return mapTier(data);
}

export async function updateServiceVariantTier(serviceId: number, variantId: number | string, tierId: number, payload: ServiceVolumeTierPayload): Promise<ServiceVolumeTier> {
  // 🆕 Нормализуем variantId
  const normalizedVariantId = typeof variantId === 'string' 
    ? parseInt(String(variantId).split(':')[0], 10) 
    : Number(variantId);
  
  if (isNaN(normalizedVariantId)) {
    throw new Error(`Invalid variantId: ${variantId}`);
  }
  
  // Используем общий роут для обновления tier, но передаем variantId в payload
  const response = await api.put(`/pricing/services/${serviceId}/tiers/${tierId}`, {
    min_quantity: payload.minQuantity,
    price_per_unit: payload.rate,
    is_active: payload.isActive,
    variant_id: normalizedVariantId,
  });
  const data = (response.data as any)?.data ?? response.data;
  return mapTier(data);
}

export async function deleteServiceVariantTier(serviceId: number, tierId: number): Promise<void> {
  await api.delete(`/pricing/services/${serviceId}/tiers/${tierId}`);
}

// ========== Новые функции для оптимизированной структуры диапазонов ==========

/**
 * Добавить границу диапазона для сервиса (общую для всех вариантов)
 */
export async function addRangeBoundary(serviceId: number, minQuantity: number): Promise<{ id: number; serviceId: number; minQuantity: number }> {
  const response = await api.post(`/pricing/services/${serviceId}/ranges`, { minQuantity });
  return response.data as { id: number; serviceId: number; minQuantity: number };
}

/**
 * Удалить границу диапазона (и все связанные цены вариантов)
 */
export async function removeRangeBoundary(serviceId: number, minQuantity: number): Promise<void> {
  await api.delete(`/pricing/services/${serviceId}/ranges/${minQuantity}`);
}

/**
 * Обновить границу диапазона (изменить min_quantity)
 */
export async function updateRangeBoundary(serviceId: number, oldMinQuantity: number, newMinQuantity: number): Promise<void> {
  await api.put(`/pricing/services/${serviceId}/ranges/${oldMinQuantity}`, { newMinQuantity });
}

/**
 * Обновить цену варианта для конкретного диапазона
 */
export async function updateVariantPrice(serviceId: number, variantId: number | string, minQuantity: number, price: number): Promise<void> {
  // 🆕 Нормализуем variantId
  const normalizedVariantId = typeof variantId === 'string' 
    ? parseInt(String(variantId).split(':')[0], 10) 
    : Number(variantId);
  
  if (isNaN(normalizedVariantId)) {
    throw new Error(`Invalid variantId: ${variantId}`);
  }
  
  await api.put(`/pricing/services/${serviceId}/variants/${normalizedVariantId}/prices/${minQuantity}`, { price });
}

export default {
  calculatePrice,
  getPricingServices,
  createPricingService,
  updatePricingService,
  deletePricingService,
  getServiceVolumeTiers,
  createServiceVolumeTier,
  updateServiceVolumeTier,
  deleteServiceVolumeTier,
  getServiceVariants,
  createServiceVariant,
  updateServiceVariant,
  deleteServiceVariant,
  getServiceVariantTiers,
  getAllVariantTiers,
  createServiceVariantTier,
  // Новые функции для оптимизированной структуры
  addRangeBoundary,
  removeRangeBoundary,
  updateRangeBoundary,
  updateVariantPrice,
};


