import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppIcon } from '../ui/AppIcon';
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
import { DynamicProductSelector, CUSTOM_PRODUCT_ID, POSTPRINT_PRODUCT_ID } from './components/DynamicProductSelector';
import { PrintingSettingsSection } from './components/PrintingSettingsSection';
import { getProductionTimeLabel, getProductionDaysByPriceType, getProductionTimeLabelFromDays } from './utils/time';
import { getEffectiveSimplifiedConfig } from './utils/simplifiedConfig';
import { ProductSpecs, CalculationResult, EditContextPayload } from './types/calculator.types';
import { useCalculatorEditContext } from './hooks/useCalculatorEditContext';
import { useCalculatorPricingActions } from './hooks/useCalculatorPricingActions';
import { useAutoCalculate } from './hooks/useAutoCalculate'; // 🆕 Автопересчет
import { getEnhancedProductTypes } from '../../api';
import { buildParameterSummary, type BuildSummaryOptions } from './utils/summaryBuilder';
import { CalculatorSections } from './components/CalculatorSections';
import { CustomProductForm } from './components/CustomProductForm';
import { PostprintServicesForm } from './components/PostprintServicesForm';
import { usePostprintServices } from './hooks/usePostprintServices';
import { useCustomProduct } from './hooks/useCustomProduct';
import { useProductSelection } from './hooks/useProductSelection';
import { getPriceTypeMultiplier, buildOrderPayload, buildAITrainingData } from './utils/orderPayloadBuilder';

