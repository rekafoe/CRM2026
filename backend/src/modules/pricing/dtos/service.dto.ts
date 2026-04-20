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
  /** ID материала для списания при выполнении операции (ламинирование, крепление и т.д.) */
  material_id?: number | null;
  /** Расход материала на единицу операции (по умолчанию 1) */
  qty_per_item?: number | null;
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
  material_id?: number | null;
  qty_per_item?: number | null;
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
  material_id?: number | null;
  qty_per_item?: number | null;
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
  material_id?: number | null;
  qty_per_item?: number | null;
  /** Родитель в дереве вариантов (уровень 2 → уровень 1); дублируется в parameters.parentVariantId для совместимости */
  parentVariantId?: number | null;
}

export interface CreateServiceVariantDTO {
  variantName: string;
  parameters: Record<string, any>;
  sortOrder?: number;
  isActive?: boolean;
  material_id?: number | null;
  qty_per_item?: number | null;
  parentVariantId?: number | null;
}

export interface UpdateServiceVariantDTO {
  variantName?: string;
  parameters?: Record<string, any>;
  sortOrder?: number;
  isActive?: boolean;
  material_id?: number | null;
  qty_per_item?: number | null;
  parentVariantId?: number | null;
}

