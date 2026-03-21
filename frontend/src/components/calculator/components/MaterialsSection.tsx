import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppIcon } from '../../ui/AppIcon';
import { checkMaterialAvailability, calculateMaterialCost } from '../../../services/calculatorMaterialService';
import type { CalculationResult } from '../types/calculator.types';
import { getMaterials } from '../../../api';

  /**
   * Плотность только из явных полей (без парсинга названия).
   * Поддерживаем варианты имён с бэкенда/форм.
   */
function getMaterialDensity(m: any): number | null {
  const raw =
    m?.density ??
    m?.density_g_sm ??
    m?.densityGsm ??
    m?.grams_per_sqm ??
    m?.gramsPerSqm ??
    m?.paper_density ??
    m?.paperDensity;
  if (raw == null || raw === '') return null;
  const d = Number(raw);
  return Number.isFinite(d) && d > 0 ? d : null;
}

interface MaterialsSectionProps {
  specs: {
    paperType: string;
    paperDensity: number;
    lamination: 'none' | 'matte' | 'glossy';
    quantity: number;
    material_id?: number; // 🆕 ID материала из схемы
    base_material_id?: number; // 🆕 Материал-основа (заготовка)
    size_id?: number | string; // 🆕 ID размера для упрощённых продуктов
    [key: string]: any; // Для других полей
  };
  warehousePaperTypes: Array<{ 
    name: string; 
    display_name: string; 
    densities?: Array<{ 
      value: number; 
      label: string; 
      price?: number;
      available_quantity?: number;
      is_available?: boolean;
      material_id?: number;
    }> 
  }>;
  availableDensities: Array<{ value: number; label: string }>;
  loadingPaperTypes: boolean;
  getDefaultPaperDensity: (paperType: string) => number;
  updateSpecs: (updates: Partial<any>, instant?: boolean) => void; // 🆕 Добавили instant
  schema?: { 
    fields?: Array<{
      name: string;
      label?: string;
      required?: boolean;
      placeholder?: string;
      enum?: any[];
    }>; 
    constraints?: { allowed_paper_types?: string[] | null };
    template?: { 
      simplified?: { 
        sizes?: Array<{ 
          id: string; 
          label: string; 
          allowed_material_ids?: number[];
        }> 
      } | null;
    } | null;
    /** Материалы из схемы (с density, paper_type_name) — для simplified с подтипами */
    materials?: Array<{ id: number; name: string; density?: number; paper_type_name?: string; paper_type_id?: number; price?: number; unit?: string }>;
  } | null;
  // Результат расчета
  result?: CalculationResult | null;
  /** Только блок «Материал» для упрощённых продуктов (в одну колонку с «Тип печати») */
  renderMaterialOnly?: boolean;
  /** Размеры текущего типа продукта (если у продукта есть типы) */
  effectiveSizes?: Array<{ id: string; allowed_material_ids?: number[]; allowed_base_material_ids?: number[]; [key: string]: any }>;
  /**
   * Меняется при смене продукта или подтипа (simplified types).
   * Сбрасывает локальный выбор типа бумаги/плотности — иначе после смены таба остаётся paper_type от прошлого подтипа и список материалов пустой/не тот.
   */
  materialSelectionResetKey?: string;
}

