import { Database } from 'sqlite';
import { getDb } from '../../../db';
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
} from '../dtos/service.dto';

const DEFAULT_CURRENCY = 'BYN';

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
  operation_type?: string; // 🆕
  unit: string;
  price_unit?: string;
  price_per_unit: number;
  is_active: number;
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

    // Обновление схемы для существующих БД (добавляем column, если отсутствует)
    try {
      const columns = await db.all(`PRAGMA table_info('service_prices')`);
      const hasServiceType = columns.some((column: any) => column.name === 'service_type');
      if (!hasServiceType) {
        await db.run(`ALTER TABLE service_prices ADD COLUMN service_type TEXT DEFAULT 'generic'`);
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

    // Добавляем variant_id в service_volume_prices, если его нет
    try {
      const columns = await db.all(`PRAGMA table_info('service_volume_prices')`);
      const hasVariantId = columns.some((column: any) => column.name === 'variant_id');
      if (!hasVariantId) {
        await db.run(`ALTER TABLE service_volume_prices ADD COLUMN variant_id INTEGER REFERENCES service_variants(id) ON DELETE CASCADE`);
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
  }

  private static mapService(row: RawServiceRow): PricingServiceDTO {
    const priceUnit = row.price_unit ?? 'per_item';
    return {
      id: row.id,
      name: row.service_name,
      type: row.service_type ?? 'generic',
      // Для обратной совместимости с фронтом: если цена "за рез/за лист/фикс" — показываем это в unit,
      // потому что в UI поле unit сейчас совмещает unit и price_unit.
      unit:
        priceUnit && priceUnit !== 'per_item'
          ? priceUnit
          : row.unit,
      priceUnit,
      rate: Number(row.price_per_unit ?? 0),
      currency: DEFAULT_CURRENCY,
      isActive: !!row.is_active,
      operationType: row.operation_type, // 🆕
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
    // ИЗМЕНЕНО: Берем из post_processing_services вместо service_prices
    const rows = await db.all<any[]>(`
      SELECT 
        id, 
        name as service_name, 
        operation_type as service_type,
        operation_type, 
        unit, 
        price_unit,
        price as price_per_unit, 
        is_active 
      FROM post_processing_services 
      ORDER BY name
    `);
    return rows.map(this.mapService);
  }

  static async getServiceById(id: number): Promise<PricingServiceDTO | null> {
    const db = await this.getConnection();
    // ИЗМЕНЕНО: Читаем из post_processing_services
    const row = await db.get<any>(`
      SELECT 
        id, 
        name as service_name, 
        operation_type as service_type, 
        unit, 
        price_unit,
        price as price_per_unit, 
        is_active 
      FROM post_processing_services 
      WHERE id = ?
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

    const result = await db.run(
      `INSERT INTO post_processing_services (name, operation_type, unit, price_unit, price, is_active) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      payload.name,
      operationType,
      resolvedUnit,
      resolvedPriceUnit,
      Number(payload.rate ?? 0),
      payload.isActive === undefined || payload.isActive ? 1 : 0,
    );
    const created = await db.get<any>(`
      SELECT 
        id, 
        name as service_name, 
        operation_type as service_type,
        operation_type, 
        unit, 
        price_unit,
        price as price_per_unit, 
        is_active 
      FROM post_processing_services 
      WHERE id = ?
    `, result.lastID);
    if (!created) {
      throw new Error('Failed to retrieve created service record');
    }
    return this.mapService(created);
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

    await db.run(
      `UPDATE post_processing_services 
       SET name = ?, operation_type = ?, unit = ?, price_unit = ?, price = ?, is_active = ? 
       WHERE id = ?`,
      payload.name ?? current.name,
      operationType,
      resolvedUnit,
      resolvedPriceUnit,
      payload.rate !== undefined ? payload.rate : current.price,
      payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : current.is_active,
      id,
    );

    const updated = await db.get<any>(`
      SELECT 
        id, 
        name as service_name, 
        operation_type as service_type,
        operation_type, 
        unit, 
        price_unit,
        price as price_per_unit, 
        is_active 
      FROM post_processing_services 
      WHERE id = ?
    `, id);
    return updated ? this.mapService(updated) : null;
  }

  static async deleteService(id: number): Promise<void> {
    const db = await this.getConnection();
    // ИЗМЕНЕНО: Удаляем из post_processing_services
    await db.run(`DELETE FROM service_volume_prices WHERE service_id = ?`, id);
    await db.run(`DELETE FROM post_processing_services WHERE id = ?`, id);
  }

  static async listServiceTiers(serviceId: number, variantId?: number): Promise<ServiceVolumeTierDTO[]> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    
    let query = `SELECT id, service_id, variant_id, min_quantity, price_per_unit, is_active FROM service_volume_prices WHERE service_id = ?`;
    const params: any[] = [serviceId];
    
    if (variantId !== undefined && variantId !== null) {
      // Для варианта возвращаем только его tiers
      query += ` AND variant_id = ?`;
      params.push(variantId);
    } else {
      // Для услуги без варианта возвращаем только общие tiers
      query += ` AND variant_id IS NULL`;
    }
    
    query += ` ORDER BY min_quantity`;
    
    try {
      const rows = await db.all<RawTierRow[]>(query, ...params);
      return rows.map(this.mapTier);
    } catch (error: any) {
      console.error('Error in listServiceTiers:', error);
      console.error('Query:', query);
      console.error('Params:', params);
      throw error;
    }
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

  // Методы для работы с вариантами услуг
  static async listServiceVariants(serviceId: number): Promise<ServiceVariantDTO[]> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    const rows = await db.all<any[]>(
      `SELECT id, service_id, variant_name, parameters, sort_order, is_active, created_at, updated_at 
       FROM service_variants 
       WHERE service_id = ? 
       ORDER BY sort_order, id`,
      serviceId,
    );
    return rows.map(row => ({
      id: row.id,
      serviceId: row.service_id,
      variantName: row.variant_name,
      parameters: typeof row.parameters === 'string' ? JSON.parse(row.parameters) : (row.parameters || {}),
      sortOrder: row.sort_order || 0,
      isActive: row.is_active !== undefined ? !!row.is_active : true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  static async createServiceVariant(serviceId: number, payload: CreateServiceVariantDTO): Promise<ServiceVariantDTO> {
    const db = await this.getConnection();
    // Убираем ensureSchema отсюда - схема проверяется при getConnection()
    const result = await db.run(
      `INSERT INTO service_variants (service_id, variant_name, parameters, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      serviceId,
      payload.variantName,
      JSON.stringify(payload.parameters || {}),
      payload.sortOrder ?? 0,
      payload.isActive === undefined || payload.isActive ? 1 : 0,
    );
    const row = await db.get<any>(
      `SELECT id, service_id, variant_name, parameters, sort_order, is_active, created_at, updated_at 
       FROM service_variants 
       WHERE id = ?`,
      result.lastID,
    );
    if (!row) {
      throw new Error('Failed to retrieve created service variant');
    }
    return {
      id: row.id,
      serviceId: row.service_id,
      variantName: row.variant_name,
      parameters: typeof row.parameters === 'string' ? JSON.parse(row.parameters) : (row.parameters || {}),
      sortOrder: row.sort_order || 0,
      isActive: row.is_active !== undefined ? !!row.is_active : true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  static async updateServiceVariant(variantId: number, payload: UpdateServiceVariantDTO): Promise<ServiceVariantDTO | null> {
    const db = await this.getConnection();
    await this.ensureSchema(db);
    const current = await db.get<any>(`SELECT * FROM service_variants WHERE id = ?`, variantId);
    if (!current) {
      return null;
    }

    await db.run(
      `UPDATE service_variants 
       SET variant_name = ?, parameters = ?, sort_order = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      payload.variantName ?? current.variant_name,
      payload.parameters !== undefined ? JSON.stringify(payload.parameters) : current.parameters,
      payload.sortOrder !== undefined ? payload.sortOrder : current.sort_order,
      payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : current.is_active,
      variantId,
    );

    const updated = await db.get<any>(
      `SELECT id, service_id, variant_name, parameters, sort_order, is_active, created_at, updated_at 
       FROM service_variants 
       WHERE id = ?`,
      variantId,
    );
    if (!updated) {
      return null;
    }
    return {
      id: updated.id,
      serviceId: updated.service_id,
      variantName: updated.variant_name,
      parameters: typeof updated.parameters === 'string' ? JSON.parse(updated.parameters) : (updated.parameters || {}),
      sortOrder: updated.sort_order || 0,
      isActive: updated.is_active !== undefined ? !!updated.is_active : true,
      createdAt: updated.created_at,
      updatedAt: updated.updated_at,
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
   * Обновляет цену варианта для конкретного диапазона
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
      await db.run(`
        UPDATE service_variant_prices 
        SET price_per_unit = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, price, existing.id);
    } else {
      await db.run(`
        INSERT INTO service_variant_prices (variant_id, range_id, price_per_unit, is_active)
        VALUES (?, ?, ?, 1)
      `, variantId, range.id, price);
    }
  }
}


