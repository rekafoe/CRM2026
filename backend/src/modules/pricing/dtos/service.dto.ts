export type ServiceConsumptionMode = 'fixed' | 'roll_feed';
export type ServiceMeterBasis = 'knife_path' | 'feed';

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
  /** Режим расхода материала в складе: fixed или roll_feed */
  consumption_mode?: ServiceConsumptionMode | null;
  /** База метража для per_meter: feed или knife_path */
  meter_basis?: ServiceMeterBasis | null;
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
  consumption_mode?: ServiceConsumptionMode | null;
  meter_basis?: ServiceMeterBasis | null;
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
  consumption_mode?: ServiceConsumptionMode | null;
  meter_basis?: ServiceMeterBasis | null;
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
  /** Ширина рулона мм из материала варианта (sheet_width / printable_width) — для UI калькулятора и сайта */
  roll_width_mm?: number | null;
  /** Родитель в дереве вариантов (уровень 2 → уровень 1); дублируется в parameters.parentVariantId для совместимости */
  parentVariantId?: number | null;
  consumption_mode?: ServiceConsumptionMode | null;
  meter_basis?: ServiceMeterBasis | null;
}

export interface CreateServiceVariantDTO {
  variantName: string;
  parameters: Record<string, any>;
  sortOrder?: number;
  isActive?: boolean;
  material_id?: number | null;
  qty_per_item?: number | null;
  parentVariantId?: number | null;
  consumption_mode?: ServiceConsumptionMode | null;
  meter_basis?: ServiceMeterBasis | null;
}

export interface UpdateServiceVariantDTO {
  variantName?: string;
  parameters?: Record<string, any>;
  sortOrder?: number;
  isActive?: boolean;
  material_id?: number | null;
  qty_per_item?: number | null;
  parentVariantId?: number | null;
  consumption_mode?: ServiceConsumptionMode | null;
  meter_basis?: ServiceMeterBasis | null;
}

