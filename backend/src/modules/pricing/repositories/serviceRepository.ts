import { Database } from 'sqlite';
import { getDb } from '../../../db';
import {
  CreatePricingServiceDTO,
  PricingServiceDTO,
  ServiceVolumeTierDTO,
  CreateServiceVolumeTierDTO,
  UpdatePricingServiceDTO,
  UpdateServiceVolumeTierDTO,
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
  unit: string;
  price_per_unit: number;
  is_active: number;
};

type RawTierRow = {
  id: number;
  service_id: number;
  min_quantity: number;
  price_per_unit: number;
  is_active: number;
};

export class PricingServiceRepository {
  private static async getConnection(): Promise<Database> {
    const db = await getDb();
    await this.ensureSchema(db);
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
    await db.exec(`CREATE TABLE IF NOT EXISTS service_volume_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_id INTEGER NOT NULL,
      min_quantity INTEGER NOT NULL,
      price_per_unit REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(service_id) REFERENCES service_prices(id) ON DELETE CASCADE
    )`);
  }

  private static mapService(row: RawServiceRow): PricingServiceDTO {
    return {
      id: row.id,
      name: row.service_name,
      type: row.service_type ?? 'generic',
      unit: row.unit,
      rate: Number(row.price_per_unit ?? 0),
      currency: DEFAULT_CURRENCY,
      isActive: !!row.is_active,
    };
  }

  private static mapTier(row: RawTierRow): ServiceVolumeTierDTO {
    return {
      id: row.id,
      serviceId: row.service_id,
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
        unit, 
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
    const operationType = normalizeOperationType(payload.type);
    if (typeof payload.type === 'string' && payload.type.trim() && !ALLOWED_OPERATION_TYPES.has(payload.type.trim()) && payload.type.trim() !== 'postprint' && payload.type.trim() !== 'generic') {
      const err: any = new Error(
        `Недопустимый operation_type: "${payload.type}". Разрешено: ${Array.from(ALLOWED_OPERATION_TYPES).join(', ')}`
      );
      err.status = 400;
      throw err;
    }
    const result = await db.run(
      `INSERT INTO post_processing_services (name, operation_type, unit, price, is_active) 
       VALUES (?, ?, ?, ?, ?)`,
      payload.name,
      operationType,
      payload.unit,
      Number(payload.rate ?? 0),
      payload.isActive === undefined || payload.isActive ? 1 : 0,
    );
    const created = await db.get<any>(`
      SELECT 
        id, 
        name as service_name, 
        operation_type as service_type, 
        unit, 
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

    const operationType = payload.type !== undefined
      ? normalizeOperationType(payload.type)
      : (current.operation_type ?? 'other');

    if (typeof payload.type === 'string' && payload.type.trim() && !ALLOWED_OPERATION_TYPES.has(payload.type.trim()) && payload.type.trim() !== 'postprint' && payload.type.trim() !== 'generic') {
      const err: any = new Error(
        `Недопустимый operation_type: "${payload.type}". Разрешено: ${Array.from(ALLOWED_OPERATION_TYPES).join(', ')}`
      );
      err.status = 400;
      throw err;
    }

    await db.run(
      `UPDATE post_processing_services 
       SET name = ?, operation_type = ?, unit = ?, price = ?, is_active = ? 
       WHERE id = ?`,
      payload.name ?? current.name,
      operationType,
      payload.unit ?? current.unit,
      payload.rate !== undefined ? payload.rate : current.price,
      payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : current.is_active,
      id,
    );

    const updated = await db.get<any>(`
      SELECT 
        id, 
        name as service_name, 
        operation_type as service_type, 
        unit, 
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

  static async listServiceTiers(serviceId: number): Promise<ServiceVolumeTierDTO[]> {
    const db = await this.getConnection();
    const rows = await db.all<RawTierRow[]>(
      `SELECT id, service_id, min_quantity, price_per_unit, is_active FROM service_volume_prices WHERE service_id = ? ORDER BY min_quantity`,
      serviceId,
    );
    return rows.map(this.mapTier);
  }

  static async createServiceTier(serviceId: number, payload: CreateServiceVolumeTierDTO): Promise<ServiceVolumeTierDTO> {
    const db = await this.getConnection();
    const result = await db.run(
      `INSERT INTO service_volume_prices (service_id, min_quantity, price_per_unit, is_active) VALUES (?, ?, ?, ?)`,
      serviceId,
      Number(payload.minQuantity ?? 0),
      Number(payload.rate ?? 0),
      payload.isActive === undefined || payload.isActive ? 1 : 0,
    );
    const row = await db.get<RawTierRow>(`SELECT id, service_id, min_quantity, price_per_unit, is_active FROM service_volume_prices WHERE id = ?`, result.lastID);
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
      `UPDATE service_volume_prices SET min_quantity = ?, price_per_unit = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      payload.minQuantity !== undefined ? payload.minQuantity : current.min_quantity,
      payload.rate !== undefined ? payload.rate : current.price_per_unit,
      payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : current.is_active,
      tierId,
    );

    const updated = await db.get<RawTierRow>(`SELECT id, service_id, min_quantity, price_per_unit, is_active FROM service_volume_prices WHERE id = ?`, tierId);
    return updated ? this.mapTier(updated) : null;
  }

  static async deleteServiceTier(tierId: number): Promise<void> {
    const db = await this.getConnection();
    await db.run(`DELETE FROM service_volume_prices WHERE id = ?`, tierId);
  }
}


