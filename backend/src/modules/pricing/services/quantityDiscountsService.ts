import { getDb } from '../../../config/database'

export interface QuantityDiscountRow {
  id: number
  min_quantity: number
  max_quantity: number | null
  discount_percent: number
  is_active: number
  created_at: string
  updated_at: string
}

export class QuantityDiscountsService {
  static async list(): Promise<QuantityDiscountRow[]> {
    const db = await getDb()
    return db.all<QuantityDiscountRow[]>(`
      SELECT
        id,
        min_quantity,
        max_quantity,
        discount_percent,
        is_active,
        created_at,
        updated_at
      FROM quantity_discounts
      WHERE is_active = 1
      ORDER BY min_quantity
    `)
  }

  static async create(input: {
    min_quantity: number
    max_quantity?: number | null
    discount_percent: number
    // back-compat: UI может передавать description, но таблица сейчас его не хранит
    description?: string | null
    is_active?: boolean | number
  }): Promise<QuantityDiscountRow> {
    const db = await getDb()

    const result = await db.run(
      `
      INSERT INTO quantity_discounts (min_quantity, max_quantity, discount_percent, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
      Number(input.min_quantity),
      input.max_quantity ?? null,
      Number(input.discount_percent ?? 0),
      input.is_active === undefined ? 1 : (input.is_active ? 1 : 0)
    )

    const row = await db.get<QuantityDiscountRow>('SELECT * FROM quantity_discounts WHERE id = ?', result.lastID)
    if (!row) throw new Error('Не удалось создать скидку за количество')
    return row
  }

  static async update(
    id: number,
    updates: Partial<{
      min_quantity: number
      max_quantity: number | null
      discount_percent: number
      description: string | null
      is_active: boolean | number
    }>
  ): Promise<QuantityDiscountRow | null> {
    const db = await getDb()

    const existing = await db.get<{ id: number }>('SELECT id FROM quantity_discounts WHERE id = ?', id)
    if (!existing) return null

    const set: string[] = []
    const params: any[] = []

    if (updates.min_quantity !== undefined) {
      set.push('min_quantity = ?')
      params.push(Number(updates.min_quantity))
    }
    if (updates.max_quantity !== undefined) {
      set.push('max_quantity = ?')
      params.push(updates.max_quantity)
    }
    if (updates.discount_percent !== undefined) {
      set.push('discount_percent = ?')
      params.push(Number(updates.discount_percent))
    }
    if (updates.is_active !== undefined) {
      set.push('is_active = ?')
      params.push(updates.is_active ? 1 : 0)
    }

    set.push("updated_at = datetime('now')")
    params.push(id)

    await db.run(`UPDATE quantity_discounts SET ${set.join(', ')} WHERE id = ?`, ...params)

    return db.get<QuantityDiscountRow>('SELECT * FROM quantity_discounts WHERE id = ?', id)
  }

  static async delete(id: number): Promise<void> {
    const db = await getDb()
    await db.run(`UPDATE quantity_discounts SET is_active = 0, updated_at = datetime('now') WHERE id = ?`, id)
  }
}

