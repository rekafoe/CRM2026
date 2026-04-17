import { getDb } from '../../../db';
import { ProductServiceLinkDTO } from '../dtos/serviceLink.dto';

export type TemplateConfigRow = {
  id: number;
  product_id: number;
  name: string;
  config_data?: string | null;
  constraints?: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
};

export const toServiceLinkResponse = (link: ProductServiceLinkDTO) => ({
  link_id: link.id,
  id: link.id,
  product_id: link.productId,
  productId: link.productId,
  service_id: link.serviceId,
  serviceId: link.serviceId,
  is_required: link.isRequired,
  isRequired: link.isRequired,
  default_quantity: link.defaultQuantity,
  defaultQuantity: link.defaultQuantity,
  service_name: link.service?.name ?? null,
  serviceName: link.service?.name ?? null,
  service_type: link.service?.type ?? null,
  serviceType: link.service?.type ?? null,
  unit: link.service?.unit ?? null,
  price_per_unit: link.service?.rate ?? null,
  rate: link.service?.rate ?? null,
  is_active: link.service?.isActive ?? true,
  isActive: link.service?.isActive ?? true,
});

export function parseSubproductTypeId(raw: unknown, fallbackIndex: number): number {
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return Math.trunc(numeric);
  return fallbackIndex;
}

export function normalizeSimplifiedTypeIds(simplified: any): any {
  if (!simplified || !Array.isArray(simplified.types) || simplified.types.length === 0) return simplified || null;

  const idMap = new Map<string, number>();
  const normalizedTypes = simplified.types.map((t: any, index: number) => {
    const nextId = parseSubproductTypeId(t?.id, index + 1);
    idMap.set(String(t?.id), nextId);
    return { ...t, id: nextId };
  });

  const normalizedTypeConfigs: Record<string, any> = {};
  const sourceTypeConfigs =
    simplified.typeConfigs && typeof simplified.typeConfigs === 'object'
      ? simplified.typeConfigs
      : {};
  for (const [oldKey, cfg] of Object.entries(sourceTypeConfigs)) {
    const mapped = idMap.get(String(oldKey));
    normalizedTypeConfigs[String(mapped ?? oldKey)] = cfg;
  }

  return {
    ...simplified,
    types: normalizedTypes,
    typeConfigs: normalizedTypeConfigs,
  };
}

export function normalizeConfigDataForPersistence(configData: any): any {
  if (typeof configData === 'string') {
    try {
      const parsed = JSON.parse(configData);
      return normalizeConfigDataForPersistence(parsed);
    } catch {
      return configData;
    }
  }
  if (!configData || typeof configData !== 'object') return configData;
  if (!configData.simplified) return configData;
  return {
    ...configData,
    simplified: normalizeSimplifiedTypeIds(configData.simplified),
  };
}

export const mapTemplateConfig = (row: TemplateConfigRow) => ({
  id: row.id,
  product_id: row.product_id,
  name: row.name,
  config_data: row.config_data ? normalizeConfigDataForPersistence(JSON.parse(row.config_data)) : null,
  constraints: row.constraints ? JSON.parse(row.constraints) : null,
  is_active: !!row.is_active,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

export async function ensureProductTemplateConfigsTable() {
  const db = await getDb();
  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_template_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      config_data TEXT,
      constraints TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);
  return db;
}

export async function attachOperationsFromNorms(
  db: any,
  productId: number,
  productTypeKey?: string | null
): Promise<number> {
  if (!productTypeKey) return 0;

  const normsTable = await db.get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'operation_norms'`
  );
  if (!normsTable) return 0;

  const norms = await db.all(
    `SELECT op.operation, op.service_id, op.formula
     FROM operation_norms op
     JOIN post_processing_services pps ON pps.id = op.service_id
     WHERE op.product_type = ? AND op.is_active = 1 AND pps.is_active = 1
     ORDER BY op.id`,
    [productTypeKey]
  );
  if (!norms?.length) return 0;

  const currentSequence = await db.get(
    `SELECT COALESCE(MAX(sequence), 0) as maxSequence
     FROM product_operations_link WHERE product_id = ?`,
    [productId]
  );

  let sequence = (currentSequence?.maxSequence ?? 0) + 1;
  let inserted = 0;

  for (const norm of norms) {
    if (!norm?.service_id) continue;
    await db.run(
      `INSERT OR IGNORE INTO product_operations_link (
         product_id, operation_id, sequence, sort_order,
         is_required, is_default, price_multiplier, default_params, conditions
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [productId, norm.service_id, sequence, sequence, 1, 1, 1, null, null]
    );
    sequence += 1;
    inserted += 1;
  }
  return inserted;
}

