/**
 * УЛУЧШЕННЫЙ СЕРВИС ДЛЯ РАБОТЫ С МАТЕРИАЛАМИ В КАЛЬКУЛЯТОРЕ
 * 
 * Полная интеграция со складским сервисом:
 * - Единый источник данных (только склад)
 * - Проверка доступности в реальном времени
 * - Автоматическое обновление цен
 * - Умные рекомендации материалов
 */

import { api } from '../api/client';
import { Material } from '../types/shared';
import { logger } from '../utils/logger';

export interface CalculatorMaterial extends Material {
  // Дополнительные поля для калькулятора
  available_for_calculator: boolean;
  estimated_cost_per_sheet?: number;
  recommended_for_products?: string[]; // ['flyers', 'business_cards']
  category_name?: string;
}

export interface PaperTypeForCalculator {
  id: string;
  name: string;
  display_name: string;
  densities: Array<{
    value: number;
    label: string;
    price: number;
    material_id: number;
    available_quantity: number;
    last_updated: string;
    is_available: boolean;
  }>;
  default_density: number;
  price_multiplier: number;
  description?: string;
  category_name?: string;
  category_color?: string;
}

// 🆕 Интерфейс для конфигурации продуктов из склада
export interface ProductConfigFromWarehouse {
  id: string;
  name: string;
  display_name: string;
  formats: string[];
  recommended_paper_types: string[];
  recommended_densities: number[];
  laminations: string[];
  sides: number[];
  pages?: number[];
  special_options?: {
    magnetic?: boolean;
    cutting?: boolean;
    folding?: boolean;
    round_corners?: boolean;
  };
  description?: string;
  is_active: boolean;
}

// 🆕 Интерфейс для умных рекомендаций
export interface MaterialRecommendation {
  material_id: number;
  paper_type: string;
  density: number;
  reason: 'best_price' | 'best_quality' | 'available_now' | 'similar_product';
  confidence: number; // 0-1
  alternative_materials: Array<{
    material_id: number;
    paper_type: string;
    density: number;
    price_difference: number;
  }>;
}

/**
 * Получить плотности для конкретного типа бумаги
 */
export async function getPaperDensitiesForType(paperType: string): Promise<Array<{value: number, label: string, price: number, material_id: number, available_quantity: number}>> {
  try {
    const paperTypes = await getPaperTypesFromWarehouse();
    const type = paperTypes.find(pt => pt.name === paperType);
    const densities = type?.densities || [];
    return densities;
  } catch (error) {
    logger.error('calculatorMaterialService', 'Ошибка получения плотностей для типа бумаги', error);
    return [];
  }
}

/**
 * Получить все типы бумаги из складского сервиса
 */
// Кэш для предотвращения повторных запросов
let paperTypesCache: PaperTypeForCalculator[] | null = null;
let cacheTimestamp: number = 0;
let lastCacheHitLogTs: number = 0; // throttle cache-hit logs
const CACHE_DURATION = 30000; // 30 секунд

// Кэш для материалов
let materialsCache: any[] | null = null;
let materialsCacheTimestamp: number = 0;

