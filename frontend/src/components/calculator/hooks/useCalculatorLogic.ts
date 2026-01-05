import { useCallback, useMemo } from 'react';
import { calcUniversalPrice } from '../../../api';
import { useLogger } from '../../../utils/logger';
import { useToastNotifications } from '../../Toast';
import { ProductSpecs, CalculationResult } from '../types/calculator.types';

/**
 * Хук для бизнес-логики калькулятора
 */
export const useCalculatorLogic = () => {
  const logger = useLogger('useCalculatorLogic');
  const toast = useToastNotifications();

  // Расчет стоимости печати
  const calculatePrintingPrice = useCallback(async (specs: ProductSpecs): Promise<CalculationResult | null> => {
    try {
      logger.info('🧮 Начинаем расчет стоимости', { specs });
      
      const response = await calcUniversalPrice({
        productType: specs.productType,
        specifications: {
          format: specs.format,
          sides: specs.sides,
          paperType: specs.paperType,
          paperDensity: specs.paperDensity,
          lamination: specs.lamination,
          pages: specs.pages,
          magnetic: specs.magnetic
        },
        qty: specs.quantity,
        priceType: specs.priceType === 'standard' ? 'online' : 
                   specs.priceType === 'urgent' ? 'rush' : 
                   specs.priceType === 'superUrgent' ? 'rush' : 
                   specs.priceType === 'express' ? 'rush' : 
                   specs.priceType as 'online' | 'promo',
        customerType: specs.customerType
      });

      // ⚠️ DEPRECATED: Этот код НЕ должен использоваться!
      // В новом калькуляторе (ImprovedPrintingCalculatorModal) используется useCalculatorPricingActions
      
      const result: CalculationResult = {
        productName: response.data.productName || specs.productType,
        specifications: specs,
        pricePerItem: response.data.pricePerItem || response.data.unitPrice || 0,
        totalCost: response.data.totalPrice || response.data.totalCost || 0,
        materials: (response.data.materials || []).map((m: any) => ({
          material: typeof m.material === 'string' ? m.material : m.material?.name || 'Неизвестно',
          quantity: m.quantity || 0,
          unit: m.unit || 'шт',
          price: m.cost || m.price || m.unitPrice || 0,
          // ❌ НЕПРАВИЛЬНО: считаем total на фронте! Должно быть m.total от бэкенда!
          total: m.total || ((m.cost || m.price || m.unitPrice || 0) * (m.quantity || 0))
        })),
        services: response.data.services || [],
        productionTime: response.data.productionTime || response.data.estimatedTime || '1 день',
        deliveryDate: response.data.deliveryDate || new Date().toISOString()
      };

      logger.info('✅ Расчет завершен', { 
        productName: result.productName,
        pricePerItem: result.pricePerItem,
        totalCost: result.totalCost
      });

      return result;
    } catch (error) {
      logger.error('❌ Ошибка расчета стоимости', error);
      toast.error('Ошибка расчета стоимости', error instanceof Error ? error.message : 'Неизвестная ошибка');
      return null;
    }
  }, [logger, toast]);

  // Получение дней производства
  const getProductionDays = useCallback((specs: ProductSpecs): number => {
    const baseDays = {
      'Визитки': 1,
      'Листовки': 1,
      'Буклеты': 2,
      'Баннеры': 3,
      'Наклейки': 2,
      'Брошюры': 3
    };

    let days = baseDays[specs.productType as keyof typeof baseDays] || 1;

    // Увеличиваем время для срочных заказов
    if (specs.priceType === 'urgent') {
      days = Math.max(1, Math.ceil(days * 0.5));
    } else if (specs.priceType === 'superUrgent') {
      days = 1;
    } else if (specs.priceType === 'express') {
      days = Math.max(1, Math.ceil(days * 0.3));
    }

    // Увеличиваем время для больших тиражей
    if (specs.quantity > 1000) {
      days += 1;
    }
    if (specs.quantity > 5000) {
      days += 1;
    }

    // Увеличиваем время для ламинации
    if (specs.lamination !== 'none') {
      days += 1;
    }

    return days;
  }, []);

  // Расчет скидки
  const calculateDiscount = useCallback((specs: ProductSpecs, basePrice: number): number => {
    let discount = 0;

    // Скидка для VIP клиентов
    if (specs.customerType === 'vip') {
      discount += 0.1; // 10%
    }

    // Скидка за объем
    if (specs.quantity >= 1000) {
      discount += 0.05; // 5%
    }
    if (specs.quantity >= 5000) {
      discount += 0.05; // еще 5%
    }

    // Скидка за онлайн заказ
    if (specs.priceType === 'online') {
      discount += 0.05; // 5%
    }

    return Math.min(discount, 0.25); // Максимальная скидка 25%
  }, []);

  // Применение скидки к цене
  const applyDiscount = useCallback((price: number, discount: number): number => {
    return price * (1 - discount);
  }, []);

  // Форматирование цены
  const formatPrice = useCallback((price: number): string => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'BYN',
      minimumFractionDigits: 2
    }).format(price);
  }, []);

  // Форматирование даты доставки
  const formatDeliveryDate = useCallback((days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toLocaleDateString('ru-RU');
  }, []);

  // Получение иконки продукта
  const getProductIcon = useCallback((productType: string): string => {
    const icons: Record<string, string> = {
      'Визитки': '💳',
      'Листовки': '📄',
      'Буклеты': '📖',
      'Баннеры': '🏷️',
      'Наклейки': '🏷️',
      'Брошюры': '📚'
    };
    return icons[productType] || '📄';
  }, []);

  // Получение цвета статуса
  const getStatusColor = useCallback((priceType: string): string => {
    const colors: Record<string, string> = {
      'standard': '#1976d2',
      'urgent': '#ff9800',
      'superUrgent': '#f44336',
      'online': '#4caf50',
      'promo': '#9c27b0',
      'express': '#ff5722'
    };
    return colors[priceType] || '#1976d2';
  }, []);

  // Получение названия статуса
  const getStatusName = useCallback((priceType: string): string => {
    const names: Record<string, string> = {
      'standard': 'Стандарт',
      'urgent': 'Срочно',
      'superUrgent': 'Супер срочно',
      'online': 'Онлайн',
      'promo': 'Промо',
      'express': 'Экспресс'
    };
    return names[priceType] || 'Стандарт';
  }, []);

  // Проверка возможности расчета
  const canCalculate = useCallback((specs: ProductSpecs): boolean => {
    return !!(
      specs.productType &&
      specs.format &&
      specs.quantity > 0 &&
      specs.paperType &&
      specs.paperDensity > 0 &&
      specs.lamination &&
      specs.priceType &&
      specs.customerType
    );
  }, []);

  // Получение формата по умолчанию
  const getDefaultFormat = useCallback((productType: string, productConfigs?: Record<string, any>): string => {
    // Получаем первый доступный формат из конфигурации продукта
    if (productConfigs && productConfigs[productType]?.formats?.length > 0) {
      return productConfigs[productType].formats[0];
    }
    
    // Fallback - возвращаем пустую строку, чтобы пользователь выбрал
    return '';
  }, []);

  // Получение плотности бумаги по умолчанию
  const getDefaultPaperDensity = useCallback((paperType: string, warehousePaperTypes?: any[]): number => {
    // Получаем первую доступную плотность из складских данных
    if (warehousePaperTypes) {
      const paperTypeData = warehousePaperTypes.find(pt => pt.name === paperType);
      if (paperTypeData?.densities?.length > 0) {
        return paperTypeData.densities[0].value;
      }
    }
    
    // Fallback - возвращаем 0, чтобы пользователь выбрал
    return 0;
  }, []);

  return {
    calculatePrintingPrice,
    calculateCost: calculatePrintingPrice, // Алиас для совместимости
    getProductionDays,
    calculateDiscount,
    applyDiscount,
    formatPrice,
    formatDeliveryDate,
    getProductIcon,
    getStatusColor,
    getStatusName,
    getDefaultFormat,
    getDefaultPaperDensity,
    canCalculate
  };
};