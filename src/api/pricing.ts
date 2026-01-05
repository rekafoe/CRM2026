import { api } from './client';
import { calculatePrice as unifiedCalculatePrice } from '../services/pricing';

// Core pricing domain types
export type UnitType = 'sheet' | 'hour' | 'm2' | 'click' | 'item';

export interface Service {
  id: number;
  name: string;
  unit: UnitType;
  rate: number; // price per unit
  currency: 'BYN' | 'USD' | 'EUR';
  is_active: boolean;
  updated_at?: string;
}

export interface OperationNorm {
  id: number;
  product_type: string; // e.g. 'flyers'
  operation: string; // e.g. 'digital_print', 'lamination_matte'
  service_id: number; // link to Service
  // formula describes how to compute quantity from specs, e.g. "ceil(quantity / 2)" or "sheetsNeeded(specs)"
  formula: string;
  is_active: boolean;
  updated_at?: string;
}

export interface CalculateRequest {
  productType: string;
  format: string;
  quantity: number;
  priceType?: string; // urgency
  customerType?: string;
  paperType?: string;
  paperDensity?: number;
  lamination?: string;
  sides?: number;
  // additional dynamic schema fields are allowed
  [key: string]: any;
}

export interface CalculateResponseBreakdownItem {
  kind: 'material' | 'service';
  name: string;
  unit: UnitType | 'material';
  quantity: number;
  rate: number; // price per unit
  total: number;
}

export interface CalculateResponse {
  materials: CalculateResponseBreakdownItem[];
  services: CalculateResponseBreakdownItem[];
  subtotal: number; // cost before markup
  markup: number; // added amount
  final: number; // after markup and rules
  meta?: Record<string, any>;
}

// Services CRUD
export const listServices = async (): Promise<Service[]> => {
  const { data } = await api.get('/pricing/services');
  const d: any = (data && (data as any).data !== undefined ? (data as any).data : data);
  return Array.isArray(d) ? d as Service[] : [];
};

export const createService = async (payload: Omit<Service, 'id' | 'updated_at'>): Promise<Service> => {
  const { data } = await api.post('/pricing/services', payload);
  return data as Service;
};

export const updateService = async (id: number, payload: Partial<Service>): Promise<Service> => {
  const { data } = await api.put(`/pricing/services/${id}`, payload);
  return data as Service;
};

export const deleteService = async (id: number): Promise<{ success: boolean }> => {
  const { data } = await api.delete(`/pricing/services/${id}`);
  return data as { success: boolean };
};

// Operations CRUD
export const listOperationNorms = async (): Promise<OperationNorm[]> => {
  const { data } = await api.get('/pricing/operations');
  const d: any = (data && (data as any).data !== undefined ? (data as any).data : data);
  return Array.isArray(d) ? d as OperationNorm[] : [];
};

export const createOperationNorm = async (payload: Omit<OperationNorm, 'id' | 'updated_at'>): Promise<OperationNorm> => {
  const { data } = await api.post('/pricing/operations', payload);
  return data as OperationNorm;
};

export const updateOperationNorm = async (id: number, payload: Partial<OperationNorm>): Promise<OperationNorm> => {
  const { data } = await api.put(`/pricing/operations/${id}`, payload);
  return data as OperationNorm;
};

export const deleteOperationNorm = async (id: number): Promise<{ success: boolean }> => {
  const { data } = await api.delete(`/pricing/operations/${id}`);
  return data as { success: boolean };
};

// Calculate endpoint
export const calculatePrice = async (payload: CalculateRequest): Promise<any> => {
  // Delegate to unified frontend pricing service to avoid duplication
  // Map legacy admin payload to unified request shape
  const { productType, quantity, qty, priceType, ...rest } = (payload as any) || {};
  const resp = await unifiedCalculatePrice({
    product_id: (payload as any)?.product_id || 0, // 0 when using productType path on backend
    quantity: quantity || qty || 1,
    channel: priceType || 'online',
    params: {
      productType,
      // pass through remaining spec-like fields; backend reads from specifications
      ...rest
    }
  } as any);
  return resp;
};


