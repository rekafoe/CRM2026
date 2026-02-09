export interface PricingServiceDTO {
  id: number;
  name: string;
  type: string;
  unit: string;
  priceUnit?: string;
  rate: number;
  currency?: string;
  isActive: boolean;
  operationType?: string;
  minQuantity?: number;
  maxQuantity?: number;
  operator_percent?: number;
  categoryId?: number | null;
  categoryName?: string | null;
}

export interface ServiceCategoryDTO {
  id: number;
  name: string;
  sortOrder: number;
  createdAt?: string;
}

export interface CreatePricingServiceDTO {
  name: string;
  type?: string;
  unit: string;
  priceUnit?: string;
  rate: number;
  currency?: string;
  isActive?: boolean;
  operationType?: string;
  minQuantity?: number;
  maxQuantity?: number;
  operator_percent?: number;
  categoryId?: number | null;
}

export interface UpdatePricingServiceDTO {
  name?: string;
  type?: string;
  unit?: string;
  priceUnit?: string;
  rate?: number;
  currency?: string;
  isActive?: boolean;
  operationType?: string;
  minQuantity?: number;
  maxQuantity?: number;
  operator_percent?: number;
  categoryId?: number | null;
}

export interface ServiceVolumeTierDTO {
  id: number;
  serviceId: number;
  variantId?: number;
  minQuantity: number;
  rate: number;
  isActive: boolean;
}

export interface CreateServiceVolumeTierDTO {
  minQuantity: number;
  rate: number;
  isActive?: boolean;
  variantId?: number;
}

export interface UpdateServiceVolumeTierDTO {
  minQuantity?: number;
  rate?: number;
  isActive?: boolean;
  variantId?: number;
}

export interface ServiceVariantDTO {
  id: number;
  serviceId: number;
  variantName: string;
  parameters: Record<string, any>;
  sortOrder: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateServiceVariantDTO {
  variantName: string;
  parameters: Record<string, any>;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateServiceVariantDTO {
  variantName?: string;
  parameters?: Record<string, any>;
  sortOrder?: number;
  isActive?: boolean;
}

