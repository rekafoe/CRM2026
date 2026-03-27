import React, { useCallback, useEffect, useState } from 'react';
import { Product } from '../../../services/products';
import { calculatePrice as unifiedCalculatePrice } from '../../../services/pricing';
import { parseFormatToTrimSize } from '../../../utils/formatUtils';
import { CalculationResult, ProductSpecs } from '../types/calculator.types';

interface BuildSummaryOptions {
  isCustomFormat: boolean;
  customFormat: { width: string; height: string };
  warehousePaperTypes?: Array<{ name: string; display_name: string }>;
  productTypeLabels?: Record<string, string>;
}

interface UseCalculatorPricingActionsParams {
  specs: ProductSpecs;
  isValid: boolean;
  validationErrors: Record<string, string>;
  currentConfig: any;
  backendProductSchema: any;
  isCustomFormat: boolean;
  customFormat: { width: string; height: string };
  selectedProduct: (Product & { resolvedProductType?: string }) | null;
  resolveProductType: (product?: Product | null) => string | null;
  getProductionTime: () => string;
  buildParameterSummary: (
    specs: Record<string, any>,
    schema: any | null,
    options: BuildSummaryOptions,
  ) => Array<{ key: string; label: string; value: string }>;
  warehousePaperTypes?: Array<{ name: string; display_name: string }>;
  productTypeLabels?: Record<string, string>;
  printTechnology?: string;
  printColorMode?: 'bw' | 'color' | null;
  /** Размеры текущего типа продукта (для продуктов с типами) */
  effectiveSizes?: any[];
  /** setSpecs для синхронизации quantity операций per_sheet с бэкендом (ламинация по листам) */
  setSpecs?: React.Dispatch<React.SetStateAction<ProductSpecs>>;
  toast: { success: Function; error: Function };
  logger: { info: Function; error: Function };
}

interface UseCalculatorPricingActionsReturn {
  result: CalculationResult | null;
  setResult: React.Dispatch<React.SetStateAction<CalculationResult | null>>;
  appliedDiscount: any;
  setAppliedDiscount: React.Dispatch<React.SetStateAction<any>>;
  userInteracted: boolean;
  setUserInteracted: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  calculateCost: (showToast?: boolean) => Promise<void>;
}

/** Продукт «требует печать», только если в схеме явно заданы технологии/цены печати (иначе — продукт без печати: секция «Печать» не показывается, расчёт идёт без выбора типа/режима). */
export function productRequiresPrint(schema: any, effectiveSizes?: any[]): boolean {
  if (!schema) return false;
  const constraints = schema.constraints;
  if (constraints?.allowed_print_technologies && Array.isArray(constraints.allowed_print_technologies) && constraints.allowed_print_technologies.length > 0) {
    return true;
  }
  const template = schema.template;
  const sizesToCheck = Array.isArray(effectiveSizes) ? effectiveSizes : template?.simplified?.sizes;
  if (sizesToCheck && Array.isArray(sizesToCheck)) {
    const hasPrintPrices = sizesToCheck.some((size: any) =>
      Array.isArray(size.print_prices) && size.print_prices.length > 0
    );
    if (hasPrintPrices) return true;
  }
  const configData = template?.config_data || template;
  if (configData?.print_prices && Array.isArray(configData.print_prices) && configData.print_prices.length > 0) {
    return true;
  }
  return false;
}

