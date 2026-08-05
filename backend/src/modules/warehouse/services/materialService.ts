import { getDb } from '../../../config/database'
import { getTableColumns } from '../../../utils/tableSchemaCache'
import { Material } from '../../../models'
import { WarehouseTransactionService } from './warehouseTransactionService'
import { logger } from '../../../utils/logger'

export interface MaterialFilters {
  categoryId?: number;
  materialTypeId?: number;
  materialKind?: MaterialKind;
  category?: string;
  finish?: string;
  minDensity?: number;
  maxDensity?: number;
  search?: string;
  onlyActive?: boolean;
}

type MaterialKind = 'sheet' | 'roll' | 'consumable' | 'area'

const MATERIAL_KINDS: ReadonlyArray<MaterialKind> = ['sheet', 'roll', 'consumable', 'area']

function toNullableNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeMaterialKind(raw: unknown): MaterialKind | null {
  const value = String(raw || '').trim().toLowerCase()
  return MATERIAL_KINDS.includes(value as MaterialKind) ? (value as MaterialKind) : null
}

function buildBadRequest(message: string): Error & { status: number } {
  const err = new Error(message) as Error & { status: number }
  err.status = 400
  return err
}

export class MaterialService {
  private static inferMaterialKind(material: Record<string, any>): MaterialKind {
    const explicit = normalizeMaterialKind(material.material_kind)
    if (explicit) return explicit

    const normalizedUnit = String(material.unit || '').trim().toLowerCase()
    if (normalizedUnit === 'м' || normalizedUnit === 'm' || normalizedUnit === 'meter' || normalizedUnit === 'meters') {
      return 'roll'
    }
    if (normalizedUnit === 'м²' || normalizedUnit === 'm²' || normalizedUnit === 'm2' || normalizedUnit === 'sqm') {
      return 'area'
    }

    const width = toNullableNumber(material.sheet_width)
    const height = toNullableNumber(material.sheet_height)
    if (width != null && width > 0 && height != null && height > 0) {
      return 'sheet'
    }
    if (material.paper_type_id != null) {
      return 'sheet'
    }

    return 'consumable'
  }

  private static validateMaterialByKind(material: Record<string, any>, kind: MaterialKind, strictByKind: boolean) {
    const width = toNullableNumber(material.sheet_width)
    const height = toNullableNumber(material.sheet_height)
    const shouldValidateStrict = strictByKind || !material.id

    if (kind === 'sheet' && shouldValidateStrict) {
      if (!width || width <= 0) {
        throw buildBadRequest('Для листового материала укажите ширину листа (мм)')
      }
      if (!height || height <= 0) {
        throw buildBadRequest('Для листового материала укажите высоту листа (мм)')
      }
    }

    if (kind === 'roll' && shouldValidateStrict) {
      if (!width || width <= 0) {
        throw buildBadRequest('Для рулонного материала укажите ширину рулона (мм)')
      }
      const normalizedUnit = String(material.unit || '').trim().toLowerCase()
      if (!(normalizedUnit === 'м' || normalizedUnit === 'm' || normalizedUnit === 'meter' || normalizedUnit === 'meters')) {
        throw buildBadRequest('Для рулонного материала единица измерения должна быть в метрах')
      }
    }
  }

