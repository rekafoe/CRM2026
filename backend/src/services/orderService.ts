import { getDb } from '../config/database'
import { getCurrentTimestamp } from '../utils'
import { Order, Item } from '../models'
import { UnifiedWarehouseService } from './unifiedWarehouseService'
import { AutoMaterialDeductionService } from './autoMaterialDeductionService'

export class OrderService {
  private static buildDefaultReadyDate(baseDate?: string) {
    const date = baseDate ? new Date(baseDate) : new Date()
    if (isNaN(date.getTime())) {
      return null
    }
    date.setHours(date.getHours() + 1)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }
  static async getAllOrders(userId: number) {
    const db = await getDb()
    
    // Получаем обычные заказы
    const orders = (await db.all<Order>(
      `SELECT 
        id, 
        number,
        status, created_at as createdAt, customerName, customerPhone, customerEmail, 
        prepaymentAmount, prepaymentStatus, paymentUrl, paymentId, paymentMethod, userId,
        source
      FROM orders 
      WHERE userId = ? OR userId IS NULL 
      ORDER BY id DESC`,
      userId
    )) as unknown as Order[]
    
    // Получаем назначенные заказы из пула для текущего пользователя
    const assignedOrders = await db.all(`
      SELECT 
        uopo.order_id as id,
        uopo.order_type,
        uopo.status as assignment_status,
        uopo.assigned_at,
        uopo.notes as assignment_notes,
        CASE 
          WHEN uopo.order_type = 'website' THEN 
            CASE 
              WHEN o.source = 'website' THEN 'site-ord-' || o.id
              ELSE o.number
            END
          WHEN uopo.order_type = 'telegram' THEN 'tg-ord-' || po.id
          ELSE 'ord-' || uopo.order_id
        END as number,
        CASE 
          WHEN uopo.order_type = 'website' THEN o.status
          WHEN uopo.order_type = 'telegram' THEN po.status
          ELSE 'pending'
        END as status,
        CASE 
          WHEN uopo.order_type = 'website' THEN o.created_at
          WHEN uopo.order_type = 'telegram' THEN uopo.assigned_at
          ELSE uopo.assigned_at
        END as createdAt,
        CASE 
          WHEN uopo.order_type = 'website' THEN o.customerName
          WHEN uopo.order_type = 'telegram' THEN po.first_name
          ELSE 'Клиент'
        END as customerName,
        CASE 
          WHEN uopo.order_type = 'website' THEN o.customerPhone
          WHEN uopo.order_type = 'telegram' THEN po.chat_id
          ELSE ''
        END as customerPhone,
        CASE 
          WHEN uopo.order_type = 'website' THEN o.customerEmail
          ELSE ''
        END as customerEmail,
        CASE 
          WHEN uopo.order_type = 'website' THEN o.prepaymentAmount
          WHEN uopo.order_type = 'telegram' THEN po.total_price / 100.0
          ELSE 0
        END as prepaymentAmount,
        CASE 
          WHEN uopo.order_type = 'website' THEN o.prepaymentStatus
          ELSE 'paid'
        END as prepaymentStatus,
        CASE 
          WHEN uopo.order_type = 'website' THEN o.paymentUrl
          ELSE ''
        END as paymentUrl,
        CASE 
          WHEN uopo.order_type = 'website' THEN o.paymentId
          ELSE ''
        END as paymentId,
        CASE 
          WHEN uopo.order_type = 'website' THEN o.paymentMethod
          ELSE 'telegram'
        END as paymentMethod,
        uopo.page_id as userId
      FROM user_order_page_orders uopo
      LEFT JOIN orders o ON uopo.order_type = 'website' AND uopo.order_id = o.id
      LEFT JOIN photo_orders po ON uopo.order_type = 'telegram' AND uopo.order_id = po.id
      WHERE uopo.page_id IN (
        SELECT id FROM user_order_pages WHERE user_id = ?
      )
      ORDER BY uopo.assigned_at DESC
    `, [userId])
    
    // Объединяем заказы
    const allOrders = [...orders, ...assignedOrders] as Order[]
    
    for (const order of allOrders) {
      // Проверяем, является ли это Telegram заказом
      const isTelegramOrder = order.paymentMethod === 'telegram';
      
      if (isTelegramOrder) {
        // Для Telegram заказов создаем виртуальный item на основе данных из photo_orders
        const telegramOrder = await db.get(`
          SELECT selected_size, processing_options, quantity, total_price
          FROM photo_orders 
          WHERE id = ?
        `, [order.id]);
        
        if (telegramOrder) {
          order.items = [{
            id: order.id * 1000, // Виртуальный ID
            orderId: order.id,
            type: 'Фото печать',
            params: {
              description: `Фото ${telegramOrder.selected_size} (${telegramOrder.processing_options})`,
              size: telegramOrder.selected_size,
              processing: telegramOrder.processing_options,
              quantity: telegramOrder.quantity
            } as any,
            price: telegramOrder.total_price / 100.0,
            quantity: telegramOrder.quantity,
            printerId: undefined,
            sides: 1,
            sheets: 1,
            waste: 0,
            clicks: 0
          }];
        } else {
          order.items = [];
        }
      } else {
        // Для обычных заказов загружаем items из таблицы items
        const itemsRaw = (await db.all<{
          id: number
          orderId: number
          type: string
          params: string
          price: number
          quantity: number
          printerId: number | null
          sides: number
          sheets: number
          waste: number
          clicks: number
        }>(
          'SELECT id, orderId, type, params, price, quantity, printerId, sides, sheets, waste, clicks FROM items WHERE orderId = ?',
          order.id
        )) as unknown as Array<{
          id: number
          orderId: number
          type: string
          params: string
          price: number
          quantity: number
          printerId: number | null
          sides: number
          sheets: number
          waste: number
          clicks: number
        }>
        
        order.items = Array.isArray(itemsRaw) ? itemsRaw.map((ir: any) => {
          let params;
          try {
            params = JSON.parse(ir.params);
          } catch (error) {
            console.error(`Error parsing params for item ${ir.id}:`, error);
            params = { description: 'Ошибка данных' };
          }
          return {
            id: ir.id,
            orderId: ir.orderId,
            type: ir.type,
            params,
            price: ir.price,
            quantity: ir.quantity ?? 1,
            printerId: ir.printerId ?? undefined,
            sides: ir.sides,
            sheets: ir.sheets,
            waste: ir.waste,
            clicks: ir.clicks
          };
        }) : [];
      }
    }
    
    return allOrders
  }

