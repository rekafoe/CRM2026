import { useCallback, useEffect, useRef } from 'react';
import { Product } from '../../../services/products';
import { EditContextPayload, ProductSpecs } from '../types/calculator.types';

interface UseCalculatorEditContextParams {
  isOpen: boolean;
  editContext?: EditContextPayload;
  setSpecs: React.Dispatch<React.SetStateAction<ProductSpecs>>;
  setCustomFormat: React.Dispatch<React.SetStateAction<{ width: string; height: string }>>;
  setIsCustomFormat: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedProduct: React.Dispatch<
    React.SetStateAction<(Product & { resolvedProductType?: string }) | null>
  >;
  fetchProducts: (force?: boolean) => Promise<Product[]>;
  getProductById: (id: number) => Product | undefined;
  logger: { info: Function; warn: Function; error: Function };
}

export function useCalculatorEditContext({
  isOpen,
  editContext,
  setSpecs,
  setCustomFormat,
  setIsCustomFormat,
  setSelectedProduct,
  fetchProducts,
  getProductById,
  logger,
}: UseCalculatorEditContextParams): { resolveProductType: (product?: Product | null) => string | null } {
  const appliedEditContextRef = useRef<string | null>(null);
  
  const resolveProductType = useCallback((product?: Product | null): string | null => {
    if (!product) {
      return null;
    }

    const candidates: Array<string | undefined | null> = [
      product.product_type,
      product.calculator_type,
      product.category_name,
      product.name,
    ];

    for (const raw of candidates) {
      if (!raw) continue;
      const value = raw.toLowerCase();
      if (value.includes('визит')) return 'business_cards';
      if (value.includes('листов')) return 'flyers';
      if (value.includes('буклет') || value.includes('каталог')) return 'booklets';
      if (value.includes('плакат') || value.includes('poster')) return 'posters';
      if (value.includes('наклей')) return 'stickers';
    }

    return null;
  }, []);

  useEffect(() => {
    if (!isOpen || !editContext?.item) {
      appliedEditContextRef.current = null;
      return;
    }

    const { item } = editContext;
    // Создаем уникальный ключ для этого editContext
    const contextKey = `${item.id}_${editContext.orderId}_${JSON.stringify(item.params?.specifications || {})}`;
    
    // Если этот контекст уже был применен, не применяем снова
    if (appliedEditContextRef.current === contextKey) {
      return;
    }
    
    appliedEditContextRef.current = contextKey;
    const existingSpecs = (item.params?.specifications ?? {}) as Record<string, any>;

    // Используем функциональную форму setState, чтобы избежать проблем с зависимостями
    setSpecs((prev) => {
      // Проверяем, действительно ли нужно обновлять
      const explicitProductType = item.params?.productType || existingSpecs.productType;
      const needsUpdate = 
        (explicitProductType && prev.productType !== explicitProductType) ||
        (existingSpecs.quantity != null && prev.quantity !== existingSpecs.quantity) ||
        (existingSpecs.sides != null && prev.sides !== existingSpecs.sides) ||
        (existingSpecs.format && existingSpecs.format !== '' && prev.format !== existingSpecs.format);
      
      if (!needsUpdate && Object.keys(existingSpecs).length === 0) {
        return prev; // Не обновляем, если ничего не изменилось
      }

      const merged = { ...prev, ...existingSpecs };
      if (explicitProductType) {
        merged.productType = explicitProductType;
      }
      if (existingSpecs.quantity != null) {
        merged.quantity = existingSpecs.quantity;
      }
      if (existingSpecs.sides != null) {
        merged.sides = existingSpecs.sides;
      }
      if (existingSpecs.format && existingSpecs.format !== '') {
        merged.format = existingSpecs.format;
      }
      return merged;
    });

    const customSource =
      (item.params as any)?.customFormat ||
      (existingSpecs.customFormat as { width?: number | string; height?: number | string }) ||
      null;

    const inferredWidth =
      customSource?.width ??
      existingSpecs.customWidth ??
      existingSpecs.width ??
      (existingSpecs.format === 'custom' ? existingSpecs.width : undefined);
    const inferredHeight =
      customSource?.height ??
      existingSpecs.customHeight ??
      existingSpecs.height ??
      (existingSpecs.format === 'custom' ? existingSpecs.height : undefined);

    if (inferredWidth || inferredHeight) {
      setCustomFormat({
        width: inferredWidth ? String(inferredWidth) : '',
        height: inferredHeight ? String(inferredHeight) : '',
      });
    }

    setIsCustomFormat(Boolean(customSource || existingSpecs.format === 'custom'));
    let cancelled = false;

    const ensureProduct = async (productId: number) => {
      const local = getProductById(productId);
      const resolvedType =
        item.params?.productType ||
        existingSpecs.productType ||
        local?.product_type ||
        local?.calculator_type ||
        undefined;

      if (local) {
        setSelectedProduct({ ...local, resolvedProductType: resolvedType });
        return;
      }

      try {
        const list = await fetchProducts(true);
        if (cancelled) return;
        const found = list.find((p) => p.id === productId);
        if (found) {
          setSelectedProduct({ ...found, resolvedProductType: resolvedType });
        }
      } catch (error) {
        logger.warn('Не удалось загрузить продукт для редактирования позиции', { productId, error });
      }
    };

    const productId = item.params?.productId;
    if (productId) {
      void ensureProduct(productId);
    } else if (item.params?.productName) {
      setSelectedProduct((prev) => {
        if (prev) return prev;
        return {
          id: -1,
          name: item.params.productName || item.type,
          product_type: existingSpecs.productType || 'custom',
          calculator_type: existingSpecs.productType || 'custom',
        } as Product & { resolvedProductType?: string };
      });
    }

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    editContext?.item?.id,
    editContext?.orderId,
    // Не включаем setter функции в зависимости - они стабильны
    // setSpecs, setCustomFormat, setIsCustomFormat, setSelectedProduct,
    fetchProducts,
    getProductById,
    logger,
  ]);

  return {
    resolveProductType,
  };
}

