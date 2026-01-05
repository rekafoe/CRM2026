import { getDb } from '../config/database'
import { Material } from '../models'

export class MaterialImportExportService {
  // Экспорт материалов в CSV
  static async exportToCSV(filters: {
    categoryId?: number;
    supplierId?: number;
    includeInactive?: boolean;
  }) {
    const { categoryId, supplierId, includeInactive } = filters
    const where: string[] = []
    const params: any[] = []
    
    if (categoryId) { where.push('m.category_id = ?'); params.push(Number(categoryId)) }
    if (supplierId) { where.push('m.supplier_id = ?'); params.push(Number(supplierId)) }
    
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const db = await getDb()
    
    const materials = await db.all<any>(
      `SELECT 
        m.id, m.name, m.unit, m.quantity, m.min_quantity, m.sheet_price_single,
        c.name as category_name, s.name as supplier_name, s.contact_person as supplier_contact
       FROM materials m
       LEFT JOIN material_categories c ON c.id = m.category_id
       LEFT JOIN suppliers s ON s.id = m.supplier_id
      ${whereSql}
      ORDER BY c.name, m.name`,
      ...params
    )
    
    // Формируем CSV
    const headers = [
      'ID', 'Название', 'Единица измерения', 'Количество', 'Минимальный остаток',
      'Цена за единицу', 'Категория', 'Поставщик', 'Контакт поставщика'
    ]
    
    const csvRows = [headers.join(',')]
    
    for (const material of materials) {
      const row = [
        material.id,
        `"${material.name}"`,
        `"${material.unit}"`,
        material.quantity,
        material.min_quantity || '',
        material.sheet_price_single || '',
        `"${material.category_name || ''}"`,
        `"${material.supplier_name || ''}"`,
        `"${material.supplier_contact || ''}"`
      ]
      csvRows.push(row.join(','))
    }
    
    return csvRows.join('\n')
  }

  // Экспорт материалов в JSON
  static async exportToJSON(filters: {
    categoryId?: number;
    supplierId?: number;
  }) {
    const { categoryId, supplierId } = filters
    const where: string[] = []
    const params: any[] = []
    
    if (categoryId) { where.push('m.category_id = ?'); params.push(Number(categoryId)) }
    if (supplierId) { where.push('m.supplier_id = ?'); params.push(Number(supplierId)) }
    
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const db = await getDb()
    
    const materials = await db.all<any>(
      `SELECT 
        m.id, m.name, m.unit, m.quantity, m.min_quantity, m.sheet_price_single,
        m.category_id, c.name as category_name, c.color as category_color,
        m.supplier_id, s.name as supplier_name, s.contact_person as supplier_contact
       FROM materials m
       LEFT JOIN material_categories c ON c.id = m.category_id
       LEFT JOIN suppliers s ON s.id = m.supplier_id
      ${whereSql}
      ORDER BY c.name, m.name`,
      ...params
    )
    
    return {
      export_date: new Date().toISOString(),
      total_materials: materials.length,
      materials
    }
  }

  // Импорт материалов из JSON
  static async importFromJSON(data: {
    materials: Array<{
      name: string;
      unit: string;
      quantity: number;
      min_quantity?: number;
      sheet_price_single?: number;
      category_name?: string;
      supplier_name?: string;
    }>;
  }) {
    const db = await getDb()
    await db.run('BEGIN')
    
    try {
      const results = []
      const errors = []
      
      for (let i = 0; i < data.materials.length; i++) {
        const material = data.materials[i]
        
        try {
          // Находим категорию по имени
          let categoryId = null
          if (material.category_name) {
            const category = await db.get<{ id: number }>(
              'SELECT id FROM material_categories WHERE name = ?',
              material.category_name
            )
            categoryId = category?.id || null
          }
          
          // Находим поставщика по имени
          let supplierId = null
          if (material.supplier_name) {
            const supplier = await db.get<{ id: number }>(
              'SELECT id FROM suppliers WHERE name = ?',
              material.supplier_name
            )
            supplierId = supplier?.id || null
          }
          
          // Создаем материал
          const result = await db.run(
            'INSERT INTO materials (name, unit, quantity, min_quantity, sheet_price_single, category_id, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            material.name,
            material.unit,
            material.quantity,
            material.min_quantity || null,
            material.sheet_price_single || null,
            categoryId,
            supplierId
          )
          
          results.push({
            row: i + 1,
            name: material.name,
            id: result.lastID,
            status: 'success'
          })
        } catch (error: any) {
          errors.push({
            row: i + 1,
            name: material.name,
            error: error.message,
            status: 'error'
          })
        }
      }
      
      await db.run('COMMIT')
      return { results, errors }
    } catch (error) {
      await db.run('ROLLBACK')
      throw error
    }
  }

  // Получить шаблон для импорта
  static async getImportTemplate() {
    return {
      template: {
        materials: [
          {
            name: "Пример материала",
            unit: "шт",
            quantity: 100,
            min_quantity: 10,
            sheet_price_single: 5.50,
            category_name: "Бумага",
            supplier_name: "ООО Бумага-Про"
          }
        ]
      },
      instructions: [
        "1. Заполните поля name, unit, quantity (обязательные)",
        "2. min_quantity и sheet_price_single (опциональные)",
        "3. category_name должно соответствовать существующей категории",
        "4. supplier_name должно соответствовать существующему поставщику",
        "5. Сохраните файл в формате JSON"
      ]
    }
  }

  // Валидация данных импорта
  static async validateImportData(data: any) {
    const errors = []
    
    if (!data.materials || !Array.isArray(data.materials)) {
      errors.push('Неверный формат данных. Ожидается объект с массивом materials')
      return { valid: false, errors }
    }
    
    for (let i = 0; i < data.materials.length; i++) {
      const material = data.materials[i]
      const row = i + 1
      
      if (!material.name || typeof material.name !== 'string') {
        errors.push(`Строка ${row}: Не указано название материала`)
      }
      
      if (!material.unit || typeof material.unit !== 'string') {
        errors.push(`Строка ${row}: Не указана единица измерения`)
      }
      
      if (typeof material.quantity !== 'number' || material.quantity < 0) {
        errors.push(`Строка ${row}: Неверное количество материала`)
      }
      
      if (material.min_quantity !== undefined && (typeof material.min_quantity !== 'number' || material.min_quantity < 0)) {
        errors.push(`Строка ${row}: Неверное минимальное количество`)
      }
      
      if (material.sheet_price_single !== undefined && (typeof material.sheet_price_single !== 'number' || material.sheet_price_single < 0)) {
        errors.push(`Строка ${row}: Неверная цена за единицу`)
      }
    }
    
    return {
      valid: errors.length === 0,
      errors
    }
  }
}
