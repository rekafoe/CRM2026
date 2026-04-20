import type { ServiceVolumeTier } from '../../../types/pricing';

export interface PostprintVariantOption {
  key: string;
  variantId: number;
  label: string;
  parameters: Record<string, any>;
  parentVariantId?: number | null;
  tiers: ServiceVolumeTier[];
  minQuantity?: number;
  maxQuantity?: number;
}

export interface PostprintServiceOption {
  serviceId: number;
  name: string;
  unit: string;
  priceUnit?: string;
  rate: number;
  tiers: ServiceVolumeTier[];
  variants: PostprintVariantOption[];
  parentVariants?: Array<{ id: number; label: string }>;
  minQuantity?: number;
  maxQuantity?: number;
  categoryId?: number | null;
  categoryName?: string;
}

export interface PostprintCategory {
  categoryName: string;
  services: PostprintServiceOption[];
}
