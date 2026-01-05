import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getPaperTypesFromWarehouse,
  getPaperDensitiesForType,
  checkRealtimeAvailability,
  updateMaterialPrices
} from '../../../services/calculatorMaterialService';

interface UseCalculatorMaterialsParams {
  specs: { paperType: string; paperDensity: number; quantity: number; sides: number };
  setSpecs: (updater: (prev: any) => any) => void;
  log: { info: Function; warn: Function; error: Function };
  toast: { error: Function; success: Function; warning: Function };
}

export function useCalculatorMaterials({ specs, setSpecs, log, toast }: UseCalculatorMaterialsParams) {
  const [warehousePaperTypes, setWarehousePaperTypes] = useState<any[]>([]);
  const [dynamicDensities, setDynamicDensities] = useState<Array<{ value: number; label: string; price: number; material_id: number; available_quantity: number }>>([]);
  const [materialAlternatives, setMaterialAlternatives] = useState<any[]>([]);
  const [materialAvailability, setMaterialAvailability] = useState<{ available: boolean; message?: string; available_quantity?: number }>({ available: true });
  const [loadingPaperTypes, setLoadingPaperTypes] = useState(false);
  const [lastPriceUpdate, setLastPriceUpdate] = useState<string>('');

  const loadPaperTypesFromWarehouse = useCallback(async () => {
    setLoadingPaperTypes(true);
    try {
      const paperTypes = await getPaperTypesFromWarehouse();
      setWarehousePaperTypes(paperTypes);
      log.info('✅ Типы бумаги загружены из склада', { count: paperTypes.length });
    } catch (error) {
      log.error('❌ Ошибка загрузки типов бумаги из склада', error);
      toast.error('Ошибка загрузки типов бумаги. Используются данные по умолчанию.');
    } finally {
      setLoadingPaperTypes(false);
    }
  }, [log, toast]);

  const logRef = useRef(log);
  useEffect(() => { logRef.current = log; }, [log]);

  const loadDensitiesForPaperType = useCallback(async (paperType: string) => {
    try {
      const densities = await getPaperDensitiesForType(paperType);
      setDynamicDensities(densities);
      logRef.current.info('✅ Плотности загружены для типа бумаги', { paperType, count: densities.length });
      if (densities.length > 0 && !densities.find(d => d.value === specs.paperDensity)) {
        setSpecs(prev => ({ ...prev, paperDensity: densities[0].value }));
      }
    } catch (error) {
      logRef.current.error('❌ Ошибка загрузки плотностей', error);
      setDynamicDensities([]);
    }
  }, [specs.paperDensity, setSpecs]);

  const getDefaultPaperDensity = useCallback((paperType: string): number => {
    if (dynamicDensities.length > 0) {
      return dynamicDensities[0].value;
    }
    const paperTypeData = warehousePaperTypes.find(pt => pt.name === paperType);
    if (paperTypeData && paperTypeData.densities && paperTypeData.densities.length > 0) {
      return paperTypeData.densities[0].value;
    }
    return 130;
  }, [dynamicDensities, warehousePaperTypes]);

  const updatePrices = useCallback(async () => {
    try {
      const result = await updateMaterialPrices();
      setLastPriceUpdate(new Date().toISOString());
      log.info('✅ Цены материалов обновлены', { updated: result.updated, errors: result.errors.length });
      if (result.errors.length > 0) {
        toast.warning(`Обновлено ${result.updated} цен, ошибок: ${result.errors.length}`);
      } else {
        toast.success(`Успешно обновлено ${result.updated} цен`);
      }
    } catch (error) {
      log.error('❌ Ошибка обновления цен', error);
      toast.error('Ошибка обновления цен материалов');
    }
  }, [log, toast]);

  // Realtime availability (debounced)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!specs.paperType || !specs.paperDensity || specs.quantity <= 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const availability = await checkRealtimeAvailability(specs.paperType, specs.paperDensity, specs.quantity);
        setMaterialAvailability(availability);
        if (availability.alternatives && availability.alternatives.length > 0) {
          setMaterialAlternatives(availability.alternatives);
          log.info('🔄 Найдены альтернативные материалы', { count: availability.alternatives.length });
        }
      } catch (error) {
        log.error('❌ Ошибка проверки доступности материалов', error);
      }
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [specs.paperType, specs.paperDensity, specs.quantity, log]);

  // Load densities when paperType changes (guarded to avoid repeated loads)
  const lastLoadedPaperTypeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!specs.paperType || warehousePaperTypes.length === 0) return;
    if (lastLoadedPaperTypeRef.current === specs.paperType) return;
    lastLoadedPaperTypeRef.current = specs.paperType;
    loadDensitiesForPaperType(specs.paperType);
  }, [specs.paperType, warehousePaperTypes.length]);

  // Auto switch to a type with densities if current has none
  useEffect(() => {
    if (warehousePaperTypes.length > 0 && dynamicDensities.length === 0 && specs.paperType) {
      const typeWithDensities = warehousePaperTypes.find(type => type.densities && type.densities.length > 0);
      if (typeWithDensities && typeWithDensities.name !== specs.paperType) {
        setSpecs(prev => ({ ...prev, paperType: typeWithDensities.name }));
      }
    }
  }, [warehousePaperTypes, dynamicDensities.length, specs.paperType, setSpecs]);

  // Initial paper type set
  useEffect(() => {
    if (warehousePaperTypes.length > 0 && !specs.paperType) {
      const typeWithDensities = warehousePaperTypes.find(type => type.densities && type.densities.length > 0);
      const selectedType = typeWithDensities || warehousePaperTypes[0];
      setSpecs(prev => ({
        ...prev,
        paperType: selectedType.name,
        paperDensity: selectedType.densities && selectedType.densities.length > 0 ? selectedType.densities[0].value : 0
      }));
    }
  }, [warehousePaperTypes, specs.paperType, setSpecs]);

  const availableDensities = useMemo(() => dynamicDensities, [dynamicDensities]);

  return {
    warehousePaperTypes,
    availableDensities,
    loadingPaperTypes,
    materialAlternatives,
    materialAvailability,
    lastPriceUpdate,
    loadPaperTypesFromWarehouse,
    getDefaultPaperDensity,
    updatePrices
  } as const;
}


