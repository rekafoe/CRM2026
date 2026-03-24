import { useReducer } from 'react'

export type PriceRule = { min_qty: number; max_qty?: number; unit_price?: number; discount_percent?: number }

// Диапазон тиража с ценой за 1 ед.
export type SimplifiedQtyTier = { 
  min_qty: number; 
  max_qty?: number; 
  unit_price: number; // цена за 1 ед. для этого диапазона
}
export type SimplifiedPrintKey = { technology_code: string; color_mode: 'color' | 'bw'; sides_mode: 'single' | 'duplex' | 'duplex_bw_back' }
export type SimplifiedPrintPrice = SimplifiedPrintKey & { tiers: SimplifiedQtyTier[] }
export type SimplifiedMaterialPrice = { material_id: number; tiers: SimplifiedQtyTier[] }
export type SimplifiedFinishingPrice = {
  service_id: number;
  price_unit: 'per_sheet' | 'per_cut' | 'per_item' | 'fixed' | 'per_order';
  units_per_item: number; // для per_item/per_cut — на изделие; для per_sheet в расчёте не умножает листы (см. бэкенд)
  // ✅ tiers больше не храним в шаблоне - цены берутся из централизованной системы услуг
  // tiers оставлен только для обратной совместимости со старыми данными
  tiers?: SimplifiedQtyTier[]; // Опционально, только для чтения старых данных
  // 🆕 Поля для сложных операций с подтипами (например, ламинация)
  variant_id?: number; // ID варианта услуги (типа, например "Рулонная" или "Пакетная")
  subtype?: string; // Название подтипа (например, "глянец 32 мк")
  variant_name?: string; // Название варианта (типа, например "Рулонная")
  density?: string; // Плотность подтипа (например, "32 мк")
}
export type SimplifiedPagesConfig = {
  options: number[];
  default?: number;
}
export type SimplifiedSizeConfig = {
  id: number | string;
  label: string;
  width_mm: number;
  height_mm: number;
  min_qty?: number;
  max_qty?: number;
  /** Отступ под резку (мм) с каждой стороны. По умолчанию 5 мм. Для плоттерной резки — 15 мм. */
  cut_margin_mm?: number;
  /** Зазор между стикерами при раскладке (мм). По умолчанию 2 мм. */
  cut_gap_mm?: number;
  /** Ручная норма вместимости (шт/лист). Если задана — перекрывает автоматический расчёт через cut_margin_mm / cut_gap_mm. */
  items_per_sheet_override?: number;
  default_print?: Partial<SimplifiedPrintKey>;
  print_prices: SimplifiedPrintPrice[];
  allowed_material_ids: number[];
  /** Если true — размер использует свой список материалов; иначе — общие материалы типа (common_allowed_material_ids) */
  use_own_materials?: boolean;
  /** Материалы-основы (заготовки): футболки, кружки и т.п. — расход 1 шт на изделие */
  allowed_base_material_ids?: number[];
  material_prices: SimplifiedMaterialPrice[];
  finishing: SimplifiedFinishingPrice[];
}

export type ProductTypeId = number;

/** Тип продукта внутри одного продукта (например «Односторонние», «Дизайнерские») — свой набор полей и цен */
export type ProductTypeVariant = {
  id: ProductTypeId;
  name: string;
  /** Имена полей калькулятора для этого типа (опционально; если пусто — все поля из схемы) */
  fieldNames?: string[];
  default?: boolean;
  /** Краткое описание для сайта (одна строка) */
  briefDescription?: string;
  /** Полное описание для страницы продукта на сайте */
  fullDescription?: string;
  /** Характеристики (список) */
  characteristics?: string[];
  /** Преимущества (список) */
  advantages?: string[];
  /** URL изображения подтипа для сайта */
  image_url?: string;
}

/** Предвыбранная операция для подтипа */
export type InitialOperation = {
  operation_id: number;
  variant_id?: number;
  subtype?: string;
}

