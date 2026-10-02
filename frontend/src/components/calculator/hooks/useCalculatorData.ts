import { useState, useEffect, useCallback } from 'react';
import { getMaterials, getPaperTypes } from '../../../api';
import { 
  getPaperTypesFromWarehouse,
  getProductConfigsFromWarehouse,
  checkRealtimeAvailability,
  getMaterialAlternatives,
  updateMaterialPrices
} from '../../../services/calculatorMaterialService';
import { useLogger } from '../../../utils/logger';
import { useToastNotifications } from '../../Toast';
import { DataStates, useDataStates } from '../../DataStates';

/**
 * Хук для загрузки и управления данными калькулятора
 */
export const useCalculatorData = () => {
  const logger = useLogger('useCalculatorData');
  const toast = useToastNotifications();
  
  // Состояния для данных
  const materialsState = useDataStates();
  const paperTypesState = useDataStates();
  
  // Состояния для складских данных
  const [warehousePaperTypes, setWarehousePaperTypes] = useState<any[]>([]);
  const [warehouseProductConfigs, setWarehouseProductConfigs] = useState<Record<string, any>>({});
  const [materialAlternatives, setMaterialAlternatives] = useState<any[]>([]);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<string>('');
  const [loadingPaperTypes, setLoadingPaperTypes] = useState(false);

  // Загрузка материалов
  const loadMaterials = useCallback(async () => {
    try {
      materialsState.setLoading(true);
      const response = await getMaterials();
      materialsState.setData(response.data);
      logger.info('Материалы загружены', { count: response.data.length });
    } catch (error) {
      logger.error('Ошибка загрузки материалов', error);
      materialsState.setError('Ошибка загрузки материалов');
      toast.error('Ошибка загрузки материалов');
    } finally {
      materialsState.setLoading(false);
    }
  }, [materialsState, logger, toast]);

  // Загрузка типов бумаги
  const loadPaperTypes = useCallback(async () => {
    try {
      paperTypesState.setLoading(true);
      const response = await getPaperTypes();
      paperTypesState.setData(response.data);
      logger.info('Типы бумаги загружены', { count: response.data.length });
    } catch (error) {
      logger.error('Ошибка загрузки типов бумаги', error);
      paperTypesState.setError('Ошибка загрузки типов бумаги');
      toast.error('Ошибка загрузки типов бумаги');
    } finally {
      paperTypesState.setLoading(false);
    }
  }, [paperTypesState, logger, toast]);

  // Загрузка типов бумаги из складского сервиса
  const loadPaperTypesFromWarehouse = useCallback(async () => {
    setLoadingPaperTypes(true);
    try {
      const paperTypes = await getPaperTypesFromWarehouse();
      setWarehousePaperTypes(paperTypes);
      logger.info('Типы бумаги загружены из склада', { count: paperTypes.length });
    } catch (error) {
      logger.error('Ошибка загрузки типов бумаги из склада', error);
      toast.error('Ошибка загрузки типов бумаги. Используются данные по умолчанию.');
    } finally {
      setLoadingPaperTypes(false);
    }
  }, [logger, toast]);

  // Загрузка конфигурации продуктов из склада
  const loadProductConfigsFromWarehouse = useCallback(async () => {
    try {
      const configs = await getProductConfigsFromWarehouse();
      setWarehouseProductConfigs(configs);
      logger.info('Конфигурация продуктов загружена из склада', { count: Object.keys(configs).length });
    } catch (error) {
      logger.error('Ошибка загрузки конфигурации продуктов из склада', error);
    }
  }, [logger]);

  // Проверка доступности материалов в реальном времени
  const checkMaterialAvailability = useCallback(async (
    paperType: string,
    paperDensity: number,
    quantity: number
  ) => {
    try {
      const availability = await checkRealtimeAvailability(paperType, paperDensity, quantity);
      return availability;
    } catch (error) {
      logger.error('Ошибка проверки доступности материалов', error);
      return { available: true, quantity: 0, alternatives: [] };
    }
  }, [logger]);

  // Получение альтернативных материалов
  const getMaterialAlternatives = useCallback(async (
    paperType: string,
    paperDensity: number,
    quantity: number = 1
  ): Promise<any[]> => {
    try {
      const alternatives: any[] = await getMaterialAlternatives(paperType, paperDensity, quantity);
      setMaterialAlternatives(alternatives);
      return alternatives;
    } catch (error) {
      logger.error('Ошибка получения альтернативных материалов', error);
      return [];
    }
  }, [logger]);

  // Обновление цен материалов
  const updatePrices = useCallback(async () => {
    try {
      const updateResult = await updateMaterialPrices();
      setLastPriceUpdate(updateResult.updated.toString());
      logger.info('Цены материалов обновлены', { updateTime: updateResult.updated });
    } catch (error) {
      logger.error('Ошибка обновления цен материалов', error);
    }
  }, [logger]);

  // Загрузка всех данных
  const loadAllData = useCallback(async () => {
    try {
      logger.info('Начинаем загрузку данных калькулятора...');
      
      // Загружаем данные последовательно для лучшего контроля ошибок
      await loadMaterials();
      logger.info('Материалы загружены');
      
      await loadPaperTypes();
      logger.info('Типы бумаги загружены');
      
      await loadPaperTypesFromWarehouse();
      logger.info('Типы бумаги из склада загружены');
      
      await loadProductConfigsFromWarehouse();
      logger.info('Конфигурация продуктов из склада загружена');
      
      await updatePrices();
      logger.info('Цены обновлены');
      
      logger.info('Все данные калькулятора загружены успешно');
    } catch (error) {
      logger.error('Ошибка загрузки данных калькулятора', error);
      toast.error('Ошибка загрузки данных калькулятора. Некоторые функции могут работать некорректно.');
    }
  }, []);

  // Автоматическая загрузка при инициализации
  useEffect(() => {
    loadAllData();
  }, []);

  return {
    // Состояния данных
    materialsState,
    paperTypesState,
    
    // Складские данные
    warehousePaperTypes,
    warehouseProductConfigs,
    productConfigs: warehouseProductConfigs, // Алиас для совместимости
    dynamicDensities: [], // Заглушка
    materialAlternatives,
    lastPriceUpdate,
    loadingPaperTypes,
    
    // Функции загрузки
    loadMaterials,
    loadPaperTypes,
    loadPaperTypesFromWarehouse,
    loadProductConfigsFromWarehouse,
    checkMaterialAvailability,
    getMaterialAlternatives,
    updatePrices,
    loadAllData,
    loadDensitiesForPaperType: async (paperType: string) => {
      // Заглушка для загрузки плотностей
      console.log('Loading densities for paper type:', paperType);
    },
    
    // Сеттеры
    setWarehousePaperTypes,
    setWarehouseProductConfigs,
    setMaterialAlternatives,
    setLastPriceUpdate,
    setLoadingPaperTypes
  };
};