  static async createOrder(customerName?: string, customerPhone?: string, customerEmail?: string, prepaymentAmount?: number, userId?: number, date?: string) {
    const createdAt = date ? `${date}T12:00:00.000Z` : getCurrentTimestamp()
    const db = await getDb()
    const initialPrepay = Number(prepaymentAmount || 0)
    let hasPrepaymentUpdatedAt = false
    try {
      const columns = await db.all<{ name: string }>("PRAGMA table_info('orders')")
      hasPrepaymentUpdatedAt = Array.isArray(columns) && columns.some((col) => col.name === 'prepaymentUpdatedAt')
    } catch {
      hasPrepaymentUpdatedAt = false
    }
    const insertRes = hasPrepaymentUpdatedAt
      ? await db.run(
          'INSERT INTO orders (status, created_at, customerName, customerPhone, customerEmail, prepaymentAmount, prepaymentUpdatedAt, userId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          1,
          createdAt,
          customerName || null,
          customerPhone || null,
          customerEmail || null,
          initialPrepay,
          initialPrepay > 0 ? createdAt : null,
          userId ?? null
        )
      : await db.run(
          'INSERT INTO orders (status, created_at, customerName, customerPhone, customerEmail, prepaymentAmount, userId) VALUES (?, ?, ?, ?, ?, ?, ?)',
          1,
          createdAt,
          customerName || null,
          customerPhone || null,
          customerEmail || null,
          initialPrepay,
          userId ?? null
        )
    const id = insertRes.lastID!
    const number = `ORD-${String(id).padStart(4, '0')}`
    await db.run('UPDATE orders SET number = ? WHERE id = ?', number, id)

    const raw = await db.get<Order>(
      'SELECT * FROM orders WHERE id = ?',
      id
    )
    const order: Order = { ...(raw as Order), items: [] }
    return order
  }