/** Парсит options параметра: JSON-строка → объект, строка с ';' → массив. */
export function parseParameterOptions(raw: any): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    if (typeof raw === 'string') {
      return raw.split(';').map((s: string) => s.trim()).filter(Boolean);
    }
    return null;
  }
}

export const DEFAULT_COLOR_MODE_OPTIONS = [
  { value: 'bw', label: 'Ч/Б' },
  { value: 'color', label: 'Цвет' },
];

/** Загружает активные технологии печати из справочника. */
export async function loadPrintTechnologies(db: any): Promise<Array<{ value: string; label: string }> | null> {
  try {
    const hasTbl = await db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='print_technologies'"
    );
    if (!hasTbl) return null;
    const rows = await db.all(
      `SELECT code, name FROM print_technologies WHERE is_active = 1 ORDER BY name`
    ) as any[];
    return (rows || []).map((t: any) => ({ value: String(t.code), label: String(t.name) }));
  } catch {
    return null;
  }
}

/** Находит минимальный unit_price из первого тира print_prices по массиву размеров. */
export function minUnitPriceForSizes(sizes: any[]): number | null {
  if (!Array.isArray(sizes)) return null;
  let min: number | null = null;
  for (const s of sizes) {
    if (!Array.isArray(s.print_prices)) continue;
    for (const pp of s.print_prices) {
      if (!Array.isArray(pp.tiers) || pp.tiers.length === 0) continue;
      const price = pp.tiers[0].unit_price ?? pp.tiers[0].price ?? null;
      if (price != null && (min === null || price < min)) min = price;
    }
  }
  return min;
}

/** Вычисляет мин. цену за единицу из config_data (для карточек каталога). */
export function extractMinUnitPrice(configDataRaw: string | null | undefined): number | null {
  if (!configDataRaw) return null;
  try {
    const configData = typeof configDataRaw === 'string' ? JSON.parse(configDataRaw) : configDataRaw;
    const simplified = configData?.simplified;
    if (!simplified) return null;

    let result = minUnitPriceForSizes(simplified.sizes);
    if (simplified.typeConfigs && typeof simplified.typeConfigs === 'object') {
      for (const cfg of Object.values(simplified.typeConfigs) as any[]) {
        const price = minUnitPriceForSizes(cfg?.sizes);
        if (price != null && (result === null || price < result)) result = price;
      }
    }
    return result;
  } catch {
    return null;
  }
}

/** Компактный print_price: только структура для UI, без цен (technology_code, color_mode, sides_mode). */
function compactPrintPrice(pp: any) {
  if (!pp || typeof pp !== 'object') return null;
  const tech = pp.technology_code ?? pp.technologyCode;
  const color = pp.color_mode ?? pp.colorMode;
  const sides = pp.sides_mode ?? pp.sidesMode;
  if (!tech) return null;
  return {
    technology_code: String(tech),
    color_mode: color ?? 'color',
    sides_mode: sides ?? 'single',
  };
}

/** Компактный finishing: service_id, price_unit, units_per_item, variant_id — без tiers. */
function compactFinishingItem(f: any) {
  if (!f || typeof f.service_id !== 'number') return null;
  return {
    service_id: f.service_id,
    price_unit: f.price_unit ?? 'per_item',
    units_per_item: f.units_per_item ?? 1,
    ...(f.variant_id != null ? { variant_id: f.variant_id } : {}),
  };
}

/**
 * Стабильный порядок подтипов (по id, затем по имени).
 * Без этого порядок массива types в JSON мог не совпадать с порядком при перезагрузке,
 * а на сайте с key={index} картинки «перепрыгивали» между карточками.
 */
export function sortSimplifiedTypesStable(simplified: any): any {
  if (!simplified || !Array.isArray(simplified.types) || simplified.types.length === 0) return simplified;
  const types = [...simplified.types].sort((a: any, b: any) => {
    const ai = Number(a?.id);
    const bi = Number(b?.id);
    const aNum = Number.isFinite(ai);
    const bNum = Number.isFinite(bi);
    if (aNum && bNum && ai !== bi) return ai - bi;
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;
    return String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'ru');
  });
  return { ...simplified, types };
}

/** Строит компактный simplified для сайта: без тиражных прайсов и тяжёлых блоков.
 *  image_url подтипов — как в БД (обычно /api/uploads/...), чтобы прокси printcore.by подставлял свой префикс. */
