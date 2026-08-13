import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AppIcon, MoneyAmount } from '../../ui';
import { checkMaterialAvailability, calculateMaterialCost } from '../../../services/calculatorMaterialService';
import type { CalculationResult } from '../types/calculator.types';
import { getMaterials } from '../../../api';
import {
  buildMaterialSelectionTree,
  findMaterialSelectionPath,
  type WarehouseMaterialOption,
} from '../utils/materialSelectionTree';

function sameMaterialId(a: unknown, b: unknown): boolean {
  if (a == null || b == null || a === '' || b === '') return false;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return String(a) === String(b);
}

function materialRowTotal(m: { total?: number; totalCost?: number } | undefined): number {
  if (!m) return 0;
  const v = m.totalCost ?? m.total;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
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
    /** Полная складская иерархия для CRM: категория → тип → SKU/ширина/плотность. */
    materials?: WarehouseMaterialOption[];
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
  /** УФ-планшет: размер изделия задаётся в UvPrintSection, материалы берём по первому размеру шаблона */
  uvFlatbed?: boolean;
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
  uvFlatbed = false,
}) => {
  const simplifiedSizesSource = Array.isArray(effectiveSizesProp) && effectiveSizesProp.length > 0
    ? effectiveSizesProp
    : schema?.template?.simplified?.sizes;

  const sizeIdForMaterials = useMemo(() => {
    if (specs.size_id != null && specs.size_id !== '') return specs.size_id;
    if (uvFlatbed && Array.isArray(simplifiedSizesSource) && simplifiedSizesSource.length > 0) {
      return simplifiedSizesSource[0].id;
    }
    return undefined;
  }, [specs.size_id, uvFlatbed, simplifiedSizesSource]);

  const isSimplifiedProduct = Boolean(
    simplifiedSizesSource && simplifiedSizesSource.length > 0,
  );

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
    quantity_unit?: string;
    price_unit_label?: string;
    base_material_cost?: number;
  } | null>(null);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [allMaterials, setAllMaterials] = useState<WarehouseMaterialOption[]>([]);
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [selectedMaterialCategoryKey, setSelectedMaterialCategoryKey] = useState('');
  const [selectedWarehouseTypeKey, setSelectedWarehouseTypeKey] = useState('');
  /** Порядковый номер запроса /materials — отбрасываем устаревший ответ при быстрой смене подтипа */
  const materialsFetchGenerationRef = useRef(0);
  const prevMaterialSelectionKeyRef = useRef<string | null>(null);

  // Смена продукта / подтипа: сбрасываем локальный путь по складской иерархии.
  useEffect(() => {
    if (!materialSelectionResetKey) return;
    if (prevMaterialSelectionKeyRef.current === null) {
      prevMaterialSelectionKeyRef.current = materialSelectionResetKey;
      return;
    }
    if (prevMaterialSelectionKeyRef.current === materialSelectionResetKey) return;
    prevMaterialSelectionKeyRef.current = materialSelectionResetKey;
    setSelectedMaterialCategoryKey('');
    setSelectedWarehouseTypeKey('');
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
          const merged = { ...cur };
          for (const key of [
            'density',
            'category_id',
            'category_name',
            'category_color',
            'material_type_id',
            'material_type_name',
            'material_kind',
            'paper_type_id',
            'paper_type_name',
            'sheet_width',
            'sheet_height',
            'printable_width',
            'unit',
          ]) {
            if ((merged[key] == null || merged[key] === '') && (sm as any)[key] != null) {
              merged[key] = (sm as any)[key];
            }
          }
          byId.set(id, merged);
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
    const materials = result?.materials ?? [];
    const sheetMat =
      specs.material_id != null
        ? materials.find((m) => sameMaterialId((m as any).materialId ?? (m as any).material_id, specs.material_id))
        : materials[0];
    const baseMat =
      specs.base_material_id != null
        ? materials.find((m) =>
            sameMaterialId((m as any).materialId ?? (m as any).material_id, specs.base_material_id),
          )
        : undefined;
    const layout = result?.layout as { sheetsNeeded?: number; metersNeeded?: number } | undefined;
    if (!sheetMat || layout == null) return '';
    const sn = layout.sheetsNeeded;
    const mn = layout.metersNeeded;
    if (sn == null && mn == null) return '';
    const sm = sheetMat as { total?: number; totalCost?: number; unitPrice?: number; price?: number };
    const bm = baseMat as { total?: number; totalCost?: number } | undefined;
    return [
      materialRowTotal(sm),
      sm.unitPrice ?? sm.price ?? '',
      materialRowTotal(bm),
      sn ?? '',
      mn ?? '',
    ].join('|');
  }, [
    result?.materials,
    specs.material_id,
    specs.base_material_id,
    result?.layout?.sheetsNeeded,
    (result?.layout as any)?.metersNeeded,
  ]);

  // Проверяем доступность и fallback-стоимость при смене параметров (без зависимости от result)
  useEffect(() => {
    if (isSimplifiedProduct) {
      if (specs.material_id && specs.quantity > 0) {
        void calculateCost();
      }
      return;
    }
    if (specs.paperType && specs.paperDensity && specs.quantity > 0) {
      checkAvailability();
      void calculateCost();
    }
  }, [
    isSimplifiedProduct,
    specs.material_id,
    specs.paperType,
    specs.paperDensity,
    specs.quantity,
    specs.sides,
  ]);

  // Когда с бэкенда пришёл новый расчёт — обновляем блок стоимости из result без повторного цикла по ссылке result
  useEffect(() => {
    if (!resultMaterialFingerprint || specs.quantity <= 0) return;
    if (isSimplifiedProduct) {
      if (!specs.material_id) return;
    } else if (!specs.paperType || !specs.paperDensity) {
      return;
    }
    void calculateCost();
  }, [
    resultMaterialFingerprint,
    isSimplifiedProduct,
    specs.material_id,
    specs.paperType,
    specs.paperDensity,
    specs.quantity,
  ]);

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
      if (
        result?.materials &&
        result.materials.length > 0 &&
        (result.layout?.sheetsNeeded != null || (result.layout as { metersNeeded?: number } | undefined)?.metersNeeded != null)
      ) {
        const sheetMaterial =
          specs.material_id != null
            ? result.materials.find((m) =>
                sameMaterialId((m as any).materialId ?? (m as any).material_id, specs.material_id),
              )
            : result.materials[0];
        const baseMaterial =
          specs.base_material_id != null
            ? result.materials.find((m) =>
                sameMaterialId((m as any).materialId ?? (m as any).material_id, specs.base_material_id),
              )
            : undefined;

        if (!sheetMaterial) return;

        const sheetsNeededRaw = result.layout?.sheetsNeeded;
        const metersNeededRaw = (result.layout as { metersNeeded?: number } | undefined)?.metersNeeded;
        const hasMeters = metersNeededRaw != null && Number.isFinite(Number(metersNeededRaw)) && Number(metersNeededRaw) > 0;
        const quantityForWriteoff = hasMeters ? Number(metersNeededRaw) : Number(sheetsNeededRaw ?? 0);
        const quantityUnit = hasMeters ? 'п.м.' : 'шт';
        const priceUnitLabel = hasMeters ? 'Цена за пог. м:' : (uvFlatbed ? 'Цена за заготовку:' : 'Цена за лист:');
        const pricePerSheet = Number(
          (sheetMaterial as any).unitPrice ?? (sheetMaterial as any).price ?? 0,
        );
        const sheetCost = materialRowTotal(sheetMaterial as { total?: number; totalCost?: number });
        const baseCost = materialRowTotal(baseMaterial as { total?: number; totalCost?: number } | undefined);
        const totalMaterialCost = sheetCost + baseCost;

        if (
          Number.isFinite(pricePerSheet) &&
          Number.isFinite(quantityForWriteoff) &&
          Number.isFinite(totalMaterialCost)
        ) {
          setMaterialCost({
            material_cost: totalMaterialCost,
            sheets_needed: quantityForWriteoff,
            price_per_sheet: pricePerSheet,
            quantity_unit: quantityUnit,
            price_unit_label: priceUnitLabel,
            ...(baseCost > 0 ? { base_material_cost: baseCost } : {}),
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

  // 🆕 Получаем разрешённые материалы для выбранного размера
  // Важно: порядок как в шаблоне (allowed_material_ids), а не порядок строк в ответе /materials —
  // иначе дефолт «первый тип / первая плотность» уезжает на чужой тип (например DTF), если он раньше в API.
  const allowedMaterialsForSize = useMemo(() => {
    if (!isSimplifiedProduct || !sizeIdForMaterials) return [];

    const selectedSize = simplifiedSizesSource?.find((s: any) => String(s.id) === String(sizeIdForMaterials));
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
  }, [isSimplifiedProduct, sizeIdForMaterials, simplifiedSizesSource, allMaterials]);

  // 🆕 Разрешённые материалы-основы (заготовки) для выбранного размера — порядок как в шаблоне
  const allowedBaseMaterialsForSize = useMemo(() => {
    if (!isSimplifiedProduct || !sizeIdForMaterials) return [];
    const selectedSize = simplifiedSizesSource?.find((s: any) => String(s.id) === String(sizeIdForMaterials)) as { allowed_base_material_ids?: number[] } | undefined;
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
  }, [isSimplifiedProduct, sizeIdForMaterials, simplifiedSizesSource, allMaterials]);

  const materialSelectionTree = useMemo(
    () => buildMaterialSelectionTree(allowedMaterialsForSize),
    [allowedMaterialsForSize],
  );
  const currentMaterialPath = useMemo(
    () => findMaterialSelectionPath(materialSelectionTree, specs.material_id),
    [materialSelectionTree, specs.material_id],
  );
  const selectedMaterialCategory = useMemo(
    () => materialSelectionTree.find((category) => category.key === selectedMaterialCategoryKey)
      ?? materialSelectionTree.find((category) => category.key === currentMaterialPath?.categoryKey)
      ?? materialSelectionTree[0],
    [currentMaterialPath?.categoryKey, materialSelectionTree, selectedMaterialCategoryKey],
  );
  const selectedWarehouseType = useMemo(
    () => selectedMaterialCategory?.types.find((type) => type.key === selectedWarehouseTypeKey)
      ?? selectedMaterialCategory?.types.find((type) => type.key === currentMaterialPath?.typeKey)
      ?? selectedMaterialCategory?.types[0],
    [currentMaterialPath?.typeKey, selectedMaterialCategory, selectedWarehouseTypeKey],
  );
  const resolveSpecsMaterialType = useCallback((material: WarehouseMaterialOption): string | undefined => {
    const paperTypeName = String(material.paper_type_name || '').trim();
    const paperType = paperTypeName
      ? warehousePaperTypes.find((item) => (
        item.display_name === paperTypeName || item.name === paperTypeName
      ))
      : undefined;
    return paperType?.name
      || String(material.material_type_name || '').trim()
      || paperTypeName
      || undefined;
  }, [warehousePaperTypes]);
  const applyWarehouseMaterial = useCallback((material: WarehouseMaterialOption) => {
    const materialType = resolveSpecsMaterialType(material);
    updateSpecs({
      material_id: Number(material.id),
      materialType: materialType as any,
    }, true);
  }, [resolveSpecsMaterialType, updateSpecs]);

  // Единственная синхронизация внешнего material_id с локальным путём выбора.
  // Если сохранённый материал больше не разрешён, выбираем первый доступный SKU.
  useEffect(() => {
    if (!isSimplifiedProduct || !sizeIdForMaterials || materialSelectionTree.length === 0) return;
    const path = findMaterialSelectionPath(materialSelectionTree, specs.material_id);
    if (path) {
      setSelectedMaterialCategoryKey((current) => (
        current === path.categoryKey ? current : path.categoryKey
      ));
      setSelectedWarehouseTypeKey((current) => (
        current === path.typeKey ? current : path.typeKey
      ));
      const currentMaterial = allowedMaterialsForSize.find((material) => Number(material.id) === path.materialId);
      const materialType = currentMaterial ? resolveSpecsMaterialType(currentMaterial) : undefined;
      if (specs.materialType !== materialType) {
        updateSpecs({ materialType: materialType as any }, true);
      }
      return;
    }

    const firstCategory = materialSelectionTree[0];
    const firstType = firstCategory?.types[0];
    const firstMaterial = firstType?.materials[0];
    if (!firstCategory || !firstType || !firstMaterial) return;
    setSelectedMaterialCategoryKey(firstCategory.key);
    setSelectedWarehouseTypeKey(firstType.key);
    if (Number(specs.material_id) !== Number(firstMaterial.id)) {
      applyWarehouseMaterial(firstMaterial);
    }
  }, [
    allowedMaterialsForSize,
    applyWarehouseMaterial,
    isSimplifiedProduct,
    materialSelectionTree,
    resolveSpecsMaterialType,
    sizeIdForMaterials,
    specs.material_id,
    specs.materialType,
    updateSpecs,
  ]);

  // Сбрасываем base_material_id, если он не входит в разрешённые для выбранного размера
  useEffect(() => {
    if (isSimplifiedProduct && sizeIdForMaterials && specs.base_material_id && allowedBaseMaterialsForSize.length > 0) {
      const isAllowed = allowedBaseMaterialsForSize.some(m => Number(m.id) === specs.base_material_id);
      if (!isAllowed) {
        updateSpecs({ base_material_id: undefined }, true);
      }
    }
  }, [isSimplifiedProduct, sizeIdForMaterials, specs.base_material_id, allowedBaseMaterialsForSize, updateSpecs]);

  // Продукт без материалов (нет paperType в схеме и не упрощённый с размерами/материалами) — не показываем секцию
  const usesMaterials = hasField('paperType') || isSimplifiedProduct;
  if (!usesMaterials) {
    return null;
  }

  // Блок «Материал-основа» (заготовка) — показываем, если у размера есть allowed_base_material_ids
  const hasBaseMaterials = allowedBaseMaterialsForSize.length > 0;
  const baseMaterialBlock = isSimplifiedProduct && sizeIdForMaterials && hasBaseMaterials ? (
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

  // Упрощённые продукты: категория склада → тип материала → конкретный вариант.
  // Для рулона вариантом является ширина, для бумаги — плотность.
  const materialBlock = isSimplifiedProduct && sizeIdForMaterials ? (
    <div className="material-type-density-row">
      <div className="param-group param-group--narrow">
        <label>Категория материала <span style={{ color: 'var(--danger, #c53030)' }}>*</span></label>
        {loadingMaterials ? (
          <div className="form-control" style={{ color: '#666' }}>Загрузка...</div>
        ) : materialSelectionTree.length === 0 ? (
          <div className="form-control" style={{ color: '#666' }}>Нет разрешённых материалов</div>
        ) : (
          <select
            value={selectedMaterialCategory?.key ?? ''}
            onChange={(e) => {
              const category = materialSelectionTree.find((item) => item.key === e.target.value);
              const type = category?.types[0];
              const material = type?.materials[0];
              if (!category || !type || !material) return;
              setSelectedMaterialCategoryKey(category.key);
              setSelectedWarehouseTypeKey(type.key);
              applyWarehouseMaterial(material);
            }}
            className="form-control"
            required
          >
            {materialSelectionTree.map((category) => (
              <option key={category.key} value={category.key}>{category.label}</option>
            ))}
          </select>
        )}
      </div>

      <div className="param-group param-group--narrow">
        <label>Тип материала <span style={{ color: 'var(--danger, #c53030)' }}>*</span></label>
        {loadingMaterials ? (
          <div className="form-control" style={{ color: '#666' }}>Загрузка...</div>
        ) : !selectedMaterialCategory || selectedMaterialCategory.types.length === 0 ? (
          <div className="alert alert-warning"><small><AppIcon name="warning" size="xs" /> Для размера нет разрешённых материалов. Добавьте материалы в шаблоне продукта (редактор шаблона → Материалы).</small></div>
        ) : (
          <select
            value={selectedWarehouseType?.key ?? ''}
            onChange={(e) => {
              const type = selectedMaterialCategory.types.find((item) => item.key === e.target.value);
              const material = type?.materials[0];
              if (!type || !material) return;
              setSelectedWarehouseTypeKey(type.key);
              applyWarehouseMaterial(material);
            }}
            className="form-control"
            required
          >
            {selectedMaterialCategory.types.map((type) => (
              <option key={type.key} value={type.key}>{type.label}</option>
            ))}
          </select>
        )}
      </div>

      <div className="param-group param-group--narrow">
        <label>
          {selectedWarehouseType?.variantLabel ?? 'Материал'}
          <span style={{ color: 'var(--danger, #c53030)' }}> *</span>
        </label>
        {loadingMaterials ? (
          <div className="form-control" style={{ color: '#666' }}>Загрузка...</div>
        ) : !selectedWarehouseType || selectedWarehouseType.materials.length === 0 ? (
          <div className="form-control" style={{ color: '#666' }}>Нет вариантов материала</div>
        ) : (
          <select
            value={currentMaterialPath?.typeKey === selectedWarehouseType.key ? Number(specs.material_id) : Number(selectedWarehouseType.materials[0].id)}
            onChange={(e) => {
              const material = selectedWarehouseType.materials.find((item) => Number(item.id) === Number(e.target.value));
              if (material) applyWarehouseMaterial(material);
            }}
            className="form-control"
            required
          >
            {selectedWarehouseType.materials.map((material) => (
              <option key={material.id} value={material.id}>{material.optionLabel}</option>
            ))}
          </select>
        )}
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
      {isSimplifiedProduct && !sizeIdForMaterials && (
        <div className="alert alert-warning" style={{ fontSize: '0.85em', marginBottom: '1rem' }}>
          <small>
            <AppIcon name="warning" size="xs" />{' '}
            {uvFlatbed
              ? 'Для выбора материала настройте разрешённые материалы в шаблоне продукта'
              : 'Сначала выберите размер изделия в разделе "Параметры"'}
          </small>
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
                    {density.label} {price > 0 ? `(${price.toFixed(2)}/лист)` : ''} {!isAvailable ? '(недоступно)' : ''}
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

        {/* Универсальная складская иерархия для упрощённых продуктов. */}
        {isSimplifiedProduct && sizeIdForMaterials && (
          <div style={{ gridColumn: '1 / -1' }}>
            {materialBlock}
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

      {/* Упрощённые / УФ: списание листов из последнего расчёта */}
      {isSimplifiedProduct && specs.material_id && specs.quantity > 0 && materialCost && (
        <div className="material-info-section material-info-section--simplified">
          <div className="material-cost-info">
            <div className="cost-breakdown">
              <div className="cost-item">
                <span className="cost-label">{materialCost.price_unit_label ?? (uvFlatbed ? 'Цена за заготовку:' : 'Цена за лист:')}</span>
                <span className="cost-value"><MoneyAmount value={materialCost.price_per_sheet} /></span>
              </div>
              <div className="cost-item">
                <span className="cost-label">
                  {materialCost.quantity_unit === 'п.м.'
                    ? 'Списание (пог. м материала):'
                    : uvFlatbed
                      ? 'Списание (заготовок):'
                      : 'Списание (листов материала):'}
                </span>
                <span className="cost-value">{materialCost.sheets_needed ?? 0} {materialCost.quantity_unit ?? 'шт'}</span>
              </div>
              {materialCost.base_material_cost != null && materialCost.base_material_cost > 0 && (
                <div className="cost-item">
                  <span className="cost-label">Заготовка (основа):</span>
                  <span className="cost-value"><MoneyAmount value={materialCost.base_material_cost} /></span>
                </div>
              )}
              <div className="cost-item total">
                <span className="cost-label">Стоимость материала:</span>
                <span className="cost-value"><MoneyAmount value={materialCost.material_cost} /></span>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  <span className="cost-value"><MoneyAmount value={materialCost.price_per_sheet} /></span>
                </div>
                <div className="cost-item">
                  <span className="cost-label">Требуется листов:</span>
                  <span className="cost-value">{materialCost.sheets_needed ?? 0} шт</span>
                </div>
                <div className="cost-item total">
                  <span className="cost-label">Стоимость материалов:</span>
                  <span className="cost-value"><MoneyAmount value={materialCost.material_cost} /></span>
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