  // Создание заказа с резервированием материалов
  static async createOrderWithReservation(
    orderData: {
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      prepaymentAmount?: number;
      userId?: number;
      items: Array<{
        type: string;
        params: string;
        price: number;
        quantity: number;
        materialRequirements?: Array<{
          material_id: number;
          quantity: number;
        }>;
      }>;
    }
  ) {
    const db = await getDb();
    
    try {
      await db.run('BEGIN');
      
      // 1. Создаем заказ
      const order = await this.createOrder(
        orderData.customerName,
        orderData.customerPhone,
        orderData.customerEmail,
        orderData.prepaymentAmount,
        orderData.userId
      );
      
      // 2. Добавляем товары в заказ
      const orderCreatedAt = (order as any).created_at || (order as any).createdAt
      for (const item of orderData.items) {
        let paramsObj: Record<string, any> = {}
        try {
          paramsObj = typeof item.params === 'string' ? JSON.parse(item.params) : (item.params || {})
        } catch {
          paramsObj = {}
        }
        if (!paramsObj.readyDate) {
          const defaultReadyDate = this.buildDefaultReadyDate(orderCreatedAt)
          if (defaultReadyDate) {
            paramsObj.readyDate = defaultReadyDate
          }
        }
        await db.run(
          'INSERT INTO items (orderId, type, params, price, quantity) VALUES (?, ?, ?, ?, ?)',
          order.id,
          item.type,
          JSON.stringify(paramsObj),
          item.price,
          item.quantity
        );
      }
      
      // 3. Резервируем материалы, если указаны требования
      const materialReservations = [];
      for (const item of orderData.items) {
        if (item.materialRequirements) {
          for (const requirement of item.materialRequirements) {
            materialReservations.push({
              material_id: requirement.material_id,
              quantity: requirement.quantity * item.quantity, // Умножаем на количество товара
              order_id: order.id,
              reason: `Резерв для заказа ${order.number}`,
              expires_in_hours: 24
            });
          }
        }
      }
      
      if (materialReservations.length > 0) {
        await UnifiedWarehouseService.reserveMaterials(materialReservations);
      }
      
      await db.run('COMMIT');
      
      return order;
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  }

  // Создание заказа с автоматическим списанием материалов
  static async createOrderWithAutoDeduction(
    orderData: {
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      prepaymentAmount?: number;
      userId?: number;
      items: Array<{
        type: string;
        params: string;
        price: number;
        quantity: number;
        components?: Array<{
          materialId: number;
          qtyPerItem: number;
        }>;
      }>;
    }
  ) {
    const db = await getDb();
    
    try {
      await db.run('BEGIN');
      
      // 1. Создаем заказ
      const order = await this.createOrder(
        orderData.customerName,
        orderData.customerPhone,
        orderData.customerEmail,
        orderData.prepaymentAmount,
        orderData.userId
      );
      
      // 2. Добавляем товары в заказ
      const orderCreatedAt = (order as any).created_at || (order as any).createdAt
      for (const item of orderData.items) {
        let paramsObj: Record<string, any> = {}
        try {
          paramsObj = typeof item.params === 'string' ? JSON.parse(item.params) : (item.params || {})
        } catch {
          paramsObj = {}
        }
        if (!paramsObj.readyDate) {
          const defaultReadyDate = this.buildDefaultReadyDate(orderCreatedAt)
          if (defaultReadyDate) {
            paramsObj.readyDate = defaultReadyDate
          }
        }
        await db.run(
          'INSERT INTO items (orderId, type, params, price, quantity) VALUES (?, ?, ?, ?, ?)',
          order.id,
          item.type,
          JSON.stringify(paramsObj),
          item.price,
          item.quantity
        );
      }
      
      // 3. Автоматическое списание материалов
      const deductionResult = await AutoMaterialDeductionService.deductMaterialsForOrder(
        order.id,
        orderData.items.map(item => ({
          type: item.type,
          params: JSON.parse(item.params || '{}'),
          quantity: item.quantity,
          components: item.components
        })),
        orderData.userId
      );
      
      if (!deductionResult.success) {
        throw new Error(`Ошибка автоматического списания: ${deductionResult.errors.join(', ')}`);
      }
      
      await db.run('COMMIT');
      
      return {
        order,
        deductionResult
      };
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  }

  static async updateOrderStatus(id: number, status: number) {
    const db = await getDb()
    
    // Сначала проверяем, есть ли заказ в таблице photo_orders (Telegram заказы)
    const telegramOrder = await db.get('SELECT id FROM photo_orders WHERE id = ?', [id])
    
    if (telegramOrder) {
      // Обновляем Telegram заказ
      await db.run('UPDATE photo_orders SET status = ?, updated_at = datetime("now") WHERE id = ?', status, id)
      
      // Возвращаем обновленный заказ в формате Order
      const updatedTelegramOrder = await db.get(`
        SELECT 
          id,
          'tg-ord-' || id as number,
          status,
          created_at as createdAt,
          first_name as customerName,
          chat_id as customerPhone,
          total_price / 100.0 as prepaymentAmount,
          'paid' as prepaymentStatus,
          'telegram' as paymentMethod
        FROM photo_orders 
        WHERE id = ?
      `, [id])
      
      const updated: Order = { ...(updatedTelegramOrder as Order), items: [] }
      return updated
    } else {
      // Проверяем, есть ли заказ в таблице orders
      const orderInOrders = await db.get('SELECT id FROM orders WHERE id = ?', [id])
      
      if (orderInOrders) {
        // Обновляем обычный заказ
        await db.run('UPDATE orders SET status = ?, updated_at = datetime("now") WHERE id = ?', status, id)
        
        const raw = await db.get<Order>(
          'SELECT * FROM orders WHERE id = ?',
          id
        )
        const updated: Order = { ...(raw as Order), items: [] }
        return updated
      } else {
        throw new Error(`Заказ с ID ${id} не найден`)
      }
    }
  }

  static async deleteOrder(id: number, userId?: number) {
    const db = await getDb()
    
    // Проверяем источник заказа
    const order = await db.get<{ source?: string; number: string }>(
      'SELECT source, number FROM orders WHERE id = ?',
      id
    )
    
    if (!order) {
      throw new Error('Заказ не найден')
    }
    
    // Если заказ с сайта или Telegram, возвращаем его в пул вместо удаления
    if (order.source === 'website' || order.source === 'telegram') {
      console.log(`🔄 Возвращаем заказ ${order.number} в пул (источник: ${order.source})`)
      
      await db.run('BEGIN')
      try {
        // Сбрасываем userId и обновляем дату создания
        await db.run(
          'UPDATE orders SET userId = NULL, created_at = datetime("now") WHERE id = ?',
          id
        )
        await db.run('DELETE FROM material_reservations WHERE order_id = ?', [id])
        await db.run('COMMIT')
        
        console.log(`✅ Заказ ${order.number} возвращен в пул`)
        return // Не удаляем заказ, только возвращаем в пул
      } catch (e) {
        await db.run('ROLLBACK')
        throw e
      }
    }
    
    // Для обычных заказов выполняем стандартное удаление
    // Собираем все позиции заказа и их состав
    const items = (await db.all<{
      id: number
      type: string
      params: string
      quantity: number
    }>(
      'SELECT id, type, params, quantity FROM items WHERE orderId = ?',
      id
    )) as unknown as Array<{ id: number; type: string; params: string; quantity: number }>

    // Агрегируем возвраты по materialId
    const returns: Record<number, number> = {}
    const hasRulesTable = !!(await db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='product_material_rules'"
    ))
    const productMaterialsColumns = await db.all(`PRAGMA table_info('product_materials')`)
    const hasLegacyPresetSchema = productMaterialsColumns.some((col: any) => col.name === 'presetCategory')
    for (const item of items) {
      const paramsObj = JSON.parse(item.params || '{}') as { description?: string }
      let composition: Array<{ materialId: number; qtyPerItem: number }> = []
      if (hasRulesTable) {
        composition = (await db.all<{
          materialId: number
          qtyPerItem: number
        }>(
          `SELECT material_id as materialId, qty_per_item as qtyPerItem
           FROM product_material_rules
           WHERE product_type = ? AND product_name = ?`,
          [item.type, paramsObj.description || '']
        )) as unknown as Array<{ materialId: number; qtyPerItem: number }>
      } else if (hasLegacyPresetSchema) {
        composition = (await db.all<{
          materialId: number
          qtyPerItem: number
        }>(
          'SELECT materialId, qtyPerItem FROM product_materials WHERE presetCategory = ? AND presetDescription = ?',
          item.type,
          paramsObj.description || ''
        )) as unknown as Array<{ materialId: number; qtyPerItem: number }>
      }
      for (const c of composition) {
        const add = Math.ceil((c.qtyPerItem || 0) * Math.max(1, Number(item.quantity) || 1)) // Округляем вверх до целого числа
        returns[c.materialId] = (returns[c.materialId] || 0) + add
      }
    }

    await db.run('BEGIN')
    try {
      for (const mid of Object.keys(returns)) {
        const materialId = Number(mid)
        const addQty = Math.ceil(returns[materialId]) // Округляем вверх до целого числа
        if (addQty > 0) {
          await db.run(
            'UPDATE materials SET quantity = quantity + ? WHERE id = ?',
            addQty,
            materialId
          )
          await db.run(
            `INSERT INTO material_moves (
              material_id,
              type,
              quantity,
              delta,
              reason,
              order_id,
              user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            materialId,
            'order_delete_return',
            addQty,
            addQty,
            'order delete',
            id,
            userId ?? null
          )
        }
      }

      await db.run('DELETE FROM material_reservations WHERE order_id = ?', [id])

      // Удаляем заказ (позиции удалятся каскадно)
      await db.run('DELETE FROM orders WHERE id = ?', id)
      await db.run('COMMIT')
    } catch (e) {
      await db.run('ROLLBACK')
      throw e
    }
  }

  static async duplicateOrder(originalOrderId: number) {
    const db = await getDb()
    const originalOrder = await db.get<Order>('SELECT * FROM orders WHERE id = ?', originalOrderId)
    
    if (!originalOrder) {
      throw new Error('Заказ не найден')
    }

    // Создаём новый заказ
    const newOrderNumber = `${originalOrder.number}-COPY-${Date.now()}`
    const createdAt = getCurrentTimestamp()
    
    const newOrderResult = await db.run(
      'INSERT INTO orders (number, status, created_at, customerName, customerPhone, customerEmail, prepaymentAmount, prepaymentStatus) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      newOrderNumber,
      1, // Новый статус
      createdAt,
      originalOrder.customerName,
      originalOrder.customerPhone,
      originalOrder.customerEmail,
      null, // Сбрасываем предоплату
      null
    )

    const newOrderId = newOrderResult.lastID

    // Копируем позиции
    const originalItems = await db.all<any>('SELECT * FROM items WHERE orderId = ?', originalOrderId)
    for (const item of originalItems) {
      await db.run(
        'INSERT INTO items (orderId, type, params, price, quantity, printerId, sides, sheets, waste, clicks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        newOrderId,
        item.type,
        typeof item.params === 'string' ? item.params : JSON.stringify(item.params),
        item.price,
        item.quantity,
        item.printerId,
        item.sides,
        item.sheets,
        item.waste,
        item.clicks
      )
    }

    // Получаем созданный заказ с позициями
    const newOrder = await db.get<any>('SELECT * FROM orders WHERE id = ?', newOrderId)
    const newItems = await db.all<any>('SELECT * FROM items WHERE orderId = ?', newOrderId)
    
    if (newOrder) {
      newOrder.items = newItems.map((item: any) => ({
        ...item,
        params: typeof item.params === 'string' ? JSON.parse(item.params) : item.params
      }))
    }

    return newOrder
  }

  static async addOrderItem(orderId: number, itemData: any) {
    const db = await getDb()
    
    // Проверяем, что заказ существует
    const order = await db.get<any>('SELECT id, created_at, createdAt FROM orders WHERE id = ?', orderId)
    if (!order) {
      throw new Error('Заказ не найден')
    }

    // Подготавливаем данные для вставки
    const {
      name,
      description,
      quantity,
      price,
      total,
      specifications,
      materials,
      services,
      productionTime,
      productType,
      urgency,
      customerType,
      estimatedDelivery,
      sheetsNeeded,
      piecesPerSheet,
      formatInfo
    } = itemData

    // Создаем параметры для товара
    const params: Record<string, any> = {
      description,
      specifications,
      materials,
      services,
      productionTime,
      productType,
      urgency,
      customerType,
      estimatedDelivery,
      sheetsNeeded,
      piecesPerSheet,
      formatInfo
    }
    if (!params.readyDate) {
      const defaultReadyDate = this.buildDefaultReadyDate(order.created_at || order.createdAt)
      if (defaultReadyDate) {
        params.readyDate = defaultReadyDate
      }
    }

    // Вставляем товар в заказ
    const result = await db.run(
      `INSERT INTO items (orderId, type, params, price, quantity, printerId, sides, sheets, waste, clicks) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      orderId,
      name || 'Товар из калькулятора',
      JSON.stringify(params),
      price || 0,
      quantity || 1,
      null, // printerId
      1,    // sides
      1,    // sheets
      0,    // waste
      0     // clicks
    )

    // Возвращаем созданный товар
    const newItem = await db.get(
      'SELECT * FROM items WHERE id = ?',
      result.lastID
    )

    return {
      ...newItem,
      params: JSON.parse(newItem.params)
    }
  }

  // Новые методы для расширенного управления заказами

  static async searchOrders(userId: number, searchParams: {
    query?: string;
    status?: number;
    dateFrom?: string;
    dateTo?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    minAmount?: number;
    maxAmount?: number;
    hasPrepayment?: boolean;
    paymentMethod?: string;
    limit?: number;
    offset?: number;
  }) {
    const db = await getDb()
    
    let whereConditions = ['(o.userId = ? OR o.userId IS NULL)']
    let params: any[] = [userId]
    
    // Поиск по тексту
    if (searchParams.query) {
      whereConditions.push(`(
        o.number LIKE ? OR 
        o.customerName LIKE ? OR 
        o.customerPhone LIKE ? OR 
        o.customerEmail LIKE ? OR
        EXISTS (
          SELECT 1 FROM items i 
          WHERE i.orderId = o.id 
          AND (i.type LIKE ? OR i.params LIKE ?)
        )
      )`)
      const searchTerm = `%${searchParams.query}%`
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm)
    }
    
    // Фильтр по статусу
    if (searchParams.status !== undefined) {
      whereConditions.push('o.status = ?')
      params.push(searchParams.status)
    }
    
    // Фильтр по дате
    if (searchParams.dateFrom) {
      whereConditions.push('DATE(o.created_at) >= ?')
      params.push(searchParams.dateFrom)
    }
    if (searchParams.dateTo) {
      whereConditions.push('DATE(o.created_at) <= ?')
      params.push(searchParams.dateTo)
    }
    
    // Фильтр по клиенту
    if (searchParams.customerName) {
      whereConditions.push('o.customerName LIKE ?')
      params.push(`%${searchParams.customerName}%`)
    }
    if (searchParams.customerPhone) {
      whereConditions.push('o.customerPhone LIKE ?')
      params.push(`%${searchParams.customerPhone}%`)
    }
    if (searchParams.customerEmail) {
      whereConditions.push('o.customerEmail LIKE ?')
      params.push(`%${searchParams.customerEmail}%`)
    }
    
    // Фильтр по предоплате
    if (searchParams.hasPrepayment !== undefined) {
      if (searchParams.hasPrepayment) {
        whereConditions.push('o.prepaymentAmount > 0')
      } else {
        whereConditions.push('(o.prepaymentAmount IS NULL OR o.prepaymentAmount = 0)')
      }
    }
    
    // Фильтр по способу оплаты
    if (searchParams.paymentMethod) {
      whereConditions.push('o.paymentMethod = ?')
      params.push(searchParams.paymentMethod)
    }
    
    const whereClause = whereConditions.join(' AND ')
    
    // Подзапрос для расчета общей суммы заказа
    const totalAmountSubquery = `
      (SELECT COALESCE(SUM(i.price * i.quantity), 0) 
       FROM items i 
       WHERE i.orderId = o.id)
    `
    
    let query = `
      SELECT o.*, ${totalAmountSubquery} as totalAmount
      FROM orders o
      WHERE ${whereClause}
    `
    
    // Фильтр по сумме (применяем после расчета totalAmount)
    if (searchParams.minAmount !== undefined || searchParams.maxAmount !== undefined) {
      query = `
        SELECT * FROM (${query}) filtered_orders
        WHERE 1=1
      `
      if (searchParams.minAmount !== undefined) {
        query += ' AND totalAmount >= ?'
        params.push(searchParams.minAmount)
      }
      if (searchParams.maxAmount !== undefined) {
        query += ' AND totalAmount <= ?'
        params.push(searchParams.maxAmount)
      }
    }
    
    query += ' ORDER BY o.created_at DESC'
    
    // Пагинация
    if (searchParams.limit) {
      query += ' LIMIT ?'
      params.push(searchParams.limit)
    }
    if (searchParams.offset) {
      query += ' OFFSET ?'
      params.push(searchParams.offset)
    }
    
    const orders = await db.all(query, ...params)
    
    // Загружаем позиции для каждого заказа
    for (const order of orders) {
      const itemsRaw = await db.all<{
        id: number
        orderId: number
        type: string
        params: string
        price: number
        quantity: number
        printerId: number | null
        sides: number
        sheets: number
        waste: number
        clicks: number
      }>(
        'SELECT id, orderId, type, params, price, quantity, printerId, sides, sheets, waste, clicks FROM items WHERE orderId = ?',
        order.id
      )
      
      order.items = Array.isArray(itemsRaw) ? itemsRaw.map((ir: any) => {
        let params;
        try {
          params = JSON.parse(ir.params);
        } catch (error) {
          console.error(`Error parsing params for item ${ir.id}:`, error);
          params = { description: 'Ошибка данных' };
        }
        return {
          id: ir.id,
          orderId: ir.orderId,
          type: ir.type,
          params,
          price: ir.price,
          quantity: ir.quantity ?? 1,
          printerId: ir.printerId ?? undefined,
          sides: ir.sides,
          sheets: ir.sheets,
          waste: ir.waste,
          clicks: ir.clicks
        };
      }) : [];
    }
    
    return orders
  }

  static async getOrdersStats(userId: number, dateFrom?: string, dateTo?: string) {
    const db = await getDb()
    
    let whereConditions = ['(o.userId = ? OR o.userId IS NULL)']
    let params: any[] = [userId]
    
    if (dateFrom) {
      whereConditions.push('DATE(o.created_at) >= ?')
      params.push(dateFrom)
    }
    if (dateTo) {
      whereConditions.push('DATE(o.created_at) <= ?')
      params.push(dateTo)
    }
    
    const whereClause = whereConditions.join(' AND ')
    
    const stats = await db.get(`
      SELECT 
        COUNT(*) as totalOrders,
        COUNT(CASE WHEN o.status = 1 THEN 1 END) as newOrders,
        COUNT(CASE WHEN o.status = 2 THEN 1 END) as inProgressOrders,
        COUNT(CASE WHEN o.status = 3 THEN 1 END) as readyOrders,
        COUNT(CASE WHEN o.status = 4 THEN 1 END) as shippedOrders,
        COUNT(CASE WHEN o.status = 5 THEN 1 END) as completedOrders,
        COALESCE(SUM(
          (SELECT COALESCE(SUM(i.price * i.quantity), 0) 
           FROM items i WHERE i.orderId = o.id)
        ), 0) as totalRevenue,
        COALESCE(AVG(
          (SELECT COALESCE(SUM(i.price * i.quantity), 0) 
           FROM items i WHERE i.orderId = o.id)
        ), 0) as averageOrderValue,
        COUNT(CASE WHEN o.prepaymentAmount > 0 THEN 1 END) as ordersWithPrepayment,
        COALESCE(SUM(o.prepaymentAmount), 0) as totalPrepayment
      FROM orders o
      WHERE ${whereClause}
    `, ...params)
    
    return stats
  }

  static async bulkUpdateOrderStatus(orderIds: number[], newStatus: number, userId?: number) {
    const db = await getDb()
    
    if (orderIds.length === 0) {
      throw new Error('Не выбрано ни одного заказа')
    }
    
    const placeholders = orderIds.map(() => '?').join(',')
    const params = [newStatus, ...orderIds]
    
    await db.run(
      `UPDATE orders SET status = ? WHERE id IN (${placeholders})`,
      ...params
    )
    
    return { updatedCount: orderIds.length, newStatus }
  }

  static async bulkDeleteOrders(orderIds: number[], userId?: number) {
    const db = await getDb()
    
    if (orderIds.length === 0) {
      throw new Error('Не выбрано ни одного заказа')
    }
    
    let deletedCount = 0
    
    await db.run('BEGIN')
    try {
      for (const orderId of orderIds) {
        await OrderService.deleteOrder(orderId, userId)
        deletedCount++
      }
      await db.run('COMMIT')
    } catch (e) {
      await db.run('ROLLBACK')
      throw e
    }
    
    return { deletedCount }
  }

  static async exportOrders(userId: number, format: 'csv' | 'json' = 'csv', searchParams?: any) {
    const orders = searchParams 
      ? await OrderService.searchOrders(userId, { ...searchParams, limit: 10000 })
      : await OrderService.getAllOrders(userId)
    
    if (format === 'json') {
      return JSON.stringify(orders, null, 2)
    }
    
    // CSV формат
    const headers = [
      'ID', 'Номер', 'Статус', 'Дата создания', 'Клиент', 'Телефон', 'Email',
      'Предоплата', 'Способ оплаты', 'Количество позиций', 'Общая сумма'
    ]
    
    const rows = orders.map(order => [
      order.id,
      order.number,
      order.status,
      order.created_at,
      order.customerName || '',
      order.customerPhone || '',
      order.customerEmail || '',
      order.prepaymentAmount || 0,
      order.paymentMethod || '',
      order.items.length,
      order.items.reduce((sum: any, item: any) => sum + (item.price * item.quantity), 0)
    ])
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    
    return csvContent
  }
}