export function compactSimplifiedForSite(simplified: any) {
  if (!simplified || typeof simplified !== 'object') return null;
  const simplifiedOrdered = sortSimplifiedTypesStable(simplified) ?? simplified;

  let globalMinUnit: number | null = null;
  if (Array.isArray(simplifiedOrdered.sizes) && simplifiedOrdered.sizes.length > 0) {
    const p = minUnitPriceForSizes(simplifiedOrdered.sizes);
    if (p != null) globalMinUnit = p;
  }
  if (simplifiedOrdered.typeConfigs && typeof simplifiedOrdered.typeConfigs === 'object') {
    for (const cfg of Object.values(simplifiedOrdered.typeConfigs) as any[]) {
      const p = cfg?.sizes ? minUnitPriceForSizes(cfg.sizes) : null;
      if (p != null && (globalMinUnit === null || p < globalMinUnit)) globalMinUnit = p;
    }
  }

  const compactSize = (size: any) => {
    const base: Record<string, any> = {
      id: size?.id,
      label: size?.label,
      width_mm: size?.width_mm,
      height_mm: size?.height_mm,
      min_qty: size?.min_qty,
      max_qty: size?.max_qty,
    };
    if (Array.isArray(size?.allowed_material_ids) && size.allowed_material_ids.length > 0) {
      base.allowed_material_ids = size.allowed_material_ids;
    }
    if (size?.use_own_materials !== undefined) {
      base.use_own_materials = size.use_own_materials;
    }
    if (Array.isArray(size?.allowed_base_material_ids) && size.allowed_base_material_ids.length > 0) {
      base.allowed_base_material_ids = size.allowed_base_material_ids;
    }
    if (Array.isArray(size?.print_prices) && size.print_prices.length > 0) {
      base.print_prices = size.print_prices
        .map(compactPrintPrice)
        .filter(Boolean);
    }
    if (Array.isArray(size?.finishing) && size.finishing.length > 0) {
      base.finishing = size.finishing
        .map(compactFinishingItem)
        .filter(Boolean);
    }
    return base;
  };

  const compactTypes = Array.isArray(simplifiedOrdered.types)
    ? simplifiedOrdered.types.map((t: any) => {
        const cfg = simplifiedOrdered.typeConfigs?.[String(t?.id)];
        let minPrice = cfg?.sizes ? minUnitPriceForSizes(cfg.sizes) : null;
        if (minPrice == null && globalMinUnit != null) minPrice = globalMinUnit;
        const rawImg = t?.image_url;
        return {
          id: t?.id,
          name: t?.name,
          default: !!t?.default,
          briefDescription: t?.briefDescription,
          fullDescription: t?.fullDescription,
          characteristics: Array.isArray(t?.characteristics) ? t.characteristics : undefined,
          advantages: Array.isArray(t?.advantages) ? t.advantages : undefined,
          image_url:
            typeof rawImg === 'string' && rawImg.trim() ? rawImg.trim() : undefined,
          min_unit_price: minPrice,
        };
      })
    : undefined;

  const compactTypeConfigs =
    simplifiedOrdered.typeConfigs && typeof simplifiedOrdered.typeConfigs === 'object'
      ? Object.fromEntries(
          Object.entries(simplifiedOrdered.typeConfigs).map(([key, cfg]: [string, any]) => [
            key,
            {
              sizes: Array.isArray(cfg?.sizes) ? cfg.sizes.map(compactSize) : [],
              ...(Array.isArray(cfg?.common_allowed_material_ids) ? { common_allowed_material_ids: cfg.common_allowed_material_ids } : {}),
              ...(Array.isArray(cfg?.allowed_price_types) && cfg.allowed_price_types.length > 0
                ? { allowed_price_types: cfg.allowed_price_types }
                : {}),
              pages: cfg?.pages || simplifiedOrdered.pages || null,
              initial: cfg?.initial || undefined,
            },
          ])
        )
      : undefined;

  return {
    use_layout: simplifiedOrdered.use_layout,
    cutting: simplifiedOrdered.cutting,
    pages: simplifiedOrdered.pages || null,
    multiPageStructure: simplifiedOrdered.multiPageStructure || null,
    sizes: Array.isArray(simplifiedOrdered.sizes) ? simplifiedOrdered.sizes.map(compactSize) : [],
    ...(compactTypes ? { types: compactTypes } : {}),
    ...(compactTypeConfigs ? { typeConfigs: compactTypeConfigs } : {}),
  };
}

