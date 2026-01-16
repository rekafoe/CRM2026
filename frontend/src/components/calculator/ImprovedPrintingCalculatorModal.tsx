import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AIService } from '../../services/aiService';
import { Product } from '../../services/products';
import { useProductDirectoryStore } from '../../stores/productDirectoryStore';
import { useLogger } from '../../utils/logger';
import { useToastNotifications } from '../Toast';
import '../../styles/improved-printing-calculator.css';
import { ParamsSection } from './components/ParamsSection';
import { MaterialsSection } from './components/MaterialsSection';
import { useCalculatorValidation } from './hooks/useCalculatorValidation';
import { useCalculatorSchema } from './hooks/useCalculatorSchema';
import { useCalculatorMaterials } from './hooks/useCalculatorMaterials';
import { ResultSection } from './components/ResultSection';
import { DynamicFieldsSection } from './components/DynamicFieldsSection';
import { useCalculatorUI } from './hooks/useCalculatorUI';
import { AdvancedSettingsSection } from './components/AdvancedSettingsSection';
import { SelectedProductCard } from './components/SelectedProductCard';
import { DynamicProductSelector, CUSTOM_PRODUCT_ID } from './components/DynamicProductSelector';
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
  const [customProductForm, setCustomProductForm] = useState({
    name: '',
    characteristics: '',
    quantity: '1',
    productionDays: '1',
    pricePerItem: '',
  });

  // Состояние калькулятора
  const [specs, setSpecs] = useState<ProductSpecs>({
    productType: initialProductType || 'flyers',
    format: 'A6',
    quantity: 1,
    sides: 1,
    paperType: 'semi-matte' as any,
    paperDensity: 0,
    lamination: 'none',
    priceType: 'online', // Всегда используем онлайн по умолчанию
    customerType: 'regular',
    pages: 4,
    magnetic: false,
    cutting: false,
    folding: false,
    roundCorners: false,
    urgency: 'standard',
    vipLevel: 'bronze',
    specialServices: [],
    selectedOperations: [], // 🆕 Выбранные операции с подтипами и количеством
    // 🆕 materialType будет установлен динамически из типов бумаги со склада
    // materialType: 'coated' // Убрано захардкоженное значение
  });
  
  // Состояние для типа печати и режима цвета
  const [printTechnology, setPrintTechnology] = useState<string>('');
  const [printColorMode, setPrintColorMode] = useState<'bw' | 'color' | null>(null);
  
  // Состояние для названий типов продуктов (загружаются из API)
  const [productTypeLabels, setProductTypeLabels] = useState<Record<string, string>>({});
  
  const { ui, open, close } = useCalculatorUI({ showProductSelection: !initialProductType });
  const [selectedProduct, setSelectedProduct] = useState<(Product & { resolvedProductType?: string }) | null>(null);
  const isCustomProduct = selectedProduct?.id === CUSTOM_PRODUCT_ID;
  const customQuantity = Math.max(0, Number(customProductForm.quantity) || 0);
  const customPrice = Number(customProductForm.pricePerItem) || 0;
  const customProductionDays = Math.max(0, Number(customProductForm.productionDays) || 0);
  const isCustomValid =
    Boolean(customProductForm.name.trim()) && customQuantity > 0 && customPrice > 0;
  
  // Схема и типы — вынесено в хук

  const { backendProductSchema, currentConfig, availableFormats, getDefaultFormat } = useCalculatorSchema({
    productType: specs.productType,
    productId: isCustomProduct ? null : (selectedProduct?.id || null), // 🆕 Передаем ID выбранного продукта
    log: logger,
    setSpecs
  });
  
  // 🆕 Логируем состояние selectedProduct для диагностики
  useEffect(() => {
    console.log('🔍 [ImprovedPrintingCalculatorModal] selectedProduct изменился', {
      selectedProductId: selectedProduct?.id,
      selectedProductName: selectedProduct?.name,
      willPassToUseCalculatorSchema: selectedProduct?.id || null
    });
  }, [selectedProduct?.id]);

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
    enabled: userInteracted && selectedProduct?.id != null && !isCustomProduct, // Автопересчет только после первого взаимодействия и выбора продукта
    onCalculate: calculateCost,
    debounceMs: 500,
    customFormat, // ✅ Передаем кастомный формат для отслеживания изменений
    isCustomFormat // ✅ Передаем флаг кастомного формата
  });

  // 🆕 При смене продукта сбрасываем завязанные на схему поля упрощенного продукта,
  // чтобы новые allowed_* и размеры/материалы подтянулись корректно
  const prevProductIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!selectedProduct?.id || editContext?.item) {
      prevProductIdRef.current = selectedProduct?.id || null;
      return;
    }

    // Проверяем, действительно ли продукт изменился
    if (prevProductIdRef.current === selectedProduct.id) {
      return;
    }
    prevProductIdRef.current = selectedProduct.id;

    setSpecs(prev => {
      const next: any = { ...prev };
      // Для упрощённых продуктов сбрасываем size_id и material_id
      // ParamsSection автоматически установит первый размер из нового продукта
      if (next.size_id) {
        delete next.size_id;
      }
      if (next.material_id) {
        delete next.material_id;
      }
      // 🆕 Сбрасываем выбранные операции при смене продукта
      next.selectedOperations = [];
      // Для обычных продуктов сбрасываем paperType, чтобы MaterialsSection
      // мог выбрать первый разрешённый тип бумаги из нового продукта
      const isSimplified = backendProductSchema?.template?.simplified?.sizes?.length > 0;
      if (!isSimplified && next.paperType) {
        delete next.paperType;
        // Также сбрасываем плотность, так как она зависит от типа бумаги
        next.paperDensity = 0;
      }
      return next;
    });

    // Сбрасываем флаг взаимодействия, чтобы автопересчет не дергался лишний раз
    setUserInteracted(false);
  }, [selectedProduct?.id, editContext, backendProductSchema, setSpecs, setUserInteracted]);

  // 🆕 При смене продукта сбрасываем параметры печати,
  // чтобы PrintingSettingsSection смог проставить корректные дефолты по новым ограничениям
  useEffect(() => {
    if (!selectedProduct?.id || editContext?.item) {
      return;
    }

    setPrintTechnology('');
    setPrintColorMode(null);
  }, [selectedProduct?.id, editContext]);

  // 🆕 Автопересчет при изменении параметров печати
  // Параметры печати передаются в configuration при расчете,
  // поэтому useAutoCalculate не отслеживает их изменения напрямую
  // Нужен отдельный useEffect для пересчета при изменении параметров печати
  const prevPrintTechRef = useRef<string>('');
  const prevPrintColorRef = useRef<'bw' | 'color' | null>(null);
  const isFirstRenderRef = useRef(true);
  const calculationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
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
    if (userInteracted && selectedProduct?.id != null && isValid && !isCustomProduct) {
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
  }, [printTechnology, printColorMode, userInteracted, selectedProduct?.id, isValid, instantCalculate, isCustomProduct]);

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
      // 🆕 Сбрасываем выбранные операции при закрытии
      setSpecs(prev => ({ ...prev, selectedOperations: [] }));
    }
  }, [isOpen]);

  // 🆕 Устанавливаем дефолтные значения для всех селекторов (первый элемент)
  useEffect(() => {
    if (!isOpen || editContext?.item) return; // Пропускаем при редактировании
    
    // Устанавливаем первый тип бумаги, если не выбран
    if (warehousePaperTypes.length > 0 && !specs.paperType) {
      const firstPaperType = warehousePaperTypes[0];
      setSpecs(prev => ({
        ...prev,
        paperType: firstPaperType.name as any,
        paperDensity: getDefaultPaperDensity(firstPaperType.name)
      }));
    }
    
    // Устанавливаем первый формат, если не выбран
    if (availableFormats.length > 0 && !specs.format) {
      setSpecs(prev => ({
        ...prev,
        format: availableFormats[0]
      }));
    }
    
    // Устанавливаем дефолтные значения для других полей
    setSpecs(prev => ({
      ...prev,
      sides: prev.sides || 1,
      lamination: prev.lamination || 'none',
      priceType: 'online', // Всегда используем онлайн по умолчанию
      customerType: 'regular', // Всегда используем обычный тип клиента по умолчанию
    }));
  }, [isOpen, warehousePaperTypes, specs.paperType, specs.format, availableFormats, getDefaultPaperDensity, editContext]);

  // 🆕 Устанавливаем materialType на основе выбранного материала или paperType
  // materialType = тип бумаги со склада (вторая вкладка "Типы бумаги")
  useEffect(() => {
    console.log('🔍 [ImprovedPrintingCalculatorModal] useEffect для materialType', {
      warehousePaperTypesLength: warehousePaperTypes.length,
      material_id: specs.material_id,
      isSimplified: backendProductSchema?.template?.simplified,
      hasResult: !!result,
      resultMaterialsLength: result?.materials?.length || 0,
      currentMaterialType: specs.materialType
    });
    
    if (warehousePaperTypes.length === 0) {
      console.log('⚠️ [ImprovedPrintingCalculatorModal] warehousePaperTypes пустой, выходим');
      return;
    }
    
    // 🆕 Для упрощённых продуктов: materialType берётся из paper_type_id выбранного материала
    if (specs.material_id && backendProductSchema?.template?.simplified) {
      console.log('✅ [ImprovedPrintingCalculatorModal] Упрощённый продукт с material_id, ищем materialType');
      // Получаем материал из результата расчёта
      // В результате расчёта может быть paper_type_name или paper_type_id
      if (result?.materials && result.materials.length > 0) {
        const selectedMaterial = result.materials.find((m: any) => 
          (m.materialId ?? m.material_id ?? m.id) === specs.material_id
        );
        
        if (selectedMaterial) {
          // Пытаемся найти тип бумаги по paper_type_name из материала
          // paper_type_name может быть "Офисная", нужно найти соответствующий тип в warehousePaperTypes
          const paperTypeName = (selectedMaterial as any).paper_type_name;
          console.log('🔍 [ImprovedPrintingCalculatorModal] Ищем materialType для упрощённого продукта', {
            material_id: specs.material_id,
            selectedMaterial,
            paper_type_name: paperTypeName,
            warehousePaperTypes: warehousePaperTypes.map(pt => ({ name: pt.name, display_name: pt.display_name }))
          });
          
          if (paperTypeName) {
            // Ищем тип бумаги по display_name (например, "Офисная")
            const paperType = warehousePaperTypes.find(pt => pt.display_name === paperTypeName);
            if (paperType) {
              console.log('✅ [ImprovedPrintingCalculatorModal] Найден тип бумаги для materialType', {
                paperTypeName,
                paperTypeName_found: paperType.name,
                current_materialType: specs.materialType
              });
              setSpecs(prev => {
                if (!prev.materialType || prev.materialType !== paperType.name) {
                  console.log('🔄 [ImprovedPrintingCalculatorModal] Устанавливаем materialType', {
                    old: prev.materialType,
                    new: paperType.name
                  });
                  return { ...prev, materialType: paperType.name as any };
                }
                return prev;
              });
              return; // Выходим, чтобы не перезаписывать для обычных продуктов
            } else {
              console.warn('⚠️ [ImprovedPrintingCalculatorModal] Тип бумаги не найден по display_name', {
                paperTypeName,
                availableDisplayNames: warehousePaperTypes.map(pt => pt.display_name)
              });
            }
          } else {
            console.warn('⚠️ [ImprovedPrintingCalculatorModal] paper_type_name отсутствует в материале', {
              material_id: specs.material_id,
              selectedMaterialKeys: Object.keys(selectedMaterial)
            });
          }
        }
      }
      
      // 🆕 Fallback: если нет результата расчёта, используем материал из API
      // Это нужно для установки materialType до первого расчёта
      // TODO: Получить материалы из MaterialsSection или загрузить отдельно
    }
    
    // Для обычных продуктов: materialType берётся из выбранного paperType
    if (specs.paperType && !(specs.material_id && backendProductSchema?.template?.simplified)) {
      // Находим тип бумаги со склада, который соответствует выбранному paperType
      const selectedPaperType = warehousePaperTypes.find(pt => pt.name === specs.paperType);
      if (selectedPaperType) {
        // materialType должен быть равен name типа бумаги со склада
        // Это и есть "тип материала" - тип бумаги из второй вкладки склада
        setSpecs(prev => {
          // Устанавливаем materialType = name типа бумаги со склада
          if (!prev.materialType || prev.materialType !== selectedPaperType.name) {
            return { ...prev, materialType: selectedPaperType.name as any };
          }
          return prev;
        });
      }
    }
  }, [warehousePaperTypes, specs.paperType, specs.material_id, backendProductSchema, result]);


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
    if (product.id === CUSTOM_PRODUCT_ID) {
      setSelectedProduct(product as Product & { resolvedProductType?: string });
      setSpecs(prev => ({ ...prev, productType: 'universal' }));
      setCustomProductForm({
        name: '',
        characteristics: '',
        quantity: '1',
        productionDays: '1',
        pricePerItem: '',
      });
      close('showProductSelection');
      setUserInteracted(false);
      logger.info('Выбран произвольный продукт');
      return;
    }

    const resolvedType = resolveProductType(product) ?? specs.productType ?? 'flyers';
    console.log('🔍 [ImprovedPrintingCalculatorModal] handleProductSelect вызван', {
      productId: product.id,
      productName: product.name,
      resolvedType,
      willSetSelectedProduct: true
    });
    
    // ✅ Сбрасываем все поля, зависящие от продукта, при смене продукта
    setSelectedProduct({ ...product, resolvedProductType: resolvedType });
    setSpecs(prev => {
      const reset: Partial<ProductSpecs> = {
        productType: resolvedType,
        format: getDefaultFormat(),
        // ✅ Сбрасываем все поля, которые зависят от продукта
        size_id: undefined,
        material_id: undefined,
        paperType: undefined,
        paperDensity: 0,
        materialType: undefined, // Сбрасываем тип материала
        selectedOperations: [], // Сбрасываем выбранные операции
        // Оставляем только базовые поля, которые не зависят от продукта
        quantity: prev.quantity || 1,
        sides: prev.sides || 1,
        lamination: prev.lamination || 'none',
        priceType: prev.priceType || 'online',
        customerType: prev.customerType || 'regular',
        pages: prev.pages || 4,
      };
      return { ...prev, ...reset };
    });
    
    // ✅ Сбрасываем параметры печати
    setPrintTechnology('');
    setPrintColorMode(null);
    
    close('showProductSelection');
    setUserInteracted(false); // ✅ Сбрасываем флаг взаимодействия, чтобы автопересчет не дергался
    logger.info('Выбран продукт из базы данных', { productId: product.id, productName: product.name, resolvedType });
  }, [close, getDefaultFormat, logger, resolveProductType, setSelectedProduct, setSpecs, setUserInteracted, specs.productType]);

  useEffect(() => {
    if (!isOpen || !editContext?.item) return;
    const params = (editContext.item as any).params || {};
    if (!params?.customProduct) return;

    setSelectedProduct({
      id: CUSTOM_PRODUCT_ID,
      category_id: 0,
      name: 'Произвольный продукт',
      description: 'Свободная форма без ограничений',
      icon: '✍️',
      calculator_type: 'simplified',
      product_type: 'universal',
      operator_percent: 10,
      is_active: true,
      created_at: '',
      updated_at: '',
      category_name: 'Произвольное',
      category_icon: '✨',
    } as Product & { resolvedProductType?: string });
    setCustomProductForm({
      name: String(params.customName || params.description || editContext.item.type || ''),
      characteristics: String(params.characteristics || ''),
      quantity: String(editContext.item.quantity ?? 1),
      productionDays: String(params.productionDays ?? '1'),
      pricePerItem: String(editContext.item.price ?? ''),
    });
    setSpecs(prev => ({ ...prev, productType: 'universal' }));
  }, [editContext, isOpen, setSpecs]);

  const customResult = customQuantity > 0 && customPrice > 0 ? {
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
  } : null;

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

      // 🆕 Очищаем specifications от потенциально проблемных данных перед сериализацией
      const cleanSpecifications = { ...result.specifications };
      // Удаляем selectedOperations из specifications (они не нужны в сохраненных данных)
      delete cleanSpecifications.selectedOperations;
      
      // 🆕 Очищаем parameterSummary и formatInfo для безопасной сериализации
      const cleanParameterSummary = Array.isArray(parameterSummary)
        ? parameterSummary.map((p: any) => ({
            label: String(p.label || ''),
            value: String(p.value || ''),
          }))
        : [];
      
      const cleanFormatInfo = result.formatInfo
        ? (typeof result.formatInfo === 'string'
            ? result.formatInfo
            : JSON.parse(JSON.stringify(result.formatInfo)))
        : undefined;
      
      const specificationsPayload = {
        ...cleanSpecifications,
        formatInfo: cleanFormatInfo,
        parameterSummary: cleanParameterSummary,
        sheetsNeeded: computedSheets,
        piecesPerSheet: itemsPerSheet,
        layout: result.layout ? JSON.parse(JSON.stringify(result.layout)) : undefined, // 🆕 Глубокая копия для избежания циклических ссылок
        customFormat: isCustomFormat ? customFormat : undefined,
        // Сохраняем тип печати и режим цвета
        print_technology: printTechnology || undefined,
        printTechnology: printTechnology || undefined,
        print_color_mode: printColorMode || undefined,
        printColorMode: printColorMode || undefined,
        // 🆕 Сохраняем material_id и size_id для упрощённых продуктов
        ...(result.specifications.material_id ? { material_id: result.specifications.material_id } : {}),
        ...(result.specifications.size_id ? { size_id: result.specifications.size_id } : {}),
      };

      // 🆕 Очищаем данные для безопасной сериализации
      const cleanMaterials = result.materials ? result.materials.map((m: any) => ({
        materialId: m.materialId,
        materialName: m.materialName,
        quantity: m.quantity,
        unitPrice: m.unitPrice,
        totalCost: m.totalCost,
        density: m.density,
        paper_type_name: m.paper_type_name,
      })) : [];
      
      const cleanServices = result.services ? result.services.map((s: any) => ({
        operationId: s.operationId,
        operationName: s.operationName,
        operationType: s.operationType,
        priceUnit: s.priceUnit,
        unitPrice: s.unitPrice,
        quantity: s.quantity,
        totalCost: s.totalCost,
      })) : [];
      
      const paramsPayload = {
        description,
        specifications: specificationsPayload,
        materials: cleanMaterials,
        services: cleanServices,
        productionTime: result.productionTime,
        productType: result.specifications.productType,
        urgency: result.specifications.priceType,
        customerType: result.specifications.customerType,
        estimatedDelivery,
        sheetsNeeded: computedSheets,
        piecesPerSheet: itemsPerSheet,
        formatInfo: cleanFormatInfo,
        parameterSummary: cleanParameterSummary,
        productId: selectedProduct?.id,
        productName: selectedProduct?.name,
        ...(selectedProduct?.operator_percent !== undefined
          ? { operator_percent: Number(selectedProduct.operator_percent) }
          : {}),
        layout: result.layout ? JSON.parse(JSON.stringify(result.layout)) : undefined, // 🆕 Глубокая копия
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
      } catch (error: any) {
        logger.error('Ошибка при сохранении позиции заказа', error);
        
        // 🆕 Улучшенная обработка ошибок: различаем бизнес-ошибки (недостаток материалов) и системные
        let errorMessage = 'Не удалось сохранить позицию заказа';
        if (error?.response?.data?.error) {
          errorMessage = error.response.data.error;
          // Если это ошибка недостатка материалов, делаем сообщение более заметным
          if (errorMessage.includes('Недостаточно материала') || 
              error?.response?.data?.code === 'INSUFFICIENT_MATERIAL') {
            errorMessage = `⚠️ ${errorMessage}\n\nПожалуйста, пополните склад или выберите другой материал.`;
          }
        } else if (error?.message) {
          errorMessage = error.message;
        }
        
        toast.error('Не удалось сохранить позицию заказа', errorMessage);
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


  if (!isOpen) return null;

  return (
    <div className="improved-printing-calculator-overlay" onClick={(e) => {
      // Закрываем модалку при клике на overlay
      if (e.target === e.currentTarget) {
        onClose();
      }
    }}>
      {/* Основной калькулятор */}
      <div className="improved-printing-calculator">
        {/* Кнопка закрытия */}
        <button
          className="calculator-close-button"
          onClick={onClose}
          aria-label="Закрыть"
          type="button"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {/* Основной контент */}
        <div className="calculator-content">
          <div className="calculator-main">
            {/* Ошибки валидации */}
            {!isCustomProduct && Object.keys(validationErrors).length > 0 && (
              <div className="validation-errors">
                {Object.entries(validationErrors).map(([key, message]) => (
                  <div key={key} className="validation-error">
                    {message}
                  </div>
                ))}
              </div>
            )}
            {isCustomProduct && customErrors.length > 0 && (
              <div className="validation-errors">
                {customErrors.map((message) => (
                  <div key={message} className="validation-error">
                    {message}
                  </div>
                ))}
              </div>
            )}

            {isCustomProduct ? (
              <div className="calculator-section-group calculator-section-unified">
                <div className="section-group-header">
                  <h3>✍️ Произвольный продукт</h3>
                </div>
                <div className="section-group-content">
                  <SelectedProductCard
                    productType="universal"
                    displayName={selectedProduct?.name || 'Произвольный продукт'}
                    onOpenSelector={() => open('showProductSelection')}
                  />
                  <div className="form-section custom-product-form">
                    <div className="custom-product-grid">
                      <label className="custom-product-field">
                        <span className="custom-product-label">Наименование</span>
                        <input
                          type="text"
                          className="custom-product-input"
                          value={customProductForm.name}
                          onChange={(e) => setCustomProductForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="Например: Табличка 30×20"
                        />
                      </label>
                      <label className="custom-product-field">
                        <span className="custom-product-label">Тираж</span>
                        <input
                          type="number"
                          className="custom-product-input"
                          value={customProductForm.quantity}
                          min={1}
                          onChange={(e) => setCustomProductForm(prev => ({ ...prev, quantity: e.target.value }))}
                        />
                      </label>
                      <label className="custom-product-field">
                        <span className="custom-product-label">Срок изготовления (дн.)</span>
                        <input
                          type="number"
                          className="custom-product-input"
                          value={customProductForm.productionDays}
                          min={1}
                          onChange={(e) => setCustomProductForm(prev => ({ ...prev, productionDays: e.target.value }))}
                        />
                        <span className="custom-product-hint">Можно оставить 1 день по умолчанию</span>
                      </label>
                      <label className="custom-product-field">
                        <span className="custom-product-label">Цена за штуку (BYN)</span>
                        <input
                          type="number"
                          className="custom-product-input"
                          value={customProductForm.pricePerItem}
                          min={0}
                          step="0.01"
                          onChange={(e) => setCustomProductForm(prev => ({ ...prev, pricePerItem: e.target.value }))}
                          placeholder="Например: 12.50"
                        />
                      </label>
                      <label className="custom-product-field custom-product-field--full">
                        <span className="custom-product-label">Характеристики</span>
                        <textarea
                          className="custom-product-textarea"
                          value={customProductForm.characteristics}
                          onChange={(e) => setCustomProductForm(prev => ({ ...prev, characteristics: e.target.value }))}
                          placeholder="Материал, цвет, комментарии..."
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
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
                selectedProduct={selectedProduct}
                currentConfig={currentConfig}
                onOpenProductSelector={() => open('showProductSelection')}
              />
            )}

            {/* Результат расчета - фиксированный внизу */}
            {isCustomProduct ? (
              <ResultSection
                result={customResult as any}
                isValid={isCustomValid}
                onAddToOrder={() => handleAddCustomProduct()}
                mode={isEditMode ? 'edit' : 'create'}
              />
            ) : (
              <ResultSection
                result={result as any}
                isValid={isValid}
                onAddToOrder={() => handleAddToOrder()}
                mode={isEditMode ? 'edit' : 'create'}
              />
            )}

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

         </div>
       );
     };