export async function getPaperTypesFromWarehouse(): Promise<PaperTypeForCalculator[]> {
  try {
    // Проверяем кэш
    const now = Date.now();
    if (paperTypesCache && (now - cacheTimestamp) < CACHE_DURATION) {
      if (now - lastCacheHitLogTs > 10000) { // логируем не чаще, чем раз в 10 секунд
        logger.debug('calculatorMaterialService', 'Используем кэшированные типы бумаги', { count: paperTypesCache.length });
        lastCacheHitLogTs = now;
      }
      return paperTypesCache;
    }

    // Получаем типы бумаги из API (теперь с материалами)
    const paperTypesResponse = await api.get('/paper-types');
    const paperTypes = paperTypesResponse.data as any[];

    logger.info('calculatorMaterialService', 'Получены типы бумаги с материалами', { count: paperTypes.length });

    // Преобразуем данные для калькулятора
    const result: PaperTypeForCalculator[] = paperTypes.map((paperType: any) => {
      // Используем материалы, связанные с типом бумаги
      const densities = paperType.materials?.map((material: any) => ({
        value: material.density || 0,
        label: `${material.density || 0} г/м²`,
        price: material.sheet_price_single || material.price || 0,
        material_id: material.id,
        available_quantity: material.quantity || 0,
        last_updated: material.updated_at || new Date().toISOString(),
        is_available: (material.quantity || 0) > 0
      })) || [];

      // Если нет связанных материалов, используем старые цены для обратной совместимости
      if (densities.length === 0 && paperType.prices) {
        const fallbackDensities = Object.entries(paperType.prices).map(([density, price]) => ({
          value: parseInt(density),
          label: `${density} г/м²`,
          price: price as number,
          material_id: 0, // Нет связанного материала
          available_quantity: 0,
          last_updated: new Date().toISOString(),
          is_available: false
        }));
        densities.push(...fallbackDensities);
      }

      const sortedDensities = densities.sort((a: any, b: any) => a.value - b.value);

      return {
        id: paperType.name,
        name: paperType.name,
        display_name: paperType.display_name,
        densities: sortedDensities,
        default_density: sortedDensities[0]?.value || 130,
        price_multiplier: paperType.price_multiplier || 1.0,
        description: paperType.description
      };
    });

    // Сохраняем в кэш
    paperTypesCache = result;
    cacheTimestamp = now;

    return result;
  } catch (error) {
    logger.error('calculatorMaterialService', 'Ошибка загрузки типов бумаги из склада', error);
    return [];
  }
}

/**
 * Получить материалы для калькулятора (с фильтрацией)
 */
export async function getMaterialsForCalculator(): Promise<CalculatorMaterial[]> {
  try {
    const response = await api.get('/materials');
    const materials: Material[] = response.data as Material[];

    // Фильтруем только те материалы, которые нужны для калькулятора
    // (бумага, краски, пленки для ламинации)
    const calculatorMaterials = materials
      .filter(m => {
        const name = m.name.toLowerCase();
        return (
          name.includes('бумага') ||
          name.includes('paper') ||
          name.includes('пленка') ||
          name.includes('film') ||
          name.includes('краска') ||
          name.includes('ink')
        );
      })
      .map(m => ({
        ...m,
        available_for_calculator: (m.quantity || 0) > 0,
        estimated_cost_per_sheet: m.price || m.sheet_price_single || 0
      }));

    return calculatorMaterials;
  } catch (error) {
    logger.error('calculatorMaterialService', 'Ошибка загрузки материалов для калькулятора', error);
    return [];
  }
}

// Полный список материалов со склада (без фильтрации)
export async function getAllWarehouseMaterials(): Promise<Material[]> {
  try {
    const response = await api.get('/materials');
    return response.data as Material[];
  } catch (error) {
    logger.error('calculatorMaterialService', 'Ошибка загрузки всех материалов склада', error);
    return [];
  }
}

/**
 * Проверить доступность материалов для заказа
 */
export async function checkMaterialAvailability(
  paperType: string,
  paperDensity: number,
  quantity: number
): Promise<{
  available: boolean;
  available_quantity: number;
  material_id: number | null;
  message?: string;
}> {
  try {
    // Получаем типы бумаги
    const paperTypes = await getPaperTypesFromWarehouse();
    const selectedPaperType = paperTypes.find(pt => pt.id === paperType);

    if (!selectedPaperType) {
      return {
        available: false,
        available_quantity: 0,
        material_id: null,
        message: 'Тип бумаги не найден'
      };
    }

    // Находим нужную плотность
    const selectedDensity = selectedPaperType.densities.find(d => d.value === paperDensity);

    if (!selectedDensity) {
      return {
        available: false,
        available_quantity: 0,
        material_id: null,
        message: 'Плотность не найдена'
      };
    }

    // Проверяем доступное количество через API материалов (с кэшированием)
    let materials = materialsCache;
    const now = Date.now();
    
    if (!materials || (now - materialsCacheTimestamp) > CACHE_DURATION) {
      const materialsResponse = await api.get('/materials');
      materials = materialsResponse.data as any[];
      materialsCache = materials;
      materialsCacheTimestamp = now;
    }
    
    const material = materials.find(m => m.id === selectedDensity.material_id);
    const availableQuantity = material?.available_quantity || 0;

    // Рассчитываем нужное количество листов (примерная формула)
    const sheetsNeeded = Math.ceil(quantity / 2); // Примерно 2 изделия на лист

    return {
      available: availableQuantity >= sheetsNeeded,
      available_quantity: availableQuantity,
      material_id: selectedDensity.material_id,
      message: availableQuantity >= sheetsNeeded 
        ? 'Материал доступен'
        : `Недостаточно материала. Доступно: ${availableQuantity} листов, требуется: ${sheetsNeeded}`
    };
  } catch (error) {
    logger.error('calculatorMaterialService', 'Ошибка проверки доступности материалов', error);
    return {
      available: false,
      available_quantity: 0,
      material_id: null,
      message: 'Ошибка проверки доступности'
    };
  }
}

