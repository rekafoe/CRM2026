import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface ProductSpecs {
  productType: string;
  format: string;
  quantity: number;
  sides: 1 | 2;
  paperType: string;
  paperDensity: number;
  lamination: 'none' | 'matte' | 'glossy';
  priceType: 'standard' | 'urgent' | 'superUrgent' | 'online' | 'promo' | 'express';
  customerType: 'regular' | 'vip';
  pages?: number;
  magnetic?: boolean;
  cutting?: boolean;
  folding?: boolean;
  roundCorners?: boolean;
  urgency?: 'standard' | 'urgent' | 'superUrgent';
  vipLevel?: 'bronze' | 'silver' | 'gold' | 'platinum';
  specialServices?: string[];
  materialType?: 'office' | 'coated' | 'designer' | 'selfAdhesive';
}

interface CalculationResult {
  productName: string;
  specifications: ProductSpecs;
  materials: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  totalCost: number;
  pricePerItem: number;
  productionTime: string;
}

interface CalculatorState {
  // Состояние калькулятора
  specs: ProductSpecs;
  result: CalculationResult | null;
  isCalculating: boolean;
  error: string | null;
  validationErrors: Record<string, string>;
  
  // История расчетов
  calculationHistory: CalculationResult[];
  savedPresets: ProductSpecs[];
  
  // UI состояние
  showPresets: boolean;
  showProductSelection: boolean;
  
  // Действия
  updateSpecs: (updates: Partial<ProductSpecs>) => void;
  setResult: (result: CalculationResult | null) => void;
  setCalculating: (calculating: boolean) => void;
  setError: (error: string | null) => void;
  setValidationErrors: (errors: Record<string, string>) => void;
  
  // История и пресеты
  addToHistory: (result: CalculationResult) => void;
  clearHistory: () => void;
  savePreset: (preset: ProductSpecs) => void;
  loadPreset: (preset: ProductSpecs) => void;
  deletePreset: (index: number) => void;
  
  // UI действия
  setShowPresets: (show: boolean) => void;
  setShowProductSelection: (show: boolean) => void;
  
  // Вычисляемые значения
  isValid: boolean;
  getPresetByName: (name: string) => ProductSpecs | undefined;
}

const defaultSpecs: ProductSpecs = {
  productType: 'flyers',
  format: 'A6',
  quantity: 100,
  sides: 1,
  paperType: 'semi-matte',
  paperDensity: 120,
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
};

export const useCalculatorStore = create<CalculatorState>()(
  devtools(
    (set, get) => ({
      // Начальное состояние
      specs: defaultSpecs,
      result: null,
      isCalculating: false,
      error: null,
      validationErrors: {},
      calculationHistory: [],
      savedPresets: [],
      showPresets: false,
      showProductSelection: false,
      
      // Основные действия
      updateSpecs: (updates) => set((state) => ({
        specs: { ...state.specs, ...updates },
        error: null,
        validationErrors: {}
      })),
      
      setResult: (result) => set({ result, error: null }),
      
      setCalculating: (calculating) => set({ isCalculating: calculating }),
      
      setError: (error) => set({ error }),
      
      setValidationErrors: (errors) => set({ validationErrors: errors }),
      
      // История и пресеты
      addToHistory: (result) => set((state) => ({
        calculationHistory: [result, ...state.calculationHistory.slice(0, 49)] // Ограничиваем до 50 записей
      })),
      
      clearHistory: () => set({ calculationHistory: [] }),
      
      savePreset: (preset) => set((state) => ({
        savedPresets: [...state.savedPresets, preset]
      })),
      
      loadPreset: (preset) => set({ specs: preset }),
      
      deletePreset: (index) => set((state) => ({
        savedPresets: state.savedPresets.filter((_, i) => i !== index)
      })),
      
      // UI действия
      setShowPresets: (show) => set({ showPresets: show }),
      
      setShowProductSelection: (show) => set({ showProductSelection: show }),
      
      // Вычисляемые значения
      get isValid() {
        const { specs, validationErrors } = get();
        return Object.keys(validationErrors).length === 0 && 
               specs.quantity > 0 && 
               specs.format.length > 0;
      },
      
      getPresetByName: (name) => {
        const { savedPresets } = get();
        return savedPresets.find(preset => 
          `${preset.productType} ${preset.format}` === name
        );
      }
    }),
    {
      name: 'calculator-store',
    }
  )
);
