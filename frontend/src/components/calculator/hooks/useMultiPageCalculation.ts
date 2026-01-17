import { useState, useCallback, useEffect, useMemo } from 'react';
import { apiClient } from '../../../api/client';

export interface BindingType {
  value: string;
  label: string;
  maxPages?: number;
  minPages?: number;
  duplexDefault: boolean;
  description?: string;
}

export interface MultiPageParams {
  pages: number;
  quantity: number;
  format: string;
  printType: string;
  bindingType: string;
  paperType: string;
  paperDensity: number;
  duplex: boolean;
  lamination: string;
  trimMargins: boolean;
}

export interface MultiPageResult {
  totalCost: number;
  pricePerItem: number;
  breakdown: {
    printCost: number;
    bindingCost: number;
    paperCost: number;
    laminationCost: number;
    trimCost: number;
    setupCost: number;
  };
  sheets: number;
  warnings: string[];
}

export interface MultiPageSchema {
  key: string;
  type: string;
  description: string;
  fields: Array<{
    name: string;
    type: string;
    label: string;
    enum?: Array<string | number | { value: string; label: string }>;
    default?: any;
    required?: boolean;
    min?: number;
    max?: number;
    tooltip?: string;
    dependsOn?: Record<string, any>;
  }>;
  bindingRules: Record<string, {
    maxPages?: number;
    minPages?: number;
    duplexDefault: boolean;
    description?: string;
  }>;
}

const DEFAULT_PARAMS: MultiPageParams = {
  pages: 20,
  quantity: 1,
  format: 'A4',
  printType: 'laser_bw',
  bindingType: 'none',
  paperType: 'office_premium',
  paperDensity: 80,
  duplex: false,
  lamination: 'none',
  trimMargins: false,
};

export function useMultiPageCalculation() {
  const [params, setParams] = useState<MultiPageParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<MultiPageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schema, setSchema] = useState<MultiPageSchema | null>(null);
  const [bindingTypes, setBindingTypes] = useState<BindingType[]>([]);

  // Загрузить схему при монтировании
  useEffect(() => {
    const loadSchema = async () => {
      try {
        const response = await apiClient.get('/pricing/multipage/schema');
        setSchema(response.data.schema);
        setBindingTypes(response.data.bindingTypes || []);
      } catch (err) {
        console.error('Failed to load multipage schema:', err);
      }
    };
    loadSchema();
  }, []);

  // Автообновление duplex при смене типа переплёта
  useEffect(() => {
    const bindingType = bindingTypes.find(b => b.value === params.bindingType);
    if (bindingType?.duplexDefault !== undefined) {
      setParams(prev => ({
        ...prev,
        duplex: bindingType.duplexDefault
      }));
    }
  }, [params.bindingType, bindingTypes]);

  // Валидация страниц по типу переплёта
  const validation = useMemo(() => {
    const binding = bindingTypes.find(b => b.value === params.bindingType);
    const warnings: string[] = [];
    
    if (binding) {
      if (binding.minPages && params.pages < binding.minPages) {
        warnings.push(`Минимум ${binding.minPages} страниц для "${binding.label}"`);
      }
      if (binding.maxPages && params.pages > binding.maxPages) {
        warnings.push(`Максимум ${binding.maxPages} страниц для "${binding.label}"`);
      }
    }

    if (params.pages < 4) {
      warnings.push('Минимум 4 страницы');
    }

    return { isValid: warnings.length === 0, warnings };
  }, [params.pages, params.bindingType, bindingTypes]);

  // Рассчитать стоимость
  const calculate = useCallback(async () => {
    if (!validation.isValid) {
      setError(validation.warnings.join('. '));
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/pricing/multipage/calculate', params);
      setResult(response.data);
      return response.data;
    } catch (err: any) {
      const message = err.response?.data?.error || 'Ошибка расчёта';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [params, validation]);

  // Обновить параметр
  const updateParam = useCallback(<K extends keyof MultiPageParams>(
    key: K,
    value: MultiPageParams[K]
  ) => {
    setParams(prev => ({ ...prev, [key]: value }));
  }, []);

  // Сбросить к дефолтным
  const reset = useCallback(() => {
    setParams(DEFAULT_PARAMS);
    setResult(null);
    setError(null);
  }, []);

  // Получить options для select полей
  const getSelectOptions = useCallback((fieldName: string) => {
    if (!schema) return [];
    const field = schema.fields.find(f => f.name === fieldName);
    if (!field?.enum) return [];
    
    return field.enum.map(opt => {
      if (typeof opt === 'object' && opt !== null) {
        return { value: opt.value, label: opt.label };
      }
      return { value: String(opt), label: String(opt) };
    });
  }, [schema]);

  return {
    params,
    result,
    loading,
    error,
    schema,
    bindingTypes,
    validation,
    calculate,
    updateParam,
    setParams,
    reset,
    getSelectOptions,
  };
}