/** Начальные значения калькулятора для подтипа (опционально; если поле не задано — авто-определение) */
export type SubtypeInitialDefaults = {
  size_id?: number | string;
  quantity?: number;
  material_id?: number;
  /** Материал-основа (заготовка): футболка, кружка — 1 шт на изделие */
  base_material_id?: number;
  sides_mode?: 'single' | 'duplex' | 'duplex_bw_back';
  /** Код технологии печати (digital_toner, offset и т.д.) */
  print_technology?: string;
  /** Режим цвета */
  color_mode?: 'color' | 'bw';
  /** Предвыбранные операции (ламинация, скругление и т.д. — берутся из finishing) */
  operations?: InitialOperation[];
  /** Резка стопой включена по умолчанию */
  cutting?: boolean;
  /** Резка обязательна (всегда включена, чекбокс недоступен) */
  cutting_required?: boolean;
  /** Фальцовка включена по умолчанию */
  folding?: boolean;
  /** Скругление углов включено по умолчанию */
  roundCorners?: boolean;
}

/** Конфиг одного типа: размеры и цены (печать, материалы, отделка) */
export type SimplifiedTypeConfig = {
  sizes: SimplifiedSizeConfig[];
  /** Общие материалы типа: используются всеми размерами, у которых use_own_materials !== true */
  common_allowed_material_ids?: number[];
  pages?: SimplifiedPagesConfig;
  initial?: SubtypeInitialDefaults;
}

/**
 * Упрощённый конфиг продукта.
 * — Legacy: только sizes (и pages) — один «виртуальный» тип.
 * — С типами: types[] + typeConfigs[typeId] — у каждого типа свои размеры и цены.
 */
export type SimplifiedConfig = {
  sizes: SimplifiedSizeConfig[];
  pages?: SimplifiedPagesConfig;
  /** Типы продукта (варианты): если заданы, у каждого типа свой конфиг в typeConfigs */
  types?: ProductTypeVariant[];
  /** Конфиг по типам: typeId -> размеры и цены */
  typeConfigs?: Record<string, SimplifiedTypeConfig>;
  /** Включить опцию «Резка» в калькуляторе: считает резы по раскладке (sheetsNeeded × cutsPerSheet), а не по тиражу */
  cutting?: boolean;
  /** Для двухсторонней печати считать как (односторонняя + материал) ×2, но списание материала не удваивать */
  duplex_as_single_x2?: boolean;
  /** Учитывать раскладку на лист: при false — 1 изделие на лист, без оптимизации (для крупноформатных и т.п.) */
  use_layout?: boolean;
  /** Учитывать стоимость материалов в итоговой цене: false = materialPrice не добавляется */
  include_material_cost?: boolean;
}

function toTypeConfigKey(id: ProductTypeId): string {
  return String(id);
}

function parseLegacyTypeId(id: unknown, fallbackIndex: number): ProductTypeId {
  if (typeof id === 'number' && Number.isFinite(id)) return Math.trunc(id);
  if (typeof id === 'string') {
    const numeric = Number(id);
    if (Number.isFinite(numeric)) return Math.trunc(numeric);
  }
  return Date.now() + fallbackIndex;
}

function normalizeSimplifiedTypeIds(value: SimplifiedConfig): SimplifiedConfig {
  if (!Array.isArray(value.types) || value.types.length === 0) return value;

  const idMap = new Map<string, ProductTypeId>();
  const normalizedTypes = value.types.map((t, index) => {
    const nextId = parseLegacyTypeId((t as any).id, index + 1);
    idMap.set(String((t as any).id), nextId);
    return { ...t, id: nextId };
  });

  const normalizedTypeConfigs: Record<string, SimplifiedTypeConfig> = {};
  if (value.typeConfigs && typeof value.typeConfigs === 'object') {
    for (const [oldKey, cfg] of Object.entries(value.typeConfigs)) {
      const mapped = idMap.get(String(oldKey));
      normalizedTypeConfigs[mapped != null ? toTypeConfigKey(mapped) : String(oldKey)] = cfg as SimplifiedTypeConfig;
    }
  }

  return {
    ...value,
    types: normalizedTypes,
    typeConfigs: normalizedTypeConfigs,
  };
}

export interface TemplateState {
  meta: { name: string; description: string; icon: string; operator_percent: string; category_id?: number }
  trim_size: { width: string; height: string }
  print_sheet: { preset: 'SRA3' | 'A3' | 'А4' | '' ; width: string; height: string }
  constraints: {
    materials: {
      allowedCategoriesCsv: string
      densityMin: string
      densityMax: string
      finishesCsv: string
      onlyPaper: boolean
    }
    overrides: {
      includeIds: number[] // Старое поле для обратной совместимости
      allowedPaperTypes: string[] // Новое поле для типов бумаги из склада
      allowedPriceTypes: string[] // Разрешённые типы цен (standard, online и др.)
    }
  }
  finishing: Array<{ name: string }>
  packaging: Array<{ name: string }>
  print_run: { enabled: boolean; min: number | ''; max: number | '' }
  price_rules: PriceRule[]
  simplified: SimplifiedConfig
  test: { qty: number; params: Record<string, any>; paramsJson: string }
}

