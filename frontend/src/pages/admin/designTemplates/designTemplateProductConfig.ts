import type { SimplifiedConfig } from '../../../features/productTemplate/hooks/useProductTemplate';

export function parseSimplifiedFromConfig(
  configData: Record<string, unknown> | undefined,
): SimplifiedConfig | null {
  if (!configData?.simplified || typeof configData.simplified !== 'object') return null;
  return configData.simplified as SimplifiedConfig;
}

export type ProductBindValue = {
  productId: string;
  typeId: string;
  sizeId: string;
};

export const EMPTY_PRODUCT_BIND: ProductBindValue = {
  productId: '',
  typeId: '',
  sizeId: '',
};
