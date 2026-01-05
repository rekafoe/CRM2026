import { getDb } from '../../../db';

export interface PrintPriceDTO {
  id: number;
  technology_code: string;
  counter_unit: 'sheets' | 'meters';
  price_bw_single: number | null;
  price_bw_duplex: number | null;
  price_color_single: number | null;
  price_color_duplex: number | null;
  price_bw_per_meter: number | null;
  price_color_per_meter: number | null;
  is_active: number;
  created_at?: string;
  updated_at?: string;
}

export type CreatePrintPriceDTO = Omit<PrintPriceDTO, 'id' | 'created_at' | 'updated_at'>;
export type UpdatePrintPriceDTO = Partial<CreatePrintPriceDTO>;

export class PrintPriceRepository {
  static async list(): Promise<PrintPriceDTO[]> {
    const db = await getDb();
    return db.all<PrintPriceDTO[]>(`SELECT * FROM print_prices ORDER BY technology_code, id DESC`);
  }

  static async findActiveByTechnology(technologyCode: string): Promise<PrintPriceDTO | undefined> {
    const db = await getDb();
    const row = await db.get<PrintPriceDTO>(
      `SELECT * FROM print_prices WHERE technology_code = ? AND is_active = 1 ORDER BY id DESC LIMIT 1`,
      technologyCode,
    );
    return row || undefined;
  }

  static async create(payload: CreatePrintPriceDTO): Promise<PrintPriceDTO> {
    const db = await getDb();
    const result = await db.run(
      `INSERT INTO print_prices (
        technology_code, counter_unit,
        price_bw_single, price_bw_duplex,
        price_color_single, price_color_duplex,
        price_bw_per_meter, price_color_per_meter,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      payload.technology_code,
      payload.counter_unit,
      payload.price_bw_single ?? null,
      payload.price_bw_duplex ?? null,
      payload.price_color_single ?? null,
      payload.price_color_duplex ?? null,
      payload.price_bw_per_meter ?? null,
      payload.price_color_per_meter ?? null,
      payload.is_active ?? 1,
    );

    const created = await db.get<PrintPriceDTO>(
      `SELECT * FROM print_prices WHERE id = ?`,
      result.lastID,
    );
    return created as PrintPriceDTO;
  }

  static async update(id: number, payload: UpdatePrintPriceDTO): Promise<PrintPriceDTO | null> {
    const db = await getDb();

    const sets: string[] = [];
    const params: any[] = [];

    const push = (field: string, value: any) => {
      sets.push(`${field} = ?`);
      params.push(value);
    };

    if (payload.technology_code !== undefined) push('technology_code', payload.technology_code);
    if (payload.counter_unit !== undefined) push('counter_unit', payload.counter_unit);
    if (payload.price_bw_single !== undefined) push('price_bw_single', payload.price_bw_single);
    if (payload.price_bw_duplex !== undefined) push('price_bw_duplex', payload.price_bw_duplex);
    if (payload.price_color_single !== undefined) push('price_color_single', payload.price_color_single);
    if (payload.price_color_duplex !== undefined) push('price_color_duplex', payload.price_color_duplex);
    if (payload.price_bw_per_meter !== undefined) push('price_bw_per_meter', payload.price_bw_per_meter);
    if (payload.price_color_per_meter !== undefined) push('price_color_per_meter', payload.price_color_per_meter);
    if (payload.is_active !== undefined) push('is_active', payload.is_active);

    if (sets.length === 0) {
      const row = await db.get<PrintPriceDTO>(`SELECT * FROM print_prices WHERE id = ?`, id);
      return row || null;
    }

    await db.run(
      `UPDATE print_prices SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      ...params,
      id,
    );

    const row = await db.get<PrintPriceDTO>(`SELECT * FROM print_prices WHERE id = ?`, id);
    return row || null;
  }

  static async delete(id: number): Promise<void> {
    const db = await getDb();
    await db.run(`DELETE FROM print_prices WHERE id = ?`, id);
  }
}

