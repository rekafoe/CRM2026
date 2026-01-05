import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AIService } from '../../services/aiService';
import { Product } from '../../services/products';
import { useProductDirectoryStore } from '../../stores/productDirectoryStore';
import { useLogger } from '../../utils/logger';
import { useToastNotifications } from '../Toast';
import { QuickTemplates } from './QuickTemplates';
import { AuxiliaryModals } from './components/AuxiliaryModals';
import '../../styles/improved-printing-calculator.css';
import { ParamsSection } from './components/ParamsSection';
import { MaterialsSection } from './components/MaterialsSection';
import { useCalculatorValidation } from './hooks/useCalculatorValidation';
import { useCalculatorSchema } from './hooks/useCalculatorSchema';
import { useCalculatorMaterials } from './hooks/useCalculatorMaterials';
import { CalculatorHeaderActions } from './components/CalculatorHeaderActions';
import { ResultSection } from './components/ResultSection';
import { DynamicFieldsSection } from './components/DynamicFieldsSection';
import { useCalculatorUI } from './hooks/useCalculatorUI';
import { AdvancedSettingsSection } from './components/AdvancedSettingsSection';
import { SelectedProductCard } from './components/SelectedProductCard';
import { QuantityDiscountsSection } from './components/QuantityDiscountsSection';
import { DynamicProductSelector } from './components/DynamicProductSelector';
import { PrintingSettingsSection } from './components/PrintingSettingsSection';
import { getProductionTimeLabel, getProductionDaysByPriceType } from './utils/time';
import { ProductSpecs, CalculationResult, EditContextPayload } from './types/calculator.types';
import { useCalculatorEditContext } from './hooks/useCalculatorEditContext';
import { useCalculatorPricingActions } from './hooks/useCalculatorPricingActions';
import { useAutoCalculate } from './hooks/useAutoCalculate'; // 🆕 Автопересчет
import { getEnhancedProductTypes } from '../../api';
import { buildParameterSummary, type BuildSummaryOptions } from './utils/summaryBuilder';
import { CalculatorSections } from './components/CalculatorSections';

interface ImprovedPrintingCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddToOrder: (item: any) => void;
  initialProductType?: string;
  initialProductId?: number | null;
  editContext?: EditContextPayload;
  onSubmitExisting?: (payload: { orderId: number; itemId: number; item: any }) => Promise<void>;
}


