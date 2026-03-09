import { getDb } from '../../../db';
import { PriceTypeDTO, CreatePriceTypeDTO, UpdatePriceTypeDTO } from '../dtos/priceType.dto';

function mapRow(row: any): PriceTypeDTO {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    multiplier: Number(row.multiplier ?? 1),
    productionDays: Number(row.production_days ?? 3),
    description: row.description ?? null,
    sortOrder: Number(row.sort_order ?? 0),
    isSystem: !!(row.is_system ?? 0),
    isActive: !!(row.is_active ?? 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PriceTypeRepository {
  static async list(activeOnly = false): Promise<PriceTypeDTO[]> {
    const db = await getDb();
    const where = activeOnly ? 'WHERE is_active = 1' : '';
    const rows = await db.all<any>(
      `SELECT id, key, name, multiplier, production_days, description, sort_order, is_system, is_active, created_at, updated_at
       FROM price_types ${where}
       ORDER BY sort_order, id`
    );
    return (rows ?? []).map(mapRow);
  }

  static async getById(id: number): Promise<PriceTypeDTO | null> {
    const db = await getDb();
    const row = await db.get<any>(
      `SELECT id, key, name, multiplier, production_days, description, sort_order, is_system, is_active, created_at, updated_at
       FROM price_types WHERE id = ?`,
      id
    );
    return row ? mapRow(row) : null;
  }

  static async getByKey(key: string): Promise<PriceTypeDTO | null> {
    const db = await getDb();
    const row = await db.get<any>(
      `SELECT id, key, name, multiplier, production_days, description, sort_order, is_system, is_active, created_at, updated_at
       FROM price_types WHERE key = ?`,
      key
    );
    return row ? mapRow(row) : null;
  }

  static async create(payload: CreatePriceTypeDTO): Promise<PriceTypeDTO> {
    const db = await getDb();
    const key = String(payload.key ?? '').trim().toLowerCase();
    const name = String(payload.name ?? '').trim();
    const multiplier = Number(payload.multiplier ?? 1);
    const productionDays = Number(payload.productionDays ?? 3);
    const description = payload.description != null ? String(payload.description).trim() || null : null;
    const sortOrder = Number(payload.sortOrder ?? 0);

    const result = await db.run(
      `INSERT INTO price_types (key, name, multiplier, production_days, description, sort_order, is_system, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 1, datetime('now'), datetime('now'))`,
      key, name, multiplier, productionDays, description, sortOrder
    );
    const id = (result as any).lastID;
    const created = await this.getById(id);
    if (!created) throw new Error('Failed to retrieve created price type');
    return created;
  }

  static async update(id: number, payload: UpdatePriceTypeDTO): Promise<PriceTypeDTO | null> {
    const db = await getDb();
    const current = await this.getById(id);
    if (!current) return null;

    if (current.isSystem) {
      // Системные типы (standard, online) — нельзя менять key, можно только name, multiplier, production_days, description
      const name = payload.name !== undefined ? String(payload.name).trim() : current.name;
      const multiplier = payload.multiplier !== undefined ? Number(payload.multiplier) : current.multiplier;
      const productionDays = payload.productionDays !== undefined ? Number(payload.productionDays) : current.productionDays;
      const description = payload.description !== undefined ? (payload.description ? String(payload.description).trim() : null) : current.description ?? null;
      const sortOrder = payload.sortOrder !== undefined ? Number(payload.sortOrder) : current.sortOrder;

      await db.run(
        `UPDATE price_types SET name = ?, multiplier = ?, production_days = ?, description = ?, sort_order = ?, updated_at = datetime('now') WHERE id = ?`,
        name, multiplier, productionDays, description, sortOrder, id
      );
    } else {
      const name = payload.name !== undefined ? String(payload.name).trim() : current.name;
      const multiplier = payload.multiplier !== undefined ? Number(payload.multiplier) : current.multiplier;
      const productionDays = payload.productionDays !== undefined ? Number(payload.productionDays) : current.productionDays;
      const description = payload.description !== undefined ? (payload.description ? String(payload.description).trim() : null) : current.description ?? null;
      const sortOrder = payload.sortOrder !== undefined ? Number(payload.sortOrder) : current.sortOrder;
      const isActive = payload.isActive !== undefined ? (payload.isActive ? 1 : 0) : (current.isActive ? 1 : 0);

      await db.run(
        `UPDATE price_types SET name = ?, multiplier = ?, production_days = ?, description = ?, sort_order = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?`,
        name, multiplier, productionDays, description, sortOrder, isActive, id
      );
    }

    return this.getById(id);
  }

  static async delete(id: number): Promise<boolean> {
    const db = await getDb();
    const current = await this.getById(id);
    if (!current) return false;
    if (current.isSystem) {
      throw new Error('Нельзя удалить системный тип цены (standard, online)');
    }
    await db.run(`DELETE FROM price_types WHERE id = ?`, id);
    return true;
  }
}
