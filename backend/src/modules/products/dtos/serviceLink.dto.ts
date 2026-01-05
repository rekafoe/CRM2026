export interface ProductServiceLinkDTO {
  id: number;
  productId: number;
  serviceId: number;
  isRequired: boolean;
  defaultQuantity: number | null;
  service?: {
    name: string;
    type: string;
    unit: string;
    rate: number;
    isActive: boolean;
  };
}

export interface CreateProductServiceLinkDTO {
  serviceId: number;
  isRequired?: boolean;
  defaultQuantity?: number;
}

export interface DeleteProductServiceLinkDTO {
  productId: number;
  serviceId: number;
}

