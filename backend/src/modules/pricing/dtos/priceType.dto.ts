export interface PriceTypeDTO {
  id: number;
  key: string;
  name: string;
  multiplier: number;
  productionDays: number;
  description?: string | null;
  sortOrder: number;
  isSystem: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePriceTypeDTO {
  key: string;
  name: string;
  multiplier: number;
  productionDays?: number;
  description?: string | null;
  sortOrder?: number;
}

export interface UpdatePriceTypeDTO {
  name?: string;
  multiplier?: number;
  productionDays?: number;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}