function getEffectiveAllowedMaterialIdsForSize(typeConfig: any, size: any): number[] {
  const common = typeConfig?.common_allowed_material_ids;
  if (size?.use_own_materials === true) return size?.allowed_material_ids ?? [];
  if (size?.use_own_materials === false) return common ?? [];
  return (common != null && common.length > 0) ? common : (size?.allowed_material_ids ?? []);
}

/** Собирает уникальные ID материалов из simplified (allowed_material_ids, common_allowed_material_ids, allowed_base_material_ids). */
export function collectMaterialIdsFromSimplified(simplified: any): number[] {
  if (!simplified || typeof simplified !== 'object') return [];
  const ids = new Set<number>();

  const addFromSize = (size: any, typeConfig?: any) => {
    const materialIds = typeConfig ? getEffectiveAllowedMaterialIdsForSize(typeConfig, size) : (size?.allowed_material_ids ?? []);
    if (Array.isArray(materialIds)) {
      materialIds.forEach((id: number) => {
        if (Number.isFinite(Number(id))) ids.add(Number(id));
      });
    }
    if (Array.isArray(size?.allowed_base_material_ids)) {
      size.allowed_base_material_ids.forEach((id: number) => {
        if (Number.isFinite(Number(id))) ids.add(Number(id));
      });
    }
  };

  if (Array.isArray(simplified.sizes)) {
    simplified.sizes.forEach((s: any) => addFromSize(s));
  }
  if (simplified.typeConfigs && typeof simplified.typeConfigs === 'object') {
    for (const cfg of Object.values(simplified.typeConfigs) as any[]) {
      if (Array.isArray(cfg?.common_allowed_material_ids)) {
        cfg.common_allowed_material_ids.forEach((id: number) => {
          if (Number.isFinite(Number(id))) ids.add(Number(id));
        });
      }
      if (Array.isArray(cfg?.sizes)) cfg.sizes.forEach((s: any) => addFromSize(s, cfg));
    }
  }

  return Array.from(ids);
}

/** Извлекает цены по тиражам из simplified: print_prices, material_prices (с tiers). Finishing — только service_id/variant_id, tiers подгружаются отдельно. */
export function extractTierPricesFromSimplified(simplified: any): {
  tier_boundaries: number[];
  sizes: Array<{
    size_id: number;
    label: string;
    print_prices: Array<{
      technology_code: string;
      color_mode: string;
      sides_mode: string;
      tiers: Array<{ min_qty: number; max_qty?: number; unit_price: number }>;
    }>;
    material_prices: Array<{
      material_id: number;
      tiers: Array<{ min_qty: number; max_qty?: number; unit_price: number }>;
    }>;
    finishing: Array<{ service_id: number; variant_id?: number }>;
  }>;
  type_configs?: Record<string, { sizes: ReturnType<typeof extractTierPricesFromSimplified>['sizes'] }>;
} | null {
  if (!simplified || typeof simplified !== 'object') return null;

  const normalizeTier = (t: any, nextMin?: number) => {
    const min = t?.min_qty ?? t?.minQty;
    const price = t?.unit_price ?? t?.unitPrice ?? t?.price;
    if (min == null || !Number.isFinite(Number(min)) || price == null || !Number.isFinite(Number(price))) return null;
    const max = t?.max_qty ?? t?.maxQty ?? (nextMin != null ? nextMin - 1 : undefined);
    return { min_qty: Number(min), max_qty: max, unit_price: Number(price) };
  };

  const normalizeTiers = (tiers: any[]) => {
    if (!Array.isArray(tiers)) return [];
    const sorted = [...tiers].sort((a, b) => (a?.min_qty ?? a?.minQty ?? 0) - (b?.min_qty ?? b?.minQty ?? 0));
    return sorted
      .map((t, idx) => normalizeTier(t, sorted[idx + 1]?.min_qty ?? sorted[idx + 1]?.minQty))
      .filter(Boolean);
  };

  const extractSize = (size: any) => {
    const print_prices: Array<{ technology_code: string; color_mode: string; sides_mode: string; tiers: any[] }> = [];
    if (Array.isArray(size?.print_prices)) {
      for (const pp of size.print_prices) {
        const tiers = normalizeTiers(pp?.tiers ?? []);
        if (tiers.length > 0) {
          print_prices.push({
            technology_code: String(pp.technology_code ?? pp.technologyCode ?? ''),
            color_mode: String(pp.color_mode ?? pp.colorMode ?? 'color'),
            sides_mode: String(pp.sides_mode ?? pp.sidesMode ?? 'single'),
            tiers,
          });
        }
      }
    }

    const material_prices: Array<{ material_id: number; tiers: any[] }> = [];
    if (Array.isArray(size?.material_prices)) {
      for (const mp of size.material_prices) {
        const mid = mp?.material_id ?? mp?.materialId;
        if (mid == null || !Number.isFinite(Number(mid))) continue;
        const tiers = normalizeTiers(mp?.tiers ?? []);
        if (tiers.length > 0) {
          material_prices.push({ material_id: Number(mid), tiers });
        }
      }
    }

    const finishing: Array<{ service_id: number; variant_id?: number }> = [];
    if (Array.isArray(size?.finishing)) {
      for (const f of size.finishing) {
        const sid = f?.service_id;
        if (sid != null && Number.isFinite(Number(sid))) {
          finishing.push({
            service_id: Number(sid),
            ...(f.variant_id != null ? { variant_id: Number(f.variant_id) } : {}),
          });
        }
      }
    }

    return {
      size_id: size?.id ?? 0,
      label: size?.label ?? '',
      print_prices,
      material_prices,
      finishing,
    };
  };

  const scanSizes = (sizes: any[]) => {
    if (!Array.isArray(sizes)) return [];
    return sizes.map(extractSize).filter((s) => s.print_prices.length > 0 || s.material_prices.length > 0 || s.finishing.length > 0);
  };

  const sizes = scanSizes(simplified.sizes ?? []);
  let type_configs: Record<string, { sizes: any[] }> | undefined;
  if (simplified.typeConfigs && typeof simplified.typeConfigs === 'object') {
    type_configs = {};
    for (const [key, cfg] of Object.entries(simplified.typeConfigs) as [string, any][]) {
      const cfgSizes = scanSizes(cfg?.sizes ?? []);
      if (cfgSizes.length > 0) type_configs[key] = { sizes: cfgSizes };
    }
  }

  const tier_boundaries = collectTierBoundariesFromSimplified(simplified);

  if (sizes.length === 0 && (!type_configs || Object.keys(type_configs).length === 0)) return null;

  return {
    tier_boundaries,
    sizes,
    ...(type_configs && Object.keys(type_configs).length > 0 ? { type_configs } : {}),
  };
}

