import { getDb } from '../../../config/database'
import { getCurrentTimestamp } from '../../../utils/date'
import { Order } from '../../../models/Order'
import { UnifiedWarehouseService } from '../../warehouse/services/unifiedWarehouseService'
import { MaterialTransactionService } from '../../warehouse/services/materialTransactionService'
import { AutoMaterialDeductionService } from '../../warehouse/services/autoMaterialDeductionService'
import { OrderRepository } from '../../../repositories/orderRepository'
import { itemRowSelect, mapItemRowToItem } from '../../../models/mappers/itemMapper'
import { EarningsService } from '../../../services/earningsService'
import { mapPhotoOrderToOrder, mapPhotoOrderToVirtualItem } from '../../../models/mappers/telegramPhotoOrderMapper'

export class OrderService {
  private static async getStatusIdByName(db: any, name: string): Promise<number | null> {
    try {
      const row = (await db.get(
        'SELECT id FROM order_statuses WHERE name = ? LIMIT 1',
        [name]
      )) as { id?: number } | undefined
      return row?.id != null ? Number(row.id) : null
    } catch {
      return null
    }
  }

  // DB row types (internal)
  // use shared mapper
  static async getAllOrders(userId: number) {
    const db = await getDb()
    const orders = await OrderRepository.listUserOrders(userId)
    const assignedOrders = await OrderRepository.listAssignedOrdersForUser(userId)
    
    // Объединяем заказы
    const allOrders = [...orders, ...assignedOrders] as Order[]
    
    for (const order of allOrders) {
      // Проверяем, является ли это Telegram заказом
      const isTelegramOrder = order.paymentMethod === 'telegram';
      
      if (isTelegramOrder) {
        const telegramOrder = await OrderRepository.getPhotoOrderById(order.id)
        order.items = telegramOrder ? [mapPhotoOrderToVirtualItem(telegramOrder)] : []
      } else {
        // Для обычных заказов загружаем items из таблицы items
        order.items = await OrderRepository.getItemsByOrderId(order.id)
      }
    }
    
    return allOrders
  }

  static async createOrder(customerName?: string, customerPhone?: string, customerEmail?: string, prepaymentAmount?: number, userId?: number, date?: string, source?: 'website' | 'telegram' | 'crm', customerId?: number) {
    const createdAt = date ? `${date}T12:00:00.000Z` : getCurrentTimestamp()
    const db = await getDb()

    // Default status should reference existing order_statuses.id (FK)
    // Use the first status by sort_order, fallback to 1.
    let defaultStatusId = 1
    try {
      // Предпочитаем "Ожидает" (каноничный первый статус). Для обратной совместимости пробуем и старое "Новый".
      const waitingId = await this.getStatusIdByName(db, 'Ожидает')
      const legacyNewId = await this.getStatusIdByName(db, 'Новый')
      if (waitingId != null) {
        defaultStatusId = waitingId
      } else if (legacyNewId != null) {
        defaultStatusId = legacyNewId
      } else {
      const statusRow = await db.get<{ id: number }>('SELECT id FROM order_statuses ORDER BY sort_order ASC, id ASC LIMIT 1')
      if (statusRow?.id) defaultStatusId = Number(statusRow.id)
      }
    } catch {}

    const insertRes = await db.run(
      'INSERT INTO orders (status, created_at, customerName, customerPhone, customerEmail, prepaymentAmount, userId, source, customer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        defaultStatusId, // FK -> order_statuses.id (обычно "Новый")
        createdAt,
        customerName || null,
        customerPhone || null,
        customerEmail || null,
        Number(prepaymentAmount || 0),
        userId ?? null,
        source || 'crm',
        customerId || null
      ]
    )
    const id = (insertRes as any).lastID!
    const number = `ORD-${String(id).padStart(4, '0')}`
    await db.run('UPDATE orders SET number = ? WHERE id = ?', [number, id])

