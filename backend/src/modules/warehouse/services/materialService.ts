import { getDb } from '../../../config/database'
import { Material } from '../../../models'
import { WarehouseTransactionService } from './warehouseTransactionService'
import { logger } from '../../../utils/logger'

export interface MaterialFilters {
  categoryId?: number;
  category?: string;
  finish?: string;
  minDensity?: number;
  maxDensity?: number;
  search?: string;
  onlyActive?: boolean;
}

export class MaterialService {
  static async getAllMaterials(filters?: MaterialFilters) {
    const db = await getDb()
    const conditions: string[] = []
    const params: any[] = []

    if (filters?.categoryId) {
      conditions.push('m.category_id = ?')
      params.push(filters.categoryId)
    }

    if (filters?.category) {
      conditions.push('LOWER(c.name) LIKE LOWER(?)')
      params.push(`%${filters.category}%`)
    }

    if (filters?.finish) {
      conditions.push('LOWER(COALESCE(m.finish, pt.finish, "")) = LOWER(?)')
      params.push(filters.finish)
    }

    if (filters?.minDensity !== undefined) {
      conditions.push('m.density >= ?')
      params.push(filters.minDensity)
    }

    if (filters?.maxDensity !== undefined) {
      conditions.push('m.density <= ?')
      params.push(filters.maxDensity)
    }

    if (filters?.search) {
      conditions.push('(m.name LIKE ? OR c.name LIKE ?)')
      params.push(`%${filters.search}%`, `%${filters.search}%`)
    }

    if (filters?.onlyActive) {
      conditions.push('m.is_active = 1')
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    const allMats = await db.all<Material & { sheet_price_single: number | null }>(
      `SELECT 
        m.id,
        m.name,
        m.unit,
        m.quantity,
        m.min_quantity as min_quantity,
        m.sheet_price_single,
        m.category_id,
        c.name as category_name,
        c.color as category_color,
        m.supplier_id,
        s.name as supplier_name,
        s.contact_person as supplier_contact,
        m.paper_type_id,
        pt.display_name as paper_type_name,
        m.density,
        m.is_active,
        m.sheet_width,
        m.sheet_height,
        m.printable_width,
        m.printable_height,
        COALESCE(m.finish, pt.finish) as finish,
        -- Aliases required by API contract
        m.quantity as stock,
        COALESCE(m.sheet_price_single, 0) as price_per_sheet,
        c.name as category
       FROM materials m
       LEFT JOIN material_categories c ON c.id = m.category_id
       LEFT JOIN suppliers s ON s.id = m.supplier_id
       LEFT JOIN paper_types pt ON pt.id = m.paper_type_id
       ${whereClause}
       ORDER BY c.name, m.name`,
      params
    ) as any
    
    // Добавляем поля для резервирования и совместимости с фронтендом
    const result = await Promise.all(allMats.map(async (material: any) => {
      // Получаем резервированное количество из таблицы material_reservations
      const reservedQuery = `
        SELECT COALESCE(SUM(quantity_reserved), 0) as reserved_quantity
        FROM material_reservations 
        WHERE material_id = ? AND status = 'active'
      `;
      
      let reserved_quantity = 0;
      try {
        const reservedResult = await db.get(reservedQuery, [material.id]) as any;
        reserved_quantity = reservedResult?.reserved_quantity || 0;
      } catch (error) {
        // Если таблица не существует, игнорируем ошибку
        logger.warn('Material reservations table not found, using 0 for reserved quantity');
      }
      
      const available_quantity = Math.max(0, (material.quantity || 0) - reserved_quantity);
      
      return {
        ...material,
        price: material.sheet_price_single || 0,
        reserved_quantity,
        available_quantity
      };
    }));
    
    return result;
  }

  static async getMaterialById(id: number) {
    const db = await getDb()
    const material = await db.get<Material & { sheet_price_single: number | null }>(
      `SELECT 
        m.id,
        m.name,
        m.unit,
        m.quantity,
        m.min_quantity as min_quantity,
        m.sheet_price_single,
        m.category_id,
        c.name as category_name,
        c.color as category_color,
        m.supplier_id,
        s.name as supplier_name,
        s.contact_person as supplier_contact,
        m.paper_type_id,
        pt.display_name as paper_type_name,
        m.density,
        m.is_active,
        m.sheet_width,
        m.sheet_height,
        m.printable_width,
        m.printable_height,
        COALESCE(m.finish, pt.finish) as finish,
        m.quantity as stock,
        COALESCE(m.sheet_price_single, 0) as price_per_sheet,
        c.name as category
       FROM materials m
       LEFT JOIN material_categories c ON c.id = m.category_id
       LEFT JOIN suppliers s ON s.id = m.supplier_id
       LEFT JOIN paper_types pt ON pt.id = m.paper_type_id
       WHERE m.id = ?`,
      [id]
    ) as any
    
    if (!material) {
      return null;
    }
    
    // Получаем резервированное количество
    let reserved_quantity = 0;
    try {
      const reservedResult = await db.get(
        `SELECT COALESCE(SUM(quantity_reserved), 0) as reserved_quantity
         FROM material_reservations 
         WHERE material_id = ? AND status = 'active'`,
        [id]
      ) as any;
      reserved_quantity = reservedResult?.reserved_quantity || 0;
    } catch (error) {
      // Игнорируем, если таблица не существует
    }
    
    const available_quantity = Math.max(0, (material.quantity || 0) - reserved_quantity);
    
    return {
      ...material,
      price: material.sheet_price_single || 0,
      reserved_quantity,
      available_quantity
    };
  }

  static async createOrUpdateMaterial(material: Material & { sheet_price_single?: number | null }) {
    logger.debug('Создание/обновление материала', { material });
    const db = await getDb()
    try {
      logger.debug('Начинаем проверки материала');
      // Определяем цену: приоритет у sheet_price_single, затем price
      const price = material.sheet_price_single ?? (material as any).price ?? null;
      
      // Проверяем существование поставщика
      if (material.supplier_id) {
        const supplier = await db.get('SELECT id, name FROM suppliers WHERE id = ?', material.supplier_id);
        if (!supplier) {
          logger.error(`Поставщик с ID ${material.supplier_id} не найден`);
          const err: any = new Error(`Поставщик с ID ${material.supplier_id} не найден`);
          err.status = 400;
          throw err;
        }
        logger.debug(`Поставщик найден: ${supplier.name} (ID: ${supplier.id})`);
      }
      
      // Проверяем существование категории
      if (material.category_id) {
        logger.debug(`Проверяем категорию с ID: ${material.category_id}`);
        const category = await db.get('SELECT id, name FROM material_categories WHERE id = ?', material.category_id);
        if (!category) {
          logger.error(`Категория с ID ${material.category_id} не найдена`);
          const err: any = new Error(`Категория с ID ${material.category_id} не найдена`);
          err.status = 400;
          throw err;
        }
        logger.debug(`Категория найдена: ${category.name} (ID: ${category.id})`);
      } else {
        logger.debug('category_id не указан, пропускаем проверку');
      }
      
      if (material.id) {
        // Проверяем, существуют ли поля paper_type_id и density
        const tableInfo = await db.all("PRAGMA table_info(materials)");
        const hasExtraFields = tableInfo.some((col: any) => col.name === 'paper_type_id') && 
                               tableInfo.some((col: any) => col.name === 'density');
        const hasFinish = tableInfo.some((col: any) => col.name === 'finish');
        
        // Получаем min_quantity из min_quantity (совместимость с фронтендом)
        const minQuantity = (material as any).min_quantity ?? material.min_quantity ?? null;
        
        if (hasExtraFields && hasFinish) {
          await db.run(
            'UPDATE materials SET name = ?, unit = ?, quantity = ?, min_quantity = ?, sheet_price_single = ?, category_id = ?, supplier_id = ?, paper_type_id = ?, density = ?, finish = ?, description = ? WHERE id = ?',
            material.name,
            material.unit,
            material.quantity,
            minQuantity,
            price,
            material.category_id ?? null,
            material.supplier_id ?? null,
            (material as any).paper_type_id ?? null,
            (material as any).density ?? null,
            (material as any).finish ?? null,
            (material as any).description ?? null,
            material.id
          )
        } else if (hasExtraFields) {
          await db.run(
            'UPDATE materials SET name = ?, unit = ?, quantity = ?, min_quantity = ?, sheet_price_single = ?, category_id = ?, supplier_id = ?, paper_type_id = ?, density = ?, description = ? WHERE id = ?',
            material.name,
            material.unit,
            material.quantity,
            minQuantity,
            price,
            material.category_id ?? null,
            material.supplier_id ?? null,
            (material as any).paper_type_id ?? null,
            (material as any).density ?? null,
            (material as any).description ?? null,
            material.id
          )
        } else {
          await db.run(
            'UPDATE materials SET name = ?, unit = ?, quantity = ?, min_quantity = ?, sheet_price_single = ?, category_id = ?, supplier_id = ?, description = ? WHERE id = ?',
            material.name,
            material.unit,
            material.quantity,
            minQuantity,
            price,
            material.category_id ?? null,
            material.supplier_id ?? null,
            (material as any).description ?? null,
            material.id
          )
        }
      } else {
        logger.debug('Создаем новый материал (material.id не указан)');
        // Проверяем, существуют ли поля paper_type_id и density
        const tableInfo = await db.all("PRAGMA table_info(materials)");
        const hasExtraFields = tableInfo.some((col: any) => col.name === 'paper_type_id') && 
                               tableInfo.some((col: any) => col.name === 'density');
        const hasFinish = tableInfo.some((col: any) => col.name === 'finish');
        
        // Проверяем, есть ли поле description
        const hasDescription = tableInfo.some((col: any) => col.name === 'description');
        const hasMaxStock = tableInfo.some((col: any) => col.name === 'max_stock_level');
        
        logger.debug('Поля в таблице materials', { 
          fields: tableInfo.map((col: any) => col.name),
          hasExtraFields,
          hasDescription,
          hasMaxStock
        });
        
        if (hasExtraFields && hasFinish && hasDescription) {
          logger.debug('INSERT с полными полями (включая finish)');
          await db.run(
            'INSERT INTO materials (name, unit, quantity, min_quantity, sheet_price_single, category_id, supplier_id, paper_type_id, density, finish, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            material.name,
            material.unit,
            material.quantity,
            material.min_quantity ?? null,
            price,
            material.category_id ?? null,
            material.supplier_id ?? null,
            (material as any).paper_type_id ?? null,
            (material as any).density ?? null,
            (material as any).finish ?? null,
            (material as any).description ?? null
          )
        } else if (hasExtraFields && hasDescription) {
          logger.debug('Выполняем INSERT с полными полями (hasExtraFields && hasDescription)');
          await db.run(
            'INSERT INTO materials (name, unit, quantity, min_quantity, sheet_price_single, category_id, supplier_id, paper_type_id, density, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            material.name,
            material.unit,
            material.quantity,
            material.min_quantity ?? null,
            price,
            material.category_id ?? null,
            material.supplier_id ?? null,
            (material as any).paper_type_id ?? null,
            (material as any).density ?? null,
            (material as any).description ?? null
          )
        } else if (hasExtraFields && hasFinish) {
          await db.run(
            'INSERT INTO materials (name, unit, quantity, min_quantity, sheet_price_single, category_id, supplier_id, paper_type_id, density, finish) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            material.name,
            material.unit,
            material.quantity,
            material.min_quantity ?? null,
            price,
            material.category_id ?? null,
            material.supplier_id ?? null,
            (material as any).paper_type_id ?? null,
            (material as any).density ?? null,
            (material as any).finish ?? null
          )
        } else if (hasExtraFields) {
          await db.run(
            'INSERT INTO materials (name, unit, quantity, min_quantity, sheet_price_single, category_id, supplier_id, paper_type_id, density) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            material.name,
            material.unit,
            material.quantity,
            material.min_quantity ?? null,
            price,
            material.category_id ?? null,
            material.supplier_id ?? null,
            (material as any).paper_type_id ?? null,
            (material as any).density ?? null
          )
        } else if (hasDescription) {
          await db.run(
            'INSERT INTO materials (name, unit, quantity, min_quantity, sheet_price_single, category_id, supplier_id, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            material.name,
            material.unit,
            material.quantity,
            material.min_quantity ?? null,
            price,
            material.category_id ?? null,
            material.supplier_id ?? null,
            (material as any).description ?? null
          )
        } else {
          await db.run(
            'INSERT INTO materials (name, unit, quantity, min_quantity, sheet_price_single, category_id, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            material.name,
            material.unit,
            material.quantity,
            material.min_quantity ?? null,
            price,
            material.category_id ?? null,
            material.supplier_id ?? null
          )
        }
      }
    } catch (e: any) {
      logger.error('Ошибка при создании/обновлении материала', {
        error: e,
        details: {
          message: e.message,
          code: e.code,
          errno: e.errno,
          sql: e.sql
        }
      });
      
      if (e && typeof e.message === 'string' && e.message.includes('UNIQUE constraint failed: materials.name')) {
        const err: any = new Error('Материал с таким именем уже существует')
        err.status = 409
        throw err
      }
      throw e
    }
    
    const allMats = await db.all<Material & { sheet_price_single: number | null }>(
      `SELECT 
        m.id,
        m.name,
        m.unit,
        m.quantity,
        m.min_quantity as min_quantity,
        m.sheet_price_single,
        m.category_id,
        c.name as category_name,
        c.color as category_color,
        m.supplier_id,
        s.name as supplier_name,
        s.contact_person as supplier_contact,
        m.paper_type_id,
        pt.display_name as paper_type_name,
        m.density,
        m.is_active,
        m.sheet_width,
        m.sheet_height,
        m.printable_width,
        m.printable_height,
        COALESCE(m.finish, pt.finish) as finish,
        -- Aliases required by API contract
        m.quantity as stock,
        COALESCE(m.sheet_price_single, 0) as price_per_sheet,
        c.name as category
       FROM materials m
       LEFT JOIN material_categories c ON c.id = m.category_id
       LEFT JOIN suppliers s ON s.id = m.supplier_id
       LEFT JOIN paper_types pt ON pt.id = m.paper_type_id
       ORDER BY c.name, m.name`
    ) as any
    
        // Добавляем поля для резервирования и совместимости с фронтендом
        const result = await Promise.all(allMats.map(async (material: any) => {
          // Получаем резервированное количество из таблицы material_reservations
          const reservedQuery = `
            SELECT COALESCE(SUM(quantity_reserved), 0) as reserved_quantity
            FROM material_reservations 
            WHERE material_id = ? AND status = 'active'
          `;
          
          let reserved_quantity = 0;
          try {
            const reservedResult = await db.get(reservedQuery, [material.id]) as any;
            reserved_quantity = reservedResult?.reserved_quantity || 0;
          } catch (error) {
            // Если таблица не существует, игнорируем ошибку
            logger.warn('Material reservations table not found, using 0 for reserved quantity');
          }
          
          const available_quantity = Math.max(0, (material.quantity || 0) - reserved_quantity);
          
          return {
            ...material,
            price: material.sheet_price_single || 0,
            reserved_quantity,
            available_quantity
          };
        }));
    
    return result;
  }

  static async updateMaterial(id: number, material: Material & { sheet_price_single?: number | null }) {
    const db = await getDb()
    try {
      logger.debug('Обновление материала', { id, material });
      
      // Определяем цену: приоритет у sheet_price_single, затем price
      const price = material.sheet_price_single ?? (material as any).price ?? null;
      
      // Проверяем, существуют ли поля paper_type_id и density
      const tableInfo = await db.all("PRAGMA table_info(materials)");
      const hasExtraFields = tableInfo.some((col: any) => col.name === 'paper_type_id') && 
                             tableInfo.some((col: any) => col.name === 'density');
      
      // Получаем min_quantity из min_quantity (совместимость с фронтендом)
      const minQuantity = (material as any).min_quantity ?? material.min_quantity ?? null;
      
      if (hasExtraFields) {
        await db.run(
          'UPDATE materials SET name = ?, unit = ?, quantity = ?, min_quantity = ?, sheet_price_single = ?, category_id = ?, supplier_id = ?, paper_type_id = ?, density = ?, description = ? WHERE id = ?',
          material.name,
          material.unit,
          material.quantity,
          minQuantity,
          price,
          material.category_id ?? null,
          material.supplier_id ?? null,
          (material as any).paper_type_id ?? null,
          (material as any).density ?? null,
          (material as any).description ?? null,
          id
        )
      } else {
        await db.run(
          'UPDATE materials SET name = ?, unit = ?, quantity = ?, min_quantity = ?, sheet_price_single = ?, category_id = ?, supplier_id = ?, description = ? WHERE id = ?',
          material.name,
          material.unit,
          material.quantity,
          minQuantity,
          price,
          material.category_id ?? null,
          material.supplier_id ?? null,
          (material as any).description ?? null,
          id
        )
      }
      
      // Получаем обновленный материал
      const updatedMaterial = await db.get<Material>(
        `SELECT 
          m.id,
          m.name,
          m.unit,
          m.quantity,
          m.min_quantity,
          m.sheet_price_single,
          m.category_id,
          c.name as category_name,
          c.color as category_color,
          m.supplier_id,
          s.name as supplier_name,
          s.contact_person as supplier_contact,
          m.paper_type_id,
          pt.display_name as paper_type_name,
          m.density,
          m.is_active,
          m.sheet_width,
          m.sheet_height,
          m.printable_width,
          m.printable_height,
          COALESCE(m.finish, pt.finish) as finish,
          m.quantity as stock,
          COALESCE(m.sheet_price_single, 0) as price_per_sheet,
          c.name as category
         FROM materials m
         LEFT JOIN material_categories c ON c.id = m.category_id
         LEFT JOIN suppliers s ON s.id = m.supplier_id
         LEFT JOIN paper_types pt ON pt.id = m.paper_type_id
         WHERE m.id = ?`,
        id
      )
      
      // Добавляем поле price для совместимости с фронтендом
      return {
        ...updatedMaterial,
        price: updatedMaterial?.sheet_price_single || 0
      };
    } catch (e: any) {
      if (e && typeof e.message === 'string' && e.message.includes('UNIQUE constraint failed: materials.name')) {
        const err: any = new Error('Материал с таким именем уже существует')
        err.status = 400
        throw err
      }
      throw e
    }
  }

  static async deleteMaterial(id: number) {
    const db = await getDb()
    
    // Проверяем, существует ли материал
    const material = await db.get('SELECT id, name FROM materials WHERE id = ?', [id])
    if (!material) {
      throw new Error('Материал не найден')
    }
    
    // Проверяем, используется ли материал в продуктах
    const productUsage = await db.get(`
      SELECT COUNT(*) as count 
      FROM product_materials 
      WHERE material_id = ?
    `, [id])
    
    if (productUsage && productUsage.count > 0) {
      throw new Error(`Невозможно удалить материал "${material.name}" - он используется в ${productUsage.count} продукте(ах). Сначала отвяжите материал от продуктов.`)
    }
    
    // Проверяем правила автозаказа (если таблица существует)
    try {
      const autoOrderUsage = await db.get(`
        SELECT COUNT(*) as count 
        FROM auto_order_rules 
        WHERE material_id = ?
      `, [id])
      
      if (autoOrderUsage && autoOrderUsage.count > 0) {
        throw new Error(`Невозможно удалить материал "${material.name}" - для него настроены правила автозаказа. Сначала удалите правила.`)
      }
    } catch (e: any) {
      // Игнорируем, если таблица не существует
      if (!e.message?.includes('no such table')) {
        throw e
      }
    }
    
    // Начинаем транзакцию
    await db.run('BEGIN')
    
    try {
      // Удаляем связанные записи
      await db.run('DELETE FROM material_moves WHERE material_id = ?', [id])
      
      // Пробуем удалить резервации (если таблица существует)
      try {
        await db.run('DELETE FROM material_reservations WHERE material_id = ?', [id])
      } catch (e) {
        // Игнорируем, если таблицы не существует
      }
      
      // Удаляем правила автозаказа (если таблица существует)
      try {
        await db.run('DELETE FROM auto_order_rules WHERE material_id = ?', [id])
      } catch (e) {
        // Игнорируем, если таблицы не существует
      }
      
      // Удаляем алерты (если таблица существует)
      try {
        await db.run('DELETE FROM material_alerts WHERE material_id = ?', [id])
      } catch (e) {
        // Игнорируем, если таблицы не существует
      }
      
      // Удаляем сам материал
      await db.run('DELETE FROM materials WHERE id = ?', [id])
      
      await db.run('COMMIT')
    } catch (error) {
      await db.run('ROLLBACK')
      throw error
    }
  }

  static async getLowStockMaterials() {
    const db = await getDb()
    const rows = await db.all<any>(`SELECT id, name, unit, quantity, min_quantity as min_quantity FROM materials WHERE min_quantity IS NOT NULL AND quantity <= min_quantity ORDER BY name`)
    return rows
  }

  static async getMaterialMoves(filters: {
    materialId?: number;
    user_id?: number;
    orderId?: number;
    from?: string;
    to?: string;
    categoryId?: number;
    supplierId?: number;
    reason?: string;
    limit?: number;
    offset?: number;
  }) {
    const { materialId, user_id, orderId, from, to, categoryId, supplierId, reason, limit, offset } = filters
    const where: string[] = []
    const params: any[] = []
    
    if (materialId) { where.push('mm.material_id = ?'); params.push(Number(materialId)) }
    if (user_id) { where.push('mm.user_id = ?'); params.push(Number(user_id)) }
    if (orderId) { where.push('mm.order_id = ?'); params.push(Number(orderId)) }
    if (from) { where.push('mm.created_at >= ?'); params.push(String(from)) }
    if (to) { where.push('mm.created_at <= ?'); params.push(String(to)) }
    if (categoryId) { where.push('m.category_id = ?'); params.push(Number(categoryId)) }
    if (supplierId) { where.push('m.supplier_id = ?'); params.push(Number(supplierId)) }
    if (reason) { where.push('mm.reason LIKE ?'); params.push(`%${reason}%`) }
    
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const limitSql = limit ? `LIMIT ${limit}` : ''
    const offsetSql = offset ? `OFFSET ${offset}` : ''
    
    const db = await getDb()
    const rows = await db.all<any>(
      `SELECT 
        mm.id,
        mm.material_id AS materialId,
        m.name as material_name,
        mm.delta,
        mm.type,
        mm.quantity,
        mm.reason,
        mm.order_id AS orderId,
        mm.user_id,
        u.name as user_name,
        mm.created_at,
        c.name as category_name, s.name as supplier_name
       FROM material_moves mm
       JOIN materials m ON m.id = mm.material_id
       LEFT JOIN users u ON u.id = mm.user_id
       LEFT JOIN material_categories c ON c.id = m.category_id
       LEFT JOIN suppliers s ON s.id = m.supplier_id
      ${whereSql}
      ORDER BY mm.created_at DESC, mm.id DESC
      ${limitSql} ${offsetSql}`,
      ...params
    )
    return rows
  }

  static async getMaterialMovesStats(filters: {
    materialId?: number;
    user_id?: number;
    orderId?: number;
    from?: string;
    to?: string;
    categoryId?: number;
    supplierId?: number;
  }) {
    const { materialId, user_id, orderId, from, to, categoryId, supplierId } = filters
    const where: string[] = []
    const params: any[] = []
    
    if (materialId) { where.push('mm.material_id = ?'); params.push(Number(materialId)) }
    if (user_id) { where.push('mm.user_id = ?'); params.push(Number(user_id)) }
    if (orderId) { where.push('mm.order_id = ?'); params.push(Number(orderId)) }
    if (from) { where.push('mm.created_at >= ?'); params.push(String(from)) }
    if (to) { where.push('mm.created_at <= ?'); params.push(String(to)) }
    if (categoryId) { where.push('m.category_id = ?'); params.push(Number(categoryId)) }
    if (supplierId) { where.push('m.supplier_id = ?'); params.push(Number(supplierId)) }
    
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : ''
    const db = await getDb()
    
    const stats = await db.get<{
      total_moves: number;
      total_incoming: number;
      total_outgoing: number;
      unique_materials: number;
      unique_users: number;
    }>(
      `SELECT 
        COUNT(*) as total_moves,
        SUM(CASE WHEN mm.delta > 0 THEN mm.delta ELSE 0 END) as total_incoming,
        SUM(CASE WHEN mm.delta < 0 THEN ABS(mm.delta) ELSE 0 END) as total_outgoing,
        COUNT(DISTINCT mm.material_id) as unique_materials,
        COUNT(DISTINCT mm.user_id) as unique_users
       FROM material_moves mm
       JOIN materials m ON m.id = mm.material_id
      ${whereSql}`,
      ...params
    )
    return stats
  }

  // Новый безопасный метод списания
  static async safeSpendMaterial(materialId: number, quantity: number, reason: string, orderId?: number, userId?: number) {
    return await WarehouseTransactionService.spendMaterial(materialId, quantity, reason, orderId, userId);
  }

  // Новый безопасный метод добавления
  static async safeAddMaterial(materialId: number, quantity: number, reason: string, orderId?: number, userId?: number) {
    return await WarehouseTransactionService.addMaterial(materialId, quantity, reason, orderId, userId);
  }

  // Новый безопасный метод корректировки
  static async safeAdjustStock(materialId: number, newQuantity: number, reason: string, userId?: number) {
    return await WarehouseTransactionService.adjustStock(materialId, newQuantity, reason, userId);
  }
}