/**
 * ⚠️ ТОЛЬКО ДЛЯ ПРЕДПРОСМОТРА В UI!
 * Рассчитывает ПРИМЕРНУЮ стоимость материалов для отображения в интерфейсе выбора
 * 
 * НЕ ИСПОЛЬЗУЕТСЯ для финального расчета цены!
 * Финальный расчет происходит ТОЛЬКО на бэкенде через FlexiblePricingService
 */
export async function calculateMaterialCost(
  paperType: string,
  paperDensity: number,
  quantity: number,
  sides: 1 | 2 = 1
): Promise<{
  material_cost: number;
  sheets_needed: number;
  price_per_sheet: number;
  material_id: number | null;
}> {
  try {
    const paperTypes = await getPaperTypesFromWarehouse();
    const selectedPaperType = paperTypes.find(pt => pt.id === paperType);

    if (!selectedPaperType) {
      return {
        material_cost: 0,
        sheets_needed: 0,
        price_per_sheet: 0,
        material_id: null
      };
    }

    const selectedDensity = selectedPaperType.densities.find(d => d.value === paperDensity);

    if (!selectedDensity) {
      return {
        material_cost: 0,
        sheets_needed: 0,
        price_per_sheet: 0,
        material_id: null
      };
    }

    // Рассчитываем количество листов
    // ⚠️ ПРИМЕРНЫЙ расчет для UI-подсказки, НЕ для финальной цены!
    const sheetsPerItem = 1 / 2; // Примерно 2 изделия на лист SRA3
    const sheetsNeeded = Math.ceil(quantity * sheetsPerItem);
    
    // Учитываем двустороннюю печать
    const sidesMultiplier = sides === 2 ? 1.6 : 1.0;
    
    // Стоимость материалов (ТОЛЬКО ДЛЯ ОТОБРАЖЕНИЯ В UI!)
    const pricePerSheet = selectedDensity.price * selectedPaperType.price_multiplier;
    const materialCost = sheetsNeeded * pricePerSheet * sidesMultiplier;

    return {
      material_cost: materialCost,
      sheets_needed: sheetsNeeded,
      price_per_sheet: pricePerSheet,
      material_id: selectedDensity.material_id
    };
  } catch (error) {
    logger.error('calculatorMaterialService', 'Ошибка расчета стоимости материалов', error);
    return {
      material_cost: 0,
      sheets_needed: 0,
      price_per_sheet: 0,
      material_id: null
    };
  }
}

// 🆕 УЛУЧШЕННЫЕ ФУНКЦИИ ДЛЯ ПОЛНОЙ ИНТЕГРАЦИИ СО СКЛАДОМ

/**
 * Получить конфигурацию продуктов из склада (ПОЛНОСТЬЮ ДИНАМИЧЕСКАЯ)
 */
