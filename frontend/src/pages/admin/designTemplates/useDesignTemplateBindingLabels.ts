import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DesignTemplate } from '../../../api';
import { getProductTemplateConfig } from '../../../services/products';
import { useProductDirectoryStore } from '../../../stores/productDirectoryStore';
import type { SimplifiedConfig } from '../../../features/productTemplate/hooks/useProductTemplate';
import {
  formatProductBinding,
  lookupProductBindingLabels,
  parseTemplateSpec,
  type ParsedTemplateCatalogSpec,
  type ProductBindingLabels,
} from './designTemplateCatalogUtils';

export function useDesignTemplateBindingLabels(templates: DesignTemplate[]) {
  const products = useProductDirectoryStore((s) => s.products);
  const initializeDirectory = useProductDirectoryStore((s) => s.initialize);
  const [configByProduct, setConfigByProduct] = useState<Record<number, SimplifiedConfig | null>>({});

  const productIds = useMemo(() => {
    const ids = new Set<number>();
    for (const t of templates) {
      const { productId } = parseTemplateSpec(t);
      if (productId != null && Number.isFinite(productId)) ids.add(productId);
    }
    return [...ids].sort((a, b) => a - b);
  }, [templates]);

  const productIdsKey = productIds.join(',');

  useEffect(() => {
    void initializeDirectory();
  }, [initializeDirectory]);

  useEffect(() => {
    if (productIds.length === 0) {
      setConfigByProduct({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const pairs = await Promise.all(
        productIds.map(async (productId) => {
          try {
            const cfg = await getProductTemplateConfig(productId);
            const raw = cfg?.config_data?.simplified;
            const simplified =
              raw && typeof raw === 'object' ? (raw as SimplifiedConfig) : null;
            return [productId, simplified] as const;
          } catch {
            return [productId, null] as const;
          }
        }),
      );
      if (!cancelled) {
        setConfigByProduct(Object.fromEntries(pairs));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productIdsKey, productIds]);

  const getBindingLabels = useCallback(
    (parsed: ParsedTemplateCatalogSpec): ProductBindingLabels => {
      const productName =
        parsed.productId != null
          ? products.find((p) => p.id === parsed.productId)?.name
          : undefined;
      const simplified =
        parsed.productId != null ? configByProduct[parsed.productId] ?? null : null;
      return lookupProductBindingLabels(parsed, { productName, simplified });
    },
    [products, configByProduct],
  );

  const formatBinding = useCallback(
    (parsed: ParsedTemplateCatalogSpec) => formatProductBinding(parsed, getBindingLabels(parsed)),
    [getBindingLabels],
  );

  return { formatBinding, getBindingLabels };
}
