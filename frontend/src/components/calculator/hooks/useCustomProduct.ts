import { useCallback, useEffect, useMemo, useState } from 'react';
import { Product } from '../../../services/products';
import { CUSTOM_PRODUCT_ID } from '../components/DynamicProductSelector';

interface UseCustomProductParams {
  isOpen: boolean;
  editContext?: any;
  isEditMode: boolean;
  onAddToOrder: (item: any) => void;
  onSubmitExisting?: (payload: { orderId: number; itemId: number; item: any }) => Promise<void>;
  onClose: () => void;
  setSelectedProduct: (product: Product & { resolvedProductType?: string }) => void;
  setSpecs: (updater: any) => void;
  logger: { error: (...args: any[]) => void };
  toast: { success: (msg: string) => void; error: (msg: string, details?: string) => void };
}

const buildCustomProduct = (): Product => ({
  id: CUSTOM_PRODUCT_ID,
  category_id: 0,
  name: 'Произвольный продукт',
  description: 'Свободная форма без ограничений',
  icon: 'edit',
  calculator_type: 'simplified',
  product_type: 'universal',
  operator_percent: 10,
  is_active: true,
  created_at: '',
  updated_at: '',
  category_name: 'Произвольное',
  category_icon: 'folder',
});

export function useCustomProduct({
  isOpen,
  editContext,
  isEditMode,
  onAddToOrder,
  onSubmitExisting,
  onClose,
  setSelectedProduct,
  setSpecs,
  logger,
  toast,
}: UseCustomProductParams) {
  const [customProductForm, setCustomProductForm] = useState({
    name: '',
    characteristics: '',
    quantity: '1',
    productionDays: '1',
    pricePerItem: '',
  });

  const customQuantity = Math.max(0, Number(customProductForm.quantity) || 0);
  const customPrice = Number(customProductForm.pricePerItem) || 0;
  const customProductionDays = Math.max(0, Number(customProductForm.productionDays) || 0);
  const isCustomValid =
    Boolean(customProductForm.name.trim()) && customQuantity > 0 && customPrice > 0;

  useEffect(() => {
    if (!isOpen || !editContext?.item) return;
    const params = (editContext.item as any).params || {};
    if (!params?.customProduct) return;

    setSelectedProduct(buildCustomProduct() as Product & { resolvedProductType?: string });
    setCustomProductForm({
      name: String(params.customName || params.description || editContext.item.type || ''),
      characteristics: String(params.characteristics || ''),
      quantity: String(editContext.item.quantity ?? 1),
      productionDays: String(params.productionDays ?? '1'),
      pricePerItem: String(editContext.item.price ?? ''),
    });
    setSpecs((prev: any) => ({ ...prev, productType: 'universal' }));
  }, [editContext, isOpen, setSelectedProduct, setSpecs]);

  const customResult = useMemo(() => {
    if (!(customQuantity > 0 && customPrice > 0)) return null;
    return {
      totalCost: customPrice * customQuantity,
      pricePerItem: customPrice,
      specifications: { quantity: customQuantity },
      productionTime: customProductionDays > 0 ? `${customProductionDays} дн.` : '—',
      parameterSummary: [
        ...(customProductForm.characteristics.trim()
          ? [{ label: 'Характеристики', value: customProductForm.characteristics.trim() }]
          : []),
        ...(customProductionDays > 0
          ? [{ label: 'Срок', value: `${customProductionDays} дн.` }]
          : []),
      ],
    };
  }, [customPrice, customQuantity, customProductForm.characteristics, customProductionDays]);

  const customErrors = [
    !customProductForm.name.trim() ? 'Укажите наименование' : null,
    customQuantity <= 0 ? 'Укажите тираж' : null,
    customPrice <= 0 ? 'Укажите цену за штуку' : null,
  ].filter(Boolean) as string[];

  const handleAddCustomProduct = useCallback(async () => {
    if (!isCustomValid) return;
    const name = customProductForm.name.trim();
    const characteristics = customProductForm.characteristics.trim();
    const paramsPayload = {
      customProduct: true,
      customName: name,
      characteristics: characteristics || undefined,
      productionDays: customProductionDays > 0 ? customProductionDays : undefined,
      operator_percent: 10,
      productType: 'custom',
      productName: name,
    };

    const apiItem = {
      type: name || 'Произвольный продукт',
      params: paramsPayload,
      price: customPrice,
      quantity: customQuantity,
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
        toast.success('Товар добавлен в заказ!');
      }
      onClose();
    } catch (error: any) {
      logger.error('Ошибка при сохранении произвольной позиции', error);
      toast.error('Не удалось сохранить позицию', error?.message || 'Ошибка сохранения');
    }
  }, [
    customPrice,
    customQuantity,
    customProductForm.characteristics,
    customProductForm.name,
    customProductionDays,
    editContext,
    isCustomValid,
    isEditMode,
    logger,
    onAddToOrder,
    onClose,
    onSubmitExisting,
    toast,
  ]);

  const resetCustomProductForm = useCallback(() => {
    setCustomProductForm({
      name: '',
      characteristics: '',
      quantity: '1',
      productionDays: '1',
      pricePerItem: '',
    });
  }, []);

  return {
    customProductForm,
    setCustomProductForm,
    customQuantity,
    customPrice,
    customProductionDays,
    isCustomValid,
    customResult,
    customErrors,
    handleAddCustomProduct,
    resetCustomProductForm,
  };
}
