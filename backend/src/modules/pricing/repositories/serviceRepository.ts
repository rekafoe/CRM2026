import { Database } from 'sqlite';
import { getDb } from '../../../db';
import { hasColumn, invalidateTableSchemaCache } from '../../../utils/tableSchemaCache';
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

// post_processing_services.operation_type имеет CHECK constraint на фиксированный список значений.
// Фронт/админка иногда присылает агрегированные типы (например "postprint"), которые в БД запрещены.
// Поэтому нормализуем тип перед записью.
const ALLOWED_OPERATION_TYPES = new Set<string>([
  'print',
  'cut',
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
};

type RawTierRow = {
  id: number;
  service_id: number;
  variant_id?: number | null;
  min_quantity: number;
  price_per_unit: number;
  is_active: number;
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
    try { hasOpPercent = await hasColumn('post_processing_services', 'operator_percent'); } catch { /* ignore */ }
    try { hasCategoryId = await hasColumn('post_processing_services', 'category_id'); } catch { /* ignore */ }
    try { hasMaterialId = await hasColumn('post_processing_services', 'material_id'); } catch { /* ignore */ }
    try { hasQtyPerItem = await hasColumn('post_processing_services', 'qty_per_item'); } catch { /* ignore */ }
    const opPercentSel = hasOpPercent ? ', pps.operator_percent' : '';
    const categorySel = hasCategoryId ? ', pps.category_id, sc.name as category_name' : '';
    const materialSel = (hasMaterialId && hasQtyPerItem) ? `, ${hasCategoryId ? 'pps.' : ''}material_id, ${hasCategoryId ? 'pps.' : ''}qty_per_item` : '';
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
        ${prefix}max_quantity${opPercentSel}${categorySel}${materialSel}
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
    try { hasOpPercent = await hasColumn('post_processing_services', 'operator_percent'); } catch { /* ignore */ }
    try { hasCategoryId = await hasColumn('post_processing_services', 'category_id'); } catch { /* ignore */ }
    try { hasMaterialId = await hasColumn('post_processing_services', 'material_id'); } catch { /* ignore */ }
    try { hasQtyPerItem = await hasColumn('post_processing_services', 'qty_per_item'); } catch { /* ignore */ }
    const opPercentSel = hasOpPercent ? ', pps.operator_percent' : '';
    const categorySel = hasCategoryId ? ', pps.category_id, sc.name as category_name' : '';
    const materialSel = (hasMaterialId && hasQtyPerItem) ? `, ${hasCategoryId ? 'pps.' : ''}material_id, ${hasCategoryId ? 'pps.' : ''}qty_per_item` : '';
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
        ${prefix}max_quantity${opPercentSel}${categorySel}${materialSel}
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
    try { hasOpPercent = await hasColumn('post_processing_services', 'operator_percent'); } catch { /* ignore */ }
    try { hasCategoryId = await hasColumn('post_processing_services', 'category_id'); } catch { /* ignore */ }
    try { hasMaterialId = await hasColumn('post_processing_services', 'material_id'); } catch { /* ignore */ }
    try { hasQtyPerItem = await hasColumn('post_processing_services', 'qty_per_item'); } catch { /* ignore */ }
    const opPercentSel = hasOpPercent ? ', pps.operator_percent' : '';
    const categorySel = hasCategoryId ? ', pps.category_id, sc.name as category_name' : '';
    const materialSel = (hasMaterialId && hasQtyPerItem) ? `, ${hasCategoryId ? 'pps.' : ''}material_id, ${hasCategoryId ? 'pps.' : ''}qty_per_item` : '';
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
        ${prefix}max_quantity${opPercentSel}${categorySel}${materialSel}
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
    // Совместимость с UI: если payload.unit содержит per_cut/per_sheet/... — это на самом деле price_unit
    const rawUnit = (payload.unit ?? '').toString();
    const rawPriceUnit = (payload.priceUnit ?? '').toString();
    const isPriceUnitFromUnit = ['per_cut', 'per_sheet', 'per_item', 'fixed', 'per_order'].includes(rawUnit);
    const resolvedPriceUnit = rawPriceUnit || (isPriceUnitFromUnit ? rawUnit : 'per_item');
    const resolvedUnit = isPriceUnitFromUnit ? 'шт' : rawUnit;
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
    try { hasOpPercent = await hasColumn('post_processing_services', 'operator_percent'); } catch { /* ignore */ }
    try { hasCategoryId = await hasColumn('post_processing_services', 'category_id'); } catch { /* ignore */ }
    try { hasMaterialId = await hasColumn('post_processing_services', 'material_id'); } catch { /* ignore */ }
    try { hasQtyPerItem = await hasColumn('post_processing_services', 'qty_per_item'); } catch { /* ignore */ }
    const opPercentVal = (payload as any).operator_percent;
    const includeOpPercent = hasOpPercent && opPercentVal !== undefined && opPercentVal !== null && Number.isFinite(Number(opPercentVal));
    const categoryIdVal = payload.categoryId != null && Number.isFinite(Number(payload.categoryId)) ? Number(payload.categoryId) : null;
    const includeCategoryId = hasCategoryId;
    const includeMaterial = hasMaterialId && hasQtyPerItem;
    const materialIdVal = (payload as any).material_id != null && Number.isFinite(Number((payload as any).material_id)) ? Number((payload as any).material_id) : null;
    const qtyPerItemVal = (payload as any).qty_per_item != null && Number.isFinite(Number((payload as any).qty_per_item)) ? Number((payload as any).qty_per_item) : 1;
    const insertCols = [
      'name', 'operation_type', 'unit', 'price_unit', 'price', 'is_active', 'min_quantity', 'max_quantity',
      ...(includeOpPercent ? ['operator_percent'] : []),
      ...(includeCategoryId ? ['category_id'] : []),
      ...(includeMaterial ? ['material_id', 'qty_per_item'] : []),
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
    const result = await db.run(
      `INSERT INTO post_processing_services (${insertCols.join(', ')}) VALUES (${insertVals})`,
      ...insertParams
    );
    const opPercentSel = hasOpPercent ? ', operator_percent' : '';
    const categorySel = hasCategoryId ? ', category_id, (SELECT name FROM service_categories WHERE id = post_processing_services.category_id) as category_name' : '';
    const materialSel = includeMaterial ? ', material_id, qty_per_item' : '';
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
        max_quantity${opPercentSel}${categorySel}${materialSel}
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

    const rawUnit = payload.unit !== undefined ? String(payload.unit) : '';
    const rawPriceUnit = payload.priceUnit !== undefined ? String(payload.priceUnit) : '';
    const isPriceUnitFromUnit = rawUnit ? ['per_cut', 'per_sheet', 'per_item', 'fixed', 'per_order'].includes(rawUnit) : false;
    const resolvedPriceUnit = rawPriceUnit || (isPriceUnitFromUnit ? rawUnit : (current.price_unit ?? 'per_item'));
    const resolvedUnit = isPriceUnitFromUnit
      ? (current.unit ?? 'шт')
      : (payload.unit ?? current.unit);
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
    try { hasOpPercent = await hasColumn('post_processing_services', 'operator_percent'); } catch { /* ignore */ }
    try { hasCategoryId = await hasColumn('post_processing_services', 'category_id'); } catch { /* ignore */ }
    try { hasMaterialId = await hasColumn('post_processing_services', 'material_id'); } catch { /* ignore */ }
    try { hasQtyPerItem = await hasColumn('post_processing_services', 'qty_per_item'); } catch { /* ignore */ }
    const opPercentUpdate = hasOpPercent && (payload as any).operator_percent !== undefined ? ', operator_percent = ?' : '';
    const categoryIdUpdate = hasCategoryId && payload.categoryId !== undefined
      ? ', category_id = ?'
      : '';
    const materialIdUpdate = hasMaterialId && (payload as any).material_id !== undefined ? ', material_id = ?' : '';
    const qtyPerItemUpdate = hasQtyPerItem && (payload as any).qty_per_item !== undefined ? ', qty_per_item = ?' : '';
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
    updateParams.push(id);
    await db.run(
      `UPDATE post_processing_services 
       SET name = ?, operation_type = ?, unit = ?, price_unit = ?, price = ?, is_active = ?, min_quantity = ?, max_quantity = ?${opPercentUpdate}${categoryIdUpdate}${materialIdUpdate}${qtyPerItemUpdate}
       WHERE id = ?`,
      ...updateParams
    );

    const opPercentSel = hasOpPercent ? ', operator_percent' : '';
    const categorySel = hasCategoryId ? ', category_id, (SELECT name FROM service_categories WHERE id = post_processing_services.category_id) as category_name' : '';
    const materialSel = (hasMaterialId && hasQtyPerItem) ? ', material_id, qty_per_item' : '';
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
        max_quantity${opPercentSel}${categorySel}${materialSel}
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
      // Если для варианта нет цен в service_volume_prices — пробуем service_variant_prices (новая структура)
      if (result.length === 0 && variantId != null && Number.isFinite(variantId)) {
        const fromNew = await this.listServiceTiersFromVariantPrices(serviceId, variantId);
        if (fromNew.length > 0) return fromNew;
      }
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
      // Используем новую оптимизированную структуру с JOIN
      // Если новые таблицы существуют, используем их, иначе fallback на старую структуру
      const hasNewStructure = await db.get(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='service_range_boundaries'
      `);
      
      if (hasNewStructure) {
        // Новая структура: JOIN между service_variant_prices и service_range_boundaries
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
        
        // Группируем по variant_id
        const tiersMap = new Map<number, ServiceVolumeTierDTO[]>();
        for (const row of rows) {
          const variantId = row.variant_id;
          if (variantId !== null && variantId !== undefined) {
            const variantIdNum = Number(variantId);
            if (!tiersMap.has(variantIdNum)) {
              tiersMap.set(variantIdNum, []);
            }
            tiersMap.get(variantIdNum)!.push({
              id: row.id,
              serviceId: row.service_id,
              variantId: variantIdNum,
              minQuantity: row.min_quantity,
              rate: row.price_per_unit,
              isActive: !!row.is_active,
            });
          }
        }
        
        return tiersMap;
      } else {
        // Fallback на старую структуру для обратной совместимости
        const rows = await db.all<RawTierRow[]>(
          `SELECT id, service_id, variant_id, min_quantity, price_per_unit, is_active 
           FROM service_volume_prices 
           WHERE service_id = ? AND variant_id IS NOT NULL
           ORDER BY variant_id, min_quantity`,
          serviceId
        );
        
        const tiersMap = new Map<number, ServiceVolumeTierDTO[]>();
        for (const row of rows) {
          const variantId = row.variant_id;
          if (variantId !== null && variantId !== undefined) {
            const variantIdNum = Number(variantId);
            if (!tiersMap.has(variantIdNum)) {
              tiersMap.set(variantIdNum, []);
            }
            tiersMap.get(variantIdNum)!.push(this.mapTier(row));
          }
        }
        
        return tiersMap;
      }
    } catch (error: any) {
      console.error('Error in listAllVariantTiers:', error);
      console.error('ServiceId:', serviceId);
      throw error;
    }
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
  static async listServiceVariants(serviceId: number): Promise<ServiceVariantDTO[]> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    let hasMaterialId = false;
    let hasQtyPerItem = false;
    let hasParentVariantId = false;
    try { hasMaterialId = await hasColumn('service_variants', 'material_id'); } catch { /* ignore */ }
    try { hasQtyPerItem = await hasColumn('service_variants', 'qty_per_item'); } catch { /* ignore */ }
    try { hasParentVariantId = await hasColumn('service_variants', 'parent_variant_id'); } catch { /* ignore */ }
    const materialCols = hasMaterialId && hasQtyPerItem ? ', material_id, qty_per_item' : '';
    const parentCol = hasParentVariantId ? ', parent_variant_id' : '';
    const rows = await db.all<any[]>(
      `SELECT id, service_id, variant_name, parameters, sort_order, is_active, created_at, updated_at${parentCol}${materialCols}
       FROM service_variants 
       WHERE service_id = ? 
       ORDER BY sort_order, id`,
      serviceId,
    );
    return rows.map((row) => {
      const paramsRaw = parseServiceVariantParameters(row.parameters);
      const parentColVal = hasParentVariantId ? normalizeParentVariantId(row.parent_variant_id) : null;
      const parentFromJson = normalizeParentVariantId(paramsRaw.parentVariantId);
      const parentResolved = parentColVal !== null ? parentColVal : parentFromJson;
      const parameters = parametersWithParentSync(paramsRaw, parentResolved);
      return {
        id: row.id,
        serviceId: row.service_id,
        variantName: row.variant_name,
        parameters,
        sortOrder: row.sort_order || 0,
        isActive: row.is_active !== undefined ? !!row.is_active : true,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ...(hasParentVariantId ? { parentVariantId: parentResolved } : {}),
        ...(hasMaterialId && row.material_id != null ? { material_id: row.material_id } : {}),
        ...(hasQtyPerItem && row.qty_per_item != null ? { qty_per_item: Number(row.qty_per_item) } : {}),
      };
    });
  }

  static async createServiceVariant(serviceId: number, payload: CreateServiceVariantDTO): Promise<ServiceVariantDTO> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    let hasMaterialId = false;
    let hasQtyPerItem = false;
    let hasParentVariantId = false;
    try { hasMaterialId = await hasColumn('service_variants', 'material_id'); } catch { /* ignore */ }
    try { hasQtyPerItem = await hasColumn('service_variants', 'qty_per_item'); } catch { /* ignore */ }
    try { hasParentVariantId = await hasColumn('service_variants', 'parent_variant_id'); } catch { /* ignore */ }
    const includeMaterial = hasMaterialId && hasQtyPerItem;
    const materialIdVal = payload.material_id != null && Number.isFinite(Number(payload.material_id)) ? Number(payload.material_id) : null;
    const qtyPerItemVal = payload.qty_per_item != null && Number.isFinite(Number(payload.qty_per_item)) ? Number(payload.qty_per_item) : 1;
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
    const insertPlaces = insertParams.map(() => '?').join(',');
    const result = await db.run(`INSERT INTO service_variants (${insertCols}) VALUES (${insertPlaces})`, ...insertParams);

    const parentSel = hasParentVariantId ? ', parent_variant_id' : '';
    const materialSel = includeMaterial ? ', material_id, qty_per_item' : '';
    const row = await db.get<any>(
      `SELECT id, service_id, variant_name, parameters, sort_order, is_active, created_at, updated_at${parentSel}${materialSel}
       FROM service_variants 
       WHERE id = ?`,
      result.lastID,
    );
    if (!row) {
      throw new Error('Failed to retrieve created service variant');
    }
    const paramsRaw = parseServiceVariantParameters(row.parameters);
    const parentColVal = hasParentVariantId ? normalizeParentVariantId(row.parent_variant_id) : null;
    const parentFromJson = normalizeParentVariantId(paramsRaw.parentVariantId);
    const parentResolved = parentColVal !== null ? parentColVal : parentFromJson;
    const parameters = parametersWithParentSync(paramsRaw, parentResolved);
    return {
      id: row.id,
      serviceId: row.service_id,
      variantName: row.variant_name,
      parameters,
      sortOrder: row.sort_order || 0,
      isActive: row.is_active !== undefined ? !!row.is_active : true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(hasParentVariantId ? { parentVariantId: parentResolved } : {}),
      ...(row.material_id != null ? { material_id: row.material_id } : {}),
      ...(row.qty_per_item != null ? { qty_per_item: Number(row.qty_per_item) } : {}),
    };
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
    try { hasMaterialId = await hasColumn('service_variants', 'material_id'); } catch { /* ignore */ }
    try { hasQtyPerItem = await hasColumn('service_variants', 'qty_per_item'); } catch { /* ignore */ }
    try { hasParentVariantId = await hasColumn('service_variants', 'parent_variant_id'); } catch { /* ignore */ }

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
    updateParams.push(variantId);

    await db.run(`UPDATE service_variants SET ${setSql} WHERE id = ?`, ...updateParams);

    const parentSel = hasParentVariantId ? ', parent_variant_id' : '';
    const materialSel = hasMaterialId && hasQtyPerItem ? ', material_id, qty_per_item' : '';
    const updated = await db.get<any>(
      `SELECT id, service_id, variant_name, parameters, sort_order, is_active, created_at, updated_at${parentSel}${materialSel}
       FROM service_variants 
       WHERE id = ?`,
      variantId,
    );
    if (!updated) {
      return null;
    }
    const paramsRaw = parseServiceVariantParameters(updated.parameters);
    const parentColVal = hasParentVariantId ? normalizeParentVariantId(updated.parent_variant_id) : null;
    const parentFromJson = normalizeParentVariantId(paramsRaw.parentVariantId);
    const parentResolvedOut = parentColVal !== null ? parentColVal : parentFromJson;
    const parameters = parametersWithParentSync(paramsRaw, parentResolvedOut);

    return {
      id: updated.id,
      serviceId: updated.service_id,
      variantName: updated.variant_name,
      parameters,
      sortOrder: updated.sort_order || 0,
      isActive: updated.is_active !== undefined ? !!updated.is_active : true,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
      ...(hasParentVariantId ? { parentVariantId: parentResolvedOut } : {}),
      ...(updated.material_id != null ? { material_id: updated.material_id } : {}),
      ...(updated.qty_per_item != null ? { qty_per_item: Number(updated.qty_per_item) } : {}),
    };
  }

  static async deleteServiceVariant(variantId: number): Promise<void> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    
    // Проверяем, используем ли мы новую структуру
    const hasNewStructure = await db.get(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='service_variant_prices'
    `);
    
    if (hasNewStructure) {
      // Новая структура: удаляем цены варианта
      await db.run(`DELETE FROM service_variant_prices WHERE variant_id = ?`, variantId);
    } else {
      // Старая структура: удаляем tiers варианта
      await db.run(`DELETE FROM service_volume_prices WHERE variant_id = ?`, variantId);
    }
    
    // Удаляем вариант
    await db.run(`DELETE FROM service_variants WHERE id = ?`, variantId);
  }

  // ========== Новые методы для работы с оптимизированной структурой ==========
  
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
    const variants = await db.all<{ id: number }[]>(`
      SELECT id FROM service_variants WHERE service_id = ?
    `, serviceId);
    
    for (const variant of variants) {
      try {
        await db.run(`
          INSERT INTO service_variant_prices (variant_id, range_id, price_per_unit, is_active)
          VALUES (?, ?, 0, 1)
        `, variant.id, rangeId);
      } catch (err: any) {
        // Игнорируем ошибки UNIQUE constraint
        if (!err.message?.includes('UNIQUE constraint')) {
          throw err;
        }
      }
    }
    
    return rangeId;
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


