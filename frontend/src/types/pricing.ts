export type PricingServiceType = 'print' | 'postprint' | 'other' | 'generic' | string;

export interface ServiceCategory {
  id: number;
  name: string;
  sortOrder: number;
  createdAt?: string;
}

export interface PricingService {
  id: number;
  name: string;
  type: PricingServiceType;
  unit: string;
  priceUnit?: string;
  rate: number;
  isActive: boolean;
  operationType?: string;
  minQuantity?: number;
  maxQuantity?: number;
  operator_percent?: number;
  categoryId?: number | null;
  categoryName?: string | null;
}

export interface ServiceVolumeTier {
  id: number;
  serviceId: number;
  variantId?: number; // Для сложных услуг - привязка к варианту
  minQuantity: number;
  rate: number;
  isActive: boolean;
}

export interface ServiceVolumeTierPayload {
  minQuantity: number;
  rate: number;
  isActive?: boolean;
  variantId?: number; // Для сложных услуг - привязка к варианту
}

export interface ServiceVariant {
  id: number;
  serviceId: number;
  variantName: string;
  parameters: Record<string, any>; // JSON с параметрами (type, density и т.д.)
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ServiceVariantPayload {
  variantName: string;
  parameters: Record<string, any>;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CreatePricingServicePayload {
  name: string;
  type: PricingServiceType;
  unit: string;
  priceUnit?: string;
  rate: number;
  isActive?: boolean;
  operationType?: string;
  minQuantity?: number;
  maxQuantity?: number;
  operator_percent?: number;
  categoryId?: number | null;
}

export interface UpdatePricingServicePayload extends Partial<CreatePricingServicePayload> {}
// Типы для политики ценообразования

export interface PricingTier {
  id: string
  name: string
  description: string
  deliveryTime: string // 'urgent' | 'online' | 'promo'
  multiplier: number // Коэффициент к базовой цене
  minOrder: number
  maxOrder?: number
  isActive: boolean
}

export interface ProductPricing {
  id: string
  productType: string
  productName: string
  basePrice: number // Базовая цена за единицу
  pricingTiers: PricingTier[]
  materials: {
    materialId: string
    materialName: string
    quantity: number
    unitPrice: number
    totalPrice: number
  }[]
  services: {
    serviceId: string
    serviceName: string
    quantity: number
    unitPrice: number
    totalPrice: number
  }[]
  totalCost: number
  markup: number // Наценка в процентах
  finalPrice: number
}

export interface PricingPolicy {
  id: string
  name: string
  description: string
  isActive: boolean
  tiers: {
    urgent: PricingTier
    online: PricingTier
    promo: PricingTier
  }
  markups: {
    materials: number // Наценка на материалы
    services: number // Наценка на услуги
    labor: number // Наценка на труд
  }
  discounts: {
    volume: {
      minQuantity: number
      discountPercent: number
    }[]
    loyalty: {
      customerType: string
      discountPercent: number
    }[]
  }
}

export interface PriceAnalysis {
  website: string
  analyzedAt: Date
  products: {
    name: string
    type: string
    specifications: string
    prices: {
      urgent: number
      online: number
      promo: number
    }
    materials: {
      name: string
      quantity: number
      unit: string
      price: number
    }[]
    services: {
      name: string
      price: number
    }[]
  }[]
  recommendations: {
    suggestedMarkup: number
    competitivePricing: boolean
    notes: string
  }
}

