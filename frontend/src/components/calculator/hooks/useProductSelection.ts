import { useCallback } from 'react';
import { Product } from '../../../services/products';
import { CUSTOM_PRODUCT_ID, POSTPRINT_PRODUCT_ID } from '../components/DynamicProductSelector';
import { ProductSpecs } from '../types/calculator.types';
import type { UIState } from './useCalculatorUI';

interface UseProductSelectionParams {
  close: (key: keyof UIState) => void;
  logger: { info: (...args: any[]) => void };
  resolveProductType: (product: Product) => string | null;
  getDefaultFormat: () => string;
  specsProductType: string;
  setSelectedProduct: (product: Product & { resolvedProductType?: string }) => void;
  setSpecs: (updater: (prev: ProductSpecs) => ProductSpecs) => void;
  setUserInteracted: (value: boolean) => void;
  setPrintTechnology: (value: string) => void;
  setPrintColorMode: (value: 'bw' | 'color' | null) => void;
  resetCustomProductForm: () => void;
  resetPostprintSelections: () => void;
}

export function useProductSelection({
  close,
  logger,
  resolveProductType,
  getDefaultFormat,
  specsProductType,
  setSelectedProduct,
  setSpecs,
  setUserInteracted,
  setPrintTechnology,
  setPrintColorMode,
  resetCustomProductForm,
  resetPostprintSelections,
}: UseProductSelectionParams) {
  const handleProductSelect = useCallback(
    (product: Product) => {
      if (product.id === CUSTOM_PRODUCT_ID) {
        setSelectedProduct(product as Product & { resolvedProductType?: string });
        setSpecs((prev) => ({ ...prev, productType: 'universal' }));
        resetCustomProductForm();
        close('showProductSelection');
        setUserInteracted(false);
        logger.info('Выбран произвольный продукт');
        return;
      }
      if (product.id === POSTPRINT_PRODUCT_ID) {
        setSelectedProduct(product as Product & { resolvedProductType?: string });
        setSpecs((prev) => ({ ...prev, productType: 'universal' }));
        resetPostprintSelections();
        close('showProductSelection');
        setUserInteracted(false);
        logger.info('Выбран продукт послепечатных услуг');
        return;
      }

      const resolvedType = resolveProductType(product) ?? specsProductType ?? 'flyers';
      setSelectedProduct({ ...product, resolvedProductType: resolvedType });
      setSpecs((prev) => {
        const reset: Partial<ProductSpecs> = {
          productType: resolvedType,
          format: getDefaultFormat(),
          size_id: undefined,
          material_id: undefined,
          paperType: undefined,
          paperDensity: 0,
          materialType: undefined,
          selectedOperations: [],
          quantity: prev.quantity || 1,
          sides: prev.sides || 1,
          lamination: prev.lamination || 'none',
          priceType: prev.priceType || 'online',
          customerType: prev.customerType || 'regular',
          pages: prev.pages || 4,
        };
        return { ...prev, ...reset };
      });

      setPrintTechnology('');
      setPrintColorMode(null);
      close('showProductSelection');
      setUserInteracted(false);
      logger.info('Выбран продукт из базы данных', { productId: product.id, productName: product.name, resolvedType });
    },
    [
      close,
      getDefaultFormat,
      logger,
      resetCustomProductForm,
      resetPostprintSelections,
      resolveProductType,
      setPrintColorMode,
      setPrintTechnology,
      setSelectedProduct,
      setSpecs,
      setUserInteracted,
      specsProductType,
    ]
  );

  return { handleProductSelect };
}