export async function getProductConfigsFromWarehouse(): Promise<Record<string, ProductConfigFromWarehouse>> {
  try {
    // Получаем типы бумаги из склада
    const paperTypes = await getPaperTypesFromWarehouse();
    
    // Получаем материалы для анализа доступности
    const materials = await getMaterialsForCalculator();
    
    // 🆕 Получаем конфигурацию продуктов из API склада
    const response = await api.get('/product-configs');
    const warehouseProductConfigs = (response.data as any[]) || [];
    
    // Если в складе нет конфигурации продуктов, создаем базовую на основе материалов
    if (warehouseProductConfigs.length === 0) {
      return await createDynamicProductConfigs(paperTypes, materials);
    }
    
    // Преобразуем данные из склада в нужный формат
    const productConfigs: Record<string, ProductConfigFromWarehouse> = {};
    
    for (const config of warehouseProductConfigs) {
      // Получаем доступные типы бумаги для этого продукта
      const availablePaperTypes = paperTypes.filter(pt => 
        config.recommended_paper_types?.includes(pt.name) || 
        pt.densities.some(d => d.is_available)
      ).map(pt => pt.name);
      
      // Получаем доступные плотности
      const availableDensities = paperTypes
        .filter(pt => availablePaperTypes.includes(pt.name))
        .flatMap(pt => pt.densities)
        .filter(d => d.is_available)
        .map(d => d.value)
        .sort((a, b) => a - b);
      
      productConfigs[config.id] = {
        id: config.id,
        name: config.name,
        display_name: config.display_name || config.name,
        formats: config.formats || ['A4'], // Базовый формат если не указан
        recommended_paper_types: availablePaperTypes,
        recommended_densities: availableDensities,
        laminations: config.laminations || ['none', 'matte', 'glossy'],
        sides: config.sides || [1, 2],
        pages: config.pages,
        special_options: config.special_options,
        description: config.description,
        is_active: config.is_active !== false
      };
    }
    
    return productConfigs;
  } catch (error) {
    logger.error('calculatorMaterialService', 'Ошибка загрузки конфигурации продуктов из склада', error);
    // Fallback: создаем базовую конфигурацию
    const paperTypes = await getPaperTypesFromWarehouse();
    const materials = await getMaterialsForCalculator();
    return await createDynamicProductConfigs(paperTypes, materials);
  }
}

/**
 * Создать динамическую конфигурацию продуктов на основе доступных материалов
 */
async function createDynamicProductConfigs(
  paperTypes: PaperTypeForCalculator[], 
  materials: CalculatorMaterial[]
): Promise<Record<string, ProductConfigFromWarehouse>> {
  
  // Получаем все доступные плотности
  const allDensities = paperTypes
    .flatMap(pt => pt.densities)
    .filter(d => d.is_available)
    .map(d => d.value)
    .sort((a, b) => a - b);
  
  // Получаем все доступные типы бумаги
  const allPaperTypes = paperTypes
    .filter(pt => pt.densities.some(d => d.is_available))
    .map(pt => pt.name);
  
  // Создаем базовые продукты на основе категорий материалов
  const productConfigs: Record<string, ProductConfigFromWarehouse> = {};
  
  // Анализируем материалы и создаем продукты
  const materialCategories = new Set<string>((materials as any[]).map(m => m.category_name).filter(Boolean) as string[]);
  
  for (const category of materialCategories) {
    const categoryMaterials = materials.filter(m => m.category_name === category);
    
    if (categoryMaterials.length > 0) {
      const productId = category.toLowerCase().replace(/\s+/g, '_');
      const productName = category;
      
      productConfigs[productId] = {
        id: productId,
        name: productName,
        display_name: productName,
        formats: ['A4', 'A5', 'A6'], // Базовые форматы
        recommended_paper_types: allPaperTypes,
        recommended_densities: allDensities,
        laminations: ['none', 'matte', 'glossy'],
        sides: [1, 2],
        description: `Продукт на основе категории: ${category}`,
        is_active: true
      };
    }
  }
  
  // Если нет категорий, создаем универсальный продукт
  if (Object.keys(productConfigs).length === 0) {
    productConfigs['universal'] = {
      id: 'universal',
      name: 'Универсальный продукт',
      display_name: 'Универсальный продукт',
      formats: ['A4', 'A5', 'A6'],
      recommended_paper_types: allPaperTypes,
      recommended_densities: allDensities,
      laminations: ['none', 'matte', 'glossy'],
      sides: [1, 2],
      description: 'Универсальный продукт для всех доступных материалов',
      is_active: true
    };
  }
  
  return productConfigs;
}