export const ImprovedPrintingCalculatorModal: React.FC<ImprovedPrintingCalculatorModalProps> = ({
  isOpen,
  onClose,
  onAddToOrder,
  initialProductType,
  initialProductId,
  editContext,
  onSubmitExisting,
}) => {
  const logger = useLogger('ImprovedPrintingCalculatorModal');
  const toast = useToastNotifications();
  const fetchProducts = useProductDirectoryStore((state) => state.fetchProducts);
  const getProductById = useProductDirectoryStore((state) => state.getProductById);
  const isEditMode = Boolean(editContext);
  const [customFormat, setCustomFormat] = useState({ width: '', height: '' });
  const [isCustomFormat, setIsCustomFormat] = useState(false);

  // Состояние калькулятора
  const [specs, setSpecs] = useState<ProductSpecs>({
    productType: initialProductType || 'flyers',
    format: 'A6',
    quantity: 100,
    sides: 1,
    paperType: 'semi-matte' as any,
    paperDensity: 0,
    lamination: 'none',
    priceType: 'standard',
    customerType: 'regular',
    pages: 4,
    magnetic: false,
    cutting: false,
    folding: false,
    roundCorners: false,
    urgency: 'standard',
    vipLevel: 'bronze',
    specialServices: [],
    materialType: 'coated'
  });
  
  // Состояние для типа печати и режима цвета
  const [printTechnology, setPrintTechnology] = useState<string>('');
  const [printColorMode, setPrintColorMode] = useState<'bw' | 'color' | null>(null);
  
  // Состояние для названий типов продуктов (загружаются из API)
  const [productTypeLabels, setProductTypeLabels] = useState<Record<string, string>>({});
  
  const { ui, open, close } = useCalculatorUI({ showProductSelection: !initialProductType });
  const [comparisonItems, setComparisonItems] = useState<Array<{
    id: string;
    name: string;
    specs: ProductSpecs;
    result: CalculationResult;
    isSelected: boolean;
  }>>([]);
  const [selectedProduct, setSelectedProduct] = useState<(Product & { resolvedProductType?: string }) | null>(null);
  
  // Схема и типы — вынесено в хук

  const { backendProductSchema, currentConfig, availableFormats, getDefaultFormat } = useCalculatorSchema({
    productType: specs.productType,
    productId: selectedProduct?.id || null, // 🆕 Передаем ID выбранного продукта
    log: logger,
    setSpecs
  });

  const { resolveProductType } = useCalculatorEditContext({
    isOpen,
    editContext,
    setSpecs,
    setCustomFormat,
    setIsCustomFormat,
    setSelectedProduct,
    fetchProducts,
    getProductById,
    logger,
  });

  const {
    warehousePaperTypes,
    availableDensities,
    loadingPaperTypes,
    loadPaperTypesFromWarehouse,
    getDefaultPaperDensity,
    updatePrices
  } = useCalculatorMaterials({ specs, setSpecs, log: logger as any, toast });


  // Валидация вынесена в хук
  const { validationErrors, isValid } = useCalculatorValidation({
    specs: { productType: specs.productType, quantity: specs.quantity, pages: specs.pages },
    backendProductSchema,
    isCustomFormat,
    customFormat
  });

  const getProductionTime = useCallback(
    () => getProductionTimeLabel(specs.priceType as any),
    [specs.priceType],
  );

  const {
    result,
    setResult,
    appliedDiscount,
    setAppliedDiscount,
    userInteracted,
    setUserInteracted,
    calculateCost,
  } = useCalculatorPricingActions({
    specs,
    isValid,
    validationErrors,
    currentConfig,
    backendProductSchema,
    isCustomFormat,
    customFormat,
    selectedProduct,
    resolveProductType,
    getProductionTime,
    buildParameterSummary,
    warehousePaperTypes,
    productTypeLabels,
    printTechnology,
    printColorMode,
    toast,
    logger,
  });

  // 🆕 Автоматический пересчет при изменении параметров
  const { instantCalculate } = useAutoCalculate({
    specs,
    selectedProduct,
    isValid,
    enabled: userInteracted && selectedProduct?.id != null, // Автопересчет только после первого взаимодействия и выбора продукта
    onCalculate: calculateCost,
    debounceMs: 500,
    customFormat, // ✅ Передаем кастомный формат для отслеживания изменений
    isCustomFormat // ✅ Передаем флаг кастомного формата
  });

  // 🆕 Автопересчет при изменении параметров печати
  // Параметры печати передаются в configuration при расчете,
  // поэтому useAutoCalculate не отслеживает их изменения напрямую
  // Нужен отдельный useEffect для пересчета при изменении параметров печати
  const prevPrintTechRef = useRef<string>('');
  const prevPrintColorRef = useRef<'bw' | 'color' | null>(null);
  const isFirstRenderRef = useRef(true);
  const calculationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Пропускаем первый рендер
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      prevPrintTechRef.current = printTechnology;
      prevPrintColorRef.current = printColorMode;
      return;
    }
    
    // Проверяем, действительно ли изменились параметры печати
    const techChanged = prevPrintTechRef.current !== printTechnology;
    const colorChanged = prevPrintColorRef.current !== printColorMode;
    
    if (!techChanged && !colorChanged) {
      return; // Параметры не изменились, не пересчитываем
    }
    
    // Обновляем refs
    prevPrintTechRef.current = printTechnology;
    prevPrintColorRef.current = printColorMode;
    
    // Отменяем предыдущий таймаут, если был
    if (calculationTimeoutRef.current) {
      clearTimeout(calculationTimeoutRef.current);
    }
    
    // Вызываем расчет только если все условия выполнены
    if (userInteracted && selectedProduct?.id != null && isValid) {
      // Debounce для избежания множественных вызовов
      calculationTimeoutRef.current = setTimeout(() => {
        instantCalculate();
        calculationTimeoutRef.current = null;
      }, 300);
    }
    
    return () => {
      if (calculationTimeoutRef.current) {
        clearTimeout(calculationTimeoutRef.current);
        calculationTimeoutRef.current = null;
      }
    };
  }, [printTechnology, printColorMode, userInteracted, selectedProduct?.id, isValid, instantCalculate]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (editContext?.item) {
      setResult(null);
      setUserInteracted(false);
      // Загружаем тип печати и режим цвета из editContext
      const itemSpecs = editContext.item.params?.specifications || {};
      if (itemSpecs.print_technology || itemSpecs.printTechnology) {
        setPrintTechnology(itemSpecs.print_technology || itemSpecs.printTechnology || '');
      }
      if (itemSpecs.print_color_mode || itemSpecs.printColorMode) {
        setPrintColorMode(itemSpecs.print_color_mode || itemSpecs.printColorMode || null);
      }
    }
  }, [isOpen, editContext, setResult, setUserInteracted]);

  // 🆕 useEffect для загрузки данных при открытии (однократно на открытие)
  const didOpenInitRef = useRef(false);
  useEffect(() => {
    if (isOpen && !didOpenInitRef.current) {
      didOpenInitRef.current = true;
      if (warehousePaperTypes.length === 0) {
        loadPaperTypesFromWarehouse();
      }
      // Загружаем цены один раз при открытии
      updatePrices();
      
      setUserInteracted(false);
    }
    if (!isOpen) {
      didOpenInitRef.current = false;
      // Сбрасываем тип печати и режим цвета при закрытии
      setPrintTechnology('');
      setPrintColorMode(null);
    }
  }, [isOpen]);


  // Выбор типа продукта
  const selectProductType = useCallback((productType: string) => {
    setSpecs(prev => ({ 
      ...prev, 
      productType,
      format: getDefaultFormat(),
      paperDensity: getDefaultPaperDensity(prev.paperType)
    }));
    close('showProductSelection');
    setUserInteracted(true);
    logger.info('Выбран тип продукта', { productType });
  }, [close, getDefaultFormat, getDefaultPaperDensity, logger, setUserInteracted]);

  // Выбор продукта из базы данных
  const handleProductSelect = useCallback((product: Product) => {
    const resolvedType = resolveProductType(product) ?? specs.productType ?? 'flyers';
    setSelectedProduct({ ...product, resolvedProductType: resolvedType });
    setSpecs(prev => ({
      ...prev,
      productType: resolvedType,
      format: getDefaultFormat(),
      paperDensity: getDefaultPaperDensity(prev.paperType)
    }));
    close('showProductSelection');
    setUserInteracted(true);
    logger.info('Выбран продукт из базы данных', { productId: product.id, productName: product.name, resolvedType });
  }, [close, getDefaultFormat, getDefaultPaperDensity, logger, resolveProductType, setSelectedProduct, setSpecs, setUserInteracted, specs.productType]);

  // Автовыбор продукта по initialProductId (например, при редактировании заказа)
  useEffect(() => {
    if (!isOpen || !initialProductId || selectedProduct) return;
    const existing = getProductById(initialProductId);
    if (existing) {
      handleProductSelect(existing);
      return;
    }
    // Если продукта нет в кеше, догружаем список и пробуем снова
    (async () => {
      try {
        await fetchProducts(true);
        const loaded = getProductById(initialProductId);
        if (loaded) {
          handleProductSelect(loaded);
        }
      } catch (e) {
        logger.warn('Не удалось автозагрузить продукт по ID', { initialProductId, error: e });
      }
    })();
  }, [isOpen, initialProductId, selectedProduct, fetchProducts, getProductById, handleProductSelect, logger]);

  // Если калькулятор открыт и продукт не выбран — сразу показываем селектор
  useEffect(() => {
    if (isOpen && !selectedProduct && !initialProductId) {
      open('showProductSelection');
    }
  }, [isOpen, selectedProduct, initialProductId, open]);

  // Загрузка названий типов продуктов из API
  useEffect(() => {
    if (isOpen && Object.keys(productTypeLabels).length === 0) {
      getEnhancedProductTypes()
        .then((response) => {
          const types = Array.isArray(response.data) ? response.data : [];
          const labels: Record<string, string> = {};
          types.forEach((type: any) => {
            if (type.key && type.name) {
              labels[type.key] = type.name;
            }
          });
          setProductTypeLabels(labels);
        })
        .catch(() => {
          // Ошибка загрузки - используем пустой объект
          setProductTypeLabels({});
        });
    }
  }, [isOpen, productTypeLabels]);

  // Обновление спецификаций
  const updateSpecs = useCallback((updates: Partial<ProductSpecs>, instant: boolean = false) => {
    setSpecs(prev => ({ ...prev, ...updates }));
    setUserInteracted(true); // Отмечаем, что пользователь взаимодействовал с калькулятором
    
    // ❌ УБРАНО: Мгновенный расчет здесь
    // useAutoCalculate уже автоматически пересчитывает при изменении specs
    // Дополнительный вызов instantCalculate приводит к двойному/тройному расчету
  }, [setSpecs, setUserInteracted]);


  // Вспомогательные функции
  const getProductionDays = useCallback(() => getProductionDaysByPriceType(specs.priceType as any), [specs.priceType]);

  // Сохранение пресета
  

  // Загрузка пресета
  

  // Обучение ИИ на данных заказа
  const trainAIOnOrder = useCallback((orderData: any) => {
    try {
      AIService.addTrainingData({
        productType: orderData.productType,
        format: orderData.format,
        quantity: orderData.quantity,
        paperType: orderData.paperType,
        paperDensity: orderData.paperDensity,
        lamination: orderData.lamination,
        urgency: orderData.urgency || 'standard',
        customerType: orderData.customerType || 'regular',
        finalPrice: orderData.finalPrice,
        timestamp: new Date(),
        marketConditions: {
          demandLevel: 0.5, // Базовое значение, можно улучшить
          competitionLevel: 0.5,
          seasonality: 0.5
        }
      });
      logger.info('ИИ обучен на данных заказа', { orderData });
    } catch (error) {
      logger.error('Ошибка обучения ИИ на заказе', error);
    }
  }, [logger]);

  // Добавление в заказ
  const handleAddToOrder = useCallback(
    async (customDescription?: string) => {
      if (!result) return;

      const layoutSheets = result.layout?.sheetsNeeded ?? undefined;
      const itemsPerSheet = result.layout?.itemsPerSheet ?? undefined;
      const computedSheets =
        layoutSheets ??
        (itemsPerSheet
          ? Math.ceil(result.specifications.quantity / Math.max(itemsPerSheet, 1))
          : undefined);
      const parameterSummary = result.parameterSummary ?? [];
      const summaryText = parameterSummary.length
        ? parameterSummary.map((param) => `${param.label}: ${param.value}`).join(' • ')
        : `${result.specifications.quantity} шт.`;
      const fallbackName = selectedProduct?.name || result.productName;
      const description =
        customDescription ||
        `${fallbackName} • ${summaryText}`;
      const estimatedDelivery = new Date(
        Date.now() + getProductionDays() * 24 * 60 * 60 * 1000
      )
        .toISOString()
        .split('T')[0];

      const specificationsPayload = {
        ...result.specifications,
        formatInfo: result.formatInfo,
        parameterSummary,
        sheetsNeeded: computedSheets,
        piecesPerSheet: itemsPerSheet,
        layout: result.layout,
        customFormat: isCustomFormat ? customFormat : undefined,
        // Сохраняем тип печати и режим цвета
        print_technology: printTechnology || undefined,
        printTechnology: printTechnology || undefined,
        print_color_mode: printColorMode || undefined,
        printColorMode: printColorMode || undefined,
      };

      const paramsPayload = {
        description,
        specifications: specificationsPayload,
        materials: result.materials,
        services: result.services,
        productionTime: result.productionTime,
        productType: result.specifications.productType,
        urgency: result.specifications.priceType,
        customerType: result.specifications.customerType,
        estimatedDelivery,
        sheetsNeeded: computedSheets,
        piecesPerSheet: itemsPerSheet,
        formatInfo: result.formatInfo,
        parameterSummary,
        productId: selectedProduct?.id,
        productName: selectedProduct?.name,
        layout: result.layout,
        customFormat: isCustomFormat ? customFormat : undefined,
      };

      const components =
        result.materials
          .filter((m) => m.materialId)
          .map((m) => ({
            materialId: m.materialId as number,
            qtyPerItem:
              result.specifications.quantity > 0
                ? Number((m.quantity / result.specifications.quantity).toFixed(6))
                : Number(m.quantity),
          })) ?? [];

      const clicks =
        (computedSheets ?? 0) * ((result.specifications.sides ?? 1) * 2);

      const apiItem = {
        type: fallbackName,
        params: paramsPayload,
        price: result.pricePerItem,
        quantity: result.specifications.quantity,
        sides: result.specifications.sides ?? 1,
        sheets: computedSheets ?? 0,
        waste: result.specifications.waste ?? 0,
        clicks,
        components,
      };

      trainAIOnOrder({
        productType: result.specifications.productType,
        format: result.specifications.format,
        quantity: result.specifications.quantity,
        paperType: result.specifications.paperType,
        paperDensity: result.specifications.paperDensity,
        lamination: result.specifications.lamination,
        urgency: result.specifications.priceType,
        customerType: result.specifications.customerType,
        finalPrice: result.pricePerItem,
      });

      try {
        if (isEditMode && editContext && onSubmitExisting) {
          await onSubmitExisting({
            orderId: editContext.orderId,
            itemId: editContext.item.id,
            item: apiItem,
          });
          toast.success('Позиция обновлена');
          logger.info('Позиция заказа обновлена через калькулятор', {
            orderId: editContext.orderId,
            itemId: editContext.item.id,
          });
        } else {
          await Promise.resolve(onAddToOrder(apiItem));
          toast.success('Товар добавлен в заказ!');
          logger.info('Товар добавлен в заказ', { productName: result.productName });
        }
        onClose();
      } catch (error) {
        logger.error('Ошибка при сохранении позиции заказа', error);
        toast.error('Не удалось сохранить позицию заказа', (error as Error).message);
      }
    },
    [
      result,
      selectedProduct,
      getProductionDays,
      isCustomFormat,
      customFormat,
      trainAIOnOrder,
      isEditMode,
      editContext,
      onSubmitExisting,
      onAddToOrder,
      toast,
      logger,
      onClose,
    ]
  );

  // Обработка применения шаблона
  const handleApplyTemplate = useCallback((templateSpecs: Partial<ProductSpecs>) => {
    setSpecs(prev => ({ ...prev, ...templateSpecs }));
    setUserInteracted(true);
    logger.info('Применен шаблон', { templateSpecs });
  }, [logger, setSpecs, setUserInteracted]);

  // Добавление в сравнение
  const handleAddToComparison = useCallback(() => {
    if (!result) return;

    const comparisonItem = {
      id: `comparison_${Date.now()}`,
      name: `${(backendProductSchema?.type || currentConfig?.name || specs.productType)} ${specs.format}`,
      specs: { ...specs },
      result: { ...result },
      isSelected: false
    };

    setComparisonItems(prev => [...prev, comparisonItem]);
    logger.info('Элемент добавлен в сравнение', { itemName: comparisonItem.name });
    toast.success('Элемент добавлен в сравнение!');
  }, [result, currentConfig, specs, logger, toast, setComparisonItems]);

  // Обработка выбора варианта из сравнения
  const handleSelectVariant = useCallback((variantSpecs: ProductSpecs) => {
    setSpecs(variantSpecs);
    setUserInteracted(true);
    logger.info('Выбран вариант из сравнения', { variantSpecs });
  }, [logger, setSpecs, setUserInteracted]);

  // Обработка обновления цен
  const handlePriceUpdate = useCallback(() => {
    // Очищаем результат для пересчета с новыми ценами
    setResult(null);
    setUserInteracted(true);
    logger.info('Цены обновлены, пересчитываем результат');
  }, [logger, setResult, setUserInteracted]);

  // Обработка применения рекомендации ИИ
  const handleApplyAIRecommendation = useCallback((recommendation: any) => {
    setSpecs(prev => ({
      ...prev,
      productType: recommendation.productType,
      format: recommendation.format,
      quantity: recommendation.quantity
    }));
    setResult(null); // Clear result to trigger recalculation
    setUserInteracted(true);
    logger.info('Применена рекомендация ИИ', { recommendation });
    toast.success('Рекомендация ИИ применена!');
  }, [logger, setResult, setSpecs, setUserInteracted, toast]);

  if (!isOpen) return null;

  return (
    <div className="improved-printing-calculator-overlay">

      {/* Основной калькулятор */}
      <div className="improved-printing-calculator">
        {/* Заголовок */}
        <div className="calculator-header">
          <div className="header-content">
            <h2>🖨️ Калькулятор печати</h2>
            <p>Рассчитайте стоимость печатной продукции</p>
          </div>
          <CalculatorHeaderActions
            onShowQuickTemplates={() => open('showQuickTemplates')}
            onShowComparison={() => open('showComparison')}
            onShowAI={() => open('showAIDashboard')}
            onShowDynamicPricing={() => open('showDynamicPricingManager')}
            onClose={onClose}
          />
        </div>

        {/* Основной контент */}
        <div className="calculator-content">
          <div className="calculator-main">
            {/* Результат расчета - фиксированный вверху */}
            <ResultSection
              result={result as any}
              isValid={isValid}
              onAddToOrder={() => handleAddToOrder()}
              onAddToComparison={handleAddToComparison}
              mode={isEditMode ? 'edit' : 'create'}
            />

            {/* Ошибки валидации - показываем сразу после результата */}
            {Object.keys(validationErrors).length > 0 && (
              <div className="validation-errors" style={{ marginBottom: '20px' }}>
                {Object.entries(validationErrors).map(([key, message]) => (
                  <div key={key} className="validation-error">
                    {message}
                  </div>
                ))}
              </div>
            )}

            <CalculatorSections
              specs={specs}
              availableFormats={availableFormats}
              validationErrors={validationErrors}
              isCustomFormat={isCustomFormat}
              customFormat={customFormat}
              setIsCustomFormat={setIsCustomFormat}
              setCustomFormat={setCustomFormat}
              updateSpecs={updateSpecs}
              backendProductSchema={backendProductSchema}
              warehousePaperTypes={warehousePaperTypes}
              availableDensities={availableDensities}
              loadingPaperTypes={loadingPaperTypes}
              getDefaultPaperDensity={getDefaultPaperDensity}
              printTechnology={printTechnology}
              printColorMode={printColorMode}
              setPrintTechnology={setPrintTechnology}
              setPrintColorMode={setPrintColorMode}
              result={result}
              setAppliedDiscount={setAppliedDiscount}
              selectedProduct={selectedProduct}
              currentConfig={currentConfig}
              onOpenProductSelector={() => open('showProductSelection')}
            />

          </div>
        </div>

        {/* Пресеты удалены */}
      </div>

      {/* Модальное окно выбора продукта */}
      {ui.showProductSelection && (
        <DynamicProductSelector
          onSelectProduct={handleProductSelect}
          onClose={() => close('showProductSelection')}
          selectedProductId={selectedProduct?.id}
        />
      )}

      {/* Модальное окно быстрых шаблонов */}
      {ui.showQuickTemplates && (
        <QuickTemplates
          onApplyTemplate={handleApplyTemplate}
          onClose={() => close('showQuickTemplates')}
        />
      )}

           <AuxiliaryModals
             showComparison={ui.showComparison}
             showAIDashboard={ui.showAIDashboard}
             showDynamicPricingManager={ui.showDynamicPricingManager}
             onCloseComparison={() => close('showComparison')}
             onCloseAI={() => close('showAIDashboard')}
             onCloseDynamicPricing={() => close('showDynamicPricingManager')}
             onSelectVariant={handleSelectVariant}
             comparisonItems={comparisonItems}
           />
         </div>
       );
     };