/** Собирает уникальные min_qty из tiers (print_prices, material_prices) — для отображения «от X шт». */
export function collectTierBoundariesFromSimplified(simplified: any): number[] {
  if (!simplified || typeof simplified !== 'object') return [];
  const values = new Set<number>();

  const addFromTiers = (tiers: any[]) => {
    if (!Array.isArray(tiers)) return;
    tiers.forEach((t: any) => {
      const m = t?.min_qty ?? t?.minQty;
      if (m != null && Number.isFinite(Number(m))) values.add(Number(m));
    });
  };

  const scanSize = (size: any) => {
    if (Array.isArray(size?.print_prices)) {
      size.print_prices.forEach((pp: any) => addFromTiers(pp?.tiers));
    }
    if (Array.isArray(size?.material_prices)) {
      size.material_prices.forEach((mp: any) => addFromTiers(mp?.tiers));
    }
  };

  if (Array.isArray(simplified.sizes)) simplified.sizes.forEach(scanSize);
  if (simplified.typeConfigs && typeof simplified.typeConfigs === 'object') {
    for (const cfg of Object.values(simplified.typeConfigs) as any[]) {
      if (Array.isArray(cfg?.sizes)) cfg.sizes.forEach(scanSize);
    }
  }

  return Array.from(values).sort((a, b) => a - b);
}

/** Собирает уникальные service_id из finishing (по всем размерам simplified). */
export function collectServiceIdsFromSimplified(simplified: any): number[] {
  if (!simplified || typeof simplified !== 'object') return [];
  const ids = new Set<number>();

  const addFromSize = (size: any) => {
    if (Array.isArray(size?.finishing)) {
      size.finishing.forEach((f: any) => {
        const sid = f?.service_id;
        if (sid != null && Number.isFinite(Number(sid))) ids.add(Number(sid));
      });
    }
  };

  if (Array.isArray(simplified.sizes)) {
    simplified.sizes.forEach(addFromSize);
  }
  if (simplified.typeConfigs && typeof simplified.typeConfigs === 'object') {
    for (const cfg of Object.values(simplified.typeConfigs) as any[]) {
      if (Array.isArray(cfg?.sizes)) cfg.sizes.forEach(addFromSize);
    }
  }

  const bindingServiceId = simplified?.multiPageStructure?.binding?.service_id;
  if (bindingServiceId != null && Number.isFinite(Number(bindingServiceId))) {
    ids.add(Number(bindingServiceId));
  }

  return Array.from(ids);
}
