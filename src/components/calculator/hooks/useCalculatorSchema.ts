import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getEnhancedProductTypes, getEnhancedProductSchema, getProductSchemaById } from '../../../api';

interface UseCalculatorSchemaParams {
  productType: string;
  productId?: number | null; // 🆕 Добавляем productId
  log: { info: Function; warn: Function; error?: Function };
  setSpecs: (updater: (prev: any) => any) => void;
}

// Глобальный кэш для всех экземпляров компонента
const globalSchemaCache = new Map<string | number, { schema: any; timestamp: number }>();
const loadingSchemas = new Set<string | number>(); // Защита от параллельных запросов
const SCHEMA_CACHE_TTL = 5 * 60 * 1000; // 5 минут

export function useCalculatorSchema({ productType, productId, log, setSpecs }: UseCalculatorSchemaParams) {
  const [backendProductTypes, setBackendProductTypes] = useState<any[]>([]);
  const [backendProductSchema, setBackendProductSchema] = useState<any | null>(null);
  const lastProductIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // Load product types once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await getEnhancedProductTypes();
        if (cancelled) return;
        const list = Array.isArray(resp?.data?.data) ? resp.data.data : (resp.data || []);
        setBackendProductTypes(list);
        log.info('✅ Список типов продуктов загружен', { count: list.length });
      } catch (e) {
        if (!cancelled) log.warn('⚠️ Не удалось загрузить список типов продуктов');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load schema for current product (by ID or by type)
  useEffect(() => {
    mountedRef.current = true;
    
    // 🎯 Приоритет: сначала загружаем по productId, если он есть
    const key = productId ? `product_${productId}` : productType;
    if (!key) {
      log.warn('⚠️ Нет productId и productType, схема не будет загружена');
      return;
    }
    
    // Проверяем глобальный кэш
    const cached = globalSchemaCache.get(key);
    const now = Date.now();
    if (cached && (now - cached.timestamp) < SCHEMA_CACHE_TTL) {
      // Используем кэшированную схему
      if (mountedRef.current) {
        setBackendProductSchema(cached.schema);
      }
      return;
    }
    
    // Проверяем, не загружается ли уже эта схема
    if (loadingSchemas.has(key)) {
      return; // Уже загружается, ждём
    }
    
    // Сохраняем текущий productId для проверки изменений
    if (productId) {
      lastProductIdRef.current = productId;
    }
    
    // Помечаем ключ как загружаемый
    loadingSchemas.add(key);
    
    let cancelled = false;
    (async () => {
      try {
        let resp;
        let schema;
        
        // 🆕 Если есть productId, загружаем схему по ID продукта (из параметров)
        if (productId) {
          log.info('📦 Загружаем схему по ID продукта', { productId, productType });
          resp = await getProductSchemaById(productId);
          schema = resp?.data?.data || resp?.data;
        } else {
          // Иначе загружаем старую схему по типу продукта
          log.info('📋 Загружаем схему по типу продукта (БЕЗ constraints!)', { productType, productId });
          resp = await getEnhancedProductSchema(productType);
          schema = resp?.data?.data || resp?.data;
        }
        
        if (cancelled || !mountedRef.current) return;
        
        // Сохраняем в глобальный кэш
        globalSchemaCache.set(key, { schema: schema || null, timestamp: Date.now() });
        
        setBackendProductSchema(schema || null);
        log.info('✅ Схема продукта загружена', { 
          key, 
          productId, 
          productType,
          fields: schema?.fields?.length || 0
        });

        // Initialize defaults from schema
        if (schema && Array.isArray(schema.fields)) {
          const updates: Record<string, any> = {};
          setSpecs(prev => {
            for (const f of schema.fields) {
              const hasValue = prev[f.name] !== undefined && prev[f.name] !== null;
              if (hasValue) continue;
              
              // 🔧 Обрабатываем разные типы значений по умолчанию
              if (Array.isArray(f.enum) && f.enum.length > 0) {
                // Для enum берем первое значение или value из объекта
                const firstOption = f.enum[0];
                updates[f.name] = typeof firstOption === 'object' && firstOption?.value !== undefined 
                  ? firstOption.value 
                  : firstOption;
              } else if (f.type === 'boolean') {
                updates[f.name] = false;
              } else if (f.type === 'number' || f.type === 'integer') {
                updates[f.name] = f.min ?? 0;
              } else if (f.type === 'string') {
                updates[f.name] = '';
              }
            }
            return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
          });
        }
      } catch (e) {
        if (cancelled || !mountedRef.current) return;
        
        // Сохраняем null в кэш на 1 минуту, чтобы не спамить
        globalSchemaCache.set(key, { schema: null, timestamp: Date.now() });
        
        log.warn('⚠️ Не удалось загрузить схему продукта (запросы временно остановлены)', {
          key,
          productId,
          productType,
          error: (e as any)?.message,
        });
        setBackendProductSchema(null);
      } finally {
        // Убираем из списка загружаемых
        loadingSchemas.delete(key);
      }
    })();
    
    return () => { 
      cancelled = true;
      mountedRef.current = false;
    };
  }, [productType, productId]);

  const currentConfig = useMemo(() => {
    if (backendProductSchema) {
      const fields = Array.isArray(backendProductSchema.fields) ? backendProductSchema.fields : [];
      const formats = (fields.find((f: any) => f.name === 'format')?.enum || []) as string[];
      const pages = (fields.find((f: any) => f.name === 'pages')?.enum || []) as number[];
      const flags = {
        magnetic: !!fields.find((f: any) => f.name === 'magnetic'),
        cutting: !!fields.find((f: any) => f.name === 'cutting'),
        folding: !!fields.find((f: any) => f.name === 'folding'),
        roundCorners: !!fields.find((f: any) => f.name === 'roundCorners')
      } as const;
      return {
        name: backendProductSchema.type || productType,
        formats,
        pages,
        ...flags
      } as any;
    }
    return { name: productType, formats: [], pages: [] };
  }, [backendProductSchema, productType]);

  const availableFormats = useMemo(() => {
    const schemaFormats = backendProductSchema?.fields?.find((f: any) => f.name === 'format')?.enum;
    if (Array.isArray(schemaFormats) && schemaFormats.length) return schemaFormats as string[];
    if (currentConfig?.formats?.length) return currentConfig.formats as string[];
    return ['A4'];
  }, [backendProductSchema, currentConfig]);

  const getDefaultFormat = useCallback((): string => {
    const enumFormats = backendProductSchema?.fields?.find((f: any) => f.name === 'format')?.enum;
    if (Array.isArray(enumFormats) && enumFormats.length) return enumFormats[0];
    return 'A4';
  }, [backendProductSchema]);

  return {
    backendProductTypes,
    backendProductSchema,
    currentConfig,
    availableFormats,
    getDefaultFormat
  } as const;
}