/**
 * Проверить доступность материалов в реальном времени
 */
export async function checkRealtimeAvailability(
  paperType: string,
  paperDensity: number,
  quantity: number
): Promise<{
  available: boolean;
  available_quantity: number;
  material_id: number | null;
  message: string;
  last_checked: string;
  alternatives?: MaterialRecommendation[];
}> {
  try {
    const availability = await checkMaterialAvailability(paperType, paperDensity, quantity);
    
    // Если материал недоступен, ищем альтернативы
    let alternatives: MaterialRecommendation[] = [];
    if (!availability.available) {
      alternatives = await getMaterialAlternatives(paperType, paperDensity, quantity);
    }

    return {
      available: availability.available,
      available_quantity: availability.available_quantity,
      material_id: availability.material_id,
      message: availability.message || 'Проверка доступности',
      last_checked: new Date().toISOString(),
      alternatives
    };
  } catch (error) {
    logger.error('calculatorMaterialService', 'Ошибка проверки доступности в реальном времени', error);
    return {
      available: false,
      available_quantity: 0,
      material_id: null,
      message: 'Ошибка проверки доступности',
      last_checked: new Date().toISOString()
    };
  }
}

/**
 * Получить альтернативные материалы (умные рекомендации)
 */
export async function getMaterialAlternatives(
  paperType: string,
  paperDensity: number,
  quantity: number
): Promise<MaterialRecommendation[]> {
  try {
    const paperTypes = await getPaperTypesFromWarehouse();
    const materials = await getMaterialsForCalculator();
    
    const alternatives: MaterialRecommendation[] = [];
    
    // Ищем материалы с похожими характеристиками
    for (const pt of paperTypes) {
      if (pt.name === paperType) continue; // Пропускаем тот же тип
      
      for (const density of pt.densities) {
        if (density.available_quantity >= quantity) {
          const material = materials.find(m => m.id === density.material_id);
          if (material) {
            alternatives.push({
              material_id: density.material_id,
              paper_type: pt.name,
              density: density.value,
              reason: 'available_now',
              confidence: 0.8,
              alternative_materials: []
            });
          }
        }
      }
    }
    
    // Сортируем по уверенности
    return alternatives.sort((a, b) => b.confidence - a.confidence);
  } catch (error) {
    logger.error('calculatorMaterialService', 'Ошибка получения альтернативных материалов', error);
    return [];
  }
}

/**
 * Обновить цены материалов (для автоматического обновления)
 */
export async function updateMaterialPrices(): Promise<{
  updated: number;
  errors: string[];
}> {
  try {
    const paperTypes = await getPaperTypesFromWarehouse();
    const materials = await getMaterialsForCalculator();
    
    let updated = 0;
    const errors: string[] = [];
    
    // Обновляем цены на основе данных склада
    for (const pt of paperTypes) {
      for (const density of pt.densities) {
        try {
          // Здесь можно добавить логику обновления цен
          // Например, отправка запроса на обновление цены
          updated++;
        } catch (error) {
          errors.push(`Ошибка обновления цены для ${pt.name} ${density.value}g: ${error}`);
        }
      }
    }
    
    return { updated, errors };
  } catch (error) {
    logger.error('calculatorMaterialService', 'Ошибка обновления цен материалов', error);
    return { updated: 0, errors: ['Общая ошибка обновления цен'] };
  }
}

export default {
  getPaperTypesFromWarehouse,
  getMaterialsForCalculator,
  getAllWarehouseMaterials,
  checkMaterialAvailability,
  calculateMaterialCost,
  // 🆕 Новые функции
  getProductConfigsFromWarehouse,
  checkRealtimeAvailability,
  getMaterialAlternatives,
  updateMaterialPrices
};
