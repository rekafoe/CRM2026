import { api } from '../../api/client';
import {
  PricingService,
  ServiceVolumeTier,
  ServiceVolumeTierPayload,
  CreatePricingServicePayload,
  UpdatePricingServicePayload,
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
  rate: Number(svc.price_per_unit ?? svc.rate ?? 0),
  isActive: svc.is_active !== undefined ? !!svc.is_active : true,
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
  const response = await api.post('/pricing/services', {
    name: payload.name,
    service_type: payload.type,
    unit: payload.unit,
    rate: payload.rate,
    is_active: payload.isActive ?? true,
  });
  const data = (response.data as any)?.data ?? response.data;
  return mapService(data);
}

export async function updatePricingService(id: number, payload: UpdatePricingServicePayload): Promise<PricingService> {
  const response = await api.put(`/pricing/services/${id}`, {
    name: payload.name,
    service_type: payload.type,
    unit: payload.unit,
    rate: payload.rate,
    is_active: payload.isActive,
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
  const response = await api.post(`/pricing/services/${serviceId}/tiers`, {
    min_quantity: payload.minQuantity,
    price_per_unit: payload.rate,
    is_active: payload.isActive ?? true,
  });
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
};


