import { useCallback, useEffect, useState } from 'react';
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
function productRequiresPrint(schema: any): boolean {
  if (!schema) return false;
  const constraints = schema.constraints;
  if (constraints?.allowed_print_technologies && Array.isArray(constraints.allowed_print_technologies) && constraints.allowed_print_technologies.length > 0) {
    return true;
  }
  const template = schema.template;
  if (template?.simplified?.sizes && Array.isArray(template.simplified.sizes)) {
    const hasPrintPrices = template.simplified.sizes.some((size: any) =>
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
        const backendResult = await unifiedCalculatePrice({
          product_id: productId,
          quantity,
          params: configuration,
          channel: 'online',
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
            logger.info('📐 Парсим format в trim_size', { format: specs.format, trimSize: parsed });
          } else {
            logger.info('⚠️ Не удалось распарсить format', { format: specs.format });
          }
        } else {
          logger.info('ℹ️ format не указан, бэкенд должен взять размер из шаблона продукта', { productId: selectedProduct.id });
        }

        // ✅ Параметры печати обязательны только для продуктов с печатью. Продукты без печати считаем без них.
        const requiresPrint = productRequiresPrint(backendProductSchema);
        if (requiresPrint && (!printTechnology || !printColorMode)) {
          const missingParams = [];
          if (!printTechnology) missingParams.push('технология печати');
          if (!printColorMode) missingParams.push('режим цвета (чб/цвет)');
          
          if (!showToast) {
            logger.info('⏭️ Пропускаем автопересчет: параметры печати не выбраны', {
              missingParams,
              printTechnology,
              printColorMode
            });
            return;
          }
          
          throw new Error(
            `❌ Не указаны параметры печати: ${missingParams.join(', ')}. ` +
            `Пожалуйста, выберите технологию печати и режим цвета в разделе "Печать" перед расчетом.`
          );
        }

        // 🆕 Нормализуем выбранные операции в формат finishing для SimplifiedPricingService
        // selectedOperations (фронтенд) -> finishing (бэкенд, simplified-конфиг)
        let finishingConfig: Array<{
          service_id: number;
          price_unit: 'per_cut' | 'per_item';
          units_per_item: number;
        }> | undefined;

        if (Array.isArray(specs.selectedOperations) && specs.selectedOperations.length > 0) {
          const backendOps: any[] = Array.isArray(backendProductSchema?.operations)
            ? backendProductSchema.operations
            : [];

          finishingConfig = specs.selectedOperations
            .map((sel: any) => {
              const op = backendOps.find((o) => {
                const opId = o.operation_id ?? o.id;
                return opId === sel.operationId;
              });

              if (!op) {
                logger.info('⚠️ Не найдена операция в schema для selectedOperation', { selectedOperation: sel });
                return null;
              }

              const serviceId: number | undefined = op.operation_id ?? op.id;
              if (!serviceId || !Number.isFinite(serviceId)) {
                logger.info('⚠️ Невалидный service_id для операции', { op });
                return null;
              }

              const opType: string | undefined =
                op.operation_type ??
                op.type ??
                op.service_type ??
                (op.parameters && typeof op.parameters === 'object' ? op.parameters.operation_type : undefined);

              // Для операций типа рез/биг/фальц считаем цену за "рез" (per_cut), иначе за изделие (per_item)
              const priceUnit: 'per_cut' | 'per_item' =
                opType === 'cut' || opType === 'score' || opType === 'fold' ? 'per_cut' : 'per_item';

              // ✅ Количество из UI:
              // - Для per_cut: количество резов/бигов/фальцев на одно изделие (умножается на тираж на бэкенде)
              // - Для per_item: общее количество единиц услуги на весь заказ (НЕ умножается на тираж)
              const unitsPerItem = Number(sel.quantity) > 0 ? Number(sel.quantity) : 1;

              return {
                service_id: Number(serviceId),
                price_unit: priceUnit,
                units_per_item: unitsPerItem,
                // 🆕 Передаём variantId для услуг с вариантами (например, ламинация)
                ...(sel.variantId ? { variant_id: Number(sel.variantId) } : {}),
              };
            })
            .filter((f): f is { service_id: number; price_unit: 'per_cut' | 'per_item'; units_per_item: number } => !!f);

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

        const configuration = {
          ...specs,
          productType: resolvedType,
          format: specs.format, // ✅ Явно передаем формат
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
          // 🆕 Для упрощённых продуктов передаем size_id и material_id
          ...(specs.size_id ? { size_id: specs.size_id } : {}),
          ...(specs.material_id ? { material_id: specs.material_id } : {}),
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

        if (services.length === 0) {
          logger.info('⚠️ Бэкенд не вернул операции', { productId: selectedProduct.id });
          throw new Error('Для продукта не настроены операции. Добавьте операции в админке.');
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

        // Анализ материалов
        const materialsFlat = materials.map((m: any) => ({
          id: m.materialId || m.id,
          name: m.materialName || m.name,
          unitPrice: m.unitPrice || m.price,
          quantity: m.quantity,
          totalCost: m.totalCost || m.total
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
        
        // Пробуем получить формат материала из первого материала
        if (materials.length > 0) {
          const material = materials[0] as any;
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
        const layoutSummary =
          itemsPerSheet || sheetsNeeded || sheetSizeLabel || wastePercentage || fitsOnSheet === false
            ? {
                itemsPerSheet,
                sheetsNeeded,
                sheetSize: sheetSizeLabel,
                wastePercentage:
                  wastePercentage != null ? Math.round(Number(wastePercentage) * 100) / 100 : undefined,
                fitsOnSheet: fitsOnSheet === undefined ? undefined : !!fitsOnSheet,
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
            const material = materials.find((m: any) => 
              (m.materialId ?? m.material_id ?? m.id) === specs.material_id
            ) || materials[0];
            const materialDensity = material.density;
            if (materialDensity) {
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
            } else {
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
          // Для обычных продуктов проверяем, что плотность из материала бэкенда совпадает с выбранной пользователем
          const material = materials[0] as any;
          const backendDensity = material.density;
          
          if (backendDensity && backendDensity !== actualPaperDensity) {
            // Плотность из бэкенда не совпадает с выбранной - используем выбранную пользователем
            logger.info('⚠️ Плотность из материала бэкенда не совпадает с выбранной пользователем, используем выбранную', { 
              materialId: material.materialId ?? material.material_id ?? material.id,
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
              materialId: material.materialId ?? material.material_id ?? material.id,
              density: actualPaperDensity
            });
          }
        } else if (!actualPaperDensity && materials.length > 0) {
          // Если пользователь не выбрал плотность, но бэкенд вернул - используем её
          const material = materials[0] as any;
          const backendDensity = material.density;
          if (backendDensity) {
            actualPaperDensity = backendDensity;
            logger.info('ℹ️ Используем плотность из материала бэкенда (пользователь не выбрал)', { 
              materialId: material.materialId ?? material.material_id ?? material.id,
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
          const materialId = m.materialId ?? m.material_id ?? m.id;
          // Для упрощённых продуктов, если material_id не в результате, используем из specs
          const finalMaterialId = materialId || (specs.material_id ? specs.material_id : undefined);
          
          const normalized = {
            materialId: finalMaterialId,
            material: m.materialName || m.material || m.name,
            quantity: Number(m.quantity) || 0,
            unit: m.unit || m.unitName || 'шт',
            unitPrice: m.unitPrice ?? m.unit_price ?? m.price ?? 0,
            price: m.unitPrice ?? m.unit_price ?? m.price ?? 0,
            total: m.totalCost ?? m.total ?? 0,
            // 🆕 Добавляем paper_type_name для установки materialType на фронтенде
            paper_type_name: m.paper_type_name,
          };
          
          // 🆕 Логирование для отладки
          if (specs.material_id && finalMaterialId === specs.material_id) {
            console.log('🔍 [useCalculatorPricingActions] Нормализация материала для упрощённого продукта', {
              originalMaterial: m,
              normalized,
              hasPaperTypeName: !!m.paper_type_name,
              paper_type_name: m.paper_type_name
            });
          }
          
          return normalized;
        });
        
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

        const normalizedServices = services.map((s: any) => ({
          operationId: s.operationId ?? s.operation_id ?? s.id,
          service: s.operationName || s.name,
          quantity: s.quantity,
          unit: s.priceUnit || s.unit,
          price: s.unitPrice || s.price,
          total: s.totalCost || s.total,
        }));

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
      getProductionTime,
      isCustomFormat,
      isValid,
      logger,
      printTechnology,
      printColorMode,
      resolveProductType,
      selectedProduct,
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
    }, 1000);

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

