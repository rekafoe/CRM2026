import { Database } from 'sqlite';
import { getDb } from '../../../db';
import {
  CreateProductServiceLinkDTO,
  ProductServiceLinkDTO,
} from '../dtos/serviceLink.dto';

type RawLinkRow = {
  id: number;
  product_id: number;
  service_id: number;
  is_required: number;
  default_quantity: number | null;
  service_name?: string;
  service_type?: string;
  unit?: string;
  price_per_unit?: number;
  is_active?: number;
};

export class ProductServiceLinkRepository {
  private static async getConnection(): Promise<Database> {
    const db = await getDb();
    await this.ensureSchema(db);
    return db;
  }

  private static async ensureSchema(db: Database): Promise<void> {
    await db.exec(`CREATE TABLE IF NOT EXISTS product_service_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      is_required INTEGER DEFAULT 0,
      default_quantity REAL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY(service_id) REFERENCES service_prices(id) ON DELETE CASCADE
    )`);
    await db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_product_service_links_unique ON product_service_links(product_id, service_id)`);
  }

  private static mapRow(row: RawLinkRow): ProductServiceLinkDTO {
    return {
      id: row.id,
      productId: row.product_id,
      serviceId: row.service_id,
      isRequired: !!row.is_required,
      defaultQuantity: row.default_quantity ?? null,
      service: row.service_name
        ? {
            name: row.service_name,
            type: row.service_type ?? 'generic',
            unit: row.unit ?? '',
            rate: Number(row.price_per_unit ?? 0),
            isActive: row.is_active !== undefined ? !!row.is_active : true,
          }
        : undefined,
    };
  }

  static async listByProduct(productId: number): Promise<ProductServiceLinkDTO[]> {
    const db = await this.getConnection();
    const rows = await db.all<RawLinkRow[]>(
      `SELECT 
        spl.id,
        spl.product_id,
        spl.service_id,
        spl.is_required,
        spl.default_quantity,
        sp.service_name,
        sp.service_type,
        sp.unit,
        sp.price_per_unit,
        sp.is_active
      FROM product_service_links spl
      JOIN service_prices sp ON sp.id = spl.service_id
      WHERE spl.product_id = ?
      ORDER BY sp.service_name`,
      productId,
    );
    return rows.map(this.mapRow);
  }

  static async create(productId: number, payload: CreateProductServiceLinkDTO): Promise<ProductServiceLinkDTO> {
    const db = await this.getConnection();
    try {
      await db.run(
        `INSERT INTO product_service_links (product_id, service_id, is_required, default_quantity)
         VALUES (?, ?, ?, ?)`,
        productId,
        payload.serviceId,
        payload.isRequired ? 1 : 0,
        payload.defaultQuantity !== undefined ? Number(payload.defaultQuantity) : 1,
      );
    } catch (error: any) {
      if (error?.message?.includes('UNIQUE')) {
        const existing = await db.get<RawLinkRow>(
          `SELECT 
            spl.id,
            spl.product_id,
            spl.service_id,
            spl.is_required,
            spl.default_quantity,
            sp.service_name,
            sp.service_type,
            sp.unit,
            sp.price_per_unit,
            sp.is_active
          FROM product_service_links spl
          JOIN service_prices sp ON sp.id = spl.service_id
          WHERE spl.product_id = ? AND spl.service_id = ?`,
          productId,
          payload.serviceId,
        );
        if (existing) {
          throw Object.assign(new Error('PRODUCT_SERVICE_LINK_ALREADY_EXISTS'), {
            code: 'PRODUCT_SERVICE_LINK_ALREADY_EXISTS',
            existing: this.mapRow(existing),
          });
        }
      }
      throw error;
    }

    const row = await db.get<RawLinkRow>(
      `SELECT 
        spl.id,
        spl.product_id,
        spl.service_id,
        spl.is_required,
        spl.default_quantity,
        sp.service_name,
        sp.service_type,
        sp.unit,
        sp.price_per_unit,
        sp.is_active
      FROM product_service_links spl
      JOIN service_prices sp ON sp.id = spl.service_id
      WHERE spl.product_id = ? AND spl.service_id = ?`,
      productId,
      payload.serviceId,
    );

    if (!row) {
      throw new Error('Failed to fetch created product service link');
    }

    return this.mapRow(row);
  }

  static async delete(productId: number, serviceId: number): Promise<number> {
    const db = await this.getConnection();
    const result = await db.run(
      `DELETE FROM product_service_links WHERE product_id = ? AND service_id = ?`,
      productId,
      serviceId,
    );
    return result.changes ?? 0;
  }
}


