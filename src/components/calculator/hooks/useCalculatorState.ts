import { useState, useCallback } from 'react';
import { ProductSpecs, CalculationResult } from '../types/calculator.types';

interface CustomFormat {
  width: string;
  height: string;
}

interface FormatValidation {
  isValid: boolean;
  message: string;
}

interface ComparisonItem {
  specs: ProductSpecs;
  result: CalculationResult;
  id: string;
}

interface MaterialAvailability {
  available: boolean;
  quantity: number;
  alternatives: any[];
}

/**
 * Хук для управления состояниями калькулятора
 */
export const useCalculatorState = (initialProductType?: string) => {
  // Основные состояния
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isCalculating, setIsCalculating] = useState(false);
  const [savedPresets, setSavedPresets] = useState<ProductSpecs[]>(() => {
    try {
      const stored = localStorage.getItem('printing-calculator-presets');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [isValid, setIsValid] = useState(false);
  const [productConfigs, setProductConfigs] = useState<Record<string, any>>({});
  
  // Состояния для кастомного формата
  const [customFormat, setCustomFormat] = useState<CustomFormat>({ width: '', height: '' });
  const [isCustomFormat, setIsCustomFormat] = useState(false);
  const [formatValidation, setFormatValidation] = useState<FormatValidation>({ isValid: true, message: '' });
  
  // Основные спецификации продукта
  const [specs, setSpecs] = useState<ProductSpecs>({
    productType: initialProductType || '',
    format: '',
    quantity: 1,
    sides: 1,
    paperType: '' as any,
    paperDensity: 0,
    lamination: 'none',
    priceType: 'standard',
    customerType: 'regular'
  });
  
  // Результаты расчетов
  const [result, setResult] = useState<CalculationResult | null>(null);
  const [calculationHistory, setCalculationHistory] = useState<CalculationResult[]>([]);
  const [userInteracted, setUserInteracted] = useState(false);
  
  // Состояния UI
  const [showPresets, setShowPresets] = useState(false);
  const [showProductSelection, setShowProductSelection] = useState(false);
  const [showQuickTemplates, setShowQuickTemplates] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [showAIDashboard, setShowAIDashboard] = useState(false);
  const [showDynamicPricingManager, setShowDynamicPricingManager] = useState(false);
  
  // Состояния для сравнения
  const [comparisonItems, setComparisonItems] = useState<ComparisonItem[]>([]);
  
  // Состояния для интеграции со складом
  const [warehousePaperTypes, setWarehousePaperTypes] = useState<any[]>([]);
  const [dynamicDensities, setDynamicDensities] = useState<Array<{
    value: number;
    label: string;
    price: number;
    material_id: number;
    available_quantity: number;
  }>>([]);
  const [warehouseProductConfigs, setWarehouseProductConfigs] = useState<Record<string, any>>({});
  const [materialAlternatives, setMaterialAlternatives] = useState<any[]>([]);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<string>('');
  const [materialAvailability, setMaterialAvailability] = useState<MaterialAvailability>({
    available: true,
    quantity: 0,
    alternatives: []
  });
  const [loadingPaperTypes, setLoadingPaperTypes] = useState(false);

  // Функции для обновления состояний
  const updateSpecs = useCallback((updates: Partial<ProductSpecs>) => {
    setSpecs(prev => ({ ...prev, ...updates }));
    setUserInteracted(true);
  }, []);

  const updateCustomFormat = useCallback((updates: Partial<CustomFormat>) => {
    setCustomFormat(prev => ({ ...prev, ...updates }));
  }, []);

  const updateFormatValidation = useCallback((validation: FormatValidation) => {
    setFormatValidation(validation);
  }, []);

  const addToComparison = useCallback((item: ComparisonItem) => {
    setComparisonItems(prev => [...prev, item]);
  }, []);

  const removeFromComparison = useCallback((id: string) => {
    setComparisonItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const clearComparison = useCallback(() => {
    setComparisonItems([]);
  }, []);

  const addToHistory = useCallback((calculation: CalculationResult) => {
    setCalculationHistory(prev => [calculation, ...prev.slice(0, 9)]); // Храним последние 10 расчетов
  }, []);

  const clearHistory = useCallback(() => {
    setCalculationHistory([]);
  }, []);

  const resetCalculator = useCallback(() => {
    setSpecs({
      productType: initialProductType || '',
      format: '',
      quantity: 1,
      sides: 1,
      paperType: 'semi-matte' as any,
      paperDensity: 0,
      lamination: 'none',
      priceType: 'standard',
      customerType: 'regular'
    });
    setResult(null);
    setError(null);
    setValidationErrors({});
    setIsValid(false);
    setUserInteracted(false);
    setCustomFormat({ width: '', height: '' });
    setIsCustomFormat(false);
    setFormatValidation({ isValid: true, message: '' });
  }, [initialProductType]);

  return {
    // Состояния
    error,
    validationErrors,
    isCalculating,
    savedPresets,
    isValid,
    productConfigs,
    customFormat,
    isCustomFormat,
    formatValidation,
    specs,
    result,
    calculationHistory,
    userInteracted,
    showPresets,
    showProductSelection,
    showQuickTemplates,
    showComparison,
    showAIDashboard,
    showDynamicPricingManager,
    comparisonItems,
    warehousePaperTypes,
    dynamicDensities,
    warehouseProductConfigs,
    materialAlternatives,
    lastPriceUpdate,
    materialAvailability,
    loadingPaperTypes,

    // Сеттеры
    setError,
    setValidationErrors,
    setIsCalculating,
    setSavedPresets,
    setIsValid,
    setProductConfigs,
    setCustomFormat,
    setIsCustomFormat,
    setFormatValidation,
    setSpecs,
    setResult,
    setCalculationHistory,
    setUserInteracted,
    setShowPresets,
    setShowProductSelection,
    setShowQuickTemplates,
    setShowComparison,
    setShowAIDashboard,
    setShowDynamicPricingManager,
    setComparisonItems,
    setWarehousePaperTypes,
    setDynamicDensities,
    setWarehouseProductConfigs,
    setMaterialAlternatives,
    setLastPriceUpdate,
    setMaterialAvailability,
    setLoadingPaperTypes,

    // Функции
    updateSpecs,
    updateCustomFormat,
    updateFormatValidation,
    updateValidationErrors: setValidationErrors,
    clearError: () => setError(null),
    setCalculationResult: setResult,
    addToCalculationHistory: addToHistory,
    addToComparison,
    removeFromComparison,
    clearComparison,
    addToHistory,
    clearHistory,
    resetCalculator,
    
    // Методы для работы с пресетами
    loadPreset: (preset: ProductSpecs) => {
      updateSpecs(preset);
    },
    savePreset: (preset: ProductSpecs) => {
      const newPreset = { ...preset, name: (preset as any).name || `${preset.productType} ${preset.format}` };
      setSavedPresets(prev => [...prev, newPreset]);
      localStorage.setItem('printing-calculator-presets', JSON.stringify([...savedPresets, newPreset]));
    },
    
    // Методы для работы с быстрыми шаблонами
    applyTemplate: (templateSpecs: any) => {
      updateSpecs(templateSpecs);
    }
  };
};