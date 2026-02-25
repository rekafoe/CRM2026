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
    const params = (item.params ?? {}) as Record<string, any>;

    // Восстанавливаем selectedOperations: приоритет params.selectedOperations (полная структура),
    // иначе конвертируем из params.services (для старых заказов)
    let selectedOperationsFromItem: Array<{ operationId: number; variantId?: number; subtype?: string; quantity?: number }> = [];
    if (Array.isArray(params.selectedOperations) && params.selectedOperations.length > 0) {
      selectedOperationsFromItem = params.selectedOperations.map((op: any) => ({
        operationId: Number(op.operationId ?? op.operation_id),
        ...(op.variantId != null || op.variant_id != null ? { variantId: Number(op.variantId ?? op.variant_id) } : {}),
        ...(op.subtype ? { subtype: String(op.subtype) } : {}),
        ...(op.quantity != null ? { quantity: Number(op.quantity) } : {}),
      })).filter((o: any) => o.operationId);
    } else {
      const savedServices = Array.isArray(params.services) ? params.services : [];
      selectedOperationsFromItem = savedServices.map((s: any) => {
        const opId = s.operationId ?? s.operation_id ?? s.id;
        if (!opId) return null;
        const restored: { operationId: number; variantId?: number; subtype?: string; quantity?: number } = {
          operationId: Number(opId),
        };
        if (s.variantId != null || s.variant_id != null) {
          restored.variantId = Number(s.variantId ?? s.variant_id);
        }
        if (s.subtype) restored.subtype = String(s.subtype);
        if (s.quantity != null) restored.quantity = Number(s.quantity);
        return restored;
      }).filter(Boolean) as Array<{ operationId: number; variantId?: number; subtype?: string; quantity?: number }>;
    }

    // Используем функциональную форму setState, чтобы избежать проблем с зависимостями
    setSpecs((prev) => {
      // Проверяем, действительно ли нужно обновлять
      const explicitProductType = item.params?.productType || existingSpecs.productType;
      const needsUpdate = 
        (explicitProductType && prev.productType !== explicitProductType) ||
        (existingSpecs.quantity != null && prev.quantity !== existingSpecs.quantity) ||
        (existingSpecs.sides != null && prev.sides !== existingSpecs.sides) ||
        (existingSpecs.format && existingSpecs.format !== '' && prev.format !== existingSpecs.format) ||
        (selectedOperationsFromItem.length > 0 && (!prev.selectedOperations || prev.selectedOperations.length === 0));
      
      if (!needsUpdate && Object.keys(existingSpecs).length === 0 && selectedOperationsFromItem.length === 0) {
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
      // Восстанавливаем операции из сохранённого заказа (params.selectedOperations или params.services)
      if (selectedOperationsFromItem.length > 0) {
        merged.selectedOperations = selectedOperationsFromItem;
      } else if (existingSpecs.selectedOperations && Array.isArray(existingSpecs.selectedOperations)) {
        merged.selectedOperations = existingSpecs.selectedOperations;
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

