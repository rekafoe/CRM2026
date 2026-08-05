import { getDb } from '../../../config/database'
import { MaterialType } from '../../../models'

export interface MaterialTypeFilters {
  categoryId?: number
  search?: string
  onlyActive?: boolean
}

type MaterialTypePayload = Omit<MaterialType, 'id' | 'created_at' | 'updated_at' | 'category_name'>

function toNumberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function buildBadRequest(message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number }
  err.status = 400
  return err
}

export class MaterialTypeService {
  static async getAllTypes(filters: MaterialTypeFilters = {}) {
    const db = await getDb()
    const conditions: string[] = []
    const params: any[] = []

    if (filters.categoryId) {
      conditions.push('mt.category_id = ?')
      params.push(filters.categoryId)
    }

    if (filters.onlyActive) {
      conditions.push('COALESCE(mt.is_active, 1) = 1')
    }

    if (filters.search) {
      conditions.push('(LOWER(mt.name) LIKE LOWER(?) OR LOWER(COALESCE(mt.description, "")) LIKE LOWER(?))')
      params.push(`%${filters.search}%`, `%${filters.search}%`)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    return db.all<MaterialType & { materials_count: number }>(
      `SELECT
        mt.id,
        mt.category_id,
        mc.name as category_name,
        mt.name,
        mt.code,
        mt.description,
        COALESCE(mt.is_active, 1) as is_active,
        mt.created_at,
        mt.updated_at,
        COUNT(m.id) as materials_count
      FROM material_types mt
      JOIN material_categories mc ON mc.id = mt.category_id
      LEFT JOIN materials m ON m.material_type_id = mt.id
      ${whereClause}
      GROUP BY mt.id, mt.category_id, mc.name, mt.name, mt.code, mt.description, mt.is_active, mt.created_at, mt.updated_at
      ORDER BY mc.name, mt.name`,
      params,
    )
  }

  static async getTypeById(id: number) {
    const db = await getDb()
    return db.get<MaterialType & { materials_count: number }>(
      `SELECT
        mt.id,
        mt.category_id,
        mc.name as category_name,
        mt.name,
        mt.code,
        mt.description,
        COALESCE(mt.is_active, 1) as is_active,
        mt.created_at,
        mt.updated_at,
        COUNT(m.id) as materials_count
      FROM material_types mt
      JOIN material_categories mc ON mc.id = mt.category_id
      LEFT JOIN materials m ON m.material_type_id = mt.id
      WHERE mt.id = ?
      GROUP BY mt.id, mt.category_id, mc.name, mt.name, mt.code, mt.description, mt.is_active, mt.created_at, mt.updated_at`,
      [id],
    )
  }

  static async createType(payload: MaterialTypePayload) {
    const db = await getDb()
    const categoryId = toNumberOrNull(payload.category_id)
    if (!categoryId) {
      throw buildBadRequest('category_id обязателен')
    }

    const name = String(payload.name || '').trim()
    if (!name) {
      throw buildBadRequest('name обязателен')
    }

    const category = await db.get<{ id: number }>('SELECT id FROM material_categories WHERE id = ?', [categoryId])
    if (!category) {
      throw buildBadRequest(`Категория с ID ${categoryId} не найдена`)
    }

    try {
      const result = await db.run(
        `INSERT INTO material_types (category_id, name, code, description, is_active)
         VALUES (?, ?, ?, ?, ?)`,
        [
          categoryId,
          name,
          payload.code?.trim() || null,
          payload.description?.trim() || null,
          payload.is_active === false || payload.is_active === 0 ? 0 : 1,
        ],
      )

      return this.getTypeById(Number(result.lastID))
    } catch (error: any) {
      if (String(error?.message || '').includes('UNIQUE constraint failed')) {
        const err = new Error('Тип материала с таким названием уже существует в этой категории') as Error & { status: number }
        err.status = 409
        throw err
      }
      throw error
    }
  }

  static async updateType(id: number, payload: Partial<MaterialTypePayload>) {
    const db = await getDb()
    const existing = await db.get<{ id: number }>('SELECT id FROM material_types WHERE id = ?', [id])
    if (!existing) {
      return null
    }

    const updates: string[] = []
    const values: any[] = []

    if (payload.category_id !== undefined) {
      const categoryId = toNumberOrNull(payload.category_id)
      if (!categoryId) {
        throw buildBadRequest('category_id должен быть корректным числом')
      }
      const category = await db.get<{ id: number }>('SELECT id FROM material_categories WHERE id = ?', [categoryId])
      if (!category) {
        throw buildBadRequest(`Категория с ID ${categoryId} не найдена`)
      }
      updates.push('category_id = ?')
      values.push(categoryId)
    }

    if (payload.name !== undefined) {
      const name = String(payload.name || '').trim()
      if (!name) {
        throw buildBadRequest('name не может быть пустым')
      }
      updates.push('name = ?')
      values.push(name)
    }

    if (payload.code !== undefined) {
      updates.push('code = ?')
      values.push(payload.code?.trim() || null)
    }

    if (payload.description !== undefined) {
      updates.push('description = ?')
      values.push(payload.description?.trim() || null)
    }

    if (payload.is_active !== undefined) {
      updates.push('is_active = ?')
      values.push(payload.is_active === false || payload.is_active === 0 ? 0 : 1)
    }

    if (!updates.length) {
      return this.getTypeById(id)
    }

    updates.push(`updated_at = datetime('now')`)

    try {
      await db.run(
        `UPDATE material_types
         SET ${updates.join(', ')}
         WHERE id = ?`,
        [...values, id],
      )
    } catch (error: any) {
      if (String(error?.message || '').includes('UNIQUE constraint failed')) {
        const err = new Error('Тип материала с таким названием уже существует в этой категории') as Error & { status: number }
        err.status = 409
        throw err
      }
      throw error
    }

    return this.getTypeById(id)
  }

  static async deleteType(id: number) {
    const db = await getDb()
    const existing = await db.get<{ id: number; name: string }>(
      'SELECT id, name FROM material_types WHERE id = ?',
      [id],
    )
    if (!existing) {
      const err = new Error('Тип материала не найден') as Error & { status: number }
      err.status = 404
      throw err
    }

    const linkedMaterials = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM materials WHERE material_type_id = ?',
      [id],
    )
    if ((linkedMaterials?.count || 0) > 0) {
      const err = new Error(`Нельзя удалить тип "${existing.name}", пока он используется в материалах`) as Error & {
        status: number
      }
      err.status = 400
      throw err
    }

    await db.run('DELETE FROM material_types WHERE id = ?', [id])
  }
}
