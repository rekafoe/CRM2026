import { getDb } from '../config/database'
import { MaterialCategory } from '../models'
import { getCachedData, invalidateCache } from '../utils/dataCache'

export class MaterialCategoryService {
  static async getAllCategories() {
    return getCachedData(
      'material_categories_all',
      async () => {
        const db = await getDb()
        return await db.all<MaterialCategory>(
          'SELECT id, name, description, color, created_at FROM material_categories ORDER BY name'
        )
      },
      10 * 60 * 1000 // 10 минут
    )
  }

  static async getCategoryById(id: number) {
    const db = await getDb()
    const category = await db.get<MaterialCategory>(
      'SELECT id, name, description, color, created_at FROM material_categories WHERE id = ?',
      id
    )
    return category
  }

  static async createCategory(category: Omit<MaterialCategory, 'id' | 'created_at'>) {
    const db = await getDb()
    try {
      const result = await db.run(
        'INSERT INTO material_categories (name, description, color) VALUES (?, ?, ?)',
        category.name,
        category.description || null,
        category.color || '#1976d2'
      )
      
      const newCategory = await db.get<MaterialCategory>(
        'SELECT id, name, description, color, created_at FROM material_categories WHERE id = ?',
        result.lastID
      )
      invalidateCache('material_categories_all')
      return newCategory
    } catch (e: any) {
      if (e && typeof e.message === 'string' && e.message.includes('UNIQUE constraint failed')) {
        const err: any = new Error('Категория с таким именем уже существует')
        err.status = 409
        throw err
      }
      throw e
    }
  }

  static async updateCategory(id: number, category: Partial<Omit<MaterialCategory, 'id' | 'created_at'>>) {
    const db = await getDb()
    try {
      // Строим динамический запрос только для переданных полей
      const updates: string[] = []
      const values: any[] = []
      
      if (category.name !== undefined) {
        updates.push('name = ?')
        values.push(category.name)
      }
      if (category.description !== undefined) {
        updates.push('description = ?')
        values.push(category.description || null)
      }
      if (category.color !== undefined) {
        updates.push('color = ?')
        values.push(category.color || '#1976d2')
      }
      
      if (updates.length === 0) {
        // Если нет полей для обновления, просто возвращаем текущую категорию
        return await this.getCategoryById(id)
      }
      
      values.push(id)
      
      await db.run(
        `UPDATE material_categories SET ${updates.join(', ')} WHERE id = ?`,
        ...values
      )
      
      const updatedCategory = await db.get<MaterialCategory>(
        'SELECT id, name, description, color, created_at FROM material_categories WHERE id = ?',
        id
      )
      invalidateCache('material_categories_all')
      return updatedCategory
    } catch (e: any) {
      if (e && typeof e.message === 'string' && e.message.includes('UNIQUE constraint failed')) {
        const err: any = new Error('Категория с таким именем уже существует')
        err.status = 409
        throw err
      }
      throw e
    }
  }

  static async deleteCategory(id: number) {
    const db = await getDb()
    
    // Проверяем, есть ли материалы в этой категории
    const materialsCount = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM materials WHERE category_id = ?',
      id
    )
    
    if (materialsCount && materialsCount.count > 0) {
      const err: any = new Error('Нельзя удалить категорию, в которой есть материалы')
      err.status = 400
      throw err
    }
    
    await db.run('DELETE FROM material_categories WHERE id = ?', id)
    invalidateCache('material_categories_all')
  }

  static async getCategoryStats() {
    const db = await getDb()
    const stats = await db.all<{
      category_id: number;
      category_name: string;
      category_color: string;
      materials_count: number;
      total_quantity: number;
      total_value: number;
    }>(
      `SELECT 
        c.id as category_id,
        c.name as category_name,
        c.color as category_color,
        COUNT(m.id) as materials_count,
        COALESCE(SUM(m.quantity), 0) as total_quantity,
        COALESCE(SUM(m.quantity * COALESCE(m.sheet_price_single, 0)), 0) as total_value
       FROM material_categories c
       LEFT JOIN materials m ON m.category_id = c.id
       GROUP BY c.id, c.name, c.color
       ORDER BY c.name`
    )
    return stats
  }
}
