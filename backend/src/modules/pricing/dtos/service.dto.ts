export interface PricingServiceDTO {
  id: number;
  name: string;
  type: string;
  unit: string;
  priceUnit?: string;
  rate: number;
  currency?: string;
  isActive: boolean;
}

export interface CreatePricingServiceDTO {
  name: string;
  type?: string;
  unit: string;
  priceUnit?: string;
  rate: number;
  currency?: string;
  isActive?: boolean;
}

export interface UpdatePricingServiceDTO {
  name?: string;
  type?: string;
  unit?: string;
  priceUnit?: string;
  rate?: number;
  currency?: string;
  isActive?: boolean;
}

export interface ServiceVolumeTierDTO {
  id: number;
  serviceId: number;
  minQuantity: number;
  rate: number;
  isActive: boolean;
}

export interface CreateServiceVolumeTierDTO {
  minQuantity: number;
  rate: number;
  isActive?: boolean;
}

export interface UpdateServiceVolumeTierDTO {
  minQuantity?: number;
  rate?: number;
  isActive?: boolean;
}

