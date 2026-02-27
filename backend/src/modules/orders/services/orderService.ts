import { getDb } from '../../../config/database'
import { getCurrentTimestamp, getTodayString } from '../../../utils/date'
import { hasColumn } from '../../../utils/tableSchemaCache'
import { getCachedData } from '../../../utils/dataCache'
import { Order } from '../../../models/Order'
import { UnifiedWarehouseService } from '../../warehouse/services/unifiedWarehouseService'
import { MaterialTransactionService } from '../../warehouse/services/materialTransactionService'
import { AutoMaterialDeductionService } from '../../warehouse/services/autoMaterialDeductionService'
import { OrderRepository } from '../../../repositories/orderRepository'
import { itemRowSelect, mapItemRowToItem } from '../../../models/mappers/itemMapper'
import { EarningsService } from '../../../services/earningsService'
import { mapPhotoOrderToOrder, mapPhotoOrderToVirtualItem } from '../../../models/mappers/telegramPhotoOrderMapper'

/** Коэффициенты типов цен для заказов с сайта (от базовой цены продукта). */
const WEBSITE_PRICE_TYPE_MULTIPLIERS: Record<string, number> = {
  urgent: 1.5,      // срочно: +50%
  online: 0.85,     // онлайн: -15%
  promo: 0.7,       // промо: -30%
  special: 0.55,    // спец.предложение: -45%
}

