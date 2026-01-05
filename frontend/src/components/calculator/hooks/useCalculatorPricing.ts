// ⚠️ DEPRECATED: Этот хук НЕ используется в новом калькуляторе (ImprovedPrintingCalculatorModal)
// Используется только useCalculatorPricingActions
// TODO: Удалить этот файл после проверки, что он нигде не импортируется

import { useCallback, useMemo, useState } from 'react';
import { calculateMaterialCost } from '../../../services/calculatorMaterialService';
import { calculatePrice } from '../../../services/pricing';
import { parseFormatToTrimSize } from '../../../utils/formatUtils';

export interface ProductSpecs {
  productType: string;
  format: string;
  quantity: number;
  sides: 1 | 2;
  paperType: string;
  paperDensity: number;
  lamination: string;
  priceType: string;
  customerType: string;
  pages?: number;
  magnetic?: boolean;
  cutting?: boolean;
}

export interface CalculationResult {
  productName: string;
  specifications: ProductSpecs;
  materials: Array<{ material: string; quantity: number; unit: string; price: number; total: number }>;
  services: Array<{ service: string; price: number; total: number }>;
  totalCost: number;
  pricePerItem: number;
  productionTime: string;
}

interface UseCalculatorPricingParams {
  specs: ProductSpecs;
  backendProductSchema: any | null;
  currentConfig: any;
  getProductionTime: () => string;
  log: { info: Function; error: Function };
  toast: { success: Function; error: Function };
}

export function useCalculatorPricing({ specs, backendProductSchema, currentConfig, getProductionTime, log, toast }: UseCalculatorPricingParams) {
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [calculationHistory, setCalculationHistory] = useState<CalculationResult[]>([]);

  const loadCalculationHistory = useCallback(() => {
    try {
      const saved = localStorage.getItem('printing-calculator-history');
      if (saved) setCalculationHistory(JSON.parse(saved));
    } catch {}
  }, []);

  const saveCalculationHistory = useCallback((calculation: CalculationResult) => {
    try {
      const newHistory = [calculation, ...calculationHistory.slice(0, 9)];
      setCalculationHistory(newHistory);
      localStorage.setItem('printing-calculator-history', JSON.stringify(newHistory));
    } catch {}
  }, [calculationHistory]);

  const calculateCost = useCallback(async () => {
    setIsCalculating(true);
    try {
      if (!currentConfig) throw new Error('Конфигурация продукта не найдена');

      // Преобразуем format в trim_size для унификации
      let trimSize: { width: number; height: number } | undefined;
      if (specs.format) {
        const parsed = parseFormatToTrimSize(specs.format);
        if (parsed) {
          trimSize = parsed;
        }
      }

      const adapted = {
        product_id: Number(currentConfig?.id || 0),
        quantity: specs.quantity,
        channel: (specs.priceType as any) || 'online',
        params: {
          productType: specs.productType,
          format: specs.format, // Оставляем для обратной совместимости
          quantity: specs.quantity,
          paperType: specs.paperType,
          paperDensity: specs.paperDensity,
          lamination: specs.lamination,
          sides: specs.sides,
          customerType: specs.customerType,
          // Добавляем trim_size для унификации с бэкендом
          ...(trimSize ? { trim_size: trimSize } : {}),
        }
      } as any

      const data: any = await calculatePrice(adapted);
      if (!data) throw new Error('Пустой ответ расчета');

      const backendMaterials = (data.breakdown?.materials || []) as Array<{ name: string; unit: string; quantity: number; rate: number; total: number }>;
      const backendServices = (data.breakdown?.services || []) as Array<{ name: string; unit: string; quantity: number; rate: number; total: number }>;

      const materials = backendMaterials.map(m => ({ material: m.name, quantity: m.quantity, unit: m.unit || 'шт', price: m.rate, total: m.total }));
      const services = backendServices.map(s => ({ service: s.name, price: s.rate, total: s.total }));

      // ❌ УБРАН ФОЛЛБЭК: Если бэкенд не вернул материалы - это ОШИБКА настройки продукта
      if (materials.length === 0) {
        throw new Error('Бэкенд не вернул материалы. Проверьте настройку продукта в админке: убедитесь, что добавлены материалы и операции.');
      }

      // ✅ Используем ТОЛЬКО цену от бэкенда, без корректировок на фронтенде
      const backendTotal = (data.breakdown?.total ?? data.final ?? 0) as number;
      
      if (backendTotal <= 0) {
        throw new Error('Бэкенд вернул некорректную цену (0 или отрицательную). Проверьте настройку операций продукта.');
      }

      const adjustedTotal = backendTotal;

      // ✅ Проверяем, что бэкенд вернул цену за единицу
      if (typeof data.finalPrice !== 'number') {
        throw new Error('Бэкенд не вернул цену за единицу (finalPrice)');
      }

      const calculation: CalculationResult = {
        productName: `${(backendProductSchema?.type || currentConfig?.name || 'Товар из калькулятора')} ${specs.format} (${specs.paperType} ${specs.paperDensity}г/м², ${specs.sides === 2 ? 'двусторонние' : 'односторонние'})`,
        specifications: { ...specs },
        materials,
        services,
        totalCost: adjustedTotal,
        pricePerItem: data.finalPrice, // ✅ ТОЛЬКО от бэкенда, без фоллбэков
        productionTime: getProductionTime()
      };
      setResult(calculation);
      saveCalculationHistory(calculation);
      log.info('Расчет выполнен успешно', { totalCost: calculation.totalCost });
      return calculation;
    } catch (error) {
      log.error('Ошибка расчета', error);
      toast.error('Ошибка при расчете стоимости');
      return null;
    } finally {
      setIsCalculating(false);
    }
  }, [specs, currentConfig, backendProductSchema, getProductionTime, log, toast, saveCalculationHistory]);

  return {
    isCalculating,
    result,
    setResult,
    calculateCost,
    calculationHistory,
    loadCalculationHistory,
    
  } as const;
}


