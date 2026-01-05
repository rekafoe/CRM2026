/**
 * ХУК АВТОМАТИЧЕСКОГО ПЕРЕСЧЕТА
 * 
 * Автоматически пересчитывает цену при изменении параметров
 * - Мгновенный расчет для select/radio/tabs
 * - Debounced расчет для input (500мс задержка)
 * - Оптимизирует нагрузку на сервер
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';

// Функция для создания стабильного ключа из specs (только важные поля)
function getSpecsKey(specs: any, customFormat?: { width: string; height: string }, isCustomFormat?: boolean): string {
  return JSON.stringify({
    quantity: specs.quantity,
    paperType: specs.paperType,
    paperDensity: specs.paperDensity,
    format: specs.format, // ✅ Формат включен в ключ
    sides: specs.sides,
    lamination: specs.lamination,
    priceType: specs.priceType,
    pages: specs.pages, // ✅ Страницы тоже важны
    material_id: specs.material_id, // ✅ ID материала тоже важен
    // ✅ Кастомный формат тоже важен для расчета
    customFormat: isCustomFormat ? customFormat : undefined,
    isCustomFormat: isCustomFormat || false,
  });
}

interface UseAutoCalculateParams {
  specs: any;
  selectedProduct: any;
  isValid: boolean;
  enabled?: boolean;
  onCalculate: () => Promise<void>;
  debounceMs?: number;
  customFormat?: { width: string; height: string };
  isCustomFormat?: boolean;
}

export function useAutoCalculate({
  specs,
  selectedProduct,
  isValid,
  enabled = true,
  onCalculate,
  debounceMs = 500,
  customFormat,
  isCustomFormat
}: UseAutoCalculateParams) {
  const isFirstRender = useRef(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const specsRef = useRef(specs);
  const lastSpecsKeyRef = useRef<string>('');
  const isCalculatingRef = useRef(false);
  
  // Обновляем ref при изменении specs
  useEffect(() => {
    specsRef.current = specs;
  }, [specs]);
  
  // Создаем стабильный ключ из specs, включая кастомный формат
  const specsKey = useMemo(() => getSpecsKey(specs, customFormat, isCustomFormat), [specs, customFormat, isCustomFormat]);
  
  // Ref для стабильной ссылки на onCalculate и других зависимостей
  const onCalculateRef = useRef(onCalculate);
  const enabledRef = useRef(enabled);
  const isValidRef = useRef(isValid);
  const selectedProductIdRef = useRef(selectedProduct?.id);
  
  useEffect(() => {
    onCalculateRef.current = onCalculate;
    enabledRef.current = enabled;
    isValidRef.current = isValid;
    selectedProductIdRef.current = selectedProduct?.id;
  }, [onCalculate, enabled, isValid, selectedProduct?.id]);
  
  // Debounced расчет (с задержкой) - используем ref для стабильности
  const debouncedCalculate = useCallback(() => {
    if (!enabledRef.current || !isValidRef.current || !selectedProductIdRef.current) {
      return;
    }
    
    // Не запускаем новый расчет, если уже идет расчет
    if (isCalculatingRef.current) {
      return;
    }
    
    // Отменяем предыдущий таймаут
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    // Устанавливаем новый таймаут
    timeoutRef.current = setTimeout(async () => {
      // Двойная проверка перед запуском
      if (isCalculatingRef.current || !enabledRef.current || !isValidRef.current || !selectedProductIdRef.current) {
        return;
      }
      
      isCalculatingRef.current = true;
      try {
        await onCalculateRef.current();
      } catch (error) {
        console.error('Auto-calculate error:', error);
      } finally {
        isCalculatingRef.current = false;
        timeoutRef.current = null;
      }
    }, debounceMs);
  }, [debounceMs]);
  
  // Мгновенный расчет (без задержки)
  const instantCalculate = useCallback(async () => {
    if (!enabledRef.current || !isValidRef.current || !selectedProductIdRef.current) {
      return;
    }
    
    // Не запускаем новый расчет, если уже идет расчет
    if (isCalculatingRef.current) {
      return;
    }
    
    // Отменяем debounced таймаут если был
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    
    isCalculatingRef.current = true;
    try {
      await onCalculateRef.current();
    } catch (error) {
      console.error('Instant calculate error:', error);
    } finally {
      isCalculatingRef.current = false;
    }
  }, []);
  
  // Автопересчет при изменении specs
  useEffect(() => {
    // Пропускаем первый рендер
    if (isFirstRender.current) {
      isFirstRender.current = false;
      lastSpecsKeyRef.current = specsKey;
      return;
    }
    
    // Проверяем, действительно ли specs изменились
    if (lastSpecsKeyRef.current === specsKey) {
      return; // Не пересчитываем, если ключ не изменился
    }
    
    // Не пересчитываем, если уже идет расчет
    if (isCalculatingRef.current) {
      return;
    }
    
    // Обновляем ключ ПЕРЕД запуском расчета, чтобы избежать повторных вызовов
    lastSpecsKeyRef.current = specsKey;
    
    // Запускаем debounced расчет
    debouncedCalculate();
    
    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specsKey]); // Не включаем debouncedCalculate в зависимости - он стабилен через useCallback
  
  // Cleanup при размонтировании
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
  
  return {
    instantCalculate, // Для select/radio/tabs - расчет сразу
    debouncedCalculate // Для input - расчет через debounceMs
  };
}