type Action =
  | { type: 'setTrim'; field: 'width' | 'height'; value: string }
  | { type: 'reset' }
  | { type: 'setMeta'; patch: Partial<TemplateState['meta']> }
  | { type: 'setFinishing'; value: Array<{ name: string }> }
  | { type: 'setPackaging'; value: Array<{ name: string }> }
  | { type: 'setRun'; patch: Partial<TemplateState['print_run']> }
  | { type: 'setPrintSheet'; patch: Partial<TemplateState['print_sheet']> }
  | { type: 'setMaterialsConstraints'; patch: Partial<TemplateState['constraints']['materials']> }
  | { type: 'setOverrides'; patch: Partial<TemplateState['constraints']['overrides']> }
  | { type: 'setRules'; value: PriceRule[] }
  | { type: 'setSimplified'; value: SimplifiedConfig }
  | { type: 'addRule'; rule: PriceRule }
  | { type: 'updateRule'; index: number; patch: Partial<PriceRule> }
  | { type: 'removeRule'; index: number }
  | { type: 'setTestQty'; value: number }
  | { type: 'setTestParams'; value: Record<string, any> }
  | { type: 'setTestJson'; value: string }

function reducer(state: TemplateState, action: Action): TemplateState {
  switch (action.type) {
    case 'reset':
      return useProductTemplateInitial()
    case 'setTrim':
      return { ...state, trim_size: { ...state.trim_size, [action.field]: action.value } }
    case 'setMeta':
      return { ...state, meta: { ...state.meta, ...action.patch } }
    case 'setFinishing':
      return { ...state, finishing: action.value }
    case 'setPrintSheet':
      return { ...state, print_sheet: { ...state.print_sheet, ...action.patch } }
    case 'setMaterialsConstraints':
      return { ...state, constraints: { ...state.constraints, materials: { ...state.constraints.materials, ...action.patch } } }
    case 'setOverrides':
      return { ...state, constraints: { ...state.constraints, overrides: { ...state.constraints.overrides, ...action.patch } } }
    case 'setPackaging':
      return { ...state, packaging: action.value }
    case 'setRun':
      return { ...state, print_run: { ...state.print_run, ...action.patch } }
    case 'setRules':
      return { ...state, price_rules: action.value }
    case 'setSimplified':
      return { ...state, simplified: normalizeSimplifiedTypeIds(action.value) }
    case 'addRule':
      return { ...state, price_rules: [...state.price_rules, action.rule] }
    case 'updateRule':
      return { ...state, price_rules: state.price_rules.map((r, i) => (i === action.index ? { ...r, ...action.patch } : r)) }
    case 'removeRule':
      return { ...state, price_rules: state.price_rules.filter((_, i) => i !== action.index) }
    case 'setTestQty':
      return { ...state, test: { ...state.test, qty: action.value } }
    case 'setTestParams':
      return { ...state, test: { ...state.test, params: action.value, paramsJson: JSON.stringify(action.value) } }
    case 'setTestJson':
      return { ...state, test: { ...state.test, paramsJson: action.value } }
    default:
      return state
  }
}

export function useProductTemplateInitial(): TemplateState {
  return {
    meta: { name: '', description: '', icon: '', operator_percent: '' },
    trim_size: { width: '', height: '' },
    print_sheet: { preset: '', width: '', height: '' },
    constraints: {
      materials: { allowedCategoriesCsv: '', densityMin: '', densityMax: '', finishesCsv: '', onlyPaper: true },
      overrides: { includeIds: [], allowedPaperTypes: [], allowedPriceTypes: ['standard', 'online'] }
    },
    finishing: [],
    packaging: [],
    print_run: { enabled: false, min: '', max: '' },
    price_rules: [],
    simplified: { sizes: buildDefaultSizes(), pages: { options: [] }, duplex_as_single_x2: false, include_material_cost: true },
    test: { qty: 100, params: {}, paramsJson: '{}' }
  }
}