export class OrderService {
  private static normalizeReasonCode(reason: string): string {
    return String(reason || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_а-яё-]/g, '')
      .slice(0, 80);
  }

  private static async recordCancellationEvent(
    db: any,
    payload: {
      orderId?: number | null;
      orderNumber?: string | null;
      orderSource?: string | null;
      statusBefore?: number | null;
      eventType: 'delete' | 'soft_cancel' | 'status_cancel';
      reason: string;
      userId?: number;
    }
  ) {
    const exists = await db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='order_cancellation_events'"
    );
    if (!exists) return;
    const reasonText = String(payload.reason || '').trim();
    if (!reasonText) return;
    await db.run(
      `INSERT INTO order_cancellation_events
      (order_id, order_number, order_source, status_before, event_type, reason, reason_code, user_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        payload.orderId ?? null,
        payload.orderNumber ?? null,
        payload.orderSource ?? null,
        payload.statusBefore ?? null,
        payload.eventType,
        reasonText,
        this.normalizeReasonCode(reasonText),
        payload.userId ?? null
      ]
    );
  }

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
  private static async getAllStatuses(): Promise<Array<{ id: number; name: string }>> {
    return getCachedData<Array<{ id: number; name: string }>>(
      'order_statuses_all',
      async () => {
        const db = await getDb()
        const rows = await db.all<{ id: number; name: string }>(
          'SELECT id, name FROM order_statuses ORDER BY sort_order, id'
        )
        return Array.isArray(rows) ? rows : []
      },
      30 * 60 * 1000 // 30 минут (статусы меняются очень редко)
    )
  }

  private static async getStatusIdByName(db: any, name: string): Promise<number | null> {
    try {
      const statuses = await this.getAllStatuses()
      const status = statuses.find(s => s.name === name)
      return status?.id ?? null
    } catch {
      return null
    }
  }

  // DB row types (internal)
  // use shared mapper
  static async getAllOrders(userId: number) {
    const orders = await OrderRepository.listUserOrders(userId)
    let assignedOrders: Order[] = []
    try {
      assignedOrders = (await OrderRepository.listAssignedOrdersForUser(userId)) as Order[]
    } catch (e) {
      // user_order_page_orders / user_order_pages могут отсутствовать
    }
    const allOrders = [...orders, ...assignedOrders] as Order[]

    // Batch loading items/photo-orders для устранения N+1.
    const telegramIds = allOrders.filter((o) => o.paymentMethod === 'telegram').map((o) => o.id)
    const websiteIds = allOrders.filter((o) => o.paymentMethod !== 'telegram').map((o) => o.id)
    const [itemsByOrderId, photoOrdersById] = await Promise.all([
      OrderRepository.getItemsByOrderIds(websiteIds),
      OrderRepository.getPhotoOrdersByIds(telegramIds),
    ])
    for (const order of allOrders) {
      if (order.paymentMethod === 'telegram') {
        const photo = photoOrdersById.get(order.id)
        order.items = photo ? [mapPhotoOrderToVirtualItem(photo)] : []
      } else {
        order.items = itemsByOrderId.get(order.id) ?? []
      }
    }

    return allOrders
  }

  /** Заказы: владельческие + выданные этим юзером в дату (вкладка «Выданные заказы»). issued_by_me — флаг. */
  static async getOrdersIssuedOn(userId: number, dateYmd: string) {
    const orders = (await OrderRepository.listOrdersIssuedOnIncludingIssuedBy(userId, dateYmd)) as Order[]
    return OrderService.attachItemsToOrders(orders)
  }

  /** Все заказы, выданные в указанную дату (все пользователи видят все) */
  static async getOrdersIssuedOnAll(dateYmd: string) {
    const orders = (await OrderRepository.listAllOrdersIssuedOn(dateYmd)) as Order[]
    return OrderService.attachItemsToOrders(orders)
  }

  private static async attachItemsToOrders(orders: Order[]) {
    const telegramIds = orders.filter((o) => o.paymentMethod === 'telegram').map((o) => o.id)
    const websiteIds = orders.filter((o) => o.paymentMethod !== 'telegram').map((o) => o.id)
    const [itemsByOrderId, photoOrdersById] = await Promise.all([
      OrderRepository.getItemsByOrderIds(websiteIds),
      OrderRepository.getPhotoOrdersByIds(telegramIds),
    ])
    for (const order of orders) {
      if (order.paymentMethod === 'telegram') {
        const photo = photoOrdersById.get(order.id)
        order.items = photo ? [mapPhotoOrderToVirtualItem(photo)] : []
      } else {
        order.items = itemsByOrderId.get(order.id) ?? []
      }
    }
    return orders
  }

  /** Все заказы без фильтра по пользователю (для пула заказов). Batch loading — устранение N+1. */
  static async getAllOrdersForPool() {
    const orders = (await OrderRepository.listAllOrders()) as Order[]
    const telegramIds = orders.filter((o) => o.paymentMethod === 'telegram').map((o) => o.id)
    const websiteIds = orders.filter((o) => o.paymentMethod !== 'telegram').map((o) => o.id)
    const [itemsByOrderId, photoOrdersById] = await Promise.all([
      OrderRepository.getItemsByOrderIds(websiteIds),
      OrderRepository.getPhotoOrdersByIds(telegramIds),
    ])
    for (const order of orders) {
      if (order.paymentMethod === 'telegram') {
        const photo = photoOrdersById.get(order.id)
        order.items = photo ? [mapPhotoOrderToVirtualItem(photo)] : []
      } else {
        order.items = itemsByOrderId.get(order.id) ?? []
      }
    }
    return orders
  }

  static async createOrder(customerName?: string, customerPhone?: string, customerEmail?: string, prepaymentAmount?: number, userId?: number, date?: string, source?: 'website' | 'telegram' | 'crm', customerId?: number, paymentChannel?: 'cash' | 'invoice' | 'not_cashed') {
    const dateOnly = date ? String(date).trim().slice(0, 10) : null
    const isToday = dateOnly && dateOnly === getTodayString()
    const createdAt = dateOnly && !isToday ? `${dateOnly}T12:00:00.000Z` : getCurrentTimestamp()
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
        const statuses = await this.getAllStatuses()
        if (statuses.length > 0) {
          defaultStatusId = statuses[0].id
        }
      }
    } catch {}

    const initialPrepay = Number(prepaymentAmount || 0)
    let hasPrepaymentUpdatedAt = false
    let hasPaymentChannel = false
    try {
      hasPrepaymentUpdatedAt = await hasColumn('orders', 'prepaymentUpdatedAt')
      hasPaymentChannel = await hasColumn('orders', 'payment_channel')
    } catch {
      hasPrepaymentUpdatedAt = false
      hasPaymentChannel = false
    }
    const channel = paymentChannel && OrderService.ALLOWED_PAYMENT_CHANNELS.has(paymentChannel) ? paymentChannel : 'cash'
    const insertRes = hasPrepaymentUpdatedAt
      ? await db.run(
          `INSERT INTO orders (status, created_at, customerName, customerPhone, customerEmail, prepaymentAmount, prepaymentUpdatedAt, userId, source, customer_id${hasPaymentChannel ? ', payment_channel' : ''}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?${hasPaymentChannel ? ', ?' : ''})`,
          [
            defaultStatusId, createdAt, customerName || null, customerPhone || null, customerEmail || null,
            initialPrepay, initialPrepay > 0 ? createdAt : null, userId ?? null, source || 'crm', customerId || null,
            ...(hasPaymentChannel ? [channel] : [])
          ]
        )
      : await db.run(
          `INSERT INTO orders (status, created_at, customerName, customerPhone, customerEmail, prepaymentAmount, userId, source, customer_id${hasPaymentChannel ? ', payment_channel' : ''}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?${hasPaymentChannel ? ', ?' : ''})`,
          [
            defaultStatusId, createdAt, customerName || null, customerPhone || null, customerEmail || null,
            initialPrepay, userId ?? null, source || 'crm', customerId || null,
            ...(hasPaymentChannel ? [channel] : [])
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
        params: string | Record<string, unknown>;
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
          [order.id, item.type, JSON.stringify(paramsObj), item.price, item.quantity]
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
      source?: 'website' | 'telegram' | 'crm';
      items: Array<{
        type: string;
        params: string | Record<string, unknown>;
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
    const source = orderData.source || 'crm';

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
        source,
        orderData.customer_id
      );
      
      // 2. Добавляем товары в заказ
      const orderCreatedAt = (order as any).created_at || (order as any).createdAt
      const isWebsite = source === 'website'
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
        let finalPrice = Number(item.price) || 0
        const priceType = (item as any).priceType ?? (item as any).price_type ?? paramsObj.priceType ?? paramsObj.price_type
        if (isWebsite && priceType && typeof priceType === 'string') {
          const key = priceType.toLowerCase().trim()
          const mult = WEBSITE_PRICE_TYPE_MULTIPLIERS[key]
          if (mult != null) {
            finalPrice = Math.round(finalPrice * mult * 100) / 100
            paramsObj.priceType = key
          }
        }
        await db.run(
          'INSERT INTO items (orderId, type, params, price, quantity) VALUES (?, ?, ?, ?, ?)',
          [order.id, item.type, JSON.stringify(paramsObj), finalPrice, item.quantity]
        );
      }
      
      // 3. Автоматическое списание материалов (params уже объект при заказе с сайта, иначе строка JSON)
      const deductionResult = await AutoMaterialDeductionService.deductMaterialsForOrder(
        order.id,
        orderData.items.map(item => {
          const paramsObj = typeof item.params === 'string' ? (() => { try { return JSON.parse(item.params || '{}'); } catch { return {}; } })() : (item.params || {});
          return {
            type: item.type,
            params: paramsObj,
            quantity: item.quantity,
            components: item.components
          };
        }),
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

  /** Допустимые значения скидки: 0, 5, 10, 15, 20, 25 (%) */
  private static readonly ALLOWED_DISCOUNT_PERCENTS = new Set([0, 5, 10, 15, 20, 25]);

  /** Допустимые значения payment_channel */
  private static readonly ALLOWED_PAYMENT_CHANNELS = new Set(['cash', 'invoice', 'not_cashed']);

  /**
   * Обновить канал оплаты заказа (учёт в кассе).
   * cash — учитывается в кассе, invoice — счёт (не в кассе), not_cashed — не пробивался.
   */
  static async updateOrderPaymentChannel(id: number, paymentChannel: string): Promise<Order> {
    const db = await getDb();
    const ch = String(paymentChannel || 'cash').toLowerCase();
    if (!OrderService.ALLOWED_PAYMENT_CHANNELS.has(ch)) {
      throw new Error('payment_channel должен быть cash, invoice или not_cashed');
    }
    const order = await db.get<Order>('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) {
      throw new Error('Заказ не найден');
    }
    let hasPaymentChannel = false;
    try {
      hasPaymentChannel = await hasColumn('orders', 'payment_channel');
    } catch { /* ignore */ }
    if (!hasPaymentChannel) {
      throw new Error('Колонка payment_channel ещё не добавлена. Примените миграции.');
    }
    await db.run(
      'UPDATE orders SET payment_channel = ?, updated_at = datetime("now") WHERE id = ?',
      [ch, id]
    );
    const updated = await db.get<Order>('SELECT * FROM orders WHERE id = ?', [id]);
    return updated as Order;
  }

  /** Обновить примечания заказа */
  static async updateOrderNotes(id: number, notes: string | null): Promise<Order> {
    const db = await getDb();
    const order = await db.get<Order>('SELECT id FROM orders WHERE id = ?', [id]);
    if (!order) {
      throw new Error('Заказ не найден');
    }
    let hasNotes = false;
    try {
      hasNotes = await hasColumn('orders', 'notes');
    } catch {
      hasNotes = false;
    }
    if (!hasNotes) {
      throw new Error('Колонка notes ещё не добавлена. Примените миграции.');
    }
    await db.run(
      'UPDATE orders SET notes = ?, updated_at = datetime("now") WHERE id = ?',
      [notes ?? null, id]
    );
    const updated = await db.get<Order>('SELECT * FROM orders WHERE id = ?', [id]);
    return updated as Order;
  }

  /**
   * Обновить скидку на заказ (процент от итоговой суммы).
   * Если оплата offline и предоплата была «в синке» с итогом — пересчитываем предоплату под новый итог.
   */
  static async updateOrderDiscount(id: number, discountPercent: number): Promise<Order> {
    const db = await getDb()
    const order = await db.get<{ id: number; prepaymentAmount?: number | null; paymentMethod?: string | null; discount_percent?: number | null }>(
      'SELECT id, prepaymentAmount, paymentMethod, COALESCE(discount_percent, 0) as discount_percent FROM orders WHERE id = ?',
      [id]
    )
    if (!order) {
      throw new Error('Заказ не найден')
    }
    const p = Number(discountPercent)
    if (!Number.isFinite(p) || !OrderService.ALLOWED_DISCOUNT_PERCENTS.has(p)) {
      throw new Error('Скидка должна быть 0, 5, 10, 15, 20 или 25%')
    }
    const oldPct = Number(order.discount_percent || 0) / 100
    const newPct = p / 100
    const tot = await db.get<{ total_amount: number }>(
      'SELECT COALESCE(SUM(price * quantity), 0) as total_amount FROM items WHERE orderId = ?',
      [id]
    )
    const subtotal = Number(tot?.total_amount || 0)
    const oldTotal = Math.round(subtotal * (1 - oldPct) * 100) / 100
    const newTotal = Math.round(subtotal * (1 - newPct) * 100) / 100
    const prepaymentAmount = Number(order.prepaymentAmount || 0)
    const eps = 0.005
    const inSync = Math.abs(prepaymentAmount - oldTotal) < eps

    await db.run(
      'UPDATE orders SET discount_percent = ?, updated_at = datetime("now") WHERE id = ?',
      [p, id]
    )

    if (order.paymentMethod === 'offline' && inSync && newTotal >= 0) {
      let hasPrepaymentUpdatedAt = false
      try {
        hasPrepaymentUpdatedAt = await hasColumn('orders', 'prepaymentUpdatedAt')
      } catch {
        hasPrepaymentUpdatedAt = false
      }
      const updateSql = hasPrepaymentUpdatedAt
        ? 'UPDATE orders SET prepaymentAmount = ?, prepaymentUpdatedAt = datetime("now"), updated_at = datetime("now") WHERE id = ?'
        : 'UPDATE orders SET prepaymentAmount = ?, updated_at = datetime("now") WHERE id = ?'
      await db.run(updateSql, newTotal, id)
    }

    const updated = await db.get<Order>('SELECT * FROM orders WHERE id = ?', [id])
    return { ...(updated as any as Order), items: [] }
  }

  static async updateOrderStatus(id: number, status: number, userId?: number, cancelReason?: string) {
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
        if (Number(status) === 5) {
          const reasonText = String(cancelReason || '').trim();
          if (!reasonText) {
            throw new Error('Для отмены заказа необходимо указать причину')
          }
          const ord = await db.get<{ number?: string | null; source?: string | null; status?: number | null }>(
            'SELECT number, source, status FROM orders WHERE id = ?',
            [id]
          );
          await this.recordCancellationEvent(db, {
            orderId: id,
            orderNumber: ord?.number ?? null,
            orderSource: ord?.source ?? null,
            statusBefore: Number(ord?.status ?? 0),
            eventType: 'status_cancel',
            reason: reasonText,
            userId
          });
        }

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

  // Переназначение заказа по номеру (ORD-XXXX) или site-ord-<id>. Допускаются первый статус (0 или 1).
  static async reassignOrderByNumber(orderNumber: string, targetUserId: number) {
    const db = await getDb()
    const siteMatch = /^site-ord-(\d+)$/i.exec(orderNumber)
    let row: { id: number; status: number } | undefined
    if (siteMatch) {
      const orderId = parseInt(siteMatch[1], 10)
      row = await db.get<{ id: number; status: number }>('SELECT id, status FROM orders WHERE id = ? AND source = ?', [orderId, 'website'])
    }
    if (!row) {
      row = await db.get<{ id: number; status: number }>('SELECT id, status FROM orders WHERE number = ?', [orderNumber])
    }
    if (!row) {
      throw new Error('Заказ не найден')
    }
    const statusId = Number(row.status)
    if (statusId !== 0 && statusId !== 1) {
      throw new Error('Переназначение доступно только для заказов в статусе «ожидает» (0 или 1)')
    }
    await db.run('UPDATE orders SET userId = ?, updatedAt = datetime("now") WHERE id = ?', [targetUserId, row.id])
    return { id: row.id, userId: targetUserId }
  }

  static async deleteOrder(id: number, userId?: number, reason?: string) {
    // Собираем все позиции заказа и их состав
    const db = await getDb()
    const reasonText = String(reason || '').trim()
    if (!reasonText) {
      throw new Error('Для удаления/отмены заказа необходимо указать причину')
    }
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
    const hasLegacyPresetSchema = await hasColumn('product_materials', 'presetCategory')
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
      const ord = await db.get<{ source?: string; status?: number; created_date?: string; number?: string }>(
        'SELECT source, status, number, COALESCE(createdAt, created_at) as created_date FROM orders WHERE id = ?',
        [id]
      )

      // Если онлайн/телеграм — не удаляем, а переводим в пул: статус 0, снимаем привязку и ставим is_cancelled=1
      if (ord && (ord.source === 'website' || ord.source === 'telegram')) {
        await this.recordCancellationEvent(db, {
          orderId: id,
          orderNumber: ord?.number ?? null,
          orderSource: ord?.source ?? null,
          statusBefore: Number(ord?.status ?? 0),
          eventType: 'soft_cancel',
          reason: reasonText,
          userId
        })
        await db.run('UPDATE orders SET status = 0, userId = NULL, is_cancelled = 1, updatedAt = datetime("now") WHERE id = ?', [id])
        await db.run('DELETE FROM material_reservations WHERE order_id = ?', [id])
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

      await db.run('DELETE FROM material_reservations WHERE order_id = ?', [id])

      await this.recordCancellationEvent(db, {
        orderId: id,
        orderNumber: ord?.number ?? null,
        orderSource: ord?.source ?? null,
        statusBefore: Number(ord?.status ?? 0),
        eventType: 'delete',
        reason: reasonText,
        userId
      })

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
    const order = await db.get<any>('SELECT id, created_at, createdAt FROM orders WHERE id = ?', [orderId])
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
    department_id?: number;
    limit?: number;
    offset?: number;
  }) {
    const orders = await OrderRepository.searchOrders(userId, searchParams)
    const orderIds = (orders as Order[]).map((o) => o.id)
    const itemsByOrderId = await OrderRepository.getItemsByOrderIds(orderIds)
    for (const order of orders as Order[]) {
      order.items = itemsByOrderId.get(order.id) ?? []
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

  static async bulkDeleteOrders(orderIds: number[], userId?: number, reason?: string) {
    const db = await getDb()
    
    if (orderIds.length === 0) {
      throw new Error('Не выбрано ни одного заказа')
    }
    
    let deletedCount = 0
    
    await db.run('BEGIN')
    try {
      for (const orderId of orderIds) {
        await OrderService.deleteOrder(orderId, userId, reason)
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
