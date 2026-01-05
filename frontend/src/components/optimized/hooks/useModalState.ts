import { useState, useCallback } from 'react';

export const useModalState = () => {
  const [showAddItem, setShowAddItem] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showPrepaymentModal, setShowPrepaymentModal] = useState(false);
  const [showTopPicker, setShowTopPicker] = useState(false);
  const [showPrintingCalculator, setShowPrintingCalculator] = useState(false);
  const [showPaperTypesManager, setShowPaperTypesManager] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [showOrderPool, setShowOrderPool] = useState(false);
  const [showUserOrderPage, setShowUserOrderPage] = useState(false);
  const [showCountersPage, setShowCountersPage] = useState(false);
  const [showPageSwitcher, setShowPageSwitcher] = useState(false);

  const [calculatorContext, setCalculatorContext] = useState<{
    mode: 'create' | 'edit';
    orderId?: number;
    item?: any | null;
    initialProductType?: string;
    initialProductId?: number | null;
  }>({ mode: 'create' });

  const closeCalculator = useCallback(() => {
    setShowPrintingCalculator(false);
    setCalculatorContext({ mode: 'create', initialProductId: null });
  }, []);

  const openCalculator = useCallback(
    (productType?: string, orderId?: number) => {
      setCalculatorContext({
        mode: 'create',
        orderId: orderId ?? undefined,
        item: null,
        initialProductType: productType,
        initialProductId: null,
      });
      setShowPrintingCalculator(true);
    },
    []
  );

  const openCalculatorForEdit = useCallback((orderId: number, item: any) => {
    setCalculatorContext({
      mode: 'edit',
      orderId,
      item,
      initialProductType:
        item?.params?.productType ||
        item?.params?.specifications?.productType ||
        undefined,
      initialProductId:
        item?.params?.productId ||
        item?.params?.specifications?.productId ||
        null,
    });
    setShowPrintingCalculator(true);
  }, []);

  return {
    showAddItem,
    setShowAddItem,
    showPresets,
    setShowPresets,
    showPrepaymentModal,
    setShowPrepaymentModal,
    showTopPicker,
    setShowTopPicker,
    showPrintingCalculator,
    setShowPrintingCalculator,
    showPaperTypesManager,
    setShowPaperTypesManager,
    showFilesModal,
    setShowFilesModal,
    showOrderPool,
    setShowOrderPool,
    showUserOrderPage,
    setShowUserOrderPage,
    showCountersPage,
    setShowCountersPage,
    showPageSwitcher,
    setShowPageSwitcher,
    calculatorContext,
    setCalculatorContext,
    closeCalculator,
    openCalculator,
    openCalculatorForEdit,
  };
};