/** Сортировка размеров от меньшего к большему по площади (ширина×высота), затем по ширине, затем по высоте */
export function sortSizesByArea(sizes: SimplifiedSizeConfig[]): SimplifiedSizeConfig[] {
  return [...sizes].sort((a, b) => {
    if ((a.width_mm ?? 0) !== (b.width_mm ?? 0)) return (a.width_mm ?? 0) - (b.width_mm ?? 0)
    return (a.height_mm ?? 0) - (b.height_mm ?? 0)
  })
}

/** Конфиг текущего типа или legacy (sizes/pages из корня) */
export function getEffectiveConfig(value: SimplifiedConfig, selectedTypeId: ProductTypeId | null): SimplifiedTypeConfig {
  if (value.types?.length && value.typeConfigs && selectedTypeId) {
    return value.typeConfigs[toTypeConfigKey(selectedTypeId)] ?? { sizes: [], pages: value.pages }
  }
  return { sizes: value.sizes, pages: value.pages }
}

/** Эффективный список разрешённых материалов для размера: свои или общие типа (по флагу use_own_materials) */
export function getEffectiveAllowedMaterialIds(typeConfig: SimplifiedTypeConfig, size: SimplifiedSizeConfig): number[] {
  const common = typeConfig.common_allowed_material_ids
  if (size.use_own_materials === true) return size.allowed_material_ids ?? []
  if (size.use_own_materials === false) return common ?? []
  return (common != null && common.length > 0) ? common : (size.allowed_material_ids ?? [])
}

export function generateTypeId(): ProductTypeId {
  return Date.now() + Math.floor(Math.random() * 1000)
}

export function generateSizeId(): number {
  return Date.now() + Math.floor(Math.random() * 1000)
}

/** Стандартные диапазоны тиража: 1, 5, 10, 50, 100, 500, 1000 */
const DEFAULT_TIER_BOUNDARIES = [1, 5, 10, 50, 100, 500, 1000]

function buildDefaultPrintTiers(): SimplifiedQtyTier[] {
  const tiers: SimplifiedQtyTier[] = []
  for (let i = 0; i < DEFAULT_TIER_BOUNDARIES.length; i++) {
    const min_qty = DEFAULT_TIER_BOUNDARIES[i]
    const max_qty = i < DEFAULT_TIER_BOUNDARIES.length - 1
      ? DEFAULT_TIER_BOUNDARIES[i + 1] - 1
      : undefined
    tiers.push({ min_qty, max_qty, unit_price: 0 })
  }
  return tiers
}

/** Лазерный профессиональный — тип печати по умолчанию для подтипа (laser_prof или laser_sheet) */
const DEFAULT_PRINT_TECHNOLOGY = 'laser_prof'

function buildDefaultPrintPrices(): SimplifiedPrintPrice[] {
  const tiers = buildDefaultPrintTiers()
  return [
    { technology_code: DEFAULT_PRINT_TECHNOLOGY, color_mode: 'color', sides_mode: 'single', tiers: [...tiers] },
    { technology_code: DEFAULT_PRINT_TECHNOLOGY, color_mode: 'color', sides_mode: 'duplex', tiers: [...tiers] },
    { technology_code: DEFAULT_PRINT_TECHNOLOGY, color_mode: 'bw', sides_mode: 'single', tiers: [...tiers] },
    { technology_code: DEFAULT_PRINT_TECHNOLOGY, color_mode: 'bw', sides_mode: 'duplex', tiers: [...tiers] },
  ]
}

/** Стандартные размеры: A4, A5, A6 */
const DEFAULT_SIZES_SPEC: Array<{ label: string; width_mm: number; height_mm: number }> = [
  { label: 'A4', width_mm: 210, height_mm: 297 },
  { label: 'A5', width_mm: 148, height_mm: 210 },
  { label: 'A6', width_mm: 105, height_mm: 148 },
]

export function buildDefaultSizes(): SimplifiedSizeConfig[] {
  const printPrices = buildDefaultPrintPrices()
  return DEFAULT_SIZES_SPEC.map((spec) => ({
    id: generateSizeId(),
    label: spec.label,
    width_mm: spec.width_mm,
    height_mm: spec.height_mm,
    print_prices: printPrices.map((p) => ({
      ...p,
      tiers: p.tiers.map((t) => ({ ...t })),
    })),
    allowed_material_ids: [],
    material_prices: [],
    finishing: [],
  }))
}

export default function useProductTemplate() {
  return useReducer(reducer, undefined as unknown as TemplateState, useProductTemplateInitial)
}


