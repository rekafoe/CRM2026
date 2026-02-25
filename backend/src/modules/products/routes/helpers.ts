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

/** Строит компактный simplified для сайта: без тиражных прайсов и тяжёлых блоков. */
export function compactSimplifiedForSite(simplified: any) {
  if (!simplified || typeof simplified !== 'object') return null;

  const compactSize = (size: any) => ({
    id: size?.id,
    label: size?.label,
    width_mm: size?.width_mm,
    height_mm: size?.height_mm,
    min_qty: size?.min_qty,
    max_qty: size?.max_qty,
  });

  const compactTypes = Array.isArray(simplified.types)
    ? simplified.types.map((t: any) => {
        const cfg = simplified.typeConfigs?.[String(t?.id)];
        return {
          id: t?.id,
          name: t?.name,
          default: !!t?.default,
          briefDescription: t?.briefDescription,
          image_url: t?.image_url || undefined,
          min_unit_price: cfg?.sizes ? minUnitPriceForSizes(cfg.sizes) : null,
        };
      })
    : undefined;

  const compactTypeConfigs =
    simplified.typeConfigs && typeof simplified.typeConfigs === 'object'
      ? Object.fromEntries(
          Object.entries(simplified.typeConfigs).map(([key, cfg]: [string, any]) => [
            key,
            {
              sizes: Array.isArray(cfg?.sizes) ? cfg.sizes.map(compactSize) : [],
              pages: cfg?.pages || simplified.pages || null,
              initial: cfg?.initial || undefined,
            },
          ])
        )
      : undefined;

  return {
    use_layout: simplified.use_layout,
    cutting: simplified.cutting,
    pages: simplified.pages || null,
    sizes: Array.isArray(simplified.sizes) ? simplified.sizes.map(compactSize) : [],
    ...(compactTypes ? { types: compactTypes } : {}),
    ...(compactTypeConfigs ? { typeConfigs: compactTypeConfigs } : {}),
  };
}
