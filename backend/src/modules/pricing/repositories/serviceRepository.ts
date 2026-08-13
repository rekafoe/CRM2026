import { Database } from 'sqlite';
import { getDb } from '../../../db';
import { hasColumn, invalidateTableSchemaCache } from '../../../utils/tableSchemaCache';
import { defaultRollFeedForPriceUnit } from '../services/finishingPerM2';
import {
  collectLeafVariantIds,
  collectNonLeafVariantIds,
  resolveServiceVariantParentId,
  type ServiceVariantTreeRow,
} from '../utils/serviceVariantTree';
import {
  CreatePricingServiceDTO,
  PricingServiceDTO,
  ServiceVolumeTierDTO,
  CreateServiceVolumeTierDTO,
  UpdatePricingServiceDTO,
  UpdateServiceVolumeTierDTO,
  ServiceVariantDTO,
  CreateServiceVariantDTO,
  UpdateServiceVariantDTO,
  ServiceCategoryDTO,
} from '../dtos/service.dto';

const DEFAULT_CURRENCY = 'BYN';
const BINDINGS_CATEGORY_NAME = 'Переплёты';

function parseServiceVariantParameters(raw: unknown): Record<string, any> {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, any>;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return p && typeof p === 'object' ? p : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeParentVariantId(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function loadServiceVariantTreeRows(
  db: Database,
  serviceId: number,
): Promise<ServiceVariantTreeRow[]> {
  return db.all<ServiceVariantTreeRow[]>(
    `SELECT id, variant_name, parameters, parent_variant_id
     FROM service_variants
     WHERE service_id = ?
     ORDER BY sort_order, id`,
    serviceId,
  );
}

async function serviceVariantLeafIds(db: Database, serviceId: number): Promise<number[]> {
  return collectLeafVariantIds(await loadServiceVariantTreeRows(db, serviceId));
}

async function assertServiceVariantPricingLeaf(
  db: Database,
  serviceId: number,
  variantId: number,
): Promise<void> {
  const rows = await loadServiceVariantTreeRows(db, serviceId);
  const variantExists = rows.some((row) => Number(row.id) === Number(variantId));
  if (!variantExists) {
    const err: any = new Error(`Variant with id ${variantId} not found for service ${serviceId}`);
    err.status = 404;
    throw err;
  }
  if (!collectLeafVariantIds(rows).includes(Number(variantId))) {
    const err: any = new Error('Цена доступна только для последнего уровня варианта');
    err.status = 400;
    throw err;
  }
}

async function clearNonLeafVariantPrices(db: Database, serviceId: number): Promise<void> {
  const nonLeafIds = [...collectNonLeafVariantIds(await loadServiceVariantTreeRows(db, serviceId))];
  if (nonLeafIds.length === 0) return;
  const placeholders = nonLeafIds.map(() => '?').join(',');
  await db.run(
    `DELETE FROM service_variant_prices WHERE variant_id IN (${placeholders})`,
    ...nonLeafIds,
  );
  await db.run(
    `DELETE FROM service_volume_prices WHERE service_id = ? AND variant_id IN (${placeholders})`,
    serviceId,
    ...nonLeafIds,
  );
}

function parsePositiveRollWidthMm(sheetWidth?: unknown, printableWidth?: unknown): number | null {
  const w = Number(sheetWidth ?? printableWidth ?? 0);
  return Number.isFinite(w) && w > 0 ? w : null;
}

function parametersWithParentSync(
  parameters: Record<string, any>,
  parentId: number | null
): Record<string, any> {
  const out = { ...parameters };
  if (parentId !== null) {
    out.parentVariantId = parentId;
  } else {
    delete out.parentVariantId;
  }
  return out;
}

function mapServiceVariantRow(
  row: any,
  opts: {
    hasParentVariantId: boolean;
    hasMaterialId: boolean;
    hasQtyPerItem: boolean;
    hasConsumptionMode: boolean;
    hasMeterBasis: boolean;
  }
): ServiceVariantDTO {
  const paramsRaw = parseServiceVariantParameters(row.parameters);
  const parentColVal = opts.hasParentVariantId ? normalizeParentVariantId(row.parent_variant_id) : null;
  const parentFromJson = normalizeParentVariantId(paramsRaw.parentVariantId);
  const parentResolved = parentColVal !== null ? parentColVal : parentFromJson;
  const parameters = parametersWithParentSync(paramsRaw, parentResolved);
  const rollWidthMm = parsePositiveRollWidthMm(row.material_sheet_width, row.material_printable_width);
  return {
    id: row.id,
    serviceId: row.service_id,
    variantName: row.variant_name,
    parameters,
    sortOrder: row.sort_order || 0,
    isActive: row.is_active !== undefined ? !!row.is_active : true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(opts.hasParentVariantId ? { parentVariantId: parentResolved } : {}),
    ...(opts.hasMaterialId && row.material_id != null ? { material_id: row.material_id } : {}),
    ...(opts.hasQtyPerItem && row.qty_per_item != null ? { qty_per_item: Number(row.qty_per_item) } : {}),
    ...(rollWidthMm != null ? { roll_width_mm: rollWidthMm } : {}),
    ...(opts.hasConsumptionMode
      ? { consumption_mode: normalizeConsumptionMode(row.consumption_mode ?? 'fixed') }
      : {}),
    ...(opts.hasMeterBasis ? { meter_basis: normalizeMeterBasis(row.meter_basis, null) } : {}),
  };
}

// post_processing_services.operation_type имеет CHECK constraint на фиксированный список значений.
// Фронт/админка иногда присылает агрегированные типы (например "postprint"), которые в БД запрещены.
// Поэтому нормализуем тип перед записью.
const ALLOWED_OPERATION_TYPES = new Set<string>([
  'print',
  'cut',
  'plotter_cut',
  'fold',
  'score',
  'laminate',
  'bind',
  'perforate',
  'emboss',
  'foil',
  'varnish',
  'package',
  'design',
  'delivery',
  'other',
]);

const ALLOWED_CONSUMPTION_MODES = new Set<string>(['fixed', 'roll_feed']);
const ALLOWED_METER_BASES = new Set<string>(['knife_path', 'feed']);

/** Значения CHECK(price_unit) в post_processing_services */
const ALLOWED_PRICE_UNITS = new Set<string>([
  'per_sheet',
  'per_item',
  'per_m2',
  'per_hour',
  'fixed',
  'per_order',
  'per_cut',
  'per_meter',
]);

/** UI/алиасы → канонический price_unit (иначе CHECK → 500). */
const PRICE_UNIT_ALIASES: Record<string, string> = {
  per_sheet: 'per_sheet',
  per_item: 'per_item',
  per_m2: 'per_m2',
  per_hour: 'per_hour',
  fixed: 'fixed',
  per_order: 'per_order',
  per_cut: 'per_cut',
  per_meter: 'per_meter',
  m2: 'per_m2',
  'м2': 'per_m2',
  'м²': 'per_m2',
  sqm: 'per_m2',
  hour: 'per_hour',
  'час': 'per_hour',
  sheet: 'per_sheet',
  'лист': 'per_sheet',
  item: 'per_item',
  'шт': 'per_item',
  click: 'per_item',
};

const PRICE_UNIT_DEFAULT_UNIT: Record<string, string> = {
  per_m2: 'м²',
  per_hour: 'час',
  per_sheet: 'лист',
  per_meter: 'пог.м',
  per_order: 'заказ',
  per_cut: 'шт',
  per_item: 'шт',
  fixed: 'шт',
};

/** Значения селекта «Единица» в админке, которые означают выбор тарифа (не просто unit). */
const UI_PRICE_SELECTORS = new Set<string>([
  'per_cut',
  'per_sheet',
  'per_item',
  'fixed',
  'per_order',
  'per_meter',
  'per_m2',
  'per_hour',
  'm2',
  'м2',
  'м²',
  'sqm',
  'hour',
  'sheet',
  'item',
  'click',
]);

function normalizeOperationType(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  if (!v) return 'other';

  // Совместимость с фронтом/старой моделью
  const mapped =
    v === 'postprint' || v === 'generic'
      ? 'other'
      : v;

  return ALLOWED_OPERATION_TYPES.has(mapped) ? mapped : 'other';
}

function canonicalizePriceUnit(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim();
  if (!v) return null;
  const aliased = PRICE_UNIT_ALIASES[v] || PRICE_UNIT_ALIASES[v.toLowerCase()];
  if (aliased && ALLOWED_PRICE_UNITS.has(aliased)) return aliased;
  if (ALLOWED_PRICE_UNITS.has(v)) return v;
  return null;
}

function isUiPriceSelector(raw: string): boolean {
  return UI_PRICE_SELECTORS.has(raw) || UI_PRICE_SELECTORS.has(raw.toLowerCase());
}

/**
 * UI кладёт в unit и физическую единицу (m2), и price_unit (per_cut).
 * Нормализуем в пару, совместимую с CHECK(price_unit) — иначе SQLite даёт 500.
 */
function resolveServiceUnits(
  unitRaw: unknown,
  priceUnitRaw: unknown,
  fallbackUnit: string = 'шт',
  fallbackPriceUnit: string = 'per_item'
): { unit: string; priceUnit: string } {
  const rawUnit = unitRaw != null ? String(unitRaw).trim() : '';
  const fromPriceField = canonicalizePriceUnit(priceUnitRaw);
  const fromUnitSelector =
    rawUnit && isUiPriceSelector(rawUnit) ? canonicalizePriceUnit(rawUnit) : null;

  const priceUnit =
    fromPriceField ||
    fromUnitSelector ||
    canonicalizePriceUnit(fallbackPriceUnit) ||
    'per_item';

  if (!ALLOWED_PRICE_UNITS.has(priceUnit)) {
    const err: any = new Error(
      `Недопустимый price_unit: "${priceUnitRaw ?? unitRaw}". Для квадратных метров укажите m2 или per_m2.`
    );
    err.status = 400;
    throw err;
  }

  const unit = fromUnitSelector
    ? PRICE_UNIT_DEFAULT_UNIT[priceUnit] || fallbackUnit
    : rawUnit || PRICE_UNIT_DEFAULT_UNIT[priceUnit] || fallbackUnit;

  return { unit, priceUnit };
}

function normalizeConsumptionMode(
  raw: unknown,
  fallback: 'fixed' | 'roll_feed' = 'fixed'
): 'fixed' | 'roll_feed' {
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (ALLOWED_CONSUMPTION_MODES.has(v)) return v as 'fixed' | 'roll_feed';
  return fallback;
}

function normalizeMeterBasis(raw: unknown, fallback: 'knife_path' | 'feed' | null = null): 'knife_path' | 'feed' | null {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const v = String(raw).trim().toLowerCase();
  return ALLOWED_METER_BASES.has(v) ? (v as 'knife_path' | 'feed') : fallback;
}

type RawServiceRow = {
  id: number;
  service_name: string;
  service_type?: string;
  operation_type?: string;
  unit: string;
  price_unit?: string;
  price_per_unit: number;
  is_active: number;
  min_quantity?: number | null;
  max_quantity?: number | null;
  operator_percent?: number | null;
  category_id?: number | null;
  category_name?: string | null;
  material_id?: number | null;
  qty_per_item?: number | null;
  consumption_mode?: string | null;
  meter_basis?: string | null;
};

type RawTierRow = {
  id: number;
  service_id: number;
  variant_id?: number | null;
  min_quantity: number;
  price_per_unit: number;
  is_active: number;
};

export type ServicePricingBundleEntry = {
  variants: ServiceVariantDTO[];
  baseTiers: ServiceVolumeTierDTO[];
  variantTiers: Record<number, ServiceVolumeTierDTO[]>;
};

export class PricingServiceRepository {
  private static schemaEnsured = false;

  private static async getConnection(): Promise<Database> {
    const db = await getDb();
    // Проверяем схему только один раз
    if (!this.schemaEnsured) {
      await this.ensureSchema(db);
      this.schemaEnsured = true;
    }
    return db;
  }

  private static async ensureSchema(db: Database): Promise<void> {
    // Основная таблица цен услуг
    await db.exec(`CREATE TABLE IF NOT EXISTS service_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_name TEXT NOT NULL,
      unit TEXT NOT NULL,
      price_per_unit REAL NOT NULL,
      service_type TEXT DEFAULT 'generic',
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    try {
      if (!(await hasColumn('service_prices', 'service_type'))) {
        await db.run(`ALTER TABLE service_prices ADD COLUMN service_type TEXT DEFAULT 'generic'`);
        invalidateTableSchemaCache('service_prices');
      }
    } catch {
      // ignore
    }

    try {
      if (!(await hasColumn('post_processing_services', 'max_quantity'))) {
        await db.run(`ALTER TABLE post_processing_services ADD COLUMN max_quantity INTEGER`);
        invalidateTableSchemaCache('post_processing_services');
      }
    } catch {
      // ignore
    }

    // Таблица диапазонов цен по объему
    // ВАЖНО: service_id ссылается на post_processing_services, а не на service_prices
    await db.exec(`CREATE TABLE IF NOT EXISTS service_volume_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL,
      min_quantity INTEGER NOT NULL,
      price_per_unit REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(service_id) REFERENCES post_processing_services(id) ON DELETE CASCADE
    )`);

    try {
      if (!(await hasColumn('service_volume_prices', 'variant_id'))) {
        await db.run(`ALTER TABLE service_volume_prices ADD COLUMN variant_id INTEGER REFERENCES service_variants(id) ON DELETE CASCADE`);
        invalidateTableSchemaCache('service_volume_prices');
      }
    } catch {
      // ignore
    }

    // Таблица вариантов услуг (для сложных услуг типа ламинации)
    await db.exec(`CREATE TABLE IF NOT EXISTS service_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL,
      variant_name TEXT NOT NULL,
      parameters TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(service_id) REFERENCES post_processing_services(id) ON DELETE CASCADE
    )`);

    // Создаем индекс для быстрого поиска по service_id
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_service_variants_service_id ON service_variants(service_id)`);
    try {
      if (!(await hasColumn('service_variants', 'parent_variant_id'))) {
        await db.run(`ALTER TABLE service_variants ADD COLUMN parent_variant_id INTEGER`);
        await db.exec(`CREATE INDEX IF NOT EXISTS idx_service_variants_parent_variant_id ON service_variants(parent_variant_id)`);
        await PricingServiceRepository.backfillParentVariantIds(db);
        invalidateTableSchemaCache('service_variants');
      }
    } catch {
      // ignore
    }
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_service_volume_prices_variant_id ON service_volume_prices(variant_id)`);
    
    // Создаем новые оптимизированные таблицы (если их еще нет - миграция создаст их)
    await db.exec(`CREATE TABLE IF NOT EXISTS service_range_boundaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL,
      min_quantity INTEGER NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(service_id) REFERENCES post_processing_services(id) ON DELETE CASCADE,
      UNIQUE(service_id, min_quantity)
    )`);
    
    await db.exec(`CREATE TABLE IF NOT EXISTS service_variant_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      variant_id INTEGER NOT NULL,
      range_id INTEGER NOT NULL,
      price_per_unit REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(variant_id) REFERENCES service_variants(id) ON DELETE CASCADE,
      FOREIGN KEY(range_id) REFERENCES service_range_boundaries(id) ON DELETE CASCADE,
      UNIQUE(variant_id, range_id)
    )`);
    
    // Создаем индексы для новых таблиц
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_service_range_boundaries_service_id ON service_range_boundaries(service_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_service_variant_prices_variant_id ON service_variant_prices(variant_id)`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_service_variant_prices_range_id ON service_variant_prices(range_id)`);

    // Категории послепечатных услуг (для группировки в выборе продукта)
    await db.exec(`CREATE TABLE IF NOT EXISTS service_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )`);
    try {
      if (!(await hasColumn('post_processing_services', 'category_id'))) {
        await db.run(`ALTER TABLE post_processing_services ADD COLUMN category_id INTEGER REFERENCES service_categories(id) ON DELETE SET NULL`);
        invalidateTableSchemaCache('post_processing_services');
      }
    } catch {
      // ignore
    }
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_post_processing_services_category_id ON post_processing_services(category_id)`);

    try {
      if (!(await hasColumn('post_processing_services', 'consumption_mode'))) {
        await db.run(
          `ALTER TABLE post_processing_services ADD COLUMN consumption_mode TEXT NOT NULL DEFAULT 'fixed' CHECK (consumption_mode IN ('fixed', 'roll_feed'))`
        );
        invalidateTableSchemaCache('post_processing_services');
      }
    } catch {
      // ignore
    }
    try {
      if (!(await hasColumn('post_processing_services', 'meter_basis'))) {
        await db.run(
          `ALTER TABLE post_processing_services ADD COLUMN meter_basis TEXT CHECK (meter_basis IN ('knife_path', 'feed'))`
        );
        invalidateTableSchemaCache('post_processing_services');
      }
    } catch {
      // ignore
    }
    try {
      if (!(await hasColumn('service_variants', 'consumption_mode'))) {
        await db.run(
          `ALTER TABLE service_variants ADD COLUMN consumption_mode TEXT NOT NULL DEFAULT 'fixed' CHECK (consumption_mode IN ('fixed', 'roll_feed'))`
        );
        invalidateTableSchemaCache('service_variants');
      }
    } catch {
      // ignore
    }
    try {
      if (!(await hasColumn('service_variants', 'meter_basis'))) {
        await db.run(
          `ALTER TABLE service_variants ADD COLUMN meter_basis TEXT CHECK (meter_basis IN ('knife_path', 'feed'))`
        );
        invalidateTableSchemaCache('service_variants');
      }
    } catch {
      // ignore
    }
  }

  private static mapService(row: RawServiceRow): PricingServiceDTO {
    const priceUnit = row.price_unit ?? 'per_item';
    return {
      id: row.id,
      name: row.service_name,
      type: row.service_type ?? 'generic',
      unit:
        priceUnit && priceUnit !== 'per_item'
          ? priceUnit
          : row.unit,
      priceUnit,
      rate: Number(row.price_per_unit ?? 0),
      currency: DEFAULT_CURRENCY,
      isActive: !!row.is_active,
      operationType: row.operation_type,
      minQuantity: row.min_quantity ?? undefined,
      maxQuantity: row.max_quantity ?? undefined,
      operator_percent: row.operator_percent !== undefined && row.operator_percent !== null ? Number(row.operator_percent) : undefined,
      categoryId: row.category_id != null ? row.category_id : undefined,
      categoryName: row.category_name != null && row.category_name !== '' ? row.category_name : undefined,
      material_id: row.material_id != null ? row.material_id : undefined,
      qty_per_item: row.qty_per_item != null ? Number(row.qty_per_item) : undefined,
      consumption_mode:
        row.consumption_mode != null
          ? normalizeConsumptionMode(row.consumption_mode)
          : undefined,
      meter_basis:
        row.meter_basis != null
          ? normalizeMeterBasis(row.meter_basis, null)
          : undefined,
    };
  }

  private static mapTier(row: RawTierRow): ServiceVolumeTierDTO {
    return {
      id: row.id,
      serviceId: row.service_id,
      variantId: row.variant_id ? Number(row.variant_id) : undefined,
      minQuantity: Number(row.min_quantity ?? 0),
      rate: Number(row.price_per_unit ?? 0),
      isActive: !!row.is_active,
    };
  }

  static async listServices(): Promise<PricingServiceDTO[]> {
    const db = await this.getConnection();
    let hasOpPercent = false;
    let hasCategoryId = false;
    let hasMaterialId = false;
    let hasQtyPerItem = false;
    let hasConsumptionMode = false;
    let hasMeterBasis = false;
    try { hasOpPercent = await hasColumn('post_processing_services', 'operator_percent'); } catch { /* ignore */ }
    try { hasCategoryId = await hasColumn('post_processing_services', 'category_id'); } catch { /* ignore */ }
    try { hasMaterialId = await hasColumn('post_processing_services', 'material_id'); } catch { /* ignore */ }
    try { hasQtyPerItem = await hasColumn('post_processing_services', 'qty_per_item'); } catch { /* ignore */ }
    try { hasConsumptionMode = await hasColumn('post_processing_services', 'consumption_mode'); } catch { /* ignore */ }
    try { hasMeterBasis = await hasColumn('post_processing_services', 'meter_basis'); } catch { /* ignore */ }
    const opPercentSel = hasOpPercent ? ', pps.operator_percent' : '';
    const categorySel = hasCategoryId ? ', pps.category_id, sc.name as category_name' : '';
    const materialSel = (hasMaterialId && hasQtyPerItem) ? `, ${hasCategoryId ? 'pps.' : ''}material_id, ${hasCategoryId ? 'pps.' : ''}qty_per_item` : '';
    const consumptionSel = hasConsumptionMode ? `, ${hasCategoryId ? 'pps.' : ''}consumption_mode` : '';
    const meterBasisSel = hasMeterBasis ? `, ${hasCategoryId ? 'pps.' : ''}meter_basis` : '';
    const joinCategory = hasCategoryId ? 'LEFT JOIN service_categories sc ON sc.id = pps.category_id' : '';
    const fromTable = hasCategoryId ? 'post_processing_services pps' : 'post_processing_services';
    const prefix = hasCategoryId ? 'pps.' : '';
    const rows = await db.all<any[]>(`
      SELECT 
        ${prefix}id, 
        ${prefix}name as service_name, 
        ${prefix}operation_type as service_type,
        ${prefix}operation_type, 
        ${prefix}unit, 
        ${prefix}price_unit,
        ${prefix}price as price_per_unit, 
        ${prefix}is_active,
        ${prefix}min_quantity,
        ${prefix}max_quantity${opPercentSel}${categorySel}${materialSel}${consumptionSel}${meterBasisSel}
      FROM ${fromTable} ${joinCategory}
      ORDER BY ${hasCategoryId ? 'sc.sort_order, sc.name, pps.name' : 'name'}
    `);
    return rows.map(this.mapService);
  }

  private static async ensureBindingsCategory(db: Database): Promise<number | null> {
    const existing = await db.get<{ id: number }>(
      `SELECT id FROM service_categories WHERE LOWER(name) = LOWER(?) LIMIT 1`,
      BINDINGS_CATEGORY_NAME
    );
    if (existing?.id) return existing.id;

    const maxSortRow = await db.get<{ maxSort: number }>(
      `SELECT COALESCE(MAX(sort_order), 0) as maxSort FROM service_categories`
    );
    const nextSort = Number(maxSortRow?.maxSort ?? 0) + 1;
    const created = await db.run(
      `INSERT INTO service_categories (name, sort_order) VALUES (?, ?)`,
      BINDINGS_CATEGORY_NAME,
      nextSort
    );
    return created.lastID ?? null;
  }

  static async listBindings(): Promise<PricingServiceDTO[]> {
    const db = await this.getConnection();
    let hasOpPercent = false;
    let hasCategoryId = false;
    let hasMaterialId = false;
    let hasQtyPerItem = false;
    let hasConsumptionMode = false;
    let hasMeterBasis = false;
    try { hasOpPercent = await hasColumn('post_processing_services', 'operator_percent'); } catch { /* ignore */ }
    try { hasCategoryId = await hasColumn('post_processing_services', 'category_id'); } catch { /* ignore */ }
    try { hasMaterialId = await hasColumn('post_processing_services', 'material_id'); } catch { /* ignore */ }
    try { hasQtyPerItem = await hasColumn('post_processing_services', 'qty_per_item'); } catch { /* ignore */ }
    try { hasConsumptionMode = await hasColumn('post_processing_services', 'consumption_mode'); } catch { /* ignore */ }
    try { hasMeterBasis = await hasColumn('post_processing_services', 'meter_basis'); } catch { /* ignore */ }
    const opPercentSel = hasOpPercent ? ', pps.operator_percent' : '';
    const categorySel = hasCategoryId ? ', pps.category_id, sc.name as category_name' : '';
    const materialSel = (hasMaterialId && hasQtyPerItem) ? `, ${hasCategoryId ? 'pps.' : ''}material_id, ${hasCategoryId ? 'pps.' : ''}qty_per_item` : '';
    const consumptionSel = hasConsumptionMode ? `, ${hasCategoryId ? 'pps.' : ''}consumption_mode` : '';
    const meterBasisSel = hasMeterBasis ? `, ${hasCategoryId ? 'pps.' : ''}meter_basis` : '';
    const joinCategory = hasCategoryId ? 'LEFT JOIN service_categories sc ON sc.id = pps.category_id' : '';
    const fromTable = hasCategoryId ? 'post_processing_services pps' : 'post_processing_services';
    const prefix = hasCategoryId ? 'pps.' : '';
    const rows = await db.all<any[]>(`
      SELECT
        ${prefix}id,
        ${prefix}name as service_name,
        ${prefix}operation_type as service_type,
        ${prefix}operation_type,
        ${prefix}unit,
        ${prefix}price_unit,
        ${prefix}price as price_per_unit,
        ${prefix}is_active,
        ${prefix}min_quantity,
        ${prefix}max_quantity${opPercentSel}${categorySel}${materialSel}${consumptionSel}${meterBasisSel}
      FROM ${fromTable} ${joinCategory}
      WHERE ${prefix}operation_type = 'bind'
      ORDER BY ${hasCategoryId ? 'sc.sort_order, sc.name, pps.name' : 'name'}
    `);
    return rows.map(this.mapService);
  }

  static async getServiceById(id: number): Promise<PricingServiceDTO | null> {
    const db = await this.getConnection();
    let hasOpPercent = false;
    let hasCategoryId = false;
    let hasMaterialId = false;
    let hasQtyPerItem = false;
    let hasConsumptionMode = false;
    let hasMeterBasis = false;
    try { hasOpPercent = await hasColumn('post_processing_services', 'operator_percent'); } catch { /* ignore */ }
    try { hasCategoryId = await hasColumn('post_processing_services', 'category_id'); } catch { /* ignore */ }
    try { hasMaterialId = await hasColumn('post_processing_services', 'material_id'); } catch { /* ignore */ }
    try { hasQtyPerItem = await hasColumn('post_processing_services', 'qty_per_item'); } catch { /* ignore */ }
    try { hasConsumptionMode = await hasColumn('post_processing_services', 'consumption_mode'); } catch { /* ignore */ }
    try { hasMeterBasis = await hasColumn('post_processing_services', 'meter_basis'); } catch { /* ignore */ }
    const opPercentSel = hasOpPercent ? ', pps.operator_percent' : '';
    const categorySel = hasCategoryId ? ', pps.category_id, sc.name as category_name' : '';
    const materialSel = (hasMaterialId && hasQtyPerItem) ? `, ${hasCategoryId ? 'pps.' : ''}material_id, ${hasCategoryId ? 'pps.' : ''}qty_per_item` : '';
    const consumptionSel = hasConsumptionMode ? `, ${hasCategoryId ? 'pps.' : ''}consumption_mode` : '';
    const meterBasisSel = hasMeterBasis ? `, ${hasCategoryId ? 'pps.' : ''}meter_basis` : '';
    const joinCategory = hasCategoryId ? 'LEFT JOIN service_categories sc ON sc.id = pps.category_id' : '';
    const prefix = hasCategoryId ? 'pps.' : '';
    const fromTable = hasCategoryId ? 'post_processing_services pps' : 'post_processing_services';
    const row = await db.get<any>(`
      SELECT 
        ${prefix}id, 
        ${prefix}name as service_name, 
        ${prefix}operation_type as service_type, 
        ${prefix}operation_type,
        ${prefix}unit, 
        ${prefix}price_unit,
        ${prefix}price as price_per_unit, 
        ${prefix}is_active,
        ${prefix}min_quantity,
        ${prefix}max_quantity${opPercentSel}${categorySel}${materialSel}${consumptionSel}${meterBasisSel}
      FROM ${fromTable} ${joinCategory}
      WHERE ${prefix}id = ?
    `, id);
    return row ? this.mapService(row) : null;
  }

  static async createService(payload: CreatePricingServiceDTO): Promise<PricingServiceDTO> {
    const db = await this.getConnection();
    // ИЗМЕНЕНО: Создаем в post_processing_services
    // 🆕 Используем operationType из payload, если есть, иначе из type
    const operationType = normalizeOperationType(payload.operationType || payload.type);
    if (typeof payload.type === 'string' && payload.type.trim() && !ALLOWED_OPERATION_TYPES.has(payload.type.trim()) && payload.type.trim() !== 'postprint' && payload.type.trim() !== 'generic') {
      const err: any = new Error(
        `Недопустимый operation_type: "${payload.type}". Разрешено: ${Array.from(ALLOWED_OPERATION_TYPES).join(', ')}`
      );
      err.status = 400;
      throw err;
    }
    // Совместимость с UI: unit может быть m2 / per_cut / … — маппим в CHECK-совместимый price_unit
    const { unit: resolvedUnit, priceUnit: resolvedPriceUnit } = resolveServiceUnits(
      payload.unit,
      payload.priceUnit,
      'шт',
      'per_item'
    );
    const minQuantity = payload.minQuantity ?? 1;
    const maxQuantity = payload.maxQuantity ?? null;
    if (maxQuantity !== null && maxQuantity < minQuantity) {
      const err: any = new Error('max_quantity не может быть меньше min_quantity');
      err.status = 400;
      throw err;
    }

    let hasOpPercent = false;
    let hasCategoryId = false;
    let hasMaterialId = false;
    let hasQtyPerItem = false;
    let hasConsumptionMode = false;
    let hasMeterBasis = false;
    try { hasOpPercent = await hasColumn('post_processing_services', 'operator_percent'); } catch { /* ignore */ }
    try { hasCategoryId = await hasColumn('post_processing_services', 'category_id'); } catch { /* ignore */ }
    try { hasMaterialId = await hasColumn('post_processing_services', 'material_id'); } catch { /* ignore */ }
    try { hasQtyPerItem = await hasColumn('post_processing_services', 'qty_per_item'); } catch { /* ignore */ }
    try { hasConsumptionMode = await hasColumn('post_processing_services', 'consumption_mode'); } catch { /* ignore */ }
    try { hasMeterBasis = await hasColumn('post_processing_services', 'meter_basis'); } catch { /* ignore */ }
    const opPercentVal = (payload as any).operator_percent;
    const includeOpPercent = hasOpPercent && opPercentVal !== undefined && opPercentVal !== null && Number.isFinite(Number(opPercentVal));
    const categoryIdVal = payload.categoryId != null && Number.isFinite(Number(payload.categoryId)) ? Number(payload.categoryId) : null;
    const includeCategoryId = hasCategoryId;
    const includeMaterial = hasMaterialId && hasQtyPerItem;
    const includeConsumptionMode = hasConsumptionMode;
    const includeMeterBasis = hasMeterBasis;
    const materialIdVal = (payload as any).material_id != null && Number.isFinite(Number((payload as any).material_id)) ? Number((payload as any).material_id) : null;
    const qtyPerItemVal = (payload as any).qty_per_item != null && Number.isFinite(Number((payload as any).qty_per_item)) ? Number((payload as any).qty_per_item) : 1;
    const payloadConsumption = (payload as any).consumption_mode;
    const priceUnitLower = String(resolvedPriceUnit).toLowerCase();
    const defaultConsumption = defaultRollFeedForPriceUnit(resolvedPriceUnit, operationType)
      ? 'roll_feed'
      : 'fixed';
    const consumptionModeVal = normalizeConsumptionMode(payloadConsumption, defaultConsumption);
    const payloadMeterBasis = (payload as any).meter_basis;
    const defaultMeterBasis =
      consumptionModeVal === 'roll_feed' ||
      priceUnitLower === 'per_meter' ||
      priceUnitLower === 'per_m2'
        ? 'feed'
        : null;
    const meterBasisVal = normalizeMeterBasis(payloadMeterBasis, defaultMeterBasis);
    const insertCols = [
      'name', 'operation_type', 'unit', 'price_unit', 'price', 'is_active', 'min_quantity', 'max_quantity',
      ...(includeOpPercent ? ['operator_percent'] : []),
      ...(includeCategoryId ? ['category_id'] : []),
      ...(includeMaterial ? ['material_id', 'qty_per_item'] : []),
      ...(includeConsumptionMode ? ['consumption_mode'] : []),
      ...(includeMeterBasis ? ['meter_basis'] : []),
    ];
    const insertVals = insertCols.map(() => '?').join(', ');
    const insertParams: any[] = [
      payload.name,
      operationType,
      resolvedUnit,
      resolvedPriceUnit,
      Number(payload.rate ?? 0),
      payload.isActive === undefined || payload.isActive ? 1 : 0,
      minQuantity,
      maxQuantity,
    ];
    if (includeOpPercent) insertParams.push(Number(opPercentVal));
    if (includeCategoryId) insertParams.push(categoryIdVal);
    if (includeMaterial) { insertParams.push(materialIdVal); insertParams.push(qtyPerItemVal); }
    if (includeConsumptionMode) insertParams.push(consumptionModeVal);
    if (includeMeterBasis) insertParams.push(meterBasisVal);
    let result: { lastID?: number };
    try {
      result = await db.run(
        `INSERT INTO post_processing_services (${insertCols.join(', ')}) VALUES (${insertVals})`,
        ...insertParams
      );
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      if (/CHECK constraint|constraint failed/i.test(msg)) {
        const err: any = new Error(
          `Не удалось создать услугу: нарушено ограничение БД (${msg}). Для кв. метров используйте единицу m2 / per_m2.`
        );
        err.status = 400;
        throw err;
      }
      throw e;
    }
    const opPercentSel = hasOpPercent ? ', operator_percent' : '';
    const categorySel = hasCategoryId ? ', category_id, (SELECT name FROM service_categories WHERE id = post_processing_services.category_id) as category_name' : '';
    const materialSel = includeMaterial ? ', material_id, qty_per_item' : '';
    const consumptionSel = includeConsumptionMode ? ', consumption_mode' : '';
    const meterBasisSel = includeMeterBasis ? ', meter_basis' : '';
    const created = await db.get<any>(`
      SELECT 
        id, 
        name as service_name, 
        operation_type as service_type,
        operation_type, 
        unit, 
        price_unit,
        price as price_per_unit, 
        is_active,
        min_quantity,
        max_quantity${opPercentSel}${categorySel}${materialSel}${consumptionSel}${meterBasisSel}
      FROM post_processing_services 
      WHERE id = ?
    `, result.lastID);
    if (!created) {
      throw new Error('Failed to retrieve created service record');
    }
    return this.mapService(created);
  }

  static async createBinding(payload: CreatePricingServiceDTO): Promise<PricingServiceDTO> {
    const db = await this.getConnection();
    const categoryId = await this.ensureBindingsCategory(db);
    return this.createService({
      ...payload,
      type: 'bind',
      operationType: 'bind',
      categoryId: payload.categoryId ?? categoryId,
    });
  }

  static async updateService(id: number, payload: UpdatePricingServiceDTO): Promise<PricingServiceDTO | null> {
    const db = await this.getConnection();
    // ИЗМЕНЕНО: Обновляем post_processing_services
    const current = await db.get<any>(`SELECT * FROM post_processing_services WHERE id = ?`, id);
    if (!current) {
      return null;
    }

    // 🆕 Используем operationType из payload, если есть, иначе из type, иначе текущее значение
    const operationType = payload.operationType !== undefined
      ? normalizeOperationType(payload.operationType)
      : (payload.type !== undefined
        ? normalizeOperationType(payload.type)
        : (current.operation_type ?? 'other'));

    if (typeof payload.type === 'string' && payload.type.trim() && !ALLOWED_OPERATION_TYPES.has(payload.type.trim()) && payload.type.trim() !== 'postprint' && payload.type.trim() !== 'generic') {
      const err: any = new Error(
        `Недопустимый operation_type: "${payload.type}". Разрешено: ${Array.from(ALLOWED_OPERATION_TYPES).join(', ')}`
      );
      err.status = 400;
      throw err;
    }

    const { unit: resolvedUnit, priceUnit: resolvedPriceUnit } = resolveServiceUnits(
      payload.unit !== undefined ? payload.unit : current.unit,
      payload.priceUnit !== undefined ? payload.priceUnit : current.price_unit,
      current.unit ?? 'шт',
      current.price_unit ?? 'per_item'
    );
    const minQuantity = payload.minQuantity !== undefined ? payload.minQuantity : (current.min_quantity ?? 1);
    const maxQuantity = payload.maxQuantity !== undefined ? payload.maxQuantity : (current.max_quantity ?? null);
    if (maxQuantity !== null && maxQuantity < minQuantity) {
      const err: any = new Error('max_quantity не может быть меньше min_quantity');
      err.status = 400;
      throw err;
    }

    let hasOpPercent = false;
    let hasCategoryId = false;
    let hasMaterialId = false;
    let hasQtyPerItem = false;
    let hasConsumptionMode = false;
    let hasMeterBasis = false;
    try { hasOpPercent = await hasColumn('post_processing_services', 'operator_percent'); } catch { /* ignore */ }
    try { hasCategoryId = await hasColumn('post_processing_services', 'category_id'); } catch { /* ignore */ }
    try { hasMaterialId = await hasColumn('post_processing_services', 'material_id'); } catch { /* ignore */ }
    try { hasQtyPerItem = await hasColumn('post_processing_services', 'qty_per_item'); } catch { /* ignore */ }
    try { hasConsumptionMode = await hasColumn('post_processing_services', 'consumption_mode'); } catch { /* ignore */ }
    try { hasMeterBasis = await hasColumn('post_processing_services', 'meter_basis'); } catch { /* ignore */ }
    const opPercentUpdate = hasOpPercent && (payload as any).operator_percent !== undefined ? ', operator_percent = ?' : '';
    const categoryIdUpdate = hasCategoryId && payload.categoryId !== undefined
      ? ', category_id = ?'
      : '';
    const materialIdUpdate = hasMaterialId && (payload as any).material_id !== undefined ? ', material_id = ?' : '';
    const qtyPerItemUpdate = hasQtyPerItem && (payload as any).qty_per_item !== undefined ? ', qty_per_item = ?' : '';
    const consumptionModeUpdate = hasConsumptionMode && (payload as any).consumption_mode !== undefined ? ', consumption_mode = ?' : '';
    const meterBasisUpdate = hasMeterBasis && (payload as any).meter_basis !== undefined ? ', meter_basis = ?' : '';
    const updateParams: any[] = [
      payload.name ?? current.name,
      operationType,
      resolvedUnit,
      resolvedPriceUnit,
      payload.rate !== undefined ? payload.rate : current.price,
      payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : current.is_active,
      minQuantity,
      maxQuantity,
    ];
    if (opPercentUpdate) updateParams.push(Number((payload as any).operator_percent));
    if (categoryIdUpdate) updateParams.push(payload.categoryId != null && Number.isFinite(Number(payload.categoryId)) ? payload.categoryId : null);
    if (materialIdUpdate) updateParams.push((payload as any).material_id != null && Number.isFinite(Number((payload as any).material_id)) ? Number((payload as any).material_id) : null);
    if (qtyPerItemUpdate) updateParams.push((payload as any).qty_per_item != null && Number.isFinite(Number((payload as any).qty_per_item)) ? Number((payload as any).qty_per_item) : (current.qty_per_item ?? 1));
    if (consumptionModeUpdate) {
      const fallbackMode = normalizeConsumptionMode(current.consumption_mode ?? 'fixed');
      updateParams.push(normalizeConsumptionMode((payload as any).consumption_mode, fallbackMode));
    }
    if (meterBasisUpdate) {
      const fallbackBasis = normalizeMeterBasis(current.meter_basis, null);
      updateParams.push(normalizeMeterBasis((payload as any).meter_basis, fallbackBasis));
    }
    updateParams.push(id);
    await db.run(
      `UPDATE post_processing_services 
       SET name = ?, operation_type = ?, unit = ?, price_unit = ?, price = ?, is_active = ?, min_quantity = ?, max_quantity = ?${opPercentUpdate}${categoryIdUpdate}${materialIdUpdate}${qtyPerItemUpdate}${consumptionModeUpdate}${meterBasisUpdate}
       WHERE id = ?`,
      ...updateParams
    );

    const opPercentSel = hasOpPercent ? ', operator_percent' : '';
    const categorySel = hasCategoryId ? ', category_id, (SELECT name FROM service_categories WHERE id = post_processing_services.category_id) as category_name' : '';
    const materialSel = (hasMaterialId && hasQtyPerItem) ? ', material_id, qty_per_item' : '';
    const consumptionSel = hasConsumptionMode ? ', consumption_mode' : '';
    const meterBasisSel = hasMeterBasis ? ', meter_basis' : '';
    const updated = await db.get<any>(`
      SELECT 
        id, 
        name as service_name, 
        operation_type as service_type,
        operation_type, 
        unit, 
        price_unit,
        price as price_per_unit, 
        is_active,
        min_quantity,
        max_quantity${opPercentSel}${categorySel}${materialSel}${consumptionSel}${meterBasisSel}
      FROM post_processing_services 
      WHERE id = ?
    `, id);
    return updated ? this.mapService(updated) : null;
  }

  static async updateBinding(id: number, payload: UpdatePricingServiceDTO): Promise<PricingServiceDTO | null> {
    const db = await this.getConnection();
    const existing = await db.get<{ operation_type?: string; category_id?: number | null }>(
      `SELECT operation_type, category_id FROM post_processing_services WHERE id = ?`,
      id
    );
    if (!existing || existing.operation_type !== 'bind') {
      return null;
    }
    const categoryId = await this.ensureBindingsCategory(db);
    return this.updateService(id, {
      ...payload,
      type: 'bind',
      operationType: 'bind',
      categoryId: payload.categoryId ?? existing.category_id ?? categoryId,
    });
  }

  static async deleteService(id: number): Promise<void> {
    const db = await this.getConnection();
    await db.run(`DELETE FROM service_volume_prices WHERE service_id = ?`, id);
    await db.run(`DELETE FROM post_processing_services WHERE id = ?`, id);
  }

  static async deleteBinding(id: number): Promise<void> {
    const db = await this.getConnection();
    const existing = await db.get<{ operation_type?: string }>(
      `SELECT operation_type FROM post_processing_services WHERE id = ?`,
      id
    );
    if (!existing || existing.operation_type !== 'bind') {
      const err: any = new Error('Binding not found');
      err.status = 404;
      throw err;
    }
    await this.deleteService(id);
  }

  // --- Категории послепечатных услуг ---
  static async listServiceCategories(): Promise<ServiceCategoryDTO[]> {
    const db = await this.getConnection();
    const rows = await db.all<any[]>(`SELECT id, name, sort_order, created_at FROM service_categories ORDER BY sort_order, name`);
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      sortOrder: Number(r.sort_order ?? 0),
      createdAt: r.created_at,
    }));
  }

  static async createServiceCategory(name: string, sortOrder: number = 0): Promise<ServiceCategoryDTO> {
    const db = await this.getConnection();
    const result = await db.run(`INSERT INTO service_categories (name, sort_order) VALUES (?, ?)`, name.trim(), sortOrder);
    const row = await db.get<any>(`SELECT id, name, sort_order, created_at FROM service_categories WHERE id = ?`, result.lastID);
    if (!row) throw new Error('Failed to retrieve created service category');
    return { id: row.id, name: row.name, sortOrder: Number(row.sort_order), createdAt: row.created_at };
  }

  static async updateServiceCategory(id: number, data: { name?: string; sortOrder?: number }): Promise<ServiceCategoryDTO | null> {
    const db = await this.getConnection();
    const current = await db.get<any>(`SELECT id, name, sort_order FROM service_categories WHERE id = ?`, id);
    if (!current) return null;
    const name = data.name !== undefined ? data.name.trim() : current.name;
    const sortOrder = data.sortOrder !== undefined ? data.sortOrder : current.sort_order;
    await db.run(`UPDATE service_categories SET name = ?, sort_order = ? WHERE id = ?`, name, sortOrder, id);
    const row = await db.get<any>(`SELECT id, name, sort_order, created_at FROM service_categories WHERE id = ?`, id);
    return row ? { id: row.id, name: row.name, sortOrder: Number(row.sort_order), createdAt: row.created_at } : null;
  }

  static async deleteServiceCategory(id: number): Promise<void> {
    const db = await this.getConnection();
    await db.run(`UPDATE post_processing_services SET category_id = NULL WHERE category_id = ?`, id);
    await db.run(`DELETE FROM service_categories WHERE id = ?`, id);
  }

  static async listServiceTiers(serviceId: number, variantId?: number): Promise<ServiceVolumeTierDTO[]> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    // Новая матрица — источник истины для вариантов. Legacy используется только как fallback.
    if (variantId != null && Number.isFinite(variantId)) {
      const fromNew = await this.listServiceTiersFromVariantPrices(serviceId, variantId);
      if (fromNew.length > 0) return fromNew;
    }
    
    let query = `SELECT id, service_id, variant_id, min_quantity, price_per_unit, is_active FROM service_volume_prices WHERE service_id = ?`;
    const params: any[] = [serviceId];
    
    if (variantId !== undefined && variantId !== null) {
      query += ` AND variant_id = ?`;
      params.push(variantId);
    } else {
      query += ` AND variant_id IS NULL`;
    }
    
    query += ` ORDER BY min_quantity`;
    
    try {
      const rows = await db.all<RawTierRow[]>(query, ...params);
      const result = rows.map(this.mapTier);
      return result;
    } catch (error: any) {
      console.error('Error in listServiceTiers:', error);
      console.error('Query:', query);
      console.error('Params:', params);
      throw error;
    }
  }

  /** Тарифы варианта из service_variant_prices + service_range_boundaries (новая структура) */
  private static async listServiceTiersFromVariantPrices(serviceId: number, variantId: number): Promise<ServiceVolumeTierDTO[]> {
    const db = await this.getConnection();
    const hasNew = await db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='service_range_boundaries'`);
    if (!hasNew) return [];
    const rows = await db.all<any[]>(
      `SELECT svp.id, svp.variant_id, srb.service_id, srb.min_quantity, svp.price_per_unit, svp.is_active
       FROM service_variant_prices svp
       JOIN service_range_boundaries srb ON svp.range_id = srb.id
       WHERE srb.service_id = ? AND svp.variant_id = ?
       ORDER BY srb.min_quantity`,
      serviceId,
      variantId
    );
    return (rows || []).map((r) => ({
      id: r.id,
      serviceId: r.service_id,
      variantId: r.variant_id ? Number(r.variant_id) : undefined,
      minQuantity: r.min_quantity,
      rate: r.price_per_unit,
      isActive: !!r.is_active,
    }));
  }

  /**
   * Получает все tiers для всех вариантов услуги одним запросом
   * Оптимизация: вместо N запросов делаем один с JOIN
   */
  static async listAllVariantTiers(serviceId: number): Promise<Map<number, ServiceVolumeTierDTO[]>> {
    const db = await this.getConnection();
    
    try {
      const tiersMap = new Map<number, ServiceVolumeTierDTO[]>();
      const seenKeys = new Set<string>();

      const pushTier = (tier: ServiceVolumeTierDTO) => {
        const variantIdNum = Number(tier.variantId);
        if (!Number.isFinite(variantIdNum)) return;
        const key = `${variantIdNum}:${tier.minQuantity}`;
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        if (!tiersMap.has(variantIdNum)) tiersMap.set(variantIdNum, []);
        tiersMap.get(variantIdNum)!.push({ ...tier, variantId: variantIdNum });
      };

      const hasNewStructure = await db.get(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='service_range_boundaries'
      `);

      if (hasNewStructure) {
        const rows = await db.all<any[]>(
          `SELECT 
            svp.id, 
            svp.variant_id, 
            srb.service_id, 
            srb.min_quantity, 
            svp.price_per_unit, 
            svp.is_active
           FROM service_variant_prices svp
           JOIN service_range_boundaries srb ON svp.range_id = srb.id
           WHERE srb.service_id = ? AND svp.variant_id IS NOT NULL
           ORDER BY svp.variant_id, srb.min_quantity`,
          serviceId
        );
        for (const row of rows) {
          pushTier({
            id: row.id,
            serviceId: row.service_id,
            variantId: Number(row.variant_id),
            minQuantity: row.min_quantity,
            rate: row.price_per_unit,
            isActive: !!row.is_active,
          });
        }
      }

      // Подмешиваем старую таблицу: fallback createServiceTier пишет сюда
      try {
        const oldRows = await db.all<RawTierRow[]>(
          `SELECT id, service_id, variant_id, min_quantity, price_per_unit, is_active 
           FROM service_volume_prices 
           WHERE service_id = ? AND variant_id IS NOT NULL
           ORDER BY variant_id, min_quantity`,
          serviceId
        );
        for (const row of oldRows) {
          pushTier(this.mapTier(row));
        }
      } catch {
        // service_volume_prices может отсутствовать на совсем старых БД
      }

      for (const [, list] of tiersMap) {
        list.sort((a, b) => a.minQuantity - b.minQuantity);
      }
      return tiersMap;
    } catch (error: any) {
      console.error('Error in listAllVariantTiers:', error);
      console.error('ServiceId:', serviceId);
      throw error;
    }
  }

  /**
   * Варианты, базовые tiers и tiers вариантов для нескольких услуг — без N+1 HTTP.
   */
  static async listPricingBundleForServiceIds(
    serviceIds: number[],
  ): Promise<Record<number, ServicePricingBundleEntry>> {
    const uniq = [...new Set(serviceIds.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
    const out: Record<number, ServicePricingBundleEntry> = {};
    if (uniq.length === 0) return out;

    for (const id of uniq) {
      out[id] = { variants: [], baseTiers: [], variantTiers: {} };
    }

    const db = await this.getConnection();
    await this.ensureSchema(db);

    let hasMaterialId = false;
    let hasQtyPerItem = false;
    let hasParentVariantId = false;
    let hasConsumptionMode = false;
    let hasMeterBasis = false;
    try {
      hasMaterialId = await hasColumn('service_variants', 'material_id');
    } catch {
      /* ignore */
    }
    try {
      hasQtyPerItem = await hasColumn('service_variants', 'qty_per_item');
    } catch {
      /* ignore */
    }
    try {
      hasParentVariantId = await hasColumn('service_variants', 'parent_variant_id');
    } catch {
      /* ignore */
    }
    try {
      hasConsumptionMode = await hasColumn('service_variants', 'consumption_mode');
    } catch {
      /* ignore */
    }
    try {
      hasMeterBasis = await hasColumn('service_variants', 'meter_basis');
    } catch {
      /* ignore */
    }
    const materialCols = hasMaterialId && hasQtyPerItem ? ', sv.material_id, sv.qty_per_item' : '';
    const parentCol = hasParentVariantId ? ', sv.parent_variant_id' : '';
    const consumptionCol = hasConsumptionMode ? ', sv.consumption_mode' : '';
    const meterBasisCol = hasMeterBasis ? ', sv.meter_basis' : '';
    const rollWidthCols = hasMaterialId
      ? ', m.sheet_width as material_sheet_width, m.printable_width as material_printable_width'
      : '';
    const materialJoin = hasMaterialId ? 'LEFT JOIN materials m ON m.id = sv.material_id' : '';
    const placeholders = uniq.map(() => '?').join(',');

    const vRows = await db.all<any[]>(
      `SELECT sv.id, sv.service_id, sv.variant_name, sv.parameters, sv.sort_order, sv.is_active, sv.created_at, sv.updated_at${parentCol}${materialCols}${consumptionCol}${meterBasisCol}${rollWidthCols}
       FROM service_variants sv
       ${materialJoin}
       WHERE sv.service_id IN (${placeholders})
       ORDER BY sv.service_id, sv.sort_order, sv.id`,
      ...uniq,
    );
    for (const row of vRows) {
      const sid = Number(row.service_id);
      if (!out[sid]) continue;
      out[sid].variants.push(
        mapServiceVariantRow(row, {
          hasParentVariantId,
          hasMaterialId,
          hasQtyPerItem,
          hasConsumptionMode,
          hasMeterBasis,
        })
      );
    }

    const bRows = await db.all<RawTierRow[]>(
      `SELECT id, service_id, variant_id, min_quantity, price_per_unit, is_active
       FROM service_volume_prices
       WHERE service_id IN (${placeholders}) AND variant_id IS NULL
       ORDER BY service_id, min_quantity`,
      ...uniq,
    );
    for (const row of bRows) {
      const sid = Number(row.service_id);
      if (!out[sid]) continue;
      out[sid].baseTiers.push(this.mapTier(row));
    }

    const hasNewStructure = await db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='service_range_boundaries'`,
    );

    if (hasNewStructure) {
      const vtRows = await db.all<any[]>(
        `SELECT
            svp.id,
            svp.variant_id,
            srb.service_id,
            srb.min_quantity,
            svp.price_per_unit,
            svp.is_active
           FROM service_variant_prices svp
           JOIN service_range_boundaries srb ON svp.range_id = srb.id
           WHERE srb.service_id IN (${placeholders}) AND svp.variant_id IS NOT NULL
           ORDER BY srb.service_id, svp.variant_id, srb.min_quantity`,
        ...uniq,
      );
      for (const row of vtRows) {
        const sid = Number(row.service_id);
        const vid = Number(row.variant_id);
        if (!out[sid] || !Number.isFinite(vid)) continue;
        const tier: ServiceVolumeTierDTO = {
          id: row.id,
          serviceId: sid,
          variantId: vid,
          minQuantity: row.min_quantity,
          rate: row.price_per_unit,
          isActive: !!row.is_active,
        };
        if (!out[sid].variantTiers[vid]) out[sid].variantTiers[vid] = [];
        out[sid].variantTiers[vid].push(tier);
      }
    } else {
      const vtRows = await db.all<RawTierRow[]>(
        `SELECT id, service_id, variant_id, min_quantity, price_per_unit, is_active
         FROM service_volume_prices
         WHERE service_id IN (${placeholders}) AND variant_id IS NOT NULL
         ORDER BY service_id, variant_id, min_quantity`,
        ...uniq,
      );
      for (const row of vtRows) {
        const sid = Number(row.service_id);
        const vid = row.variant_id != null ? Number(row.variant_id) : NaN;
        if (!out[sid] || !Number.isFinite(vid)) continue;
        if (!out[sid].variantTiers[vid]) out[sid].variantTiers[vid] = [];
        out[sid].variantTiers[vid].push(this.mapTier(row));
      }
    }

    return out;
  }

  static async createServiceTier(serviceId: number, payload: CreateServiceVolumeTierDTO): Promise<ServiceVolumeTierDTO> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    
    // Проверяем существование услуги
    const service = await db.get(`SELECT id FROM post_processing_services WHERE id = ?`, serviceId);
    if (!service) {
      const err: any = new Error(`Service with id ${serviceId} not found`);
      err.status = 404;
      throw err;
    }
    
    // Если передан variantId, проверяем его существование
    if (payload.variantId !== undefined && payload.variantId !== null) {
      const variant = await db.get(`SELECT id FROM service_variants WHERE id = ? AND service_id = ?`, payload.variantId, serviceId);
      if (!variant) {
        const err: any = new Error(`Variant with id ${payload.variantId} not found for service ${serviceId}`);
        err.status = 404;
        throw err;
      }
      await assertServiceVariantPricingLeaf(db, serviceId, Number(payload.variantId));
    }
    
    const result = await db.run(
      `INSERT INTO service_volume_prices (service_id, variant_id, min_quantity, price_per_unit, is_active) VALUES (?, ?, ?, ?, ?)`,
      serviceId,
      payload.variantId ?? null,
      Number(payload.minQuantity ?? 0),
      Number(payload.rate ?? 0),
      payload.isActive === undefined || payload.isActive ? 1 : 0,
    );
    const row = await db.get<RawTierRow>(`SELECT id, service_id, variant_id, min_quantity, price_per_unit, is_active FROM service_volume_prices WHERE id = ?`, result.lastID);
    if (!row) {
      throw new Error('Failed to retrieve created volume tier');
    }
    return this.mapTier(row);
  }

  static async updateServiceTier(tierId: number, payload: UpdateServiceVolumeTierDTO): Promise<ServiceVolumeTierDTO | null> {
    const db = await this.getConnection();
    const current = await db.get<RawTierRow>(`SELECT * FROM service_volume_prices WHERE id = ?`, tierId);
    if (!current) {
      return null;
    }
    const targetVariantId =
      payload.variantId !== undefined ? payload.variantId : current.variant_id;
    if (targetVariantId != null) {
      await assertServiceVariantPricingLeaf(
        db,
        Number(current.service_id),
        Number(targetVariantId),
      );
    }
    await db.run(
      `UPDATE service_volume_prices SET min_quantity = ?, price_per_unit = ?, is_active = ?, variant_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      payload.minQuantity !== undefined ? payload.minQuantity : current.min_quantity,
      payload.rate !== undefined ? payload.rate : current.price_per_unit,
      payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : current.is_active,
      payload.variantId !== undefined ? payload.variantId : (current.variant_id ?? null),
      tierId,
    );

    const updated = await db.get<RawTierRow>(`SELECT id, service_id, variant_id, min_quantity, price_per_unit, is_active FROM service_volume_prices WHERE id = ?`, tierId);
    return updated ? this.mapTier(updated) : null;
  }

  static async deleteServiceTier(tierId: number): Promise<void> {
    const db = await this.getConnection();
    await db.run(`DELETE FROM service_volume_prices WHERE id = ?`, tierId);
  }

  /** Однократный перенос parentVariantId из JSON parameters в колонку */
  private static async backfillParentVariantIds(db: Database): Promise<void> {
    const rows = await db.all<{ id: number; parameters: string | null }[]>(
      `SELECT id, parameters FROM service_variants WHERE parent_variant_id IS NULL`
    );
    for (const row of rows) {
      const p = parseServiceVariantParameters(row.parameters);
      const pid = normalizeParentVariantId(p.parentVariantId);
      if (pid === null) continue;
      await db.run(`UPDATE service_variants SET parent_variant_id = ? WHERE id = ?`, pid, row.id);
    }
  }

  // Методы для работы с вариантами услуг
  static async assertVariantPricingLeaf(serviceId: number, variantId: number): Promise<void> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    await assertServiceVariantPricingLeaf(db, serviceId, variantId);
  }

  static async listServiceVariants(serviceId: number): Promise<ServiceVariantDTO[]> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    let hasMaterialId = false;
    let hasQtyPerItem = false;
    let hasParentVariantId = false;
    let hasConsumptionMode = false;
    let hasMeterBasis = false;
    try { hasMaterialId = await hasColumn('service_variants', 'material_id'); } catch { /* ignore */ }
    try { hasQtyPerItem = await hasColumn('service_variants', 'qty_per_item'); } catch { /* ignore */ }
    try { hasParentVariantId = await hasColumn('service_variants', 'parent_variant_id'); } catch { /* ignore */ }
    try { hasConsumptionMode = await hasColumn('service_variants', 'consumption_mode'); } catch { /* ignore */ }
    try { hasMeterBasis = await hasColumn('service_variants', 'meter_basis'); } catch { /* ignore */ }
    const materialCols = hasMaterialId && hasQtyPerItem ? ', sv.material_id, sv.qty_per_item' : '';
    const parentCol = hasParentVariantId ? ', sv.parent_variant_id' : '';
    const consumptionCol = hasConsumptionMode ? ', sv.consumption_mode' : '';
    const meterBasisCol = hasMeterBasis ? ', sv.meter_basis' : '';
    const rollWidthCols = hasMaterialId
      ? ', m.sheet_width as material_sheet_width, m.printable_width as material_printable_width'
      : '';
    const materialJoin = hasMaterialId ? 'LEFT JOIN materials m ON m.id = sv.material_id' : '';
    const rows = await db.all<any[]>(
      `SELECT sv.id, sv.service_id, sv.variant_name, sv.parameters, sv.sort_order, sv.is_active, sv.created_at, sv.updated_at${parentCol}${materialCols}${consumptionCol}${meterBasisCol}${rollWidthCols}
       FROM service_variants sv
       ${materialJoin}
       WHERE sv.service_id = ?
       ORDER BY sv.sort_order, sv.id`,
      serviceId,
    );
    return rows.map((row) =>
      mapServiceVariantRow(row, {
        hasParentVariantId,
        hasMaterialId,
        hasQtyPerItem,
        hasConsumptionMode,
        hasMeterBasis,
      })
    );
  }

  static async createServiceVariant(serviceId: number, payload: CreateServiceVariantDTO): Promise<ServiceVariantDTO> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    let hasMaterialId = false;
    let hasQtyPerItem = false;
    let hasParentVariantId = false;
    let hasConsumptionMode = false;
    let hasMeterBasis = false;
    try { hasMaterialId = await hasColumn('service_variants', 'material_id'); } catch { /* ignore */ }
    try { hasQtyPerItem = await hasColumn('service_variants', 'qty_per_item'); } catch { /* ignore */ }
    try { hasParentVariantId = await hasColumn('service_variants', 'parent_variant_id'); } catch { /* ignore */ }
    try { hasConsumptionMode = await hasColumn('service_variants', 'consumption_mode'); } catch { /* ignore */ }
    try { hasMeterBasis = await hasColumn('service_variants', 'meter_basis'); } catch { /* ignore */ }
    const includeMaterial = hasMaterialId && hasQtyPerItem;
    const materialIdVal = payload.material_id != null && Number.isFinite(Number(payload.material_id)) ? Number(payload.material_id) : null;
    const qtyPerItemVal = payload.qty_per_item != null && Number.isFinite(Number(payload.qty_per_item)) ? Number(payload.qty_per_item) : 1;
    const serviceRow = await db.get<{ operation_type?: string | null; price_unit?: string | null; consumption_mode?: string | null; meter_basis?: string | null }>(
      `SELECT operation_type, price_unit, consumption_mode, meter_basis FROM post_processing_services WHERE id = ?`,
      serviceId
    );
    const payloadConsumption = (payload as any).consumption_mode;
    const servicePriceUnitLower = String(serviceRow?.price_unit || '').toLowerCase();
    const serviceNeedsRollFeed = defaultRollFeedForPriceUnit(
      serviceRow?.price_unit,
      serviceRow?.operation_type
    );
    // При привязке материала к per_m2 — roll_feed по умолчанию
    const materialLinkedToPerM2 = materialIdVal != null && servicePriceUnitLower === 'per_m2';
    const defaultRollFeed = serviceNeedsRollFeed || materialLinkedToPerM2;
    const derivedDefaultConsumption = normalizeConsumptionMode(
      serviceRow?.consumption_mode ?? (defaultRollFeed ? 'roll_feed' : 'fixed')
    );
    const consumptionModeVal = normalizeConsumptionMode(
      payloadConsumption,
      defaultRollFeed ? 'roll_feed' : derivedDefaultConsumption
    );
    const payloadMeterBasis = (payload as any).meter_basis;
    const defaultMeterBasis = normalizeMeterBasis(
      serviceRow?.meter_basis,
      consumptionModeVal === 'roll_feed' ||
        servicePriceUnitLower === 'per_meter' ||
        servicePriceUnitLower === 'per_m2'
        ? 'feed'
        : null
    );
    const meterBasisVal = normalizeMeterBasis(payloadMeterBasis, defaultMeterBasis);
    const parentId = normalizeParentVariantId(payload.parentVariantId ?? payload.parameters?.parentVariantId);
    const paramsMerged = parametersWithParentSync(payload.parameters || {}, parentId);

    let insertCols = 'service_id, variant_name, parameters, sort_order, is_active';
    const insertParams: any[] = [
      serviceId,
      payload.variantName,
      JSON.stringify(paramsMerged),
      payload.sortOrder ?? 0,
      payload.isActive === undefined || payload.isActive ? 1 : 0,
    ];
    if (hasParentVariantId) {
      insertCols += ', parent_variant_id';
      insertParams.push(parentId);
    }
    if (includeMaterial) {
      insertCols += ', material_id, qty_per_item';
      insertParams.push(materialIdVal, qtyPerItemVal);
    }
    if (hasConsumptionMode) {
      insertCols += ', consumption_mode';
      insertParams.push(consumptionModeVal);
    }
    if (hasMeterBasis) {
      insertCols += ', meter_basis';
      insertParams.push(meterBasisVal);
    }
    const insertPlaces = insertParams.map(() => '?').join(',');
    const result = await db.run(`INSERT INTO service_variants (${insertCols}) VALUES (${insertPlaces})`, ...insertParams);

    const parentSel = hasParentVariantId ? ', parent_variant_id' : '';
    const materialSel = includeMaterial ? ', material_id, qty_per_item' : '';
    const consumptionSel = hasConsumptionMode ? ', consumption_mode' : '';
    const meterBasisSel = hasMeterBasis ? ', meter_basis' : '';
    const row = await db.get<any>(
      `SELECT id, service_id, variant_name, parameters, sort_order, is_active, created_at, updated_at${parentSel}${materialSel}${consumptionSel}${meterBasisSel}
       FROM service_variants 
       WHERE id = ?`,
      result.lastID,
    );
    if (!row) {
      throw new Error('Failed to retrieve created service variant');
    }

    // Диапазон «от 1» и нулевые цены по всем границам — иначе в UI нет колонок цен
    try {
      await this.ensureDefaultRangeBoundary(serviceId, 1);
      await this.attachVariantToAllRanges(serviceId, Number(row.id));
    } catch (attachErr) {
      console.warn('createServiceVariant: не удалось привязать цены к диапазонам', attachErr);
    }
    // Как только появляется следующий уровень, цена родителя больше недействительна.
    await clearNonLeafVariantPrices(db, serviceId);

    let material_sheet_width: number | null = null;
    let material_printable_width: number | null = null;
    if (row.material_id != null) {
      try {
        const mat = await db.get<{ sheet_width?: number | null; printable_width?: number | null }>(
          `SELECT sheet_width, printable_width FROM materials WHERE id = ?`,
          row.material_id
        );
        material_sheet_width = mat?.sheet_width ?? null;
        material_printable_width = mat?.printable_width ?? null;
      } catch {
        /* ignore */
      }
    }
    return mapServiceVariantRow(
      { ...row, material_sheet_width, material_printable_width },
      {
        hasParentVariantId,
        hasMaterialId,
        hasQtyPerItem,
        hasConsumptionMode,
        hasMeterBasis,
      }
    );
  }

  static async updateServiceVariant(variantId: number, payload: UpdateServiceVariantDTO): Promise<ServiceVariantDTO | null> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    const current = await db.get<any>(`SELECT * FROM service_variants WHERE id = ?`, variantId);
    if (!current) {
      return null;
    }
    let hasMaterialId = false;
    let hasQtyPerItem = false;
    let hasParentVariantId = false;
    let hasConsumptionMode = false;
    let hasMeterBasis = false;
    try { hasMaterialId = await hasColumn('service_variants', 'material_id'); } catch { /* ignore */ }
    try { hasQtyPerItem = await hasColumn('service_variants', 'qty_per_item'); } catch { /* ignore */ }
    try { hasParentVariantId = await hasColumn('service_variants', 'parent_variant_id'); } catch { /* ignore */ }
    try { hasConsumptionMode = await hasColumn('service_variants', 'consumption_mode'); } catch { /* ignore */ }
    try { hasMeterBasis = await hasColumn('service_variants', 'meter_basis'); } catch { /* ignore */ }

    const currentParsed = parseServiceVariantParameters(current.parameters);
    const mergedParams =
      payload.parameters !== undefined ? { ...currentParsed, ...payload.parameters } : currentParsed;

    let parentResolved: number | null;
    if (payload.parentVariantId !== undefined) {
      parentResolved = normalizeParentVariantId(payload.parentVariantId);
    } else if (hasParentVariantId) {
      const fromMerged = normalizeParentVariantId(mergedParams.parentVariantId);
      const fromCol = normalizeParentVariantId(current.parent_variant_id);
      parentResolved = fromMerged !== null ? fromMerged : fromCol;
    } else {
      parentResolved = normalizeParentVariantId(mergedParams.parentVariantId);
    }

    const paramsFinal = parametersWithParentSync(mergedParams, parentResolved);

    const materialIdUpdate = hasMaterialId && payload.material_id !== undefined ? ', material_id = ?' : '';
    const qtyPerItemUpdate = hasQtyPerItem && payload.qty_per_item !== undefined ? ', qty_per_item = ?' : '';
    const consumptionModeUpdate = hasConsumptionMode && (payload as any).consumption_mode !== undefined ? ', consumption_mode = ?' : '';
    const meterBasisUpdate = hasMeterBasis && (payload as any).meter_basis !== undefined ? ', meter_basis = ?' : '';

    let setSql =
      'variant_name = ?, parameters = ?, sort_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP';
    const updateParams: any[] = [
      payload.variantName ?? current.variant_name,
      JSON.stringify(paramsFinal),
      payload.sortOrder !== undefined ? payload.sortOrder : current.sort_order,
      payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : current.is_active,
    ];
    if (hasParentVariantId) {
      setSql += ', parent_variant_id = ?';
      updateParams.push(parentResolved);
    }
    if (materialIdUpdate) {
      setSql += ', material_id = ?';
      updateParams.push(
        payload.material_id != null && Number.isFinite(Number(payload.material_id)) ? Number(payload.material_id) : null
      );
    }
    if (qtyPerItemUpdate) {
      setSql += ', qty_per_item = ?';
      updateParams.push(
        payload.qty_per_item != null && Number.isFinite(Number(payload.qty_per_item))
          ? Number(payload.qty_per_item)
          : (current.qty_per_item ?? 1)
      );
    }
    if (consumptionModeUpdate) {
      setSql += ', consumption_mode = ?';
      const fallbackMode = normalizeConsumptionMode(current.consumption_mode ?? 'fixed');
      updateParams.push(normalizeConsumptionMode((payload as any).consumption_mode, fallbackMode));
    }
    if (meterBasisUpdate) {
      setSql += ', meter_basis = ?';
      const fallbackBasis = normalizeMeterBasis(current.meter_basis, null);
      updateParams.push(normalizeMeterBasis((payload as any).meter_basis, fallbackBasis));
    }
    updateParams.push(variantId);

    await db.run(`UPDATE service_variants SET ${setSql} WHERE id = ?`, ...updateParams);
    await clearNonLeafVariantPrices(db, Number(current.service_id));

    const parentSel = hasParentVariantId ? ', sv.parent_variant_id' : '';
    const materialSel = hasMaterialId && hasQtyPerItem ? ', sv.material_id, sv.qty_per_item' : '';
    const consumptionSel = hasConsumptionMode ? ', sv.consumption_mode' : '';
    const meterBasisSel = hasMeterBasis ? ', sv.meter_basis' : '';
    const rollWidthCols = hasMaterialId
      ? ', m.sheet_width as material_sheet_width, m.printable_width as material_printable_width'
      : '';
    const materialJoin = hasMaterialId ? 'LEFT JOIN materials m ON m.id = sv.material_id' : '';
    const updated = await db.get<any>(
      `SELECT sv.id, sv.service_id, sv.variant_name, sv.parameters, sv.sort_order, sv.is_active, sv.created_at, sv.updated_at${parentSel}${materialSel}${consumptionSel}${meterBasisSel}${rollWidthCols}
       FROM service_variants sv
       ${materialJoin}
       WHERE sv.id = ?`,
      variantId,
    );
    if (!updated) {
      return null;
    }
    return mapServiceVariantRow(updated, {
      hasParentVariantId,
      hasMaterialId,
      hasQtyPerItem,
      hasConsumptionMode,
      hasMeterBasis,
    });
  }

  static async deleteServiceVariant(variantId: number): Promise<void> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    const variant = await db.get<{ service_id: number }>(
      `SELECT service_id FROM service_variants WHERE id = ?`,
      variantId,
    );
    if (!variant) return;
    const variants = await loadServiceVariantTreeRows(db, Number(variant.service_id));
    const idsToDelete = new Set<number>([variantId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const item of variants) {
        const parentId = resolveServiceVariantParentId(item);
        if (parentId != null && idsToDelete.has(parentId) && !idsToDelete.has(Number(item.id))) {
          idsToDelete.add(Number(item.id));
          changed = true;
        }
      }
    }
    const ids = [...idsToDelete];
    const placeholders = ids.map(() => '?').join(',');

    // Удаляем цены из обеих структур, чтобы legacy tiers не могли «воскреснуть».
    await db.run(`DELETE FROM service_variant_prices WHERE variant_id IN (${placeholders})`, ...ids);
    await db.run(`DELETE FROM service_volume_prices WHERE variant_id IN (${placeholders})`, ...ids);
    
    // Явно удаляем потомков: parent_variant_id исторически не имеет FK CASCADE.
    await db.run(`DELETE FROM service_variants WHERE id IN (${placeholders})`, ...ids);
    await clearNonLeafVariantPrices(db, Number(variant.service_id));
  }

  // ========== Новые методы для работы с оптимизированной структурой ==========

  /** Если у услуги ещё нет границ тиража — создаёт диапазон от minQuantity (обычно 1). */
  static async ensureDefaultRangeBoundary(serviceId: number, minQuantity: number = 1): Promise<number | null> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    const existing = await db.get<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM service_range_boundaries WHERE service_id = ?`,
      serviceId
    );
    if ((existing?.cnt ?? 0) > 0) return null;
    return this.addRangeBoundary(serviceId, minQuantity);
  }

  /** Привязывает вариант ко всем существующим границам (цена 0). */
  static async attachVariantToAllRanges(serviceId: number, variantId: number): Promise<void> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    const ranges = await db.all<{ id: number }[]>(
      `SELECT id FROM service_range_boundaries WHERE service_id = ? ORDER BY sort_order, min_quantity`,
      serviceId
    );
    for (const range of ranges || []) {
      try {
        await db.run(
          `INSERT INTO service_variant_prices (variant_id, range_id, price_per_unit, is_active)
           VALUES (?, ?, 0, 1)`,
          variantId,
          range.id
        );
      } catch (err: any) {
        if (!String(err?.message || '').includes('UNIQUE constraint')) throw err;
      }
    }
  }
  
  /**
   * Добавляет границу диапазона для сервиса (общую для всех вариантов)
   */
  static async addRangeBoundary(serviceId: number, minQuantity: number): Promise<number> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    
    // Проверяем существование сервиса
    const service = await db.get(`SELECT id FROM post_processing_services WHERE id = ?`, serviceId);
    if (!service) {
      const err: any = new Error(`Service with id ${serviceId} not found`);
      err.status = 404;
      throw err;
    }

    // Идемпотентность: повторное «от 1» не должно падать
    const existingRange = await db.get<{ id: number }>(
      `SELECT id FROM service_range_boundaries WHERE service_id = ? AND min_quantity = ?`,
      serviceId,
      minQuantity
    );
    if (existingRange?.id) {
      // Досоздаём нулевые цены для вариантов без строки по этой границе
      const leafVariantIds = await serviceVariantLeafIds(db, serviceId);
      for (const variantId of leafVariantIds) {
        try {
          await db.run(
            `INSERT INTO service_variant_prices (variant_id, range_id, price_per_unit, is_active)
             VALUES (
               ?,
               ?,
               COALESCE((
                 SELECT price_per_unit
                 FROM service_volume_prices
                 WHERE service_id = ? AND variant_id = ? AND min_quantity = ? AND is_active = 1
                 ORDER BY id DESC
                 LIMIT 1
               ), 0),
               1
             )`,
            variantId,
            existingRange.id,
            serviceId,
            variantId,
            minQuantity,
          );
        } catch (err: any) {
          if (!String(err?.message || '').includes('UNIQUE constraint')) throw err;
        }
      }
      return existingRange.id;
    }
    
    // Получаем текущий максимальный sort_order
    const maxSort = await db.get<{ max_sort: number }>(`
      SELECT COALESCE(MAX(sort_order), -1) as max_sort 
      FROM service_range_boundaries 
      WHERE service_id = ?
    `, serviceId);
    
    const result = await db.run(`
      INSERT INTO service_range_boundaries (service_id, min_quantity, sort_order, is_active)
      VALUES (?, ?, ?, 1)
    `, serviceId, minQuantity, (maxSort?.max_sort ?? -1) + 1);
    
    const rangeId = result.lastID;
    
    // Создаем цены для всех существующих вариантов с ценой 0
    const leafVariantIds = await serviceVariantLeafIds(db, serviceId);
    
    for (const variantId of leafVariantIds) {
      try {
        await db.run(`
          INSERT INTO service_variant_prices (variant_id, range_id, price_per_unit, is_active)
          VALUES (
            ?,
            ?,
            COALESCE((
              SELECT price_per_unit
              FROM service_volume_prices
              WHERE service_id = ? AND variant_id = ? AND min_quantity = ? AND is_active = 1
              ORDER BY id DESC
              LIMIT 1
            ), 0),
            1
          )
        `, variantId, rangeId, serviceId, variantId, minQuantity);
      } catch (err: any) {
        // Игнорируем ошибки UNIQUE constraint
        if (!err.message?.includes('UNIQUE constraint')) {
          throw err;
        }
      }
    }
    
    return rangeId!;
  }
  
  /**
   * Удаляет границу диапазона (и все связанные цены вариантов)
   */
  static async removeRangeBoundary(serviceId: number, minQuantity: number): Promise<void> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    
    // Находим range_id по min_quantity
    const range = await db.get<{ id: number }>(`
      SELECT id FROM service_range_boundaries 
      WHERE service_id = ? AND min_quantity = ?
    `, serviceId, minQuantity);
    
    if (!range) {
      const err: any = new Error(`Range boundary with min_quantity ${minQuantity} not found for service ${serviceId}`);
      err.status = 404;
      throw err;
    }
    
    // Удаляем все связанные цены (CASCADE через foreign key)
    await db.run(`DELETE FROM service_variant_prices WHERE range_id = ?`, range.id);
    
    // Удаляем границу диапазона
    await db.run(`DELETE FROM service_range_boundaries WHERE id = ?`, range.id);
  }
  
  /**
   * Обновляет границу диапазона (изменяет min_quantity)
   */
  static async updateRangeBoundary(serviceId: number, oldMinQuantity: number, newMinQuantity: number): Promise<void> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    
    // Находим range_id
    const range = await db.get<{ id: number }>(`
      SELECT id FROM service_range_boundaries 
      WHERE service_id = ? AND min_quantity = ?
    `, serviceId, oldMinQuantity);
    
    if (!range) {
      const err: any = new Error(`Range boundary with min_quantity ${oldMinQuantity} not found for service ${serviceId}`);
      err.status = 404;
      throw err;
    }
    
    // Обновляем min_quantity
    await db.run(`
      UPDATE service_range_boundaries 
      SET min_quantity = ? 
      WHERE id = ?
    `, newMinQuantity, range.id);
  }
  
  /**
   * Обновляет цену для конкретного диапазона (общие tiers для всех вариантов услуги)
   * 🆕 Tiers теперь общие для всех вариантов одной услуги
   */
  static async updateVariantPrice(variantId: number, minQuantity: number, price: number): Promise<void> {
    const db = await this.getConnection();
    await this.ensureSchema(db);

    // Находим range_id по min_quantity через service_id варианта
    const variant = await db.get<{ service_id: number }>(`
      SELECT service_id FROM service_variants WHERE id = ?
    `, variantId);
    
    if (!variant) {
      const err: any = new Error(`Variant with id ${variantId} not found`);
      err.status = 404;
      throw err;
    }
    await assertServiceVariantPricingLeaf(db, Number(variant.service_id), variantId);
    
    const range = await db.get<{ id: number }>(`
      SELECT id FROM service_range_boundaries 
      WHERE service_id = ? AND min_quantity = ?
    `, variant.service_id, minQuantity);
    
    if (!range) {
      const err: any = new Error(`Range boundary with min_quantity ${minQuantity} not found`);
      err.status = 404;
      throw err;
    }
    
    // Обновляем или создаем цену
    const existing = await db.get<{ id: number }>(`
      SELECT id FROM service_variant_prices 
      WHERE variant_id = ? AND range_id = ?
    `, variantId, range.id);
    
    if (existing) {
      // Обновляем существующую цену
      await db.run(`
        UPDATE service_variant_prices 
        SET price_per_unit = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, price, existing.id);
    } else {
      // Создаем новую цену
      await db.run(`
        INSERT INTO service_variant_prices (variant_id, range_id, price_per_unit, is_active)
        VALUES (?, ?, ?, 1)
      `, variantId, range.id, price);
    }
  }
}