const createInitialSpecs = (initialProductType?: string): ProductSpecs => ({
  productType: initialProductType || 'flyers',
  format: 'A6',
  quantity: 1,
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
  selectedOperations: [],
});

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
  const [specs, setSpecs] = useState<ProductSpecs>(() => createInitialSpecs(initialProductType));
  
  // Состояние для типа печати и режима цвета
  const [printTechnology, setPrintTechnology] = useState<string>('');
  const [printColorMode, setPrintColorMode] = useState<'bw' | 'color' | null>(null);
  
  // Состояние для названий типов продуктов (загружаются из API)
  const [productTypeLabels, setProductTypeLabels] = useState<Record<string, string>>({});
  // Тип продукта внутри одного продукта (односторонние, с ламинацией и т.д.)
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);

  const { ui, open, close } = useCalculatorUI({ showProductSelection: !initialProductType });
  const [selectedProduct, setSelectedProduct] = useState<(Product & { resolvedProductType?: string }) | null>(null);
  const isCustomProduct = selectedProduct?.id === CUSTOM_PRODUCT_ID;
  const isPostprintProduct = selectedProduct?.id === POSTPRINT_PRODUCT_ID;
  const {
    customProductForm,
    setCustomProductForm,
    isCustomValid,
    customResult,
    customErrors,
    handleAddCustomProduct,
    resetCustomProductForm,
  } = useCustomProduct({
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
  });
  const {
    postprintServices,
    postprintSelections,
    setPostprintSelections,
    postprintLoading,
    postprintError,
    postprintErrors,
    postprintResult,
    isPostprintValid,
    handleAddPostprintProduct,
    resetPostprintSelections,
    getOperationUnitPrice,
  } = usePostprintServices({
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
  });
  const postprintByCategory = useMemo(() => {
    const groups = new Map<string, typeof postprintServices>();
    for (const s of postprintServices) {
      const cat = s.categoryName ?? 'Без категории';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(s);
    }
    return Array.from(groups.entries()).map(([categoryName, services]) => ({ categoryName, services }));
  }, [postprintServices]);
  
  // Схема и типы — вынесено в хук

  const { backendProductSchema, currentConfig, availableFormats, getDefaultFormat } = useCalculatorSchema({
    productType: specs.productType,
    productId: isCustomProduct || isPostprintProduct ? null : (selectedProduct?.id || null), // 🆕 Передаем ID выбранного продукта
    log: logger,
    setSpecs
  });
  
  const simplified = backendProductSchema?.template?.simplified;
  const hasProductTypes = Boolean(simplified?.types?.length);
  const defaultTypeId = simplified?.types?.find((t: any) => t.default)?.id ?? simplified?.types?.[0]?.id ?? null;

  const effectiveConfig = useMemo(
    () => getEffectiveSimplifiedConfig(simplified, hasProductTypes ? selectedTypeId : null),
    [simplified, hasProductTypes, selectedTypeId]
  );
  const effectiveSizes = effectiveConfig.sizes;
  const effectivePagesOptions = effectiveConfig.pages?.options;

  type SizeWithPrices = { id: string; width_mm: number; height_mm: number; min_qty?: number; print_prices?: Array<{ tiers?: Array<{ min_qty?: number }> }> };

  const applyProductTypeConfig = useCallback((typeId: number | null) => {
    if (typeId == null) return;
    const typeVariant = simplified?.types?.find((t: any) => t.id === typeId);
    const cfg = simplified?.typeConfigs?.[String(typeId)];
    const initial = cfg?.initial;
    const initialSizeId = initial?.size_id;
    const targetSize = initialSizeId
      ? cfg?.sizes?.find((s: any) => s.id === initialSizeId)
      : cfg?.sizes?.[0];
    const firstSize = (targetSize ?? cfg?.sizes?.[0]) as SizeWithPrices | undefined;
    const autoQty = firstSize?.min_qty ?? firstSize?.print_prices?.[0]?.tiers?.[0]?.min_qty ?? 1;

    const opsSet = new Set<number>();
    const operationsFromInitial: Array<{ operationId: number; variantId?: number; subtype?: string }> = [];
    if (initial?.operations?.length) {
      for (const op of initial.operations) {
        const opId = op.operation_id;
        if (opId && !opsSet.has(opId)) {
          opsSet.add(opId);
          operationsFromInitial.push({
            operationId: opId,
            ...(op.variant_id != null ? { variantId: op.variant_id } : {}),
            ...(op.subtype ? { subtype: op.subtype } : {}),
          });
        }
      }
    }
    // Добавляем обязательные операции из схемы, если их ещё нет (чтобы галочки отображались)
    const schemaOps = backendProductSchema?.operations || [];
    for (const op of schemaOps) {
      const opId = op.operation_id ?? op.id;
      if (opId && (op.is_required === true || op.is_required === 1) && !opsSet.has(opId)) {
        opsSet.add(opId);
        operationsFromInitial.push({ operationId: opId });
      }
    }

    if (initial?.print_technology) {
      setPrintTechnology(initial.print_technology);
    }
    if (initial?.color_mode) {
      setPrintColorMode(initial.color_mode);
    }

    setSpecs((prev) => ({
      ...prev,
      typeId: typeId ?? undefined,
      typeName: typeVariant?.name ?? undefined,
      ...(firstSize ? { size_id: firstSize.id, format: `${firstSize.width_mm}×${firstSize.height_mm}` } : {}),
      quantity: initial?.quantity ?? autoQty,
      ...(initial?.material_id != null ? { material_id: initial.material_id } : {}),
      ...(initial?.base_material_id != null ? { base_material_id: initial.base_material_id } : {}),
      ...(initial?.sides_mode ? { sides: initial.sides_mode === 'single' ? 1 : 2 } : {}),
      selectedOperations: operationsFromInitial,
    }));
  }, [simplified?.types, simplified?.typeConfigs, backendProductSchema?.operations, setSpecs]);

  useEffect(() => {
    if (!hasProductTypes) {
      if (selectedTypeId !== null) setSelectedTypeId(null);
      return;
    }
    const valid = simplified?.types?.some((t: any) => t.id === selectedTypeId);
    if (!valid) {
      const nextId = defaultTypeId ?? simplified?.types?.[0]?.id ?? null;
      setSelectedTypeId(nextId);
      applyProductTypeConfig(nextId);
    }
  }, [hasProductTypes, simplified?.types, simplified?.typeConfigs, defaultTypeId, selectedTypeId, applyProductTypeConfig]);

  const handleSelectProductType = useCallback(
    (typeId: number) => {
      setSelectedTypeId(typeId);
      applyProductTypeConfig(typeId);
    },
    [applyProductTypeConfig]
  );

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
  const safeWarehousePaperTypes = Array.isArray(warehousePaperTypes) ? warehousePaperTypes : [];


  // Валидация вынесена в хук
  const { validationErrors, isValid } = useCalculatorValidation({
    specs: { productType: specs.productType, quantity: specs.quantity, pages: specs.pages, size_id: specs.size_id, selectedOperations: specs.selectedOperations },
    backendProductSchema,
    isCustomFormat,
    customFormat,
    effectiveSizes: effectiveSizes?.length ? effectiveSizes : undefined,
    effectivePagesOptions: Array.isArray(effectivePagesOptions) && effectivePagesOptions.length > 0 ? effectivePagesOptions : undefined,
  });

  const getProductionTime = useCallback(() => {
    if (specs.productionDays != null && specs.productionDays > 0) {
      return getProductionTimeLabelFromDays(specs.productionDays);
    }
    return getProductionTimeLabel(specs.priceType as any);
  }, [specs.priceType, specs.productionDays]);

  const getProductionDays = useCallback(() => {
    if (specs.productionDays != null && specs.productionDays > 0) {
      return specs.productionDays;
    }
    return getProductionDaysByPriceType(specs.priceType as any);
  }, [specs.priceType, specs.productionDays]);

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
    warehousePaperTypes: safeWarehousePaperTypes,
    productTypeLabels,
    printTechnology,
    printColorMode,
    effectiveSizes: effectiveSizes?.length ? effectiveSizes : undefined,
    toast,
    logger,
  });

  // 🆕 Автоматический пересчет при изменении параметров
  const { instantCalculate } = useAutoCalculate({
    specs,
    selectedProduct,
    isValid,
    enabled: userInteracted && selectedProduct?.id != null && !isCustomProduct && !isPostprintProduct, // Автопересчет только после первого взаимодействия и выбора продукта
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
    setSelectedTypeId(null);

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
      const sim = backendProductSchema?.template?.simplified;
      const isSimplified = (sim?.sizes?.length ?? 0) > 0 || Boolean(sim?.types?.length && sim?.typeConfigs);
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

  // Автопересчёт при установке/смене material_id или при смене подтипа (typeId).
  // material_id выставляется асинхронно MaterialsSection после загрузки материалов,
  // поэтому стоимость материала не учитывалась при первом рендере. Вызываем calculateCost напрямую,
  // т.к. instantCalculate требует userInteracted, а при первом открытии он может быть ещё false.
  const prevCalcTriggerRef = useRef<{ materialId?: number; typeId?: number; productId?: number | null }>({});
  useEffect(() => {
    if (!selectedProduct?.id || !specs.size_id || isCustomProduct || isPostprintProduct) return;
    const current = { materialId: specs.material_id, typeId: specs.typeId, productId: selectedProduct.id };
    const prev = prevCalcTriggerRef.current;

    if (prev.productId !== current.productId) {
      prevCalcTriggerRef.current = current;
      return;
    }

    const materialChanged = current.materialId != null && current.materialId !== prev.materialId;
    const typeChanged = current.typeId != null && current.typeId !== prev.typeId && prev.typeId != null;

    prevCalcTriggerRef.current = current;

    if ((materialChanged || typeChanged) && isValid) {
      void calculateCost(false);
    }
  }, [specs.material_id, specs.typeId, specs.size_id, selectedProduct?.id, isValid, calculateCost, isCustomProduct, isPostprintProduct]);

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
    
    // Устанавливаем первый тип бумаги только если продукт использует материалы (есть поле paperType в схеме)
    const productUsesPaper = backendProductSchema?.fields?.some((f: any) => f.name === 'paperType');
    if (productUsesPaper && safeWarehousePaperTypes.length > 0 && !specs.paperType) {
      const firstPaperType = safeWarehousePaperTypes[0];
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
      priceType: 'standard', // По умолчанию стандарт (×1)
      customerType: 'regular', // Всегда используем обычный тип клиента по умолчанию
    }));
  }, [isOpen, safeWarehousePaperTypes, specs.paperType, specs.format, availableFormats, getDefaultPaperDensity, editContext, backendProductSchema]);

  // Устанавливаем materialType только для обычных продуктов (из paperType).
  // Для упрощённых продуктов materialType задаёт только MaterialsSection (тип+плотность → material_id + materialType), чтобы не было рекурсии result ↔ materialType.
  useEffect(() => {
    if (safeWarehousePaperTypes.length === 0) return;
    if (specs.material_id && backendProductSchema?.template?.simplified) return;

    if (specs.paperType) {
      const selectedPaperType = safeWarehousePaperTypes.find(pt => pt.name === specs.paperType);
      if (selectedPaperType && specs.materialType !== selectedPaperType.name) {
        setSpecs(prev => {
          if (prev.materialType === selectedPaperType.name) return prev;
          return { ...prev, materialType: selectedPaperType.name as any };
        });
      }
    }
  }, [safeWarehousePaperTypes, specs.paperType, specs.materialType, backendProductSchema]);


  const { handleProductSelect } = useProductSelection({
    close,
    logger,
    resolveProductType,
    getDefaultFormat,
    specsProductType: specs.productType,
    setSelectedProduct,
    setSpecs,
    setUserInteracted,
    setPrintTechnology,
    setPrintColorMode,
    resetCustomProductForm,
    resetPostprintSelections,
  });

  const resetProductSelection = useCallback(() => {
    if (isEditMode || initialProductId) {
      return;
    }
    setSelectedProduct(null);
    setSpecs(() => createInitialSpecs(initialProductType));
    setCustomFormat({ width: '', height: '' });
    setIsCustomFormat(false);
    setResult(null);
    setUserInteracted(false);
    resetCustomProductForm();
    resetPostprintSelections();
    setPrintTechnology('');
    setPrintColorMode(null);
  }, [
    initialProductId,
    initialProductType,
    isEditMode,
    resetCustomProductForm,
    resetPostprintSelections,
    setResult,
    setSelectedProduct,
    setSpecs,
    setCustomFormat,
    setIsCustomFormat,
    setUserInteracted,
    setPrintTechnology,
    setPrintColorMode,
  ]);

  const handleOpenProductSelector = useCallback(() => {
    resetProductSelection();
    open('showProductSelection');
  }, [open, resetProductSelection]);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      resetProductSelection();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, resetProductSelection]);


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
    const isSyntheticEvent = (value: any) =>
      value &&
      typeof value === 'object' &&
      ('nativeEvent' in value || 'isDefaultPrevented' in value) &&
      ('target' in value || 'currentTarget' in value);

    if (isSyntheticEvent(updates)) {
      logger.warn('⚠️ updateSpecs получил SyntheticEvent, пропускаем', { updates });
      return;
    }

    const normalizedUpdates = Object.entries(updates || {}).reduce<Partial<ProductSpecs>>(
      (acc, [key, value]) => {
        if (isSyntheticEvent(value)) {
          logger.warn('⚠️ updateSpecs получил SyntheticEvent в поле', { key });
          return acc;
        }
        acc[key as keyof ProductSpecs] = value as any;
        return acc;
      },
      {}
    );

    if (Object.keys(normalizedUpdates).length === 0) {
      return;
    }

    setSpecs(prev => ({ ...prev, ...normalizedUpdates }));
    setUserInteracted(true); // Отмечаем, что пользователь взаимодействовал с калькулятором
    
    // ❌ УБРАНО: Мгновенный расчет здесь
    // useAutoCalculate уже автоматически пересчитывает при изменении specs
    // Дополнительный вызов instantCalculate приводит к двойному/тройному расчету
  }, [setSpecs, setUserInteracted]);


  // getProductionDays передаётся выше через useCalculatorPricingActions / handleAddToOrder

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

      const { apiItem, effectivePricePerItem } = buildOrderPayload({
        result,
        selectedProduct,
        getProductionDays,
        isCustomFormat,
        customFormat,
        printTechnology,
        printColorMode,
      });

      if (customDescription) {
        apiItem.params.description = customDescription;
      }

      trainAIOnOrder(buildAITrainingData(result, effectivePricePerItem));

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

        let errorMessage = 'Не удалось сохранить позицию заказа';
        if (error?.response?.data?.error) {
          errorMessage = error.response.data.error;
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
      printTechnology,
      printColorMode,
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
      {/* Обёртка: модалка + субтотал-бар одной шириной, без смещения */}
      <div className="calculator-modal-wrapper">
      {/* Основной калькулятор */}
      <div className="improved-printing-calculator">
        {/* Кнопка закрытия */}
        <button
          className="calculator-close-button"
          onClick={onClose}
          aria-label="Закрыть"
          type="button"
        >
          <AppIcon name="x" size="lg" />
        </button>
        {/* Основной контент */}
        <div className="calculator-content">
          <div className="calculator-main">
            {/* Ошибки валидации */}
            {!isCustomProduct && !isPostprintProduct && Object.keys(validationErrors).length > 0 && (
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
              <CustomProductForm
                selectedProductName={selectedProduct?.name || ''}
                customProductForm={customProductForm}
                setCustomProductForm={setCustomProductForm}
                onOpenProductSelector={handleOpenProductSelector}
              />
            ) : isPostprintProduct ? (
              <PostprintServicesForm
                selectedProductName={selectedProduct?.name || ''}
                onOpenProductSelector={handleOpenProductSelector}
                postprintLoading={postprintLoading}
                postprintError={postprintError}
                postprintServices={postprintServices}
                postprintByCategory={postprintByCategory}
                postprintSelections={postprintSelections}
                setPostprintSelections={setPostprintSelections}
                getOperationUnitPrice={getOperationUnitPrice}
              />
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
                onOpenProductSelector={handleOpenProductSelector}
                effectiveSizes={effectiveSizes}
                effectivePages={effectiveConfig.pages}
                productTypes={hasProductTypes ? simplified?.types : undefined}
                selectedTypeId={selectedTypeId}
                onSelectType={handleSelectProductType}
              />
            )}

          </div>
        </div>

        {/* Пресеты удалены */}
      </div>

      {/* Блок субтотала — под модалкой, единая ширина и стиль */}
      <div className="calculator-subtotal-bar">
        {isCustomProduct ? (
          <ResultSection
            result={customResult as any}
            isValid={isCustomValid}
            onAddToOrder={() => handleAddCustomProduct()}
            mode={isEditMode ? 'edit' : 'create'}
          />
        ) : isPostprintProduct ? (
          <ResultSection
            result={postprintResult as any}
            isValid={isPostprintValid}
            onAddToOrder={() => handleAddPostprintProduct()}
            mode={isEditMode ? 'edit' : 'create'}
          />
        ) : (
          <ResultSection
            result={
              result
                ? {
                    ...result,
                    pricePerItem: Math.round(result.pricePerItem * getPriceTypeMultiplier(specs.priceType || 'standard') * 100) / 100,
                    totalCost: Math.round(result.totalCost * getPriceTypeMultiplier(specs.priceType || 'standard') * 100) / 100,
                  }
                : null
            }
            isValid={isValid}
            onAddToOrder={() => handleAddToOrder()}
            mode={isEditMode ? 'edit' : 'create'}
          />
        )}
      </div>
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