export const MaterialsSection: React.FC<MaterialsSectionProps> = ({
  specs,
  warehousePaperTypes,
  availableDensities,
  loadingPaperTypes,
  getDefaultPaperDensity,
  updateSpecs,
  schema,
  result,
  renderMaterialOnly = false,
  effectiveSizes: effectiveSizesProp,
  materialSelectionResetKey,
}) => {
  const simplifiedSizesSource = Array.isArray(effectiveSizesProp) && effectiveSizesProp.length > 0
    ? effectiveSizesProp
    : schema?.template?.simplified?.sizes;

  /** Стабильный ключ: перезагрузка /materials только при смене подтипа/размеров/списков id, не при каждом рендере schema */
  const materialsReloadKey = useMemo(() => {
    if (!Array.isArray(simplifiedSizesSource) || simplifiedSizesSource.length === 0) return '';
    return simplifiedSizesSource
      .map((s: any) => {
        const am = Array.isArray(s.allowed_material_ids)
          ? [...s.allowed_material_ids].sort((a: number, b: number) => Number(a) - Number(b)).join(',')
          : '';
        const ab = Array.isArray(s.allowed_base_material_ids)
          ? [...s.allowed_base_material_ids].sort((a: number, b: number) => Number(a) - Number(b)).join(',')
          : '';
        return `${String(s.id)}:${am}:${ab}`;
      })
      .join('|');
  }, [simplifiedSizesSource]);

  const schemaRef = useRef(schema);
  schemaRef.current = schema;

  const [materialAvailability, setMaterialAvailability] = useState<{
    available: boolean;
    available_quantity: number;
    material_id: number | null;
    message?: string;
  } | null>(null);
  const [materialCost, setMaterialCost] = useState<{
    material_cost: number;
    sheets_needed: number;
    price_per_sheet: number;
  } | null>(null);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [allMaterials, setAllMaterials] = useState<Array<{ id: number; name: string; unit?: string; price?: number; paper_type_id?: number; paper_type_name?: string; density?: number }>>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  /** Выбранный тип материала (paper_type_name) — из разрешённых на складе */
  const [selectedMaterialType, setSelectedMaterialType] = useState<string>('');
  /** Выбранная плотность (г/м²) для выбранного типа */
  const [selectedDensity, setSelectedDensity] = useState<number | ''>('');
  /** Флаг: пользователь вручную выбрал тип — не перезаписывать из specs (избегаем рекурсии) */
  const userChoseTypeRef = useRef(false);
  /** Порядковый номер запроса /materials — отбрасываем устаревший ответ при быстрой смене подтипа */
  const materialsFetchGenerationRef = useRef(0);
  const prevMaterialSelectionKeyRef = useRef<string | null>(null);

  // Смена продукта / подтипа упрощённого продукта: сброс локального UI материала (иначе selectedMaterialType «прилипает» к прошлому табу).
  useEffect(() => {
    if (!materialSelectionResetKey) return;
    if (prevMaterialSelectionKeyRef.current === null) {
      prevMaterialSelectionKeyRef.current = materialSelectionResetKey;
      return;
    }
    if (prevMaterialSelectionKeyRef.current === materialSelectionResetKey) return;
    prevMaterialSelectionKeyRef.current = materialSelectionResetKey;
    setSelectedMaterialType('');
    setSelectedDensity('');
    userChoseTypeRef.current = false;
  }, [materialSelectionResetKey]);

  // Упрощённые продукты: тянем актуальный список с GET /materials при смене набора размеров/материалов (подтип и т.д.).
  // schema.materials подмешиваем через ref (без зависимости от ссылки массива), иначе лишние запросы и гонки при смене таба.
  useEffect(() => {
    if (!materialsReloadKey) return;
    let cancelled = false;
    const requestId = ++materialsFetchGenerationRef.current;
    setLoadingMaterials(true);
    getMaterials()
      .then((response) => {
        if (cancelled || requestId !== materialsFetchGenerationRef.current) return;
        const fromApi = Array.isArray(response.data)
          ? response.data.filter((m: any) => m && m.id != null)
          : [];
        const fromSchema = Array.isArray(schemaRef.current?.materials) ? schemaRef.current.materials : [];
        if (fromSchema.length === 0) {
          setAllMaterials(fromApi);
          return;
        }
        const byIdEntries: Array<[number, any]> = [];
        for (const m of fromApi) {
          if (!m || m.id == null) continue;
          const id = Number(m.id);
          if (!Number.isFinite(id)) continue;
          byIdEntries.push([id, { ...m }]);
        }
        const byId = new Map<number, any>(byIdEntries);
        for (const sm of fromSchema) {
          if (!sm || typeof sm !== 'object') continue;
          const id = Number((sm as any).id);
          if (!Number.isFinite(id)) continue;
          const cur = byId.get(id);
          if (!cur) {
            byId.set(id, { ...sm });
            continue;
          }
          const dSchema = getMaterialDensity(sm);
          const dApi = getMaterialDensity(cur);
          if (dSchema != null && dApi == null) {
            byId.set(id, {
              ...cur,
              density: (sm as any).density ?? (sm as any).density_g_sm ?? dSchema,
            });
          }
        }
        setAllMaterials(Array.from(byId.values()));
      })
      .catch((error) => {
        if (!cancelled && requestId === materialsFetchGenerationRef.current) {
          console.error('Ошибка загрузки материалов:', error);
        }
      })
      .finally(() => {
        if (!cancelled && requestId === materialsFetchGenerationRef.current) {
          setLoadingMaterials(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [materialsReloadKey]);

  const hasField = (name: string) => !!schema?.fields?.some(f => f.name === name);
  const getLabel = (name: string, fallback: string) => (schema?.fields as any)?.find((f: any) => f.name === name)?.label || fallback;
  const isRequired = (name: string) => !!(schema?.fields as any)?.find((f: any) => f.name === name)?.required;
  const getPlaceholder = (name: string, fb: string) => (schema?.fields as any)?.find((f: any) => f.name === name)?.placeholder || fb;

  // Стабильный «отпечаток» результата расчёта — НЕ кладём весь result в deps (новый объект каждый рендер → цикл: effect → calculateCost → родитель → result → effect).
  const resultMaterialFingerprint = useMemo(() => {
    const m = result?.materials?.[0] as { total?: number; unitPrice?: number; price?: number } | undefined;
    const layout = result?.layout as { sheetsNeeded?: number; metersNeeded?: number } | undefined;
    if (!m || layout == null) return '';
    const sn = layout.sheetsNeeded;
    const mn = layout.metersNeeded;
    if (sn == null && mn == null) return '';
    return [
      m.total ?? '',
      m.unitPrice ?? m.price ?? '',
      sn ?? '',
      mn ?? '',
    ].join('|');
  }, [
    result?.materials?.[0]?.total,
    (result?.materials?.[0] as any)?.unitPrice,
    (result?.materials?.[0] as any)?.price,
    result?.layout?.sheetsNeeded,
    (result?.layout as any)?.metersNeeded,
  ]);

  // Проверяем доступность и fallback-стоимость при смене параметров (без зависимости от result)
  useEffect(() => {
    if (specs.paperType && specs.paperDensity && specs.quantity > 0) {
      checkAvailability();
      void calculateCost();
    }
  }, [specs.paperType, specs.paperDensity, specs.quantity, specs.sides]);

  // Когда с бэкенда пришёл новый расчёт — обновляем блок стоимости из result без повторного цикла по ссылке result
  useEffect(() => {
    if (!resultMaterialFingerprint || !specs.paperType || !specs.paperDensity || specs.quantity <= 0) return;
    void calculateCost();
  }, [resultMaterialFingerprint, specs.paperType, specs.paperDensity, specs.quantity]);

  const checkAvailability = async () => {
    setIsCheckingAvailability(true);
    try {
      const availability = await checkMaterialAvailability(
        specs.paperType,
        specs.paperDensity,
        specs.quantity
      );
      setMaterialAvailability(availability);
    } catch (error) {
      console.error('Ошибка проверки доступности материалов:', error);
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  const calculateCost = async () => {
    try {
      // ⚠️ ВАЖНО: Используем реальные данные из результата бэкенда, если они есть
      if (result?.materials && result.materials.length > 0 && result.layout?.sheetsNeeded) {
        const material = result.materials[0]; // Берем первый материал
        const sheetsNeeded = result.layout.sheetsNeeded;
        const pricePerSheet = (material.unitPrice ?? material.price ?? 0) as number;
        const materialCost = (material.total ?? 0) as number;
        
        // Проверяем, что все значения валидны
        if (typeof materialCost === 'number' && typeof pricePerSheet === 'number' && typeof sheetsNeeded === 'number') {
          setMaterialCost({
            material_cost: materialCost,
            sheets_needed: sheetsNeeded,
            price_per_sheet: pricePerSheet,
          });
          return;
        }
      }
      
      // Fallback: примерный расчет только если нет данных от бэкенда
      const cost = await calculateMaterialCost(
        specs.paperType,
        specs.paperDensity,
        specs.quantity,
        specs.sides || 1
      );
      setMaterialCost(cost);
    } catch (error) {
      console.error('Ошибка расчета стоимости материалов:', error);
      setMaterialCost(null); // Сбрасываем при ошибке
    }
  };

  const getDensityInfo = (density: number) => {
    const paperType = warehousePaperTypes.find(pt => pt.name === specs.paperType);
    return paperType?.densities?.find(d => d.value === density);
  };

  // 🆕 Фильтруем типы бумаги на основе constraints из схемы продукта
  const allowedPaperTypes = schema?.constraints?.allowed_paper_types;
  
  const filteredPaperTypes = useMemo(() => {
    // Если ограничений нет (null, undefined, пустой массив) - показываем все типы
    if (!allowedPaperTypes || !Array.isArray(allowedPaperTypes) || allowedPaperTypes.length === 0) {
      return warehousePaperTypes;
    }
    // Фильтруем только разрешенные типы
    const filtered = warehousePaperTypes.filter(pt => {
      return allowedPaperTypes.includes(pt.name);
    });
    if (filtered.length === 0) {
      console.warn('⚠️ [MaterialsSection] После фильтрации не осталось типов бумаги!');
    }
    return filtered;
  }, [warehousePaperTypes, allowedPaperTypes]);

  // 🆕 Если текущий тип бумаги не входит в разрешенные - сбрасываем на первый разрешенный
  // Также устанавливаем первый тип бумаги, если paperType не установлен, но есть разрешённые типы
  useEffect(() => {
    if (filteredPaperTypes.length === 0) return;
    const firstName = filteredPaperTypes[0].name;
    const inList = specs.paperType && filteredPaperTypes.some((pt) => pt.name === specs.paperType);
    if (inList) return;
    const nextDensity = getDefaultPaperDensity(firstName);
    // Не дёргаем updateSpecs, если уже выставлены те же значения (иначе лишние рендеры и гонки с материалами)
    if (specs.paperType === firstName && specs.paperDensity === nextDensity) return;
    updateSpecs(
      {
        paperType: firstName,
        paperDensity: nextDensity,
      },
      true,
    );
  }, [filteredPaperTypes, specs.paperType, specs.paperDensity, updateSpecs, getDefaultPaperDensity]);

  // 🆕 Проверяем, является ли продукт упрощённым
  const isSimplifiedProduct = simplifiedSizesSource && simplifiedSizesSource.length > 0;
  
  // 🆕 Получаем разрешённые материалы для выбранного размера
  // Важно: порядок как в шаблоне (allowed_material_ids), а не порядок строк в ответе /materials —
  // иначе дефолт «первый тип / первая плотность» уезжает на чужой тип (например DTF), если он раньше в API.
  const allowedMaterialsForSize = useMemo(() => {
    if (!isSimplifiedProduct || !specs.size_id) return [];

    const selectedSize = simplifiedSizesSource?.find((s: any) => String(s.id) === String(specs.size_id));
    const ids = selectedSize?.allowed_material_ids;
    if (!selectedSize || !Array.isArray(ids) || ids.length === 0) return [];

    const byId = new Map<number, (typeof allMaterials)[number]>();
    for (const m of allMaterials) {
      if (m?.id == null) continue;
      const id = Number(m.id);
      if (Number.isFinite(id)) byId.set(id, m);
    }
    const ordered: typeof allMaterials = [];
    for (const rawId of ids) {
      const mid = Number(rawId);
      if (!Number.isFinite(mid)) continue;
      const row = byId.get(mid);
      if (row) ordered.push(row);
    }
    return ordered;
  }, [isSimplifiedProduct, specs.size_id, simplifiedSizesSource, allMaterials]);

  // 🆕 Разрешённые материалы-основы (заготовки) для выбранного размера — порядок как в шаблоне
  const allowedBaseMaterialsForSize = useMemo(() => {
    if (!isSimplifiedProduct || !specs.size_id) return [];
    const selectedSize = simplifiedSizesSource?.find((s: any) => String(s.id) === String(specs.size_id)) as { allowed_base_material_ids?: number[] } | undefined;
    const ids = selectedSize?.allowed_base_material_ids;
    if (!Array.isArray(ids) || ids.length === 0) return [];

    const byId = new Map<number, (typeof allMaterials)[number]>();
    for (const m of allMaterials) {
      if (m?.id == null) continue;
      const id = Number(m.id);
      if (Number.isFinite(id)) byId.set(id, m);
    }
    const ordered: typeof allMaterials = [];
    for (const rawId of ids) {
      const mid = Number(rawId);
      if (!Number.isFinite(mid)) continue;
      const row = byId.get(mid);
      if (row) ordered.push(row);
    }
    return ordered;
  }, [isSimplifiedProduct, specs.size_id, simplifiedSizesSource, allMaterials]);

  // Нормализация для сравнения (без учёта регистра и пробелов)
  const normalizeForCompare = (s: string | null | undefined) =>
    (s ?? '').toString().trim().toLowerCase();

  // Уникальные типы материала (paper_type_name) из разрешённых материалов — для фильтра
  // Порядок типов — по появлению в списке материалов размера (allowed_material_ids), не по алфавиту,
  // чтобы «первый по умолчанию» был из продукта, а не «Dtf» из-за localeCompare.
  const materialTypesFromMaterials = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    const norm = (s: string) => (s ?? '').toString().trim().toLowerCase();
    allowedMaterialsForSize.forEach(m => {
      const name = (m as any).paper_type_name;
      if (name && !seen.has(norm(name))) {
        seen.add(norm(name));
        order.push(name);
      }
    });
    return order;
  }, [allowedMaterialsForSize]);

  // Материалы выбранного типа (из разрешённых для продукта)
  // Сравнение без учёта регистра — «Дизайнерская» и «дизайнерская» считаются одним типом
  const allowedMaterialsByType = useMemo(() => {
    if (!selectedMaterialType) return allowedMaterialsForSize;
    const normSelected = normalizeForCompare(selectedMaterialType);
    return allowedMaterialsForSize.filter(m => {
      const ptName = (m as any).paper_type_name;
      return normSelected && normalizeForCompare(ptName) === normSelected;
    });
  }, [allowedMaterialsForSize, selectedMaterialType]);

  // Плотности для выбранного типа — только из разрешённых материалов продукта (явные поля плотности)
  const densitiesForSelectedType = useMemo(() => {
    const values = allowedMaterialsByType
      .map(m => getMaterialDensity(m))
      .filter((d): d is number => d != null && d > 0);
    return [...new Set(values)].sort((a, b) => a - b);
  }, [allowedMaterialsByType]);

  // По выбранному типу + плотности находим материал из разрешённых для продукта
  const materialByTypeAndDensity = useMemo(() => {
    if (selectedDensity === '') return undefined;
    const targetDensity = Number(selectedDensity);
    return allowedMaterialsByType.find(m => getMaterialDensity(m) === targetDensity);
  }, [allowedMaterialsByType, selectedDensity]);

  // Сбрасываем material_id, если он не входит в разрешённые для выбранного размера
  useEffect(() => {
    if (isSimplifiedProduct && specs.size_id && specs.material_id) {
      const isMaterialAllowed = allowedMaterialsForSize.some(m => Number(m.id) === specs.material_id);
      if (!isMaterialAllowed && allowedMaterialsForSize.length > 0) {
        // Материал больше не разрешён - сбрасываем
        updateSpecs({ material_id: undefined }, true);
      }
    }
  }, [isSimplifiedProduct, specs.size_id, specs.material_id, allowedMaterialsForSize, updateSpecs]);

  // Сбрасываем base_material_id, если он не входит в разрешённые для выбранного размера
  useEffect(() => {
    if (isSimplifiedProduct && specs.size_id && specs.base_material_id && allowedBaseMaterialsForSize.length > 0) {
      const isAllowed = allowedBaseMaterialsForSize.some(m => Number(m.id) === specs.base_material_id);
      if (!isAllowed) {
        updateSpecs({ base_material_id: undefined }, true);
      }
    }
  }, [isSimplifiedProduct, specs.size_id, specs.base_material_id, allowedBaseMaterialsForSize, updateSpecs]);

  // Инициализация типа и плотности по текущему материалу (из разрешённых для продукта)
  // Не перезаписываем, если пользователь выбрал тип без плотностей — иначе «не даёт выбрать»
  useEffect(() => {
    if (!isSimplifiedProduct || !specs.size_id || materialTypesFromMaterials.length === 0) return;
    // Если пользователь вручную выбрал тип, у которого нет плотностей — не перезаписывать из specs
    if (selectedMaterialType && densitiesForSelectedType.length === 0) {
      userChoseTypeRef.current = false;
      return;
    }
    const currentMaterial = allowedMaterialsForSize.find(m => Number(m.id) === specs.material_id);
    const typeFromCurrent = currentMaterial ? (currentMaterial as any).paper_type_name : undefined;
    const densityFromCurrent = currentMaterial ? getMaterialDensity(currentMaterial) : undefined;
    const typeMatches = typeFromCurrent && materialTypesFromMaterials.some(t => normalizeForCompare(t) === normalizeForCompare(typeFromCurrent));
    if (typeFromCurrent && typeMatches) {
      if (!userChoseTypeRef.current) {
        setSelectedMaterialType(prev => (prev !== typeFromCurrent ? typeFromCurrent : prev));
        if (densityFromCurrent != null) {
          setSelectedDensity(prev => (prev !== densityFromCurrent ? densityFromCurrent : prev));
        }
      }
      // Не сбрасываем userChoseTypeRef здесь — иначе следующий эффект (376–396) решит, что пользователь не выбирал тип,
      // и выйдет по guard, не вызвав updateSpecs. Сброс делается в эффекте 376–396 после успешного updateSpecs.
    } else if (materialTypesFromMaterials.length > 0 && !selectedMaterialType) {
      setSelectedMaterialType(materialTypesFromMaterials[0]);
    }
  }, [isSimplifiedProduct, specs.size_id, materialTypesFromMaterials, specs.material_id, allowedMaterialsForSize, selectedMaterialType, densitiesForSelectedType]);

  // При смене типа — ставим первую плотность этого типа (или сбрасываем, если у типа нет плотностей).
  // Если плотность та же и подходит для нового типа — сразу синхронизируем material_id (пересчёт при смене типа при той же плотности).
  useEffect(() => {
    if (!isSimplifiedProduct || !specs.size_id) return;
    if (densitiesForSelectedType.length === 0) {
      setSelectedDensity('');
      if (specs.material_id != null && allowedMaterialsForSize.length > 0) {
        updateSpecs({ material_id: undefined }, true);
      }
      return;
    }
    const firstDensity = densitiesForSelectedType[0];
    const needResetDensity = !selectedDensity || !densitiesForSelectedType.includes(selectedDensity as number);
    if (needResetDensity) {
      setSelectedDensity(firstDensity);
      const materialForFirstDensity = allowedMaterialsByType.find(m => getMaterialDensity(m) === firstDensity);
      if (materialForFirstDensity && Number(specs.material_id) !== Number(materialForFirstDensity.id)) {
        const paperType = warehousePaperTypes.length > 0 && (materialForFirstDensity as any).paper_type_name
          ? warehousePaperTypes.find(pt => pt.display_name === (materialForFirstDensity as any).paper_type_name)
          : null;
        const nextMaterialType = paperType ? paperType.name : undefined;
        updateSpecs({
          material_id: materialForFirstDensity.id,
          ...(nextMaterialType ? { materialType: nextMaterialType as any } : {}),
        }, true);
      }
    } else {
      // Плотность не менялась (та же для нового типа) — всё равно синхронизируем material_id по (тип + плотность)
      const densityNum = Number(selectedDensity);
      const materialForCurrentDensity = allowedMaterialsByType.find(m => getMaterialDensity(m) === densityNum);
      if (materialForCurrentDensity && Number(specs.material_id) !== Number(materialForCurrentDensity.id)) {
        const paperType = warehousePaperTypes.length > 0 && (materialForCurrentDensity as any).paper_type_name
          ? warehousePaperTypes.find(pt => pt.display_name === (materialForCurrentDensity as any).paper_type_name)
          : null;
        const nextMaterialType = paperType ? paperType.name : undefined;
        updateSpecs({
          material_id: materialForCurrentDensity.id,
          ...(nextMaterialType ? { materialType: nextMaterialType as any } : {}),
        }, true);
      }
    }
  }, [selectedMaterialType, densitiesForSelectedType, selectedDensity, isSimplifiedProduct, specs.size_id, specs.material_id, allowedMaterialsForSize.length, allowedMaterialsByType, warehousePaperTypes, updateSpecs]);

  // По выбранным типу и плотности выставляем material_id и materialType (только при изменении — иначе рекурсия)
  // Не перезаписываем material_id, если он задан из initial и материал в разрешённых — ждём синхронизацию selectedMaterialType/selectedDensity из effect выше
  useEffect(() => {
    if (!isSimplifiedProduct || !specs.size_id) return;
    const material = materialByTypeAndDensity;
    if (!material) return;
    const paperType = warehousePaperTypes.length > 0 && (material as any).paper_type_name
      ? warehousePaperTypes.find(pt => pt.display_name === (material as any).paper_type_name)
      : null;
    const nextMaterialType = paperType ? paperType.name : undefined;
    const alreadyEqual = Number(specs.material_id) === Number(material.id) && (!nextMaterialType || specs.materialType === nextMaterialType);
    if (alreadyEqual) return;
    if (!userChoseTypeRef.current && specs.material_id != null && Number(material.id) !== Number(specs.material_id) && allowedMaterialsForSize.some(m => Number(m.id) === specs.material_id)) {
      return;
    }
    userChoseTypeRef.current = false;
    updateSpecs({
      material_id: material.id,
      ...(nextMaterialType ? { materialType: nextMaterialType as any } : {}),
    }, true);
  }, [materialByTypeAndDensity, isSimplifiedProduct, specs.size_id, specs.material_id, specs.materialType, allowedMaterialsForSize, warehousePaperTypes, updateSpecs]);


  // Продукт без материалов (нет paperType в схеме и не упрощённый с размерами/материалами) — не показываем секцию
  const usesMaterials = hasField('paperType') || isSimplifiedProduct;
  if (!usesMaterials) {
    return null;
  }

  // Блок «Материал-основа» (заготовка) — показываем, если у размера есть allowed_base_material_ids
  const hasBaseMaterials = allowedBaseMaterialsForSize.length > 0;
  const baseMaterialBlock = isSimplifiedProduct && specs.size_id && hasBaseMaterials ? (
    <div className="param-group param-group--narrow">
      <label>Материал-основа (заготовка)</label>
      <select
        value={specs.base_material_id ?? ''}
        onChange={(e) => updateSpecs({ base_material_id: e.target.value ? Number(e.target.value) : undefined }, true)}
        className="form-control"
      >
        <option value="">— Не выбрано —</option>
        {allowedBaseMaterialsForSize.map(m => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    </div>
  ) : null;

  // Блок «Тип материала» + «Плотность» + «Имя материала» в одну строку
  const materialBlock = isSimplifiedProduct && specs.size_id ? (
    <div className="material-type-density-row">
      <div className="param-group param-group--narrow">
        <label>Тип материала <span style={{ color: 'var(--danger, #c53030)' }}>*</span></label>
        {loadingMaterials ? (
          <div className="form-control" style={{ color: '#666' }}>Загрузка...</div>
        ) : materialTypesFromMaterials.length === 0 ? (
          <div className="form-control" style={{ color: '#666' }}>Нет разрешённых материалов</div>
        ) : (
          <select
            value={selectedMaterialType}
            onChange={(e) => {
              userChoseTypeRef.current = true;
              setSelectedMaterialType(e.target.value);
            }}
            className="form-control"
            required
            title={selectedMaterialType || undefined}
          >
            {materialTypesFromMaterials.map(typeName => (
              <option key={typeName} value={typeName}>{typeName}</option>
            ))}
          </select>
        )}
      </div>
      <div className="param-group param-group--narrow">
        <label>Плотность <span style={{ color: 'var(--danger, #c53030)' }}>*</span></label>
        {loadingMaterials ? (
          <div className="form-control" style={{ color: '#666' }}>Загрузка...</div>
        ) : allowedMaterialsForSize.length === 0 ? (
          <div className="alert alert-warning"><small><AppIcon name="warning" size="xs" /> Для размера нет разрешённых материалов. Добавьте материалы в шаблоне продукта (редактор шаблона → Материалы).</small></div>
        ) : densitiesForSelectedType.length === 0 ? (
          <div className="alert alert-warning" style={{ margin: 0 }}>
            <small><AppIcon name="warning" size="xs" /> У разрешённых для этого размера материалов не заполнено числовое поле «Плотность» (г/м²) в карточке материала на складе. Обновите карточку и перезагрузите калькулятор при необходимости.</small>
          </div>
        ) : (
          <select
            value={selectedDensity}
            onChange={(e) => {
              userChoseTypeRef.current = true;
              setSelectedDensity(e.target.value ? Number(e.target.value) : '');
            }}
            className="form-control"
            required
            title={selectedDensity ? `${selectedDensity} г/м²` : undefined}
          >
            {densitiesForSelectedType.map(d => (
              <option key={d} value={d}>{d} г/м²</option>
            ))}
          </select>
        )}
      </div>
      <div className="param-group param-group--narrow">
        <label>Материал</label>
        <div className="form-control form-control--readonly" style={{ minHeight: '38px', display: 'flex', alignItems: 'center' }}>
          {materialByTypeAndDensity ? (materialByTypeAndDensity as any).name : '—'}
        </div>
      </div>
      {baseMaterialBlock}
    </div>
  ) : null;

  if (renderMaterialOnly) {
    return materialBlock;
  }

  return (
    <div className="form-section compact">
      <h3><AppIcon name="document" size="xs" /> Материалы</h3>
      {allowedPaperTypes && Array.isArray(allowedPaperTypes) && allowedPaperTypes.length > 0 && !isSimplifiedProduct && (
        <div className="alert alert-info" style={{ fontSize: '0.85em', marginBottom: '1rem' }}>
          <small><AppIcon name="info" size="xs" /> Для этого продукта доступны только выбранные типы бумаги: {allowedPaperTypes.join(', ')}</small>
        </div>
      )}
      {isSimplifiedProduct && !specs.size_id && (
        <div className="alert alert-warning" style={{ fontSize: '0.85em', marginBottom: '1rem' }}>
          <small><AppIcon name="warning" size="xs" /> Сначала выберите размер изделия в разделе "Параметры"</small>
        </div>
      )}
      <div className="materials-grid compact">
        {/* Тип бумаги (скрываем для упрощённых продуктов) */}
        {hasField('paperType') && !isSimplifiedProduct && (
        <div className="param-group param-group--narrow">
          <label>
            {getLabel('paperType', 'Тип бумаги')}
            {isRequired('paperType') && <span style={{ color: 'var(--danger, #c53030)' }}> *</span>}
          </label>
          {loadingPaperTypes ? (
            <div className="form-control" style={{ color: '#666' }}>
              Загрузка типов бумаги...
            </div>
          ) : filteredPaperTypes.length === 0 ? (
            <div className="alert alert-warning">
              <small><AppIcon name="warning" size="xs" /> Нет доступных типов бумаги для этого продукта</small>
            </div>
          ) : (
            <select
              value={specs.paperType}
              onChange={(e) => updateSpecs({ 
                paperType: e.target.value as any,
                paperDensity: getDefaultPaperDensity(e.target.value)
              }, true)} // 🆕 instant для select
              className="form-control"
              required={isRequired('paperType')}
            >
              {filteredPaperTypes.map(paperType => (
                <option key={paperType.name} value={paperType.name}>
                  {paperType.display_name}
                </option>
              ))}
            </select>
          )}
        </div>
        )}

        {/* Плотность бумаги (скрываем для упрощённых продуктов) */}
        {hasField('paperDensity') && !isSimplifiedProduct && (
        <div className="param-group">
          <label>
            {getLabel('paperDensity', 'Плотность')}
            {isRequired('paperDensity') && <span style={{ color: 'var(--danger, #c53030)' }}> *</span>}
          </label>
          {availableDensities.length > 0 ? (
            <select
              value={specs.paperDensity}
              onChange={(e) => updateSpecs({ paperDensity: parseInt(e.target.value) }, true)} // 🆕 instant
              className="form-control"
              required={isRequired('paperDensity')}
            >
              {availableDensities.map(density => {
                const densityInfo = getDensityInfo(density.value);
                const isAvailable = densityInfo?.is_available !== false;
                const price = densityInfo?.price || 0;
                const availableQty = densityInfo?.available_quantity || 0;
                
                return (
                  <option key={density.value} value={density.value} disabled={!isAvailable}>
                    {density.label} {price > 0 ? `(${price.toFixed(2)} BYN/лист)` : ''} {!isAvailable ? '(недоступно)' : ''}
                  </option>
                );
              })}
            </select>
          ) : (
            <div className="alert alert-warning">
              <small>
                <AppIcon name="warning" size="xs" /> Для выбранного типа бумаги нет доступных плотностей в базе данных.
                <br />
                Выберите другой тип бумаги или обратитесь к администратору.
              </small>
            </div>
          )}
        </div>
        )}

        {/* Ламинация (скрываем для упрощённых продуктов) */}
        {hasField('lamination') && !isSimplifiedProduct && (
        <div className="param-group">
          <label>
            {getLabel('lamination', 'Ламинация')}
            {isRequired('lamination') && <span style={{ color: 'var(--danger, #c53030)' }}> *</span>}
          </label>
          <select
            value={specs.lamination}
            onChange={(e) => updateSpecs({ lamination: e.target.value as any }, true)} // 🆕 instant
            className="form-control"
          >
            <option value="none">Без ламинации</option>
            <option value="matte">Матовая</option>
            <option value="glossy">Глянцевая</option>
          </select>
        </div>
        )}

        {/* Материал-основа (заготовка) — для продуктов с allowed_base_material_ids */}
        {hasBaseMaterials && isSimplifiedProduct && specs.size_id && (
          <div className="param-group param-group--narrow">
            <label>Материал-основа (заготовка)</label>
            <select
              value={specs.base_material_id ?? ''}
              onChange={(e) => updateSpecs({ base_material_id: e.target.value ? Number(e.target.value) : undefined }, true)}
              className="form-control"
            >
              <option value="">— Не выбрано —</option>
              {allowedBaseMaterialsForSize.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Тип материала + Плотность + Имя материала в одну строку (из разрешённых для продукта материалов) */}
        {isSimplifiedProduct && specs.size_id && (
          <div className="material-type-density-row" style={{ gridColumn: '1 / -1' }}>
            <div className="param-group param-group--narrow">
              <label>Тип материала <span style={{ color: 'var(--danger, #c53030)' }}>*</span></label>
              {loadingMaterials ? (
                <div className="form-control" style={{ color: '#666' }}>Загрузка...</div>
              ) : materialTypesFromMaterials.length === 0 ? (
                <div className="form-control" style={{ color: '#666' }}>Нет разрешённых материалов</div>
              ) : (
                <select
                  value={selectedMaterialType}
                  onChange={(e) => {
                    userChoseTypeRef.current = true;
                    setSelectedMaterialType(e.target.value);
                  }}
                  className="form-control"
                  required
                  title={selectedMaterialType || undefined}
                >
                  {materialTypesFromMaterials.map(typeName => (
                    <option key={typeName} value={typeName}>{typeName}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="param-group param-group--narrow param-group--material-under-print">
            <label>Плотность <span style={{ color: 'var(--danger, #c53030)' }}>*</span></label>
            {loadingMaterials ? (
              <div className="form-control" style={{ color: '#666' }}>Загрузка...</div>
            ) : allowedMaterialsForSize.length === 0 ? (
              <div className="alert alert-warning"><small><AppIcon name="warning" size="xs" /> Для размера нет разрешённых материалов. Добавьте материалы в шаблоне продукта (редактор шаблона → Материалы).</small></div>
            ) : densitiesForSelectedType.length === 0 ? (
              <div className="alert alert-warning" style={{ margin: 0 }}>
                <small><AppIcon name="warning" size="xs" /> У разрешённых для этого размера материалов не заполнено числовое поле «Плотность» (г/м²) в карточке материала на складе. Обновите карточку и перезагрузите калькулятор при необходимости.</small>
              </div>
            ) : (
              <select
                value={selectedDensity}
                onChange={(e) => {
                  userChoseTypeRef.current = true;
                  setSelectedDensity(e.target.value ? Number(e.target.value) : '');
                }}
                className="form-control"
                required
                title={selectedDensity ? `${selectedDensity} г/м²` : undefined}
              >
                {densitiesForSelectedType.map(d => (
                  <option key={d} value={d}>{d} г/м²</option>
                ))}
              </select>
            )}
            </div>
            <div className="param-group param-group--narrow">
              <label>Материал</label>
              <div className="form-control form-control--readonly" style={{ minHeight: '38px', display: 'flex', alignItems: 'center' }}>
                {materialByTypeAndDensity ? (materialByTypeAndDensity as any).name : '—'}
              </div>
            </div>
          </div>
        )}

        {/* Материал (material_id) - если есть в схеме (для обычных продуктов) */}
        {!isSimplifiedProduct && hasField('material_id') && (() => {
          const materialField = schema?.fields?.find((f: any) => f.name === 'material_id');
          if (!materialField || !Array.isArray(materialField.enum) || materialField.enum.length === 0) {
            return null;
          }

          const isObjectEnum = typeof materialField.enum[0] === 'object' && materialField.enum[0] !== null;
          const value = specs.material_id;

          return (
            <div className="param-group param-group--narrow">
              <label>
                {materialField.label || 'Материал'}
                {materialField.required && <span style={{ color: 'var(--danger, #c53030)' }}> *</span>}
              </label>
              <select
                value={value ? String(value) : ''}
                onChange={(e) => {
                  const newValue = e.target.value ? Number(e.target.value) : undefined;
                  updateSpecs({ material_id: newValue }, true);
                }}
                className="form-control"
                required={materialField.required}
              >
                <option value="">-- Выберите --</option>
                {(() => {
                  // Группируем материалы по типам бумаги
                  if (isObjectEnum) {
                    const grouped = new Map<string, any[]>();
                    
                    materialField.enum.forEach((opt: any) => {
                      const label = opt.label || String(opt.value);
                      let groupName = 'Другие';
                      
                      // Определяем группу по ключевым словам в названии
                      if (label.includes('matt') || label.toLowerCase().includes('полумат')) {
                        groupName = 'Полуматовая';
                      } else if (label.includes('gloss') || label.toLowerCase().includes('мелованн') || label.toLowerCase().includes('глянц')) {
                        groupName = 'Мелованная';
                      } else if (label.toLowerCase().includes('дизайнерск')) {
                        groupName = 'Дизайнерская';
                      } else if (label.toLowerCase().includes('офсет')) {
                        groupName = 'Офсетная';
                      } else if (label.toLowerCase().includes('крафт')) {
                        groupName = 'Крафт';
                      } else if (label.toLowerCase().includes('самоклей')) {
                        groupName = 'Самоклеящаяся';
                      }
                      
                      if (!grouped.has(groupName)) {
                        grouped.set(groupName, []);
                      }
                      grouped.get(groupName)!.push(opt);
                    });
                    
                    // Рендерим с группировкой через optgroup
                    return Array.from(grouped.entries()).map(([groupName, opts]) => (
                      <optgroup key={groupName} label={groupName}>
                        {opts.map((opt: any) => {
                          const optValue = opt.value;
                          const optLabel = opt.label;
                          
                          return (
                            <option key={String(optValue)} value={String(optValue)}>
                              {optLabel}
                            </option>
                          );
                        })}
                      </optgroup>
                    ));
                  }
                  
                  // Обычный рендеринг
                  return materialField.enum.map((opt: any) => {
                    const optValue = isObjectEnum ? opt.value : opt;
                    const optLabel = isObjectEnum ? opt.label : opt;
                    
                    return (
                      <option key={String(optValue)} value={String(optValue)}>
                        {optLabel}
                      </option>
                    );
                  });
                })()}
              </select>
            </div>
          );
        })()}
      </div>

      {/* Информация о доступности и стоимости материалов (только для обычных продуктов) */}
      {!isSimplifiedProduct && specs.paperType && specs.paperDensity && specs.quantity > 0 && (
        <div className="material-info-section">
          <h4><AppIcon name="chart-bar" size="xs" /> Информация о материалах</h4>
          
          {/* Статус проверки доступности */}
          {isCheckingAvailability && (
            <div className="alert alert-info">
              <small><AppIcon name="refresh" size="xs" /> Проверяем доступность материалов...</small>
            </div>
          )}

          {/* Результат проверки доступности */}
          {materialAvailability && !isCheckingAvailability && (
            <div className={`alert ${materialAvailability.available ? 'alert-success' : 'alert-warning'}`}>
              <div className="material-availability">
                <div className="availability-status">
                  <span className="status-icon">
                    {materialAvailability.available ? <AppIcon name="check" size="sm" /> : <AppIcon name="warning" size="sm" />}
                  </span>
                  <span className="status-text">
                    {materialAvailability.available ? 'Материал доступен' : 'Материал недоступен'}
                  </span>
                </div>
                <div className="availability-details">
                  <small>
                    Доступно: {materialAvailability.available_quantity} листов
                    {materialAvailability.message && (
                      <br />
                    )}
                    {materialAvailability.message}
                  </small>
                </div>
              </div>
            </div>
          )}

          {/* Стоимость материалов */}
          {materialCost && materialCost.material_cost != null && materialCost.price_per_sheet != null && (
            <div className="material-cost-info">
              <div className="cost-breakdown">
                <div className="cost-item">
                  <span className="cost-label">Цена за лист:</span>
                  <span className="cost-value">{materialCost.price_per_sheet.toFixed(2)} BYN</span>
                </div>
                <div className="cost-item">
                  <span className="cost-label">Требуется листов:</span>
                  <span className="cost-value">{materialCost.sheets_needed ?? 0} шт</span>
                </div>
                <div className="cost-item total">
                  <span className="cost-label">Стоимость материалов:</span>
                  <span className="cost-value">{materialCost.material_cost.toFixed(2)} BYN</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MaterialsSection;