    const raw = await db.get<Order>(
      'SELECT * FROM orders WHERE id = ?',
      [id]
    )
    const order: Order = { ...(raw as any as Order), items: [] }
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
      customer_id?: number;
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
        orderData.userId,
        undefined,
        'crm',
        orderData.customer_id
      );
      
      // 2. Добавляем товары в заказ
      for (const item of orderData.items) {
        await db.run(
          'INSERT INTO items (orderId, type, params, price, quantity) VALUES (?, ?, ?, ?, ?)',
          [order.id, item.type, item.params, item.price, item.quantity]
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
      customer_id?: number;
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
        orderData.userId,
        undefined,
        'crm',
        orderData.customer_id
      );
      
      // 2. Добавляем товары в заказ
      for (const item of orderData.items) {
        await db.run(
          'INSERT INTO items (orderId, type, params, price, quantity) VALUES (?, ?, ?, ?, ?)',
          [order.id, item.type, item.params, item.price, item.quantity]
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

  /**
   * Обновить customer_id заказа
   */
  static async updateOrderCustomer(id: number, customerId: number | null): Promise<Order> {
    const db = await getDb()
    
    // Проверяем существование заказа
    const order = await db.get('SELECT id FROM orders WHERE id = ?', [id])
    if (!order) {
      throw new Error('Заказ не найден')
    }

    // Если указан customer_id, проверяем его существование
    if (customerId !== null) {
      const customer = await db.get('SELECT id FROM customers WHERE id = ?', [customerId])
      if (!customer) {
        throw new Error('Клиент не найден')
      }
    }

    await db.run(
      'UPDATE orders SET customer_id = ?, updated_at = datetime("now") WHERE id = ?',
      [customerId, id]
    )

    const updated = await db.get<Order>('SELECT * FROM orders WHERE id = ?', [id])
    return { ...(updated as any as Order), items: [] }
  }

  static async updateOrderStatus(id: number, status: number) {
    const db = await getDb()
    
    // Сначала проверяем, есть ли заказ в таблице photo_orders (Telegram заказы)
    let telegramOrder: any = null
    try {
      telegramOrder = await db.get('SELECT id FROM photo_orders WHERE id = ?', [id])
    } catch {
      // photo_orders может отсутствовать на некоторых инстансах/БД — считаем, что телеграм-заказа нет
      telegramOrder = null
    }
    
    if (telegramOrder) {
      await db.run('UPDATE photo_orders SET status = ?, updated_at = datetime("now") WHERE id = ?', [status, id])
      const updatedTelegramOrder = await OrderRepository.getPhotoOrderById(id)
      const updated: Order = updatedTelegramOrder ? mapPhotoOrderToOrder(updatedTelegramOrder) : { id, number: `tg-ord-${id}`, status, created_at: new Date().toISOString(), items: [] }
      return updated
    } else {
      // Проверяем, есть ли заказ в таблице orders
      const orderInOrders = await db.get('SELECT id FROM orders WHERE id = ?', [id])
      
      if (orderInOrders) {
        // Обновляем обычный заказ
        try {
          await db.run('UPDATE orders SET status = ?, updatedAt = datetime(\"now\") WHERE id = ?', [status, id])
        } catch {
          // На некоторых схемах есть только updated_at
          await db.run('UPDATE orders SET status = ?, updated_at = datetime(\"now\") WHERE id = ?', [status, id])
        }

        // Если статус "Принят в работу", подтверждаем резервы по заказу
        const inWorkId = await this.getStatusIdByName(db, 'Принят в работу')
        if (inWorkId != null && Number(status) === Number(inWorkId)) {
          const reservations = await UnifiedWarehouseService.getReservationsByOrder(id)
          const reservationIds = reservations
            .filter(r => r.status === 'reserved')
            .map(r => r.id)
          if (reservationIds.length > 0) {
            await UnifiedWarehouseService.confirmReservations(reservationIds)
          }
        }
        
        const raw = await db.get<Order>(
          'SELECT * FROM orders WHERE id = ?',
          [id]
        )
        const updated: Order = { ...(raw as Order), items: [] }
        return updated
      } else {
        throw new Error(`Заказ с ID ${id} не найден`)
      }
    }
  }

  // Переназначение заказа на другого пользователя по номеру (только при статусе 0 "ожидает")
  static async reassignOrderByNumber(orderNumber: string, targetUserId: number) {
    const db = await getDb()
    const row = await db.get<{ id: number; status: number }>('SELECT id, status FROM orders WHERE number = ?', [orderNumber])
    if (!row) {
      throw new Error('Заказ не найден')
    }
    if (Number(row.status) !== 0) {
      throw new Error('Переназначение доступно только для заказов в статусе "ожидает" (0)')
    }
    await db.run('UPDATE orders SET userId = ?, updatedAt = datetime("now") WHERE id = ?', [targetUserId, row.id])
    return { id: row.id, userId: targetUserId }
  }

  static async deleteOrder(id: number, userId?: number) {
    // Собираем все позиции заказа и их состав
    const db = await getDb()
    const items = (await db.all<{
      id: number
      type: string
      params: string
      quantity: number
    }>(
      'SELECT id, type, params, quantity FROM items WHERE orderId = ?',
      [id]
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
          [item.type, paramsObj.description || '']
        )) as unknown as Array<{ materialId: number; qtyPerItem: number }>
      }
      for (const c of composition) {
        const add = Math.ceil((c.qtyPerItem || 0) * Math.max(1, Number(item.quantity) || 1)) // Округляем вверх до целого числа
        returns[c.materialId] = (returns[c.materialId] || 0) + add
      }
    }

    await db.run('BEGIN')
    try {
      // Узнаем источник заказа (для онлайн/телеграм делаем мягкую отмену)
      const ord = await db.get<{ source?: string; status?: number; created_date?: string }>(
        'SELECT source, status, COALESCE(createdAt, created_at) as created_date FROM orders WHERE id = ?',
        [id]
      )

      // Если онлайн/телеграм — не удаляем, а переводим в пул: статус 0, снимаем привязку и ставим is_cancelled=1
      if (ord && (ord.source === 'website' || ord.source === 'telegram')) {
        await db.run('UPDATE orders SET status = 0, userId = NULL, is_cancelled = 1, updatedAt = datetime("now") WHERE id = ?', [id])
        await db.run('COMMIT')
        if (ord?.created_date) {
          const date = String(ord.created_date).slice(0, 10)
          await EarningsService.recalculateForDate(date)
        }
        return { softCancelled: true }
      }

      for (const mid of Object.keys(returns)) {
        const materialId = Number(mid)
        const addQty = Math.ceil(returns[materialId])
        if (addQty > 0) {
          await MaterialTransactionService.return({
            materialId,
            quantity: addQty,
            reason: 'order delete',
            orderId: id,
            userId
          })
        }
      }

      // Удаляем заказ (позиции удалятся каскадно)
      await db.run('DELETE FROM orders WHERE id = ?', [id])
      await db.run('COMMIT')
      if (ord?.created_date) {
        const date = String(ord.created_date).slice(0, 10)
        await EarningsService.recalculateForDate(date)
      }
    } catch (e) {
      await db.run('ROLLBACK')
      throw e
    }
  }

  static async duplicateOrder(originalOrderId: number) {
    const db = await getDb()
    const originalOrder = await db.get<Order>('SELECT * FROM orders WHERE id = ?', [originalOrderId])
    
    if (!originalOrder) {
      throw new Error('Заказ не найден')
    }

    // Создаём новый заказ
    const newOrderNumber = `${originalOrder.number}-COPY-${Date.now()}`
    const createdAt = getCurrentTimestamp()
    
    const newOrderResult = await db.run(
      'INSERT INTO orders (number, status, created_at, customerName, customerPhone, customerEmail, prepaymentAmount, prepaymentStatus, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [newOrderNumber, 1, createdAt, originalOrder.customerName, originalOrder.customerPhone, originalOrder.customerEmail, null, null, (originalOrder as any).source || 'crm']
    )

    const newOrderId = (newOrderResult as any).lastID

    // Копируем позиции
    const originalItems = await db.all<any>('SELECT * FROM items WHERE orderId = ?', [originalOrderId])
    for (const item of originalItems) {
      await db.run(
        'INSERT INTO items (orderId, type, params, price, quantity, printerId, sides, sheets, waste, clicks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [newOrderId, item.type, typeof item.params === 'string' ? item.params : JSON.stringify(item.params), item.price, item.quantity, item.printerId, item.sides, item.sheets, item.waste, item.clicks]
      )
    }

    // Получаем созданный заказ с позициями
    const newOrder = await db.get<any>('SELECT * FROM orders WHERE id = ?', [newOrderId])
    const newItems = await db.all<any>('SELECT * FROM items WHERE orderId = ?', [newOrderId])
    
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
    const order = await db.get('SELECT id FROM orders WHERE id = ?', [orderId])
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
    const params = {
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

    // Вставляем товар в заказ
    const result = await db.run(
      `INSERT INTO items (orderId, type, params, price, quantity, printerId, sides, sheets, waste, clicks) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orderId, name || 'Товар из калькулятора', JSON.stringify(params), price || 0, quantity || 1, null, 1, 1, 0, 0]
    )

    // Возвращаем созданный товар
    const newItem = await db.get(
      'SELECT * FROM items WHERE id = ?',
      (result as any).lastID
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
    const orders = await OrderRepository.searchOrders(userId, searchParams)
    for (const order of orders as Order[]) {
      order.items = await OrderRepository.getItemsByOrderId(order.id)
    }
    return orders
  }

  static async getOrdersStats(userId: number, dateFrom?: string, dateTo?: string) {
    return OrderRepository.getOrdersStats(userId, dateFrom, dateTo)
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
    
    const rows = orders.map((order: Order) => [
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
      .map((row: Array<string | number>) => row.map((field: string | number) => `"${String(field).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    
    return csvContent
  }
}