  private static async normalizeAndValidateMaterialPayload(db: any, material: Record<string, any>) {
    const payload: Record<string, any> = { ...material }
    const explicitKind = normalizeMaterialKind(material.material_kind)
    payload.material_type_id = toNullableNumber(material.material_type_id)
    payload.sheet_width = toNullableNumber(material.sheet_width)
    payload.sheet_height = toNullableNumber(material.sheet_height)
    payload.material_kind = explicitKind ?? this.inferMaterialKind(material)

    this.validateMaterialByKind(payload, payload.material_kind, Boolean(explicitKind))

    if (payload.category_id != null) {
      payload.category_id = Number(payload.category_id)
    }
    if (payload.supplier_id != null) {
      payload.supplier_id = Number(payload.supplier_id)
    }
    if (payload.paper_type_id != null) {
      payload.paper_type_id = Number(payload.paper_type_id)
    }
    if (payload.density != null && payload.density !== '') {
      payload.density = Number(payload.density)
    }

    if (payload.material_type_id != null) {
      const typeRow = await db.get(
        'SELECT id, category_id FROM material_types WHERE id = ?',
        [payload.material_type_id],
      ) as { id: number; category_id: number } | undefined
      if (!typeRow) {
        throw buildBadRequest(`Тип материала с ID ${payload.material_type_id} не найден`)
      }

      if (payload.category_id != null && Number(payload.category_id) !== Number(typeRow.category_id)) {
        throw buildBadRequest('Выбранный тип материала не принадлежит указанной категории')
      }

      if (payload.category_id == null) {
        payload.category_id = Number(typeRow.category_id)
      }
    }

    return payload
  }