/** Сравнение id материала с бэкенда и из specs (число / строка). Иначе find() не находит строку и срабатывает fallback на materials[0] (часто расходник отделки — DTF). */
function materialRowId(m: any): number | undefined {
  const v = m?.materialId ?? m?.material_id ?? m?.id;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function sameMaterialId(a: unknown, b: unknown): boolean {
  const na = Number(a);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

export function useCalculatorPricingActions({
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
  effectiveSizes,
  setSpecs: setSpecsFromParent,
  toast,
  logger,
}: UseCalculatorPricingActionsParams): UseCalculatorPricingActionsReturn {
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [appliedDiscount, setAppliedDiscount] = useState<any>(null);
  const [userInteracted, setUserInteracted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculatePriceViaBackend = useCallback(
    async (productId: number, configuration: any, quantity: number): Promise<any> => {
      try {
        const priceType = configuration?.priceType ?? configuration?.urgency ?? 'standard';
        const backendResult = await unifiedCalculatePrice({
          product_id: productId,
          quantity,
          params: configuration,
          channel: priceType,
        } as any);
        return backendResult as any;
      } catch (err) {
        logger.error('Ошибка расчета цены через бэкенд:', err);
        throw err;
      }
    },
    [logger],
  );

  const calculateCost = useCallback(
    async (showToast: boolean = false) => {
      if (!isValid || Object.keys(validationErrors).length > 0) {
        if (showToast) {
          toast.error('Проверьте правильность заполнения полей');
        }
        return;
      }

      if (specs.quantity <= 0) {
        if (showToast) {
          toast.error('Количество должно быть больше 0');
        }
        return;
      }

      setError(null);

      try {
        if (!selectedProduct?.id) {
          throw new Error('Необходимо выбрать продукт из базы данных для расчета цены');
        }

        if (!currentConfig) {
          throw new Error('Конфигурация продукта не найдена');
        }

        const resolvedType =
          selectedProduct?.resolvedProductType ??
          resolveProductType(selectedProduct) ??
          specs.productType;

        // Преобразуем format в trim_size для унификации
        let trimSize: { width: number; height: number } | undefined;
        
        if (isCustomFormat && customFormat.width && customFormat.height) {
          // Используем кастомный формат
          const width = parseFloat(customFormat.width);
          const height = parseFloat(customFormat.height);
          if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
            trimSize = { width, height };
            logger.info('📐 Используем кастомный формат', { trimSize });
          }
        } else if (specs.format) {
          // Парсим format строку в trim_size
          // Для визиток формат в UI может быть A4/A5 (как формат листа), но trim_size должен быть размером изделия.
          // Поэтому для business_cards парсим только если формат выглядит как "90×50"/"90x50" или custom.
          const looksLikeNumericSize = /(\d+)\s*[×x]\s*(\d+)/.test(specs.format);
          const parsed =
            resolvedType === 'business_cards' && !looksLikeNumericSize
              ? null
              : parseFormatToTrimSize(specs.format);
          if (parsed) {
            trimSize = parsed;
          } else {
            logger.info('⚠️ Не удалось распарсить format', { format: specs.format });
          }
        } else {
          logger.info('ℹ️ format не указан, бэкенд должен взять размер из шаблона продукта', { productId: selectedProduct.id });
        }

        // ✅ Параметры печати обязательны только для продуктов с печатью. Продукты без печати считаем без них.
        const requiresPrint = productRequiresPrint(backendProductSchema, effectiveSizes);
        if (requiresPrint && (!printTechnology || !printColorMode)) {
          const missingParams = [];
          if (!printTechnology) missingParams.push('технология печати');
          if (!printColorMode) missingParams.push('режим цвета (чб/цвет)');
          
          if (!showToast) {
            return;
          }
          
          throw new Error(
            `❌ Не указаны параметры печати: ${missingParams.join(', ')}. ` +
            `Пожалуйста, выберите технологию печати и режим цвета в разделе "Печать" перед расчетом.`
          );
        }

        // 🆕 Нормализуем выбранные операции в формат finishing для SimplifiedPricingService
        // selectedOperations (фронтенд) -> finishing (бэкенд, simplified-конфиг)
        type FinishingCalcEntry = {
          service_id: number;
          price_unit: 'per_sheet' | 'per_cut' | 'per_item' | 'fixed' | 'per_order';
          units_per_item: number;
          variant_id?: number;
        };
        let finishingConfig: FinishingCalcEntry[] | undefined;

        if (Array.isArray(specs.selectedOperations) && specs.selectedOperations.length > 0) {
          const backendOps: any[] = Array.isArray(backendProductSchema?.operations)
            ? backendProductSchema.operations
            : [];

          const mappedFinishing = specs.selectedOperations
            .map((sel: any): FinishingCalcEntry | null => {
              const op = backendOps.find((o) => {
                const opId = Number(o.operation_id ?? o.id ?? (o as any).service_id);
                const selId = Number(sel.operationId);
                return Number.isFinite(opId) && Number.isFinite(selId) && opId === selId;
              });

              const serviceId: number | undefined = op
                ? (op.operation_id ?? op.id ?? (op as any).service_id)
                : Number(sel.operationId);
              if (!serviceId || !Number.isFinite(serviceId)) {
                logger.info('⚠️ Невалидный service_id для selectedOperation', { sel });
                return null;
              }

              const KNOWN_UNITS = ['per_sheet', 'per_cut', 'per_item', 'fixed', 'per_order'] as const;
              type KnownPu = (typeof KNOWN_UNITS)[number];
              let priceUnit: KnownPu = 'per_item';
              if (op) {
                const fromApi = String(op.price_unit ?? op.priceUnit ?? '')
                  .trim()
                  .toLowerCase();
                if ((KNOWN_UNITS as readonly string[]).includes(fromApi)) {
                  priceUnit = fromApi as KnownPu;
                } else {
                  const opType: string | undefined =
                    op.operation_type ??
                    op.type ??
                    op.service_type ??
                    (op.parameters && typeof op.parameters === 'object' ? op.parameters.operation_type : undefined);
                  priceUnit =
                    opType === 'cut' || opType === 'score' || opType === 'fold' ? 'per_cut' : 'per_item';
                }
              }

              const unitsPerItem = Number(sel.quantity) > 0 ? Number(sel.quantity) : 1;

              const entry = {
                service_id: Number(serviceId),
                price_unit: priceUnit,
                units_per_item: unitsPerItem,
                ...(sel.variantId != null ? { variant_id: Number(sel.variantId) } : {}),
              };
              if (!op) {
                logger.info('🧩 finishing из selectedOperation без совпадения в schema (simplified)', { selectedOperation: sel, entry });
              }
              return entry;
            });
          finishingConfig = mappedFinishing.filter((f): f is FinishingCalcEntry => f != null);

          logger.info('🧮 Нормализованные finishing из selectedOperations', {
            selectedOperationsCount: specs.selectedOperations.length,
            finishingCount: finishingConfig.length,
            finishing: finishingConfig,
            backendOpsCount: backendOps.length,
            backendOps: backendOps.map((o: any) => ({
              operation_id: o.operation_id,
              id: o.id,
              name: o.operation_name || o.name,
            })),
          });
        } else {
          logger.info('⚠️ selectedOperations пуст или не массив', {
            selectedOperations: specs.selectedOperations,
            isArray: Array.isArray(specs.selectedOperations),
            length: Array.isArray(specs.selectedOperations) ? specs.selectedOperations.length : 0,
          });
        }

        // Если есть выбранные операции (например ламинация), но finishingConfig пуст — собираем минимальный finishing,
        // чтобы бэкенд всегда учитывал стоимость операций
        if (
          (!finishingConfig || finishingConfig.length === 0) &&
          Array.isArray(specs.selectedOperations) &&
          specs.selectedOperations.length > 0
        ) {
          const fallbackMapped = specs.selectedOperations
            .map((sel: any): FinishingCalcEntry | null => {
              const sid = Number(sel.operationId);
              if (!Number.isFinite(sid)) return null;
              return {
                service_id: sid,
                price_unit: 'per_item',
                units_per_item: Number(sel.quantity) > 0 ? Number(sel.quantity) : 1,
                ...(sel.variantId != null ? { variant_id: Number(sel.variantId) } : {}),
              };
            });
          finishingConfig = fallbackMapped.filter((f): f is FinishingCalcEntry => f != null);
          if (finishingConfig && finishingConfig.length > 0) {
            logger.info('🧩 finishing собран из selectedOperations (fallback)', { count: finishingConfig.length });
          }
        }

        const configuration = {
          ...specs,
          productType: resolvedType,
          format: specs.format, // ✅ Явно передаем формат
          ...(specs.typeId != null ? { type_id: specs.typeId } : {}), // ✅ Явно type_id для продуктов с подтипами (открытки и т.д.)
          urgency: specs.priceType,
          paperDensity: specs.paperDensity,
          customerType: specs.customerType,
          // ✅ ВАЖНО: Всегда передаем trim_size, если он вычислен
          // Бэкенд должен использовать trim_size вместо размера из шаблона, если он указан
          ...(trimSize ? { trim_size: trimSize } : {}),
          // ✅ Добавляем параметры печати (обязательные для операций печати)
          print_technology: printTechnology,
          printTechnology,
          print_color_mode: printColorMode,
          printColorMode,
          // 🆕 Для упрощённых продуктов передаем size_id, material_id и base_material_id
          ...(specs.size_id ? { size_id: specs.size_id } : {}),
          ...(specs.material_id ? { material_id: specs.material_id } : {}),
          ...(specs.base_material_id ? { base_material_id: specs.base_material_id } : {}),
          // 🆕 Резка: явно передаём в заказ для simplified (бэкенд учтёт в цене и вернёт в operations)
          ...(specs.cutting === true || (backendProductSchema?.template?.simplified as any)?.cutting === true
            ? { cutting: true }
            : {}),
          // 🆕 Передаем выбранные операции (для обратной совместимости и отладки)
          ...(specs.selectedOperations && Array.isArray(specs.selectedOperations) && specs.selectedOperations.length > 0
            ? { selectedOperations: specs.selectedOperations }
            : {}),
          // 🆕 Передаем нормализованный список finishing для SimplifiedPricingService
          ...(finishingConfig && finishingConfig.length > 0 ? { finishing: finishingConfig } : {}),
        };

        // ✅ Логируем trim_size для отладки
        if (trimSize) {
          logger.info('📐 trim_size передается в бэкенд', { 
            trim_size: trimSize, 
            format: specs.format,
            note: 'Бэкенд должен использовать этот размер вместо размера из шаблона продукта'
          });
        } else {
          logger.info('⚠️ trim_size не вычислен, бэкенд будет использовать размер из шаблона продукта', {
            format: specs.format,
            isCustomFormat,
            customFormat
          });
        }

        // ✅ Детальное логирование конфигурации для отладки
        logger.info('💰 Вызываем бэкенд для расчета цены', {
          productId: selectedProduct.id,
          configuration: {
            ...configuration,
            // Не логируем весь configuration, чтобы не засорять логи
            trim_size: configuration.trim_size,
            format: specs.format,
            isCustomFormat,
            customFormat,
            print_technology: configuration.print_technology,
            print_color_mode: configuration.print_color_mode,
            sides: configuration.sides,
            // 🆕 Явно логируем finishing для отладки
            finishing: configuration.finishing,
            hasFinishing: !!(configuration.finishing && Array.isArray(configuration.finishing) && configuration.finishing.length > 0),
            selectedOperations: configuration.selectedOperations,
          },
          quantity: specs.quantity,
          trimSize,
          hasTrimSize: !!trimSize,
          printTechnology,
          printColorMode,
          // ✅ Полная конфигурация для отладки (раскомментируйте при необходимости)
          // fullConfiguration: configuration
        });
        
        // ✅ Для продуктов с печатью параметры должны быть переданы; для продуктов без печати — нормально, что их нет
        if (requiresPrint && (!configuration.print_technology || !configuration.print_color_mode)) {
          logger.info('⚠️ Параметры печати не переданы в конфигурацию!', {
            print_technology: configuration.print_technology,
            print_color_mode: configuration.print_color_mode
          });
        } else if (requiresPrint) {
          logger.info('✅ Параметры печати переданы в конфигурацию', {
            print_technology: configuration.print_technology,
            print_color_mode: configuration.print_color_mode
          });
        } else {
          logger.info('ℹ️ Продукт без печати — расчёт без параметров печати', { productId: selectedProduct.id });
        }

        const pricingResult = await calculatePriceViaBackend(
          selectedProduct.id,
          configuration,
          specs.quantity,
        );

        const backendResult: any = pricingResult;
        
        // ✅ СТРОГАЯ ВАЛИДАЦИЯ ответа бэкенда
        if (!backendResult) {
          throw new Error('Бэкенд не вернул результат расчета');
        }
        
        // 🔍 Логируем структуру ответа для отладки
        logger.info('📦 Структура ответа от бэкенда', {
          hasProductSize: !!backendResult.productSize,
          productSize: backendResult.productSize,
          hasLayout: !!backendResult.layout,
          layout: backendResult.layout,
          keys: Object.keys(backendResult),
          finalPrice: backendResult.finalPrice
        });
        
        if (typeof backendResult.finalPrice !== 'number' || backendResult.finalPrice < 0) {
          throw new Error('Некорректная цена от бэкенда. Проверьте настройку операций продукта.');
        }

        if (backendResult.finalPrice === 0) {
          throw new Error('Бэкенд рассчитал нулевую цену. Проверьте настройку материалов и операций продукта.');
        }

        const materials = (backendResult.materials || []) as any[];
        const services = (backendResult.operations || []) as any[];

        /** Для UI/логов: основной лист/материал заказа первым (не расходник отделки), если известен specs.material_id */
        const materialsOrderedForUi =
          specs.material_id != null && materials.length > 1
            ? [...materials].sort((a: any, b: any) => {
                const aMain = sameMaterialId(materialRowId(a), specs.material_id) ? 0 : 1;
                const bMain = sameMaterialId(materialRowId(b), specs.material_id) ? 0 : 1;
                return aMain - bMain;
              })
            : materials;

        // 🆕 Логируем операции для отладки finishing
        logger.info('🔧 Операции от бэкенда (включая finishing)', {
          operationsCount: services.length,
          operations: services.map((op: any) => ({
            operationId: op.operationId ?? op.operation_id ?? op.id,
            operationName: op.operationName || op.operation_name || op.name,
            operationType: op.operationType || op.operation_type,
            priceUnit: op.priceUnit ?? op.price_unit,
            unitPrice: op.unitPrice ?? op.unit_price ?? op.price,
            quantity: op.quantity,
            totalCost: op.totalCost ?? op.total,
            allKeys: Object.keys(op),
          })),
          selectedOperationsFromSpecs: specs.selectedOperations,
        });

        // 🆕 Логируем материалы для отладки
        logger.info('📦 Материалы от бэкенда', {
          materialsCount: materials.length,
          materials: materials.map((m: any) => ({
            materialId: m.materialId ?? m.material_id ?? m.id,
            materialName: m.materialName || m.material || m.name,
            density: m.density,
            quantity: m.quantity,
            unitPrice: m.unitPrice ?? m.unit_price ?? m.price,
            totalCost: m.totalCost ?? m.total,
            paper_type_name: m.paper_type_name, // 🆕 Добавляем для отладки
            allKeys: Object.keys(m) // 🆕 Показываем все ключи для отладки
          })),
          hasMaterialId: specs.material_id ? true : false,
          materialId: specs.material_id,
          specsPaperDensity: specs.paperDensity,
          specsSizeId: specs.size_id
        });
        
        // 🆕 Дополнительное логирование для отладки paper_type_name
        console.log('🔍 [useCalculatorPricingActions] Детальный анализ материалов от бэкенда:', 
          materials.map((m: any) => ({
            materialId: m.materialId ?? m.material_id ?? m.id,
            materialName: m.materialName || m.material || m.name,
            paper_type_name: m.paper_type_name,
            hasPaperTypeName: !!m.paper_type_name,
            allKeys: Object.keys(m)
          }))
        );

        // ✅ Проверяем, что бэкенд вернул материалы и операции
        // Для упрощённых продуктов материалы могут быть пустыми, если не выбран материал
        if (materials.length === 0 && !specs.material_id) {
          logger.info('⚠️ Бэкенд не вернул материалы', { 
            productId: selectedProduct.id,
            isSimplified: !!specs.size_id,
            hasMaterialId: !!specs.material_id
          });
          // Для упрощённых продуктов не выбрасываем ошибку, если материал не выбран
          if (!specs.size_id) {
            throw new Error('Для продукта не настроены материалы. Добавьте материалы в админке.');
          }
        }

        // Продукты без печати и без операций могут иметь только стоимость материалов — это допустимо
        if (services.length === 0) {
          logger.info('ℹ️ Бэкенд вернул расчёт без операций (только материалы)', { productId: selectedProduct.id });
        }

        // ✅ Детальное логирование операций для проверки стоимости печати
        logger.info('✅ Цена рассчитана бэкендом', {
          finalPrice: backendResult.finalPrice,
          materialsCount: materials.length,
          servicesCount: services.length,
          operations: services.map((s: any) => ({
            id: s.operationId || s.id,
            name: s.operationName || s.name,
            unitPrice: s.unitPrice || s.price,
            quantity: s.quantity,
            totalCost: s.totalCost || s.total,
            operationType: s.operationType || s.type,
            pricingSource: s.pricingSource,
            pricingKey: s.pricingKey,
            technologyCode: s.technologyCode
          })),
          // 🧾 Детальный список операций для анализа стоимости печати
          operationsFlat: services.map((s: any) => ({
            id: s.operationId || s.id,
            name: s.operationName || s.name,
            unitPrice: s.unitPrice || s.price,
            totalCost: s.totalCost || s.total,
            pricingSource: s.pricingSource,
            pricingKey: s.pricingKey,
            technologyCode: s.technologyCode
          })),

          // 🧾 Консоль лог для быстрого просмотра
          _operationsFlat: services.map((s: any) => ({
            id: s.operationId || s.id,
            name: s.operationName || s.name,
            unitPrice: s.unitPrice || s.price,
            totalCost: s.totalCost || s.total,
            pricingSource: s.pricingSource,
            pricingKey: s.pricingKey,
            technologyCode: s.technologyCode
          })),

          materials: materials.map((m: any) => ({
            id: m.materialId || m.id,
            name: m.materialName || m.name,
            unitPrice: m.unitPrice || m.price,
            quantity: m.quantity,
            totalCost: m.totalCost || m.total
          }))
        });

        // 🧾 Прямой консоль лог для анализа стоимости печати
        const operationsFlat = services.map((s: any) => ({
          id: s.operationId || s.id,
          name: s.operationName || s.name,
          unitPrice: s.unitPrice || s.price,
          totalCost: s.totalCost || s.total,
          pricingSource: s.pricingSource,
          pricingKey: s.pricingKey,
          technologyCode: s.technologyCode
        }));

        // Анализ материалов (?? чтобы 0 не превращался в undefined); порядок как в materialsOrderedForUi
        const materialsFlat = materialsOrderedForUi.map((m: any) => ({
          id: m.materialId ?? m.material_id ?? m.id,
          name: m.materialName || m.name,
          unitPrice: m.unitPrice ?? m.unit_price ?? m.price ?? 0,
          quantity: m.quantity,
          totalCost: m.totalCost ?? m.total ?? 0
        }));

        console.log('🧾 === ПОДРОБНЫЙ АНАЛИЗ МАТЕРИАЛОВ ===');
        materialsFlat.forEach((mat, index) => {
          console.log(`Материал ${index + 1}: ${mat.name}`);
          console.log(`  unitPrice: ${mat.unitPrice} руб`);
          console.log(`  quantity: ${mat.quantity}`);
          console.log(`  totalCost: ${mat.totalCost} руб`);
          console.log('');
        });

        console.log('🧾 === ПОДРОБНЫЙ АНАЛИЗ ОПЕРАЦИЙ ===');
        operationsFlat.forEach((op, index) => {
          console.log(`Операция ${index + 1}: ${op.name}`);
          console.log(`  unitPrice: ${op.unitPrice} руб`);
          console.log(`  totalCost: ${op.totalCost} руб`);
          console.log(`  pricingSource: ${op.pricingSource}`);
          console.log(`  pricingKey: ${op.pricingKey}`);
          console.log(`  technologyCode: ${op.technologyCode}`);
          console.log('');
        });
        console.log('🧾 === КОНЕЦ АНАЛИЗА ===');
        const layoutData = backendResult.layout || {};

        const itemsPerSheetRaw = layoutData.itemsPerSheet ?? layoutData.items_per_sheet;
        const itemsPerSheet = Number.isFinite(Number(itemsPerSheetRaw)) ? Number(itemsPerSheetRaw) : undefined;
        const computedSheets = itemsPerSheet
          ? Math.ceil(specs.quantity / Math.max(itemsPerSheet, 1))
          : undefined;
        const sheetsFromBackend = layoutData.sheetsNeeded ?? layoutData.sheets_needed;
        const sheetsNeeded = computedSheets ?? (Number.isFinite(Number(sheetsFromBackend)) ? Number(sheetsFromBackend) : undefined);

        console.log('📊 Расчет количества листов:');
        console.log(`  itemsPerSheet: ${itemsPerSheet}`);
        console.log(`  specs.quantity: ${specs.quantity}`);
        console.log(`  computedSheets: ${computedSheets} (Math.ceil(${specs.quantity} / ${itemsPerSheet}))`);
        console.log(`  sheetsFromBackend: ${sheetsFromBackend}`);
        console.log(`  sheetsNeeded: ${sheetsNeeded}`);
        console.log('');

        // ⚠️ Формат листа: НЕ показываем формат листа для печати (297×420 - это A3 для печати)
        // Показываем только формат материала со склада, если он доступен
        // Если формат материала недоступен - не показываем "Формат листа" вообще
        let sheetSizeLabel: string | undefined;
        
        // Формат листа: берём строку основного материала заказа, не первую в массиве (там мог быть расходник DTF)
        const materialForSheetFormat =
          (specs.material_id != null
            ? materials.find((m: any) => sameMaterialId(materialRowId(m), specs.material_id))
            : undefined) || (materials[0] as any);
        if (materials.length > 0 && materialForSheetFormat) {
          const material = materialForSheetFormat as any;
          if (material.sheet_width && material.sheet_height) {
            sheetSizeLabel = `${material.sheet_width}×${material.sheet_height} мм`;
            logger.info('✅ Используем формат материала со склада', { sheetSizeLabel });
          } else if (material.width && material.height) {
            sheetSizeLabel = `${material.width}×${material.height} мм`;
            logger.info('✅ Используем формат материала (альтернативные поля)', { sheetSizeLabel });
          }
        }
        
        // ⚠️ НЕ используем формат листа для печати (297×420 - это A3) - это не формат материала!
        // Если нет формата материала со склада - не показываем "Формат листа"

        const wastePercentage = layoutData.wastePercentage ?? layoutData.waste_percentage;
        const fitsOnSheet = layoutData.fitsOnSheet;
        const cutsPerSheet = layoutData.cutsPerSheet ?? layoutData.cuts_per_sheet;
        const layoutSummary =
          itemsPerSheet || sheetsNeeded || sheetSizeLabel || wastePercentage || fitsOnSheet === false || (Number(cutsPerSheet) > 0)
            ? {
                itemsPerSheet,
                sheetsNeeded,
                sheetSize: sheetSizeLabel,
                wastePercentage:
                  wastePercentage != null ? Math.round(Number(wastePercentage) * 100) / 100 : undefined,
                fitsOnSheet: fitsOnSheet === undefined ? undefined : !!fitsOnSheet,
                ...(Number(cutsPerSheet) > 0 ? { cutsPerSheet: Number(cutsPerSheet) } : {}),
              }
            : undefined;

        const specSnapshot = { ...specs };
        
        // ⚠️ ВАЖНО: Для упрощённых продуктов плотность нужно получать из выбранного материала
        // Поле плотности скрыто для упрощённых продуктов, поэтому specs.paperDensity может быть 0 или undefined
        let actualPaperDensity = specSnapshot.paperDensity;
        
        // 🆕 Для упрощённых продуктов: получаем плотность из материала бэкенда, если material_id есть
        // Для упрощённых продуктов поле плотности скрыто, поэтому specs.paperDensity может быть 0 или undefined
        // Нужно использовать плотность из выбранного материала
        if (specs.material_id && specs.size_id) {
          // Для упрощённых продуктов плотность должна быть в материалах из бэкенда
          if (materials.length > 0) {
            const material = materials.find((m: any) => sameMaterialId(materialRowId(m), specs.material_id));
            if (!material) {
              logger.info(
                '⚠️ В ответе бэкенда нет строки материала с выбранным material_id (проверьте тип id: число/строка). Не подставляем materials[0] — это часто расходник отделки (DTF).',
                {
                  specsMaterialId: specs.material_id,
                  backendIds: materials.map((m: any) => materialRowId(m)),
                  firstRowName: materials[0]?.materialName || materials[0]?.name,
                }
              );
            }
            const materialDensity = material?.density;
            if (material && materialDensity) {
              // Для упрощённых продуктов ВСЕГДА используем плотность из материала бэкенда
              // (потому что пользователь не может выбрать плотность вручную - поле скрыто)
              actualPaperDensity = materialDensity;
              logger.info('🆕 Для упрощённого продукта используем плотность из материала бэкенда', {
                material_id: specs.material_id,
                materialName: material.materialName || material.material || material.name,
                density: actualPaperDensity,
                originalSpecsDensity: specSnapshot.paperDensity,
                note: 'Поле плотности скрыто для упрощённых продуктов, поэтому используем плотность из материала'
              });
            } else if (material) {
              logger.info('⚠️ Для упрощённого продукта не найдена плотность в материале бэкенда', {
                material_id: specs.material_id,
                material: material.materialName || material.material || material.name,
                materialKeys: Object.keys(material)
              });
            }
          } else {
            logger.info('⚠️ Для упрощённого продукта нет материалов в результате бэкенда', {
              material_id: specs.material_id,
              size_id: specs.size_id
            });
          }
        } else if (materials.length > 0 && actualPaperDensity) {
          // Для обычных продуктов: строка материала — по выбранному material_id или первая
          const material = (specs.material_id != null
            ? materials.find((m: any) => sameMaterialId(materialRowId(m), specs.material_id))
            : undefined) || materials[0];
          const backendDensity = material?.density;
          
          if (backendDensity && backendDensity !== actualPaperDensity) {
            // Плотность из бэкенда не совпадает с выбранной - используем выбранную пользователем
            logger.info('⚠️ Плотность из материала бэкенда не совпадает с выбранной пользователем, используем выбранную', { 
              materialId: materialRowId(material),
              backendDensity,
              userSelectedDensity: actualPaperDensity,
              usingUserSelected: true,
              specsMaterialId: specs.material_id,
              specsPaperDensity: specSnapshot.paperDensity
            });
            // ⚠️ ВАЖНО: НЕ перезаписываем actualPaperDensity - используем выбранную пользователем
          } else if (backendDensity && backendDensity === actualPaperDensity) {
            // Плотности совпадают - всё хорошо
            logger.info('✅ Плотность из материала бэкенда совпадает с выбранной', { 
              materialId: materialRowId(material),
              density: actualPaperDensity
            });
          }
        } else if (!actualPaperDensity && materials.length > 0) {
          // Если пользователь не выбрал плотность, но бэкенд вернул - используем её
          const material = (specs.material_id != null
            ? materials.find((m: any) => sameMaterialId(materialRowId(m), specs.material_id))
            : undefined) || materials[0];
          const backendDensity = material?.density;
          if (backendDensity) {
            actualPaperDensity = backendDensity;
            logger.info('ℹ️ Используем плотность из материала бэкенда (пользователь не выбрал)', { 
              materialId: materialRowId(material),
              density: actualPaperDensity
            });
          }
        }
        
        // Обновляем плотность в snapshot (используем выбранную пользователем или из бэкенда, если не выбрана)
        specSnapshot.paperDensity = actualPaperDensity;
        
        // ⚠️ ВАЖНО: Используем реальный размер из результата бэкенда, а не из specs.format
        // Бэкенд может использовать размер из шаблона продукта, который отличается от выбранного формата
        let formatInfo: string;
        let formatForSummary: string;
        
        logger.info('📐 Определение формата для отображения', {
          hasProductSize: !!backendResult.productSize,
          productSize: backendResult.productSize,
          isCustomFormat,
          customFormat,
          specsFormat: specSnapshot.format
        });
        
        if (isCustomFormat && customFormat.width && customFormat.height) {
          formatInfo = `${customFormat.width}×${customFormat.height} мм`;
          formatForSummary = formatInfo;
          logger.info('✅ Используем кастомный формат', { formatInfo });
        } else if (backendResult.productSize && backendResult.productSize.width && backendResult.productSize.height) {
          // Используем размер из результата бэкенда (может быть из шаблона)
          const { width, height } = backendResult.productSize;
          formatInfo = `${width}×${height} мм`;
          formatForSummary = formatInfo;
          logger.info('✅ Используем размер из результата бэкенда (из шаблона)', { 
            formatInfo, 
            productSize: backendResult.productSize 
          });
        } else {
          // Fallback на формат из specs
          formatInfo = specSnapshot.format;
          formatForSummary = specSnapshot.format;
          logger.info('⚠️ Используем формат из specs (fallback)', { formatInfo });
        }

        // Создаем модифицированный snapshot с правильным форматом для summary
        const specSnapshotForSummary = {
          ...specSnapshot,
          format: formatForSummary, // Заменяем формат на реальный размер (50×90 мм вместо A4)
        };

        logger.info('📋 Формируем parameterSummary', {
          formatForSummary,
          formatInfo,
          specSnapshotFormat: specSnapshot.format,
          specSnapshotForSummaryFormat: specSnapshotForSummary.format,
          hasProductSize: !!backendResult.productSize,
          productSize: backendResult.productSize
        });

        const parameterSummary = buildParameterSummary(specSnapshotForSummary, backendProductSchema, {
          isCustomFormat: !!(backendResult.productSize && backendResult.productSize.width && backendResult.productSize.height) || isCustomFormat, // Если есть productSize - считаем кастомным
          customFormat: (backendResult.productSize && backendResult.productSize.width && backendResult.productSize.height)
            ? { width: String(backendResult.productSize.width), height: String(backendResult.productSize.height) }
            : customFormat,
          warehousePaperTypes,
          productTypeLabels,
        });
        
        logger.info('📋 parameterSummary сформирован', {
          formatInSummary: parameterSummary.find(p => p.key === 'format'),
          densityInSummary: parameterSummary.find(p => p.key === 'paperDensity'),
          allSummary: parameterSummary.map(p => `${p.label}: ${p.value}`),
          specSnapshotPaperDensity: specSnapshot.paperDensity,
          actualPaperDensity: actualPaperDensity
        });

        // 🆕 Нормализуем материалы, добавляя material_id из specs для упрощённых продуктов
        const normalizedMaterials = materials.map((m: any) => {
          const rawId = m.materialId ?? m.material_id ?? m.id;
          const hasOwnId =
            rawId != null &&
            rawId !== '' &&
            Number.isFinite(Number(rawId));
          // Не подставляем specs.material_id в строку без id — иначе расходник отделки получит id основной бумаги
          const finalMaterialId = hasOwnId
            ? Number(rawId)
            : specs.material_id != null
              ? specs.material_id
              : undefined;

          const normalized = {
            materialId: finalMaterialId,
            material: m.materialName || m.material || m.name,
            quantity: Number(m.quantity) || 0,
            unit: m.unit || m.unitName || 'шт',
            unitPrice: m.unitPrice ?? m.unit_price ?? m.price ?? 0,
            price: m.unitPrice ?? m.unit_price ?? m.price ?? 0,
            total: m.totalCost ?? m.total ?? 0,
            paper_type_name: m.paper_type_name,
            isConsumableOnly: m.isConsumableOnly === true,
          };
          
          // 🆕 Логирование для отладки
          if (specs.material_id != null && sameMaterialId(finalMaterialId, specs.material_id)) {
            console.log('🔍 [useCalculatorPricingActions] Нормализация материала для упрощённого продукта', {
              originalMaterial: m,
              normalized,
              hasPaperTypeName: !!m.paper_type_name,
              paper_type_name: m.paper_type_name
            });
          }
          
          return normalized;
        });

        if (specs.material_id != null && specs.size_id && normalizedMaterials.length > 1) {
          const target = Number(specs.material_id);
          if (Number.isFinite(target)) {
            normalizedMaterials.sort((a, b) => {
              const ma = Number(a.materialId);
              const mb = Number(b.materialId);
              const aMain = Number.isFinite(ma) && ma === target ? 0 : 1;
              const bMain = Number.isFinite(mb) && mb === target ? 0 : 1;
              return aMain - bMain;
            });
          }
        }
        
        // 🆕 Для упрощённых продуктов, если материалов нет в результате, но material_id есть в specs - добавляем
        if (normalizedMaterials.length === 0 && specs.material_id && specs.size_id) {
          logger.info('🆕 Добавляем материал из specs для упрощённого продукта', {
            material_id: specs.material_id,
            size_id: specs.size_id
          });
          // Добавляем пустой материал с material_id, чтобы он попал в components
          normalizedMaterials.push({
            materialId: specs.material_id,
            material: 'Материал',
            quantity: specs.quantity || 0,
            unit: 'шт',
            unitPrice: 0,
            price: 0,
            total: 0,
            paper_type_name: undefined, // Будет установлено из результата расчёта или из API
            isConsumableOnly: false,
          });
        }
        
        logger.info('📦 Нормализованные материалы', {
          materialsCount: normalizedMaterials.length,
          materials: normalizedMaterials.map(m => ({
            materialId: m.materialId,
            material: m.material,
            quantity: m.quantity
          }))
        });

        // Все операции из ответа расчёта — с полными полями для сохранения в заказ (params.services)
        const normalizedServices = services.map((s: any) => ({
          operationId: s.operationId ?? s.operation_id ?? s.id,
          operationName: s.operationName ?? s.operation_name ?? s.name,
          operationType: s.operationType ?? s.operation_type,
          priceUnit: s.priceUnit ?? s.price_unit ?? s.unit,
          service: s.operationName ?? s.operation_name ?? s.name,
          quantity: s.quantity,
          unit: s.priceUnit ?? s.price_unit ?? s.unit,
          price: s.unitPrice ?? s.unit_price ?? s.price,
          unitPrice: s.unitPrice ?? s.unit_price ?? s.price,
          total: s.totalCost ?? s.total,
          totalCost: s.totalCost ?? s.total,
          pricingSource: s.pricingSource ?? s.pricing_source,
          pricingKey: s.pricingKey ?? s.pricing_key,
          technologyCode: s.technologyCode ?? s.technology_code,
        }));

        // 🆕 Синхронизируем quantity операций per_sheet (ламинация и т.д.) с бэкендом
        // Бэкенд считает по листам печати, фронт должен показывать это значение
        if (setSpecsFromParent && Array.isArray(specs.selectedOperations) && specs.selectedOperations.length > 0 && services.length > 0) {
          const backendByOpId = new Map(
            services.map((s: any) => [(s.operationId ?? s.operation_id ?? s.id) as number, s])
          );
          let hasChanges = false;
          const updatedOps = specs.selectedOperations.map((sel: any) => {
            const backendOp = backendByOpId.get(sel.operationId);
            if (!backendOp || backendOp.quantity == null || !Number.isFinite(Number(backendOp.quantity))) return sel;
            const priceUnit = String(backendOp.priceUnit ?? backendOp.price_unit ?? '').toLowerCase();
            const opType = String(backendOp.operationType ?? backendOp.operation_type ?? '').toLowerCase();
            const opName = String(backendOp.operationName ?? backendOp.operation_name ?? backendOp.service ?? '').toLowerCase();
            const isLaminate = opType === 'laminate' || opName.includes('ламин') || opName.includes('lamination');
            // per_sheet: всегда берём quantity с бэкенда (листы печати)
            // laminate: ламинация обычно per_sheet — берём quantity с бэкенда (кол-во листов)
            const isPerSheet = priceUnit === 'per_sheet' || isLaminate;
            if (isPerSheet) {
              const backendQty = Number(backendOp.quantity);
              if (sel.quantity !== backendQty) {
                hasChanges = true;
                return { ...sel, quantity: backendQty };
              }
            }
            return sel;
          });
          if (hasChanges) {
            setSpecsFromParent((prev) => ({ ...prev, selectedOperations: updatedOps }));
            logger.info('🔄 Синхронизированы quantity операций per_sheet с бэкендом', {
              updated: updatedOps.filter((o: any, i: number) => (specs.selectedOperations?.[i]?.quantity ?? null) !== (o.quantity ?? null)),
            });
          }
        }

        // ✅ Используем ТОЛЬКО цену от бэкенда - скидки должны применяться на бэкенде
        const finalTotalCost = backendResult.finalPrice as number;
        const finalPricePerItem = backendResult.pricePerUnit as number;


        const calculationResult: CalculationResult = {
          productName: `${selectedProduct.name} ${formatInfo || specSnapshot.format} (${specSnapshot.paperType} ${specSnapshot.paperDensity}г/м², ${
            specSnapshot.sides === 2 ? 'двусторонние' : 'односторонние'
          })`,
          specifications: specSnapshot,
          materials: normalizedMaterials,
          services: normalizedServices,
          totalCost: finalTotalCost,
          pricePerItem: finalPricePerItem,
          productionTime: getProductionTime(),
          layout: layoutSummary,
          parameterSummary,
          formatInfo,
          warnings: Array.isArray(backendResult.warnings) ? backendResult.warnings : undefined,
          tier_prices: Array.isArray(backendResult.tier_prices) ? backendResult.tier_prices : undefined,
        };

        setResult(calculationResult);
        logger.info('Расчет выполнен успешно', { totalCost: backendResult.finalPrice });

        if (showToast) {
          toast.success('Расчет выполнен успешно!');
        }
      } catch (err: any) {
        // Извлекаем сообщение об ошибке из ответа бэкенда
        let errorMessage = 'Неизвестная ошибка расчета';
        
        if (err?.response?.data?.error) {
          // Ошибка из бэкенда (500 с error в response.data)
          errorMessage = err.response.data.error;
        } else if (err?.response?.data?.message) {
          // Ошибка из бэкенда (400/500 с message в response.data)
          errorMessage = err.response.data.message;
        } else if (err instanceof Error) {
          // Обычная ошибка JavaScript
          errorMessage = err.message;
        } else if (typeof err === 'string') {
          errorMessage = err;
        }
        
        if (
          typeof errorMessage === 'string' &&
          errorMessage.toLowerCase().includes('selected size not found in simplified config')
        ) {
          const expectedType = specs.typeId ?? specs.type_id ?? null;
          errorMessage =
            'Не удалось подобрать размер для расчёта. Проверьте выбранные тип/формат и размер в шаблоне, затем повторите расчёт.' +
            (expectedType != null ? ` (type_id: ${expectedType})` : '');
        }

        // Детальное логирование ошибки
        const errorDetails = {
          error: errorMessage,
          errorType: err?.constructor?.name,
          responseStatus: err?.response?.status,
          responseData: err?.response?.data,
          requestConfig: err?.config ? {
            url: err.config.url,
            method: err.config.method,
            data: err.config.data
          } : undefined,
          stack: err instanceof Error ? err.stack : undefined,
        };
        
        logger.error('❌ Ошибка расчета', errorDetails);
        
        // Дополнительно выводим в консоль для отладки
        console.error('🔴 Детали ошибки расчета:', {
          message: errorMessage,
          fullError: err,
          response: err?.response,
        });
        
        setError(errorMessage);
        if (showToast) {
          toast.error(`Ошибка расчета: ${errorMessage}`);
        }
      }
    },
    [
      appliedDiscount,
      backendProductSchema,
      buildParameterSummary,
      calculatePriceViaBackend,
      customFormat,
      effectiveSizes,
      getProductionTime,
      isCustomFormat,
      isValid,
      logger,
      printTechnology,
      printColorMode,
      resolveProductType,
      selectedProduct,
      setSpecsFromParent,
      specs,
      toast,
      validationErrors,
    ],
  );

  useEffect(() => {
    if (!userInteracted) return;
    if (!isValid || specs.quantity <= 0) return;
    if (Object.keys(validationErrors).length > 0) return;

    const timeoutId = setTimeout(() => {
      void calculateCost(false);
    }, 120);

    return () => clearTimeout(timeoutId);
  }, [userInteracted, specs, isValid, validationErrors, calculateCost]);

  return {
    result,
    setResult,
    appliedDiscount,
    setAppliedDiscount,
    userInteracted,
    setUserInteracted,
    error,
    calculateCost,
  };
}

