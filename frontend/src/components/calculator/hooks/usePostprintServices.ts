import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Product } from '../../../services/products';
import { getAllVariantTiers, getPricingServices, getServiceVariants, getServiceVolumeTiers } from '../../../services/pricing';
import { ServiceVolumeTier } from '../../../types/pricing';
import { POSTPRINT_PRODUCT_ID } from '../components/DynamicProductSelector';

interface PostprintOperation {
  key: string;
  serviceId: number;
  variantId?: number;
  name: string;
  unit: string;
  priceUnit?: string;
  rate: number;
  tiers: ServiceVolumeTier[];
  minQuantity?: number;
  maxQuantity?: number;
  categoryName?: string;
}

interface PostprintVariantOption {
  key: string;
  variantId: number;
  label: string;
  parameters: Record<string, any>;
  tiers: ServiceVolumeTier[];
  minQuantity?: number;
  maxQuantity?: number;
}

interface PostprintServiceOption {
  serviceId: number;
  name: string;
  unit: string;
  priceUnit?: string;
  rate: number;
  tiers: ServiceVolumeTier[];
  variants: PostprintVariantOption[];
  minQuantity?: number;
  maxQuantity?: number;
  categoryId?: number | null;
  categoryName?: string;
}

interface UsePostprintServicesParams {
  isOpen: boolean;
  isPostprintProduct: boolean;
  isEditMode: boolean;
  editContext?: any;
  onAddToOrder: (item: any) => void;
  onSubmitExisting?: (payload: { orderId: number; itemId: number; item: any }) => Promise<void>;
  onClose: () => void;
  setSelectedProduct: (product: Product & { resolvedProductType?: string }) => void;
  setSpecs: (updater: any) => void;
  logger: { error: (...args: any[]) => void };
  toast: { success: (msg: string) => void; error: (msg: string, details?: string) => void };
}

const buildPostprintProduct = (): Product => ({
  id: POSTPRINT_PRODUCT_ID,
  category_id: 0,
  name: 'Послепечатные услуги',
  description: 'Выбор операций и количества',
  icon: 'wrench',
  calculator_type: 'simplified',
  product_type: 'universal',
  operator_percent: 0,
  is_active: true,
  created_at: '',
  updated_at: '',
  category_name: 'Услуги',
  category_icon: 'puzzle',
});

