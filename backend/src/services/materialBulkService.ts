import { getDb } from '../config/database'
import { Material } from '../models'

export class MaterialBulkService {
  // Массовое обновление материалов
  static async bulkUpdateMaterials(updates: Array<{
    id: number;
    name?: string;
    unit?: string;
    quantity?: number;
    min_quantity?: number;
    sheet_price_single?: number;
    category_id?: number;
    supplier_id?: number;
  }>) {
    const db = await getDb()
    await db.run('BEGIN')
    
    try {
      const results = []
      
      for (const update of updates) {
        const { id, ...fields } = update
        const setClause = Object.keys(fields)
          .map(key => `${key} = ?`)
          .join(', ')
        
        const values = Object.values(fields)
        
        if (setClause) {
          await db.run(
            `UPDATE materials SET ${setClause} WHERE id = ?`,
            ...values,
            id
          )
          
          const updated = await db.get<Material>(
            `SELECT 
              m.id, m.name, m.unit, m.quantity, m.min_quantity, m.sheet_price_single,
              m.category_id, c.name as category_name, c.color as category_color,
              m.supplier_id, s.name as supplier_name, s.contact_person as supplier_contact
             FROM materials m
             LEFT JOIN material_categories c ON c.id = m.category_id
             LEFT JOIN suppliers s ON s.id = m.supplier_id
             WHERE m.id = ?`,
            id
          )
          
          results.push(updated)
        }
      }
      
      await db.run('COMMIT')
      return results
    } catch (error) {
      await db.run('ROLLBACK')
      throw error
    }
  }

  // Массовое списание материалов
  static async bulkSpendMaterials(spends: Array<{
    material_id: number;
    delta: number;
    reason: string;
    order_id?: number;
    supplier_id?: number;
    delivery_number?: string;
    invoice_number?: string;
    delivery_date?: string;
    delivery_notes?: string;
  }>, userId?: number) {
    const db = await getDb()
    await db.run('BEGIN')
    
    try {
      const results = []
      
      for (const spend of spends) {
        const { 
          material_id, 
          delta, 
          reason, 
          order_id, 
          supplier_id, 
          delivery_number, 
          invoice_number, 
          delivery_date, 
          delivery_notes 
        } = spend
        const roundedDelta = Math.ceil(Number(delta)) // Округляем вверх
        
        // Обновляем количество
        await db.run(
          'UPDATE materials SET quantity = quantity + ? WHERE id = ?',
          roundedDelta,
          material_id
        )
        
        // Записываем движение с новыми полями
        await db.run(
          `INSERT INTO material_moves (
            material_id,
            type,
            quantity,
            delta,
            reason,
            order_id,
            user_id,
            supplier_id,
            delivery_number,
            invoice_number,
            delivery_date,
            delivery_notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          material_id,
          roundedDelta >= 0 ? 'bulk_add' : 'bulk_spend',
          Math.abs(roundedDelta),
          roundedDelta,
          reason,
          order_id || null,
          userId,
          supplier_id || null,
          delivery_number || null,
          invoice_number || null,
          delivery_date || null,
          delivery_notes || null
        )
        
        // Получаем обновленный материал
        const material = await db.get<Material>(
          `SELECT 
            m.id, m.name, m.unit, m.quantity, m.min_quantity, m.sheet_price_single,
            m.category_id, c.name as category_name, c.color as category_color,
            m.supplier_id, s.name as supplier_name, s.contact_person as supplier_contact
           FROM materials m
           LEFT JOIN material_categories c ON c.id = m.category_id
           LEFT JOIN suppliers s ON s.id = m.supplier_id
           WHERE m.id = ?`,
          material_id
        )
        
        results.push({
          material_id,
          delta: roundedDelta,
          material
        })
      }
      
      await db.run('COMMIT')
      return results
    } catch (error) {
      await db.run('ROLLBACK')
      throw error
    }
  }

  // Массовое создание материалов
  static async bulkCreateMaterials(materials: Array<{
    name: string;
    unit: string;
    quantity: number;
    min_quantity?: number;
    sheet_price_single?: number;
    category_id?: number;
    supplier_id?: number;
  }>) {
    const db = await getDb()
    await db.run('BEGIN')
    
    try {
      const results = []
      
      for (const material of materials) {
        const result = await db.run(
          'INSERT INTO materials (name, unit, quantity, min_quantity, sheet_price_single, category_id, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
          material.name,
          material.unit,
          material.quantity,
          material.min_quantity || null,
          material.sheet_price_single || null,
          material.category_id || null,
          material.supplier_id || null
        )
        
        const created = await db.get<Material>(
          `SELECT 
            m.id, m.name, m.unit, m.quantity, m.min_quantity, m.sheet_price_single,
            m.category_id, c.name as category_name, c.color as category_color,
            m.supplier_id, s.name as supplier_name, s.contact_person as supplier_contact
           FROM materials m
           LEFT JOIN material_categories c ON c.id = m.category_id
           LEFT JOIN suppliers s ON s.id = m.supplier_id
           WHERE m.id = ?`,
          result.lastID
        )
        
        results.push(created)
      }
      
      await db.run('COMMIT')
      return results
    } catch (error) {
      await db.run('ROLLBACK')
      throw error
    }
  }

  // Массовое удаление материалов
  static async bulkDeleteMaterials(materialIds: number[]) {
    const db = await getDb()
    await db.run('BEGIN')
    
    try {
      const results = []
      
      for (const id of materialIds) {
        // Проверяем, есть ли движения материалов
        const moves = await db.get<{ count: number }>(
          'SELECT COUNT(*) as count FROM material_moves WHERE material_id = ?',
          id
        )
        
        if (moves && moves.count > 0) {
          results.push({
            id,
            success: false,
            error: 'Нельзя удалить материал с историей движений'
          })
          continue
        }
        
        await db.run('DELETE FROM materials WHERE id = ?', id)
        results.push({
          id,
          success: true
        })
      }
      
      await db.run('COMMIT')
      return results
    } catch (error) {
      await db.run('ROLLBACK')
      throw error
    }
  }

  // Массовое изменение категории
  static async bulkChangeCategory(materialIds: number[], categoryId: number) {
    const db = await getDb()
    await db.run('BEGIN')
    
    try {
      const placeholders = materialIds.map(() => '?').join(',')
      await db.run(
        `UPDATE materials SET category_id = ? WHERE id IN (${placeholders})`,
        categoryId,
        ...materialIds
      )
      
      await db.run('COMMIT')
      return { updated: materialIds.length }
    } catch (error) {
      await db.run('ROLLBACK')
      throw error
    }
  }

  // Массовое изменение поставщика
  static async bulkChangeSupplier(materialIds: number[], supplierId: number) {
    const db = await getDb()
    await db.run('BEGIN')
    
    try {
      const placeholders = materialIds.map(() => '?').join(',')
      await db.run(
        `UPDATE materials SET supplier_id = ? WHERE id IN (${placeholders})`,
        supplierId,
        ...materialIds
      )
      
      await db.run('COMMIT')
      return { updated: materialIds.length }
    } catch (error) {
      await db.run('ROLLBACK')
      throw error
    }
  }
}