  static async getAllMaterials(filters?: MaterialFilters) {
    const db = await getDb()
    const conditions: string[] = []
    const params: any[] = []

    if (filters?.categoryId) {
      conditions.push('m.category_id = ?')
      params.push(filters.categoryId)
    }

    if (filters?.materialTypeId) {
      conditions.push('m.material_type_id = ?')
      params.push(filters.materialTypeId)
    }

    if (filters?.materialKind) {
      conditions.push('m.material_kind = ?')
      params.push(filters.materialKind)
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

    const cols = await getTableColumns('materials')
    const purchasePriceSelect = cols.has('purchase_price')
      ? 'm.purchase_price'
      : 'NULL as purchase_price'

    const allMats = await db.all<Material & { sheet_price_single: number | null; purchase_price: number | null }>(
      `SELECT 
        m.id,
        m.name,
        m.unit,
        m.quantity,
        m.min_quantity as min_quantity,
        m.sheet_price_single,
        ${purchasePriceSelect},
        m.category_id,
        c.name as category_name,
        c.color as category_color,
        m.material_type_id,
        mt.name as material_type_name,
        m.material_kind,
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
       LEFT JOIN material_types mt ON mt.id = m.material_type_id
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
        purchase_price: material.purchase_price ?? null,
        reserved_quantity,
        available_quantity
      };
    }));
    
    return result;
  }

  static async getMaterialById(id: number) {
    const db = await getDb()
    const cols = await getTableColumns('materials')
    const purchasePriceSelect = cols.has('purchase_price')
      ? 'm.purchase_price'
      : 'NULL as purchase_price'

    const material = await db.get<Material & { sheet_price_single: number | null; purchase_price: number | null }>(
      `SELECT 
        m.id,
        m.name,
        m.unit,
        m.quantity,
        m.min_quantity as min_quantity,
        m.sheet_price_single,
        ${purchasePriceSelect},
        m.category_id,
        c.name as category_name,
        c.color as category_color,
        m.material_type_id,
        mt.name as material_type_name,
        m.material_kind,
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
       LEFT JOIN material_types mt ON mt.id = m.material_type_id
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
      purchase_price: material.purchase_price ?? null,
      reserved_quantity,
      available_quantity
    };
  }

  static async createOrUpdateMaterial(material: Material & { sheet_price_single?: number | null; purchase_price?: number | null }) {
    logger.debug('Создание/обновление материала', { material })
    const db = await getDb()
    try {
      const normalized = await this.normalizeAndValidateMaterialPayload(db, material as any)
      const price = normalized.sheet_price_single ?? normalized.price ?? null
      const purchasePrice = toNullableNumber(normalized.purchase_price)

      if (purchasePrice != null && purchasePrice < 0) {
        throw buildBadRequest('Закупочная цена не может быть отрицательной')
      }
      if (price != null && Number(price) < 0) {
        throw buildBadRequest('Отпускная цена не может быть отрицательной')
      }

      if (normalized.supplier_id) {
        const supplier = await db.get('SELECT id FROM suppliers WHERE id = ?', [normalized.supplier_id])
        if (!supplier) {
          throw buildBadRequest(`Поставщик с ID ${normalized.supplier_id} не найден`)
        }
      }

      if (normalized.category_id) {
        const category = await db.get('SELECT id FROM material_categories WHERE id = ?', [normalized.category_id])
        if (!category) {
          throw buildBadRequest(`Категория с ID ${normalized.category_id} не найдена`)
        }
      }

      if (normalized.paper_type_id) {
        const paperType = await db.get('SELECT id FROM paper_types WHERE id = ?', [normalized.paper_type_id])
        if (!paperType) {
          throw buildBadRequest(`Тип бумаги с ID ${normalized.paper_type_id} не найден`)
        }
      }

      const cols = await getTableColumns('materials')

      const assignableColumns: Array<{ name: string; value: any }> = [
        { name: 'name', value: normalized.name },
        { name: 'unit', value: normalized.unit },
        { name: 'quantity', value: normalized.quantity },
        { name: 'min_quantity', value: normalized.min_quantity ?? null },
        { name: 'sheet_price_single', value: price },
        { name: 'category_id', value: normalized.category_id ?? null },
        { name: 'supplier_id', value: normalized.supplier_id ?? null },
      ]

      if (cols.has('purchase_price')) assignableColumns.push({ name: 'purchase_price', value: purchasePrice })
      if (cols.has('paper_type_id')) assignableColumns.push({ name: 'paper_type_id', value: normalized.paper_type_id ?? null })
      if (cols.has('density')) assignableColumns.push({ name: 'density', value: normalized.density ?? null })
      if (cols.has('finish')) assignableColumns.push({ name: 'finish', value: normalized.finish ?? null })
      if (cols.has('description')) assignableColumns.push({ name: 'description', value: normalized.description ?? null })
      if (cols.has('sheet_width')) assignableColumns.push({ name: 'sheet_width', value: normalized.sheet_width ?? null })
      if (cols.has('sheet_height')) assignableColumns.push({ name: 'sheet_height', value: normalized.sheet_height ?? null })
      if (cols.has('material_type_id')) assignableColumns.push({ name: 'material_type_id', value: normalized.material_type_id ?? null })
      if (cols.has('material_kind')) assignableColumns.push({ name: 'material_kind', value: normalized.material_kind })

      if (normalized.id) {
        const setSql = assignableColumns.map((column) => `${column.name} = ?`).join(', ')
        const values = assignableColumns.map((column) => column.value)
        await db.run(`UPDATE materials SET ${setSql} WHERE id = ?`, [...values, normalized.id])
      } else {
        const columnNames = assignableColumns.map((column) => column.name)
        const placeholders = columnNames.map(() => '?').join(', ')
        const values = assignableColumns.map((column) => column.value)
        await db.run(
          `INSERT INTO materials (${columnNames.join(', ')}) VALUES (${placeholders})`,
          values,
        )
      }
    } catch (e: any) {
      logger.error('Ошибка при создании/обновлении материала', {
        error: e,
        details: {
          message: e?.message,
          code: e?.code,
          errno: e?.errno,
          sql: e?.sql,
        },
      })

      if (e && typeof e.message === 'string' && e.message.includes('UNIQUE constraint failed: materials.name')) {
        const err: any = new Error('Материал с таким именем уже существует')
        err.status = 409
        throw err
      }
      throw e
    }

    return this.getAllMaterials()
  }

  static async updateMaterial(id: number, material: Material & { sheet_price_single?: number | null }) {
    const existing = await this.getMaterialById(id)
    if (!existing) {
      const err: any = new Error('Материал не найден')
      err.status = 404
      throw err
    }

    const payload = {
      ...(existing as any),
      ...(material as any),
      id,
    }

    await this.createOrUpdateMaterial(payload)
    const updatedMaterial = await this.getMaterialById(id)
    return updatedMaterial
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