export function usePostprintServices({
  isOpen,
  isPostprintProduct,
  isEditMode,
  editContext,
  onAddToOrder,
  onSubmitExisting,
  onClose,
  setSelectedProduct,
  setSpecs,
  logger,
  toast,
}: UsePostprintServicesParams) {
  const [postprintOperations, setPostprintOperations] = useState<PostprintOperation[]>([]);
  const [postprintServices, setPostprintServices] = useState<PostprintServiceOption[]>([]);
  const [postprintSelections, setPostprintSelections] = useState<Record<string, number>>({});
  const [postprintLoading, setPostprintLoading] = useState(false);
  const [postprintError, setPostprintError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const getOperationUnitPrice = useCallback((operation: PostprintOperation, quantity: number) => {
    if (!operation.tiers || operation.tiers.length === 0) {
      return Number(operation.rate || 0);
    }
    const normalizedQty = Math.max(1, Number(quantity) || 1);
    const sortedTiers = [...operation.tiers]
      .filter((tier) => tier.isActive !== false)
      .sort((a, b) => a.minQuantity - b.minQuantity);
    const matched = sortedTiers.reduce<ServiceVolumeTier | null>((acc, tier) => {
      if (normalizedQty >= tier.minQuantity) {
        return tier;
      }
      return acc;
    }, null);
    return Number(matched?.rate ?? operation.rate ?? 0);
  }, []);

  const loadPostprintOperations = useCallback(async () => {
    if (postprintLoading || loadedRef.current) return;
    try {
      setPostprintLoading(true);
      setPostprintError(null);
      const services = await getPricingServices();
      const normalize = (value: unknown) => String(value ?? '').toLowerCase().trim();
      const isNumeric = (value: string) => value.length > 0 && !Number.isNaN(Number(value));

      const byType = services.filter((service) => {
        if (!service.isActive) return false;
        const type = normalize(service.type);
        if (isNumeric(type)) return false;
        return type === 'postprint' || type.includes('postprint') || type.includes('post_print');
      });

      const byOperation = services.filter((service) => {
        if (!service.isActive) return false;
        const type = normalize(service.type);
        if (isNumeric(type)) return false;
        const op = normalize(service.operationType);
        return op.length > 0 && op !== 'print';
      });

      const sourceServices = byType.length > 0 ? byType : byOperation;
      const operations: PostprintOperation[] = [];
      const servicesList: PostprintServiceOption[] = [];
      const normalizeLabel = (value: unknown) => String(value ?? '').trim();
      const isNumericLabel = (value: string) => value.length > 0 && !Number.isNaN(Number(value));
      const getVariantLabel = (variant: { variantName?: string; parameters?: Record<string, any> }) => {
        const params = variant.parameters || {};
        return normalizeLabel(
          params.subType ??
            params.type ??
            params.density ??
            variant.variantName ??
            ''
        );
      };
      const isDisplayableVariant = (variant: { variantName?: string; parameters?: Record<string, any> }) => {
        const label = getVariantLabel(variant);
        if (!label) return false;
        if (!isNumericLabel(label)) return true;
        const params = variant.parameters || {};
        return Object.keys(params).length > 0;
      };
      await Promise.all(
        sourceServices.map(async (service) => {
          const [variants, tiers] = await Promise.all([
            getServiceVariants(service.id),
            getServiceVolumeTiers(service.id),
          ]);
          const variantTiersMap = variants.length > 0 ? await getAllVariantTiers(service.id) : {};
          const activeTiers = tiers.filter((tier) => tier.isActive !== false);
          const activeVariants = variants.filter((variant) => variant.isActive !== false);
          const displayableVariants = activeVariants.filter(isDisplayableVariant);
          const getVariantTiers = (variantId: number) =>
            (variantTiersMap[variantId] || []).filter((tier) => tier.isActive !== false);
          const serviceLabel = normalizeLabel(service.name);
          const hasNumericServiceName = isNumericLabel(serviceLabel);
          const serviceOption: PostprintServiceOption = {
            serviceId: service.id,
            name: service.name,
            unit: service.unit,
            priceUnit: service.priceUnit,
            rate: service.rate,
            tiers: activeTiers.filter((tier) => !tier.variantId),
            variants: [],
            minQuantity: service.minQuantity,
            maxQuantity: service.maxQuantity,
            categoryId: (service as { categoryId?: number | null }).categoryId ?? null,
            categoryName: (service as { categoryName?: string }).categoryName ?? 'Без категории',
          };
          if (!hasNumericServiceName && displayableVariants.length > 0) {
            displayableVariants.forEach((variant) => {
              const variantLabel = getVariantLabel(variant) || 'Вариант';
              const variantTiers = getVariantTiers(variant.id);
              serviceOption.variants.push({
                key: `${service.id}:${variant.id}`,
                variantId: variant.id,
                label: variantLabel,
                parameters: variant.parameters || {},
                tiers: variantTiers,
                minQuantity: service.minQuantity,
                maxQuantity: service.maxQuantity,
              });
              const catName = (service as { categoryName?: string }).categoryName ?? 'Без категории';
              operations.push({
                key: `${service.id}:${variant.id}`,
                serviceId: service.id,
                variantId: variant.id,
                name: `${service.name} — ${variantLabel}`,
                unit: service.unit,
                priceUnit: service.priceUnit,
                rate: service.rate,
                tiers: variantTiers,
                minQuantity: service.minQuantity,
                maxQuantity: service.maxQuantity,
                categoryName: catName,
              });
            });
          } else {
            const catName = (service as { categoryName?: string }).categoryName ?? 'Без категории';
            operations.push({
              key: String(service.id),
              serviceId: service.id,
              name: service.name,
              unit: service.unit,
              priceUnit: service.priceUnit,
              rate: service.rate,
              tiers: activeTiers.filter((tier) => !tier.variantId),
              minQuantity: service.minQuantity,
              maxQuantity: service.maxQuantity,
              categoryName: catName,
            });
          }
          servicesList.push(serviceOption);
        })
      );
      const sortByCategoryThenName = (a: { categoryName?: string; name: string }, b: { categoryName?: string; name: string }) => {
        const ca = a.categoryName ?? 'Без категории';
        const cb = b.categoryName ?? 'Без категории';
        if (ca !== cb) return ca.localeCompare(cb);
        return a.name.localeCompare(b.name);
      };
      operations.sort(sortByCategoryThenName);
      servicesList.sort(sortByCategoryThenName);
      setPostprintOperations(operations);
      setPostprintServices(servicesList);
      loadedRef.current = true;
    } catch (error: any) {
      logger.error('Ошибка загрузки послепечатных услуг', error);
      setPostprintError(error?.message || 'Не удалось загрузить услуги');
      setPostprintOperations([]);
      setPostprintServices([]);
      loadedRef.current = false;
    } finally {
      setPostprintLoading(false);
    }
  }, [logger, postprintLoading]);

  useEffect(() => {
    if (!isOpen || !isPostprintProduct) return;
    if (loadedRef.current) return;
    void loadPostprintOperations();
  }, [isOpen, isPostprintProduct, loadPostprintOperations]);

  useEffect(() => {
    if (!isOpen || !editContext?.item) return;
    const params = (editContext.item as any).params || {};
    if (!params?.postprintProduct) return;
    setSelectedProduct(buildPostprintProduct() as Product & { resolvedProductType?: string });
    const savedOperations = Array.isArray(params.postprintOperations) ? params.postprintOperations : [];
    const selections: Record<string, number> = {};
    savedOperations.forEach((op: any) => {
      if (op?.key && op?.quantity) {
        selections[String(op.key)] = Number(op.quantity) || 0;
      }
    });
    setPostprintSelections(selections);
    setSpecs((prev: any) => ({ ...prev, productType: 'universal' }));
  }, [editContext, isOpen, setSelectedProduct, setSpecs]);

  const selectedPostprintOperations = useMemo(() => {
    return postprintOperations
      .map((operation) => {
        const qty = Number(postprintSelections[operation.key] || 0);
        if (!qty) return null;
        const unitPrice = getOperationUnitPrice(operation, qty);
        return {
          ...operation,
          quantity: qty,
          unitPrice,
          subtotal: unitPrice * qty,
        };
      })
      .filter(Boolean) as Array<PostprintOperation & { quantity: number; unitPrice: number; subtotal: number }>;
  }, [getOperationUnitPrice, postprintOperations, postprintSelections]);

  const postprintTotal = useMemo(
    () => selectedPostprintOperations.reduce((sum, op) => sum + op.subtotal, 0),
    [selectedPostprintOperations]
  );

  const isPostprintValid = selectedPostprintOperations.length > 0 && postprintTotal > 0;
  const postprintErrors = useMemo(() => {
    return [
      selectedPostprintOperations.length === 0 ? 'Выберите хотя бы одну операцию' : null,
    ].filter(Boolean) as string[];
  }, [selectedPostprintOperations.length]);

  const postprintResult = useMemo(() => {
    if (!isPostprintValid) return null;
    return {
      totalCost: postprintTotal,
      pricePerItem: postprintTotal,
      specifications: { operationsCount: selectedPostprintOperations.length },
      productionTime: '—',
      parameterSummary: selectedPostprintOperations.map((op) => ({
        label: op.name,
        value: `${op.quantity} × ${op.unitPrice.toFixed(2)} BYN`,
      })),
    };
  }, [isPostprintValid, postprintTotal, selectedPostprintOperations]);

  const handleAddPostprintProduct = useCallback(async () => {
    if (!isPostprintValid) return;
    const paramsPayload = {
      postprintProduct: true,
      postprintOperations: selectedPostprintOperations.map((operation) => ({
        key: operation.key,
        serviceId: operation.serviceId,
        variantId: operation.variantId,
        name: operation.name,
        unit: operation.unit,
        priceUnit: operation.priceUnit,
        quantity: operation.quantity,
        unitPrice: operation.unitPrice,
        subtotal: operation.subtotal,
      })),
    };

    const apiItem = {
      type: 'Послепечатные услуги',
      params: paramsPayload,
      price: postprintTotal,
      quantity: 1,
      sides: 1,
      sheets: 0,
      waste: 0,
      clicks: 0,
    };

    try {
      if (isEditMode && editContext && onSubmitExisting) {
        await onSubmitExisting({
          orderId: editContext.orderId,
          itemId: editContext.item.id,
          item: apiItem,
        });
        toast.success('Позиция обновлена');
      } else {
        await Promise.resolve(onAddToOrder(apiItem));
        toast.success('Услуги добавлены в заказ!');
      }
      onClose();
    } catch (error: any) {
      logger.error('Ошибка при сохранении послепечатных услуг', error);
      toast.error('Не удалось сохранить позицию', error?.message || 'Ошибка сохранения');
    }
  }, [
    editContext,
    isEditMode,
    isPostprintValid,
    onAddToOrder,
    onClose,
    onSubmitExisting,
    postprintTotal,
    selectedPostprintOperations,
    toast,
    logger,
  ]);

  const resetPostprintSelections = useCallback(() => {
    setPostprintSelections({});
  }, []);

  return {
    postprintOperations,
    postprintServices,
    postprintSelections,
    setPostprintSelections,
    postprintLoading,
    postprintError,
    selectedPostprintOperations,
    postprintTotal,
    postprintErrors,
    postprintResult,
    isPostprintValid,
    handleAddPostprintProduct,
    resetPostprintSelections,
    getOperationUnitPrice,
  };
}
