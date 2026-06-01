import { buildOrderNumberFromSourceAndId } from '../../../utils/orderNumberGenerator'
import { getDb } from '../../../config/database'
import { getCurrentTimestamp, getTodayString } from '../../../utils/date'
import { hasColumn, invalidateTableSchemaCache } from '../../../utils/tableSchemaCache'
import { getCachedData } from '../../../utils/dataCache'
import { Order } from '../../../models/Order'
import { UnifiedWarehouseService } from '../../warehouse/services/unifiedWarehouseService'
import { MaterialTransactionService } from '../../warehouse/services/materialTransactionService'
import { AutoMaterialDeductionService } from '../../warehouse/services/autoMaterialDeductionService'
import { OrderRepository } from '../../../repositories/orderRepository'
import { itemRowSelect, mapItemRowToItem } from '../../../models/mappers/itemMapper'
import { EarningsService } from '../../../services/earningsService'
import {
  mapPhotoOrderToOrder,
  mapPhotoOrderToVirtualItem,
  photoOrderRowToPoolOrder,
} from '../../../models/mappers/telegramPhotoOrderMapper'
import { tryEnqueueOrderStatusEmail } from '../../../services/orderStatusEmailService'
import { tryScheduleOrderStatusSms } from '../../../services/orderStatusSmsService'
import { tryNotifyTelegramOrderStatusForMiniappOrder } from '../../../services/miniappOrderStatusTelegramService'
import { trySyncWebsiteOrderStatusFromCrm } from '../../../services/websiteOrderStatusSyncService'
import { logger } from '../../../utils/logger'
import { MINIAPP_CHECKOUT_STATE_FINALIZED, type MiniappCheckoutState } from '../../../utils/miniappCheckoutState'
import {
  parseWebsiteOrderDeliveryJson,
  serializeWebsiteOrderDelivery,
  type WebsiteOrderDelivery,
} from '../../../types/websiteOrderDelivery'

export class OrderService {
  /** Старые инстансы без миграции — добавляем колонку при первом обращении. */
  private static async ensureOrdersIsCancelledColumn(): Promise<void> {
    if (await hasColumn('orders', 'is_cancelled')) return
    const db = await getDb()
    await db.exec(`ALTER TABLE orders ADD COLUMN is_cancelled INTEGER NOT NULL DEFAULT 0`)
    invalidateTableSchemaCache('orders')
  }

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

  private static async recordOrderActivity(
    db: any,
    payload: {
      orderId: number;
      eventType: string;
      message?: string | null;
      oldValue?: string | null;
      newValue?: string | null;
      comment?: string | null;
      userId?: number | null;
      meta?: Record<string, unknown> | null;
    }
  ) {
    const exists = await db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='order_activity_events'"
    );
    if (!exists) return;
    const metaJson = payload.meta ? JSON.stringify(payload.meta) : null;
    await db.run(
      `INSERT INTO order_activity_events
      (order_id, event_type, message, old_value, new_value, comment, user_id, meta_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        payload.orderId,
        payload.eventType,
        payload.message ?? null,
        payload.oldValue ?? null,
        payload.newValue ?? null,
        payload.comment ?? null,
        payload.userId ?? null,
        metaJson,
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

  private static async isCancellationStatusId(db: any, statusId: number): Promise<boolean> {
    if (!Number.isFinite(statusId)) return false
    try {
      const status = await db.get(
        'SELECT name FROM order_statuses WHERE id = ?',
        [statusId]
      ) as { name?: string } | undefined
      const name = String(status?.name || '').trim().toLowerCase()
      return name.includes('отмен') || name.includes('cancel')
    } catch {
      return false
    }
  }

  private static async getOrCreateCancelledStatusId(db: any): Promise<number> {
    try {
      const statuses = await db.all(
        'SELECT id, name FROM order_statuses ORDER BY sort_order, id'
      ) as Array<{ id: number; name: string }>
      const existing = (Array.isArray(statuses) ? statuses : []).find((status) => {
        const name = String(status.name || '').trim().toLowerCase()
        return name === 'отменён' || name === 'отменен' || name.includes('отмен') || name.includes('cancel')
      })
      if (existing?.id != null) return Number(existing.id)

      const nextSort = await db.get(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 as sort_order FROM order_statuses'
      ) as { sort_order: number } | undefined
      await db.run(
        'INSERT OR IGNORE INTO order_statuses (name, color, sort_order) VALUES (?, ?, ?)',
        'Отменён',
        '#d32f2f',
        Number(nextSort?.sort_order ?? 99)
      )
      const created = await db.get(
        'SELECT id FROM order_statuses WHERE name = ?',
        'Отменён'
      ) as { id: number } | undefined
      if (created?.id != null) return Number(created.id)
    } catch {
      // Старые/частичные схемы без order_statuses продолжат использовать legacy status=0.
    }
    return 0
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
  static async getAllOrdersForPool(options: { activeOnly?: boolean } = {}) {
    const fromOrders = (await OrderRepository.listAllOrders(
      options.activeOnly ? { statuses: [0, 1] } : undefined
    )) as Order[]
    const orderIds = new Set(fromOrders.map((o) => o.id))
    const photoRows = await OrderRepository.listPhotoOrdersForPool()
    const fromPhoto: Order[] = []
    for (const row of photoRows) {
      if (orderIds.has(row.id)) {
        continue
      }
      fromPhoto.push(photoOrderRowToPoolOrder(row))
    }
    const orders = [...fromPhoto, ...fromOrders].sort((a, b) => {
      const ta = new Date(a.created_at).getTime()
      const tb = new Date(b.created_at).getTime()
      return tb - ta
    })
    const telegramIds = orders.filter((o) => o.paymentMethod === 'telegram').map((o) => o.id)
    const websiteIds = orders.filter((o) => o.paymentMethod !== 'telegram').map((o) => o.id)
    const [itemsByOrderId, photoOrdersById] = await Promise.all([
      OrderRepository.getItemsByOrderIds(websiteIds),
      OrderRepository.getPhotoOrdersByIds(telegramIds),
    ])
    for (const order of orders) {
      if (order.paymentMethod === 'telegram') {
        const photo = photoOrdersById.get(order.id)
        order.items = photo ? [mapPhotoOrderToVirtualItem(photo)] : order.items ?? []
      } else {
        order.items = itemsByOrderId.get(order.id) ?? []
      }
    }
    return orders
  }

  static async createOrder(customerName?: string, customerPhone?: string, customerEmail?: string, prepaymentAmount?: number, userId?: number, date?: string, source?: 'website' | 'telegram' | 'crm' | 'mini_app', customerId?: number, paymentChannel?: 'cash' | 'invoice' | 'not_cashed' | 'internal') {
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
    let hasIsInternal = false
    let hasContactUserId = false
    let hasResponsibleUserId = false
    invalidateTableSchemaCache('orders')
    try {
      hasPrepaymentUpdatedAt = await hasColumn('orders', 'prepaymentUpdatedAt')
      hasPaymentChannel = await hasColumn('orders', 'payment_channel')
      hasIsInternal = await hasColumn('orders', 'is_internal')
      hasContactUserId = await hasColumn('orders', 'contact_user_id')
      hasResponsibleUserId = await hasColumn('orders', 'responsible_user_id')
    } catch {
      hasPrepaymentUpdatedAt = false
      hasPaymentChannel = false
      hasIsInternal = false
      hasContactUserId = false
      hasResponsibleUserId = false
    }
    const creatorId = userId ?? null
    const channelRaw = paymentChannel && OrderService.ALLOWED_PAYMENT_CHANNELS.has(paymentChannel) ? paymentChannel : 'cash'
    const isInternal = channelRaw === 'internal'
    const channel = isInternal ? 'not_cashed' : channelRaw

    /** Пары (колонка, значение) — один источник правды, без рассинхрона N колонок / N-1 значений. */
    const insertFields: Array<[string, unknown]> = [
      ['status', defaultStatusId],
      ['created_at', createdAt],
      ['customerName', customerName || null],
      ['customerPhone', customerPhone || null],
      ['customerEmail', customerEmail || null],
      ['prepaymentAmount', initialPrepay],
    ]
    if (hasPrepaymentUpdatedAt) {
      insertFields.push(['prepaymentUpdatedAt', initialPrepay > 0 ? createdAt : null])
    }
    insertFields.push(
      ['userId', creatorId],
      ['source', source || 'crm'],
      ['customer_id', customerId || null]
    )
    if (hasPaymentChannel) insertFields.push(['payment_channel', channel])
    if (hasIsInternal) insertFields.push(['is_internal', isInternal ? 1 : 0])
    if (hasContactUserId) insertFields.push(['contact_user_id', creatorId])
    if (hasResponsibleUserId) insertFields.push(['responsible_user_id', creatorId])

    const orderCols = insertFields.map(([col]) => col)
    const orderValues = insertFields.map(([, v]) => v)
    const placeholders = orderCols.map(() => '?').join(', ')
    let insertRes
    try {
      insertRes = await db.run(
        `INSERT INTO orders (${orderCols.join(', ')}) VALUES (${placeholders})`,
        orderValues
      )
    } catch (error) {
      logger.error('orders insert failed', {
        message: error instanceof Error ? error.message : String(error),
        orderCols,
        orderColsCount: orderCols.length,
        orderValuesCount: orderValues.length,
        source: source || 'crm',
      })
      throw error
    }
    const id = (insertRes as any).lastID!
    const number = buildOrderNumberFromSourceAndId(source || 'crm', id)
    await db.run('UPDATE orders SET number = ? WHERE id = ?', [number, id])

    const raw = await db.get<any>('SELECT * FROM orders WHERE id = ?', [id])
    const order: Order = { ...(raw as any), items: [] }
    return OrderService.orderForApi(order) as Order
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

  private static async applyMiniappOrderMetadata(
    db: any,
    payload: {
      orderId: number;
      telegramChatId?: string;
      miniappCheckoutState?: MiniappCheckoutState;
      miniappDesignHelpRequested?: boolean;
    }
  ) {
    if (payload.telegramChatId) {
      try {
        const hasTg = await hasColumn('orders', 'telegram_chat_id');
        if (hasTg) {
          await db.run('UPDATE orders SET telegram_chat_id = ? WHERE id = ?', [
            payload.telegramChatId,
            payload.orderId,
          ]);
        }
      } catch {
        // ignore
      }
    }
    try {
      const hasCheckoutState = await hasColumn('orders', 'miniapp_checkout_state');
      if (hasCheckoutState) {
        await db.run('UPDATE orders SET miniapp_checkout_state = ? WHERE id = ?', [
          payload.miniappCheckoutState || MINIAPP_CHECKOUT_STATE_FINALIZED,
          payload.orderId,
        ]);
      }
    } catch {
      // ignore
    }
    try {
      const hasDesignHelp = await hasColumn('orders', 'miniapp_design_help_requested');
      if (hasDesignHelp) {
        await db.run('UPDATE orders SET miniapp_design_help_requested = ? WHERE id = ?', [
          payload.miniappDesignHelpRequested ? 1 : 0,
          payload.orderId,
        ]);
      }
    } catch {
      // ignore
    }
  }

  private static async insertItemsForOrder(
    db: any,
    payload: {
      orderId: number;
      source: 'website' | 'telegram' | 'crm' | 'mini_app';
      orderCreatedAt?: string | null;
      items: Array<{
        type: string;
        params: string | Record<string, unknown>;
        price: number;
        quantity: number;
        totalCost?: number;
        components?: Array<{ materialId: number; qtyPerItem: number }>;
      }>;
    }
  ) {
    const isWebsiteLike = payload.source === 'website' || payload.source === 'mini_app';
    for (const item of payload.items) {
      let paramsObj: Record<string, any> = {};
      try {
        paramsObj = typeof item.params === 'string' ? JSON.parse(item.params) : (item.params || {});
      } catch {
        paramsObj = {};
      }
      if (!paramsObj.readyDate) {
        const defaultReadyDate = this.buildDefaultReadyDate(payload.orderCreatedAt || undefined);
        if (defaultReadyDate) {
          paramsObj.readyDate = defaultReadyDate;
        }
      }
      if (Array.isArray(item.components) && item.components.length > 0) {
        paramsObj._miniappComponents = item.components.map((component) => ({
          materialId: Number(component.materialId),
          qtyPerItem: Number(component.qtyPerItem),
        }));
      }
      const qty = Math.max(1, Number(item.quantity) || 1);
      const effectiveTotal =
        item.totalCost != null && Number.isFinite(Number(item.totalCost))
          ? Math.round(Number(item.totalCost) * 100) / 100
          : (typeof paramsObj.storedTotalCost === 'number' && Number.isFinite(paramsObj.storedTotalCost)
              ? Math.round(Number(paramsObj.storedTotalCost) * 100) / 100
              : null);
      let finalPrice = effectiveTotal != null ? effectiveTotal / qty : (Number(item.price) || 0);
      const priceType =
        (item as { priceType?: unknown; price_type?: unknown }).priceType ??
        (item as { priceType?: unknown; price_type?: unknown }).price_type ??
        paramsObj.priceType ??
        paramsObj.price_type;
      if (effectiveTotal != null) {
        paramsObj.storedTotalCost = effectiveTotal;
      }
      if (priceType && typeof priceType === 'string') {
        paramsObj.priceType = priceType.toLowerCase().trim();
      }
      await db.run(
        'INSERT INTO items (orderId, type, params, price, quantity) VALUES (?, ?, ?, ?, ?)',
        [payload.orderId, item.type, JSON.stringify(paramsObj), finalPrice, qty]
      );
    }
  }

  static async persistOrderDelivery(orderId: number, delivery: WebsiteOrderDelivery | null): Promise<void> {
    const db = await getDb()
    let hasCol = false
    try {
      hasCol = await hasColumn('orders', 'delivery_json')
    } catch {
      hasCol = false
    }
    if (!hasCol) {
      throw new Error('Колонка delivery_json ещё не добавлена. Примените миграции.')
    }
    const serialized = delivery ? serializeWebsiteOrderDelivery(delivery) : null
    await db.run(
      'UPDATE orders SET delivery_json = ?, updated_at = datetime("now") WHERE id = ?',
      [serialized, orderId],
    )
  }

  static readOrderDeliveryFromRow(row: { delivery_json?: string | null }): WebsiteOrderDelivery | null {
    return parseWebsiteOrderDeliveryJson(row.delivery_json ?? null)
  }

  private static async createOrderWithItemsTx(
    db: any,
    orderData: {
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      prepaymentAmount?: number;
      userId?: number;
      customer_id?: number;
      source?: 'website' | 'telegram' | 'crm' | 'mini_app';
      telegramChatId?: string;
      miniappCheckoutState?: MiniappCheckoutState;
      miniappDesignHelpRequested?: boolean;
      delivery?: WebsiteOrderDelivery | null;
      items: Array<{
        type: string;
        params: string | Record<string, unknown>;
        price: number;
        quantity: number;
        components?: Array<{ materialId: number; qtyPerItem: number }>;
      }>;
    }
  ) {
    const source = orderData.source || 'crm';
    const createdOrder = await this.createOrder(
      orderData.customerName,
      orderData.customerPhone,
      orderData.customerEmail,
      orderData.prepaymentAmount,
      orderData.userId,
      undefined,
      source,
      orderData.customer_id
    );
    await this.applyMiniappOrderMetadata(db, {
      orderId: createdOrder.id,
      telegramChatId: orderData.telegramChatId,
      miniappCheckoutState: orderData.miniappCheckoutState,
      miniappDesignHelpRequested: orderData.miniappDesignHelpRequested,
    });
    if (orderData.delivery) {
      await this.persistOrderDelivery(createdOrder.id, orderData.delivery)
    }
    const orderCreatedAt = (createdOrder as any).created_at || (createdOrder as any).createdAt;
    await this.insertItemsForOrder(db, {
      orderId: createdOrder.id,
      source,
      orderCreatedAt,
      items: orderData.items,
    });
    const itemIdRows = (await db.all(
      'SELECT id FROM items WHERE orderId = ? ORDER BY id ASC',
      [createdOrder.id]
    )) as Array<{ id: number }>;
    const itemIds = (Array.isArray(itemIdRows) ? itemIdRows : []).map((r) => Number(r.id));
    const rawOrder = await db.get('SELECT * FROM orders WHERE id = ?', [createdOrder.id]);
    const delivery = OrderService.readOrderDeliveryFromRow(rawOrder as { delivery_json?: string })
    return {
      order: OrderService.orderForApi({
        ...(rawOrder as any),
        items: [],
        delivery: delivery ?? undefined,
      }) as Order,
      itemIds,
    };
  }

  static async createOrderWithItems(
    orderData: {
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      prepaymentAmount?: number;
      userId?: number;
      customer_id?: number;
      source?: 'website' | 'telegram' | 'crm' | 'mini_app';
      telegramChatId?: string;
      miniappCheckoutState?: MiniappCheckoutState;
      miniappDesignHelpRequested?: boolean;
      delivery?: WebsiteOrderDelivery | null;
      items: Array<{
        type: string;
        params: string | Record<string, unknown>;
        price: number;
        quantity: number;
        components?: Array<{ materialId: number; qtyPerItem: number }>;
      }>;
    }
  ) {
    const db = await getDb();
    try {
      await db.run('BEGIN');
      const result = await this.createOrderWithItemsTx(db, orderData);
      await db.run('COMMIT');
      return result;
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    }
  }

  static async deductMaterialsForExistingOrder(orderId: number, userId?: number) {
    const db = await getDb();
    const rows = (await db.all(
      'SELECT type, params, quantity FROM items WHERE orderId = ? ORDER BY id ASC',
      [orderId]
    )) as Array<{ type: string; params: string | null; quantity: number }>;
    const deductionItems = (Array.isArray(rows) ? rows : []).map((row) => {
      let paramsObj: Record<string, any> = {};
      try {
        paramsObj = row.params ? JSON.parse(String(row.params)) : {};
      } catch {
        paramsObj = {};
      }
      const storedComponents = Array.isArray(paramsObj._miniappComponents)
        ? paramsObj._miniappComponents
        : [];
      return {
        type: row.type,
        params: paramsObj,
        quantity: Number(row.quantity) || 0,
        components: storedComponents
          .map((component: Record<string, unknown>) => ({
            materialId: Number(component.materialId),
            qtyPerItem: Number(component.qtyPerItem),
          }))
          .filter((component: { materialId: number; qtyPerItem: number }) =>
            Number.isFinite(component.materialId) &&
            component.materialId > 0 &&
            Number.isFinite(component.qtyPerItem)
          ),
      };
    });
    return AutoMaterialDeductionService.deductMaterialsForOrder(orderId, deductionItems, userId);
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
      source?: 'website' | 'telegram' | 'crm' | 'mini_app';
      /** Для фильтра заказов Mini App (Telegram user id = chat_id в личке) */
      telegramChatId?: string;
      delivery?: WebsiteOrderDelivery | null;
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

    try {
      await db.run('BEGIN');
      const { order, itemIds } = await this.createOrderWithItemsTx(db, orderData);
      const deductionResult = await this.deductMaterialsForExistingOrder(order.id, orderData.userId);
      if (!deductionResult.success) {
        const err = new Error(
          `Ошибка автоматического списания: ${deductionResult.errors.join(', ')}`
        );
        (err as { code?: string }).code = 'ORDER_AUTO_DEDUCTION_FAILED';
        throw err;
      }
      await db.run('COMMIT');
      const { OrderPricingService } = await import('./orderPricingService');
      try {
        await OrderPricingService.recalculateOrderPrices(order.id);
      } catch (recalcErr) {
        logger.warn('[createOrderWithAutoDeduction] пересчёт цен по группам не выполнен', {
          orderId: order.id,
          error: (recalcErr as Error).message,
        });
      }
      return {
        order,
        deductionResult,
        itemIds,
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

    const updated = await db.get<any>('SELECT * FROM orders WHERE id = ?', [id])
    return OrderService.orderForApi({ ...(updated as any), items: [] }) as Order
  }

  /** Допустимые значения скидки: 0, 5, 10, 15, 20, 25 (%) */
  private static readonly ALLOWED_DISCOUNT_PERCENTS = new Set([0, 5, 10, 15, 20, 25]);

  /** Допустимые значения payment_channel (internal хранится в is_internal) */
  private static readonly ALLOWED_PAYMENT_CHANNELS = new Set(['cash', 'invoice', 'not_cashed', 'internal']);

  /** Строка orders → объект для JSON API. */
  static toApiOrder(row: Record<string, unknown> & { items?: unknown[] }): Order {
    return OrderService.orderForApi(row as { delivery_json?: string | null; items?: unknown[] }) as Order
  }

  /** payment_channel='internal' когда is_internal=1; delivery_json → delivery (для API) */
  private static orderForApi<T extends {
    is_internal?: number
    payment_channel?: string
    delivery_json?: string | null
    delivery?: WebsiteOrderDelivery
  }>(o: T | null | undefined): T | null | undefined {
    if (!o) return o
    const withChannel = (o.is_internal ? { ...o, payment_channel: 'internal' } : { ...o }) as T & {
      delivery_json?: string | null
    }
    const delivery = withChannel.delivery ?? OrderService.readOrderDeliveryFromRow(withChannel)
    if (!delivery) {
      return withChannel as T
    }
    const { delivery_json: _dj, ...rest } = withChannel
    return { ...rest, delivery } as T
  }

  /**
   * Обновить канал оплаты заказа (учёт в кассе).
   * internal — хранится в is_internal=1, payment_channel='not_cashed' (CHECK не поддерживает internal).
   */
  static async updateOrderPaymentChannel(id: number, paymentChannel: string): Promise<Order> {
    const db = await getDb();
    const ch = String(paymentChannel || 'cash').toLowerCase();
    if (!OrderService.ALLOWED_PAYMENT_CHANNELS.has(ch)) {
      throw new Error('payment_channel должен быть cash, invoice, not_cashed или internal');
    }
    const order = await db.get<Order>('SELECT * FROM orders WHERE id = ?', [id]);
    if (!order) {
      throw new Error('Заказ не найден');
    }
    let hasPaymentChannel = false;
    let hasIsInternal = false;
    try {
      hasPaymentChannel = await hasColumn('orders', 'payment_channel');
      hasIsInternal = await hasColumn('orders', 'is_internal');
    } catch { /* ignore */ }
    if (!hasPaymentChannel) {
      throw new Error('Колонка payment_channel ещё не добавлена. Примените миграции.');
    }
    const isInternal = ch === 'internal';
    const storedChannel = isInternal ? 'not_cashed' : ch;
    if (hasIsInternal) {
      await db.run(
        'UPDATE orders SET payment_channel = ?, is_internal = ?, updated_at = datetime("now") WHERE id = ?',
        [storedChannel, isInternal ? 1 : 0, id]
      );
    } else {
      await db.run(
        'UPDATE orders SET payment_channel = ?, updated_at = datetime("now") WHERE id = ?',
        [storedChannel, id]
      );
    }
    const updated = await db.get<any>('SELECT * FROM orders WHERE id = ?', [id]);
    return OrderService.orderForApi(updated) as Order;
  }

  /**
   * Переносит дату оформления заказа на «сейчас» (момент назначения ответственного).
   * Заказ с сайта от 01.06, взятый в работу 02.06, попадает в отчёты и списки за 02.06.
   * @returns предыдний календарный день created_at (YYYY-MM-DD) для пересчёта начислений
   */
  static async shiftOrderToAssignmentDay(orderId: number): Promise<string | null> {
    const db = await getDb()
    const preRow = await db.get<{ d: string }>(
      `SELECT date(COALESCE(createdAt, created_at)) as d FROM orders WHERE id = ?`,
      [orderId],
    )
    const preDay = preRow?.d ? String(preRow.d).slice(0, 10) : null
    const currentDate = getCurrentTimestamp()

    let hasCreatedAt = false
    let hasCreatedAtSnake = false
    let hasUpdatedAt = false
    let hasUpdatedAtSnake = false
    let hasPrepaymentUpdatedAt = false
    try {
      hasCreatedAt = await hasColumn('orders', 'createdAt')
      hasCreatedAtSnake = await hasColumn('orders', 'created_at')
      hasUpdatedAt = await hasColumn('orders', 'updatedAt')
      hasUpdatedAtSnake = await hasColumn('orders', 'updated_at')
      hasPrepaymentUpdatedAt = await hasColumn('orders', 'prepaymentUpdatedAt')
    } catch { /* ignore */ }

    const dateUpdates: string[] = []
    const dateParams: unknown[] = []
    if (hasCreatedAt) {
      dateUpdates.push('createdAt = ?')
      dateParams.push(currentDate)
    }
    if (hasCreatedAtSnake) {
      dateUpdates.push('created_at = ?')
      dateParams.push(currentDate)
    }
    if (hasUpdatedAt) dateUpdates.push('updatedAt = datetime("now")')
    if (hasUpdatedAtSnake) dateUpdates.push('updated_at = datetime("now")')
    if (dateUpdates.length > 0) {
      await db.run(`UPDATE orders SET ${dateUpdates.join(', ')} WHERE id = ?`, ...dateParams, orderId)
    }

    if (hasPrepaymentUpdatedAt) {
      if (hasUpdatedAt) {
        await db.run(
          'UPDATE orders SET prepaymentUpdatedAt = ?, updatedAt = datetime("now") WHERE id = ?',
          currentDate,
          orderId,
        )
      } else if (hasUpdatedAtSnake) {
        await db.run(
          'UPDATE orders SET prepaymentUpdatedAt = ?, updated_at = datetime("now") WHERE id = ?',
          currentDate,
          orderId,
        )
      } else {
        await db.run('UPDATE orders SET prepaymentUpdatedAt = ? WHERE id = ?', currentDate, orderId)
      }
    }

    return preDay
  }

  /** Обновить контактёра и/или ответственного заказа */
  static async updateOrderAssignees(id: number, contact_user_id?: number | null, responsible_user_id?: number | null, actorUserId?: number): Promise<Order> {
    const db = await getDb();
    const existing = await db.get<any>(
      'SELECT id, userId, contact_user_id, responsible_user_id FROM orders WHERE id = ?',
      [id],
    );
    if (!existing) {
      throw new Error('Заказ не найден');
    }
    const updates: string[] = [];
    const values: (number | null)[] = [];
    let hasContact = false;
    let hasResponsible = false;
    try {
      hasContact = await hasColumn('orders', 'contact_user_id');
      hasResponsible = await hasColumn('orders', 'responsible_user_id');
    } catch { /* ignore */ }
    if (hasContact && contact_user_id !== undefined) {
      updates.push('contact_user_id = ?');
      values.push(contact_user_id ?? null);
    }
    let responsibleAssignmentDayBefore: string | null = null
    if (responsible_user_id !== undefined) {
      if (hasResponsible) {
        updates.push('responsible_user_id = ?');
        values.push(responsible_user_id ?? null);
      }
      updates.push('userId = ?');
      values.push(responsible_user_id ?? null);
      if (responsible_user_id != null) {
        responsibleAssignmentDayBefore = await OrderService.shiftOrderToAssignmentDay(id);
      }
    }
    if (updates.length === 0) {
      return OrderService.orderForApi(await db.get<any>('SELECT * FROM orders WHERE id = ?', [id])) as Order;
    }
    values.push(id);
    await db.run(
      `UPDATE orders SET ${updates.join(', ')}, updated_at = datetime("now") WHERE id = ?`,
      values
    );
    if (hasContact && contact_user_id !== undefined && Number(existing.contact_user_id ?? 0) !== Number(contact_user_id ?? 0)) {
      await this.recordOrderActivity(db, {
        orderId: id,
        eventType: 'contact_user_changed',
        message: 'Изменён контактёр заказа',
        oldValue: existing.contact_user_id != null ? String(existing.contact_user_id) : null,
        newValue: contact_user_id != null ? String(contact_user_id) : null,
        userId: actorUserId ?? null,
      });
    }
    if (responsible_user_id !== undefined) {
      const prevEffective = existing.responsible_user_id ?? existing.userId
      const nextEffective = responsible_user_id
      if (Number(prevEffective ?? 0) !== Number(nextEffective ?? 0)) {
        await this.recordOrderActivity(db, {
          orderId: id,
          eventType: 'reassign',
          message: nextEffective == null
            ? 'Ответственный снят'
            : prevEffective == null
              ? 'Заказ взяли в работу'
              : 'Заказ переназначен',
          oldValue: prevEffective != null ? String(prevEffective) : null,
          newValue: nextEffective != null ? String(nextEffective) : null,
          userId: actorUserId ?? null,
          meta: {
            previous_user_id: prevEffective != null ? Number(prevEffective) : null,
            target_user_id: nextEffective != null ? Number(nextEffective) : null,
            action: nextEffective == null ? 'unassign' : prevEffective == null ? 'take' : 'reassign',
          },
        });
      }
    }
    const outAssignees = OrderService.orderForApi(await db.get<any>('SELECT * FROM orders WHERE id = ?', [id])) as Order;
    void EarningsService.recalculateEarningsForOrderDays({
      orderId: id,
      orderCreatedDateBeforeUpdate: responsibleAssignmentDayBefore ?? undefined,
    }).catch((e) => {
      logger.error('Earnings recalc after assignees failed', { orderId: id, message: (e as Error)?.message });
    });
    return outAssignees;
  }

  /** Обновить примечания заказа */
  static async updateOrderNotes(id: number, notes: string | null, actorUserId?: number): Promise<Order> {
    const db = await getDb();
    const existing = await db.get<any>('SELECT id, notes FROM orders WHERE id = ?', [id]);
    const order = existing as Order | undefined;
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
    const oldNotes = typeof existing.notes === 'string' ? existing.notes : '';
    const newNotes = typeof notes === 'string' ? notes : '';
    if (oldNotes !== newNotes) {
      await this.recordOrderActivity(db, {
        orderId: id,
        eventType: 'notes_updated',
        message: 'Обновлены примечания',
        oldValue: oldNotes.slice(0, 280) || null,
        newValue: newNotes.slice(0, 280) || null,
        userId: actorUserId ?? null,
      });
    }
    const updated = await db.get<any>('SELECT * FROM orders WHERE id = ?', [id]);
    return OrderService.orderForApi(updated) as Order;
  }

  static async getOrderActivity(orderId: number) {
    const db = await getDb();
    const order = await db.get<any>(
      `SELECT id, number, source, userId, notes, COALESCE(createdAt, created_at) as created_at
       FROM orders WHERE id = ?`,
      [orderId]
    );
    if (!order) {
      throw new Error('Заказ не найден');
    }

    const events: Array<{
      id: string;
      order_id: number;
      event_type: string;
      message: string;
      old_value?: string | null;
      new_value?: string | null;
      comment?: string | null;
      user_id?: number | null;
      user_name?: string | null;
      created_at: string;
      meta?: Record<string, unknown> | null;
    }> = [];

    events.push({
      id: `created-${order.id}`,
      order_id: order.id,
      event_type: 'created',
      message: `Заказ создан (${order.source || 'crm'})`,
      old_value: null,
      new_value: null,
      comment: null,
      user_id: order.userId ?? null,
      user_name: null,
      created_at: String(order.created_at || new Date().toISOString()),
      meta: { source: order.source ?? 'crm' },
    });

    const hasActivity = !!(await db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='order_activity_events'"
    ));
    if (hasActivity) {
      const activityRows = await db.all<any>(
        `SELECT a.id, a.order_id, a.event_type, a.message, a.old_value, a.new_value, a.comment, a.user_id, a.meta_json, a.created_at,
                COALESCE(u.name, u.email, 'Система') as user_name
         FROM order_activity_events a
         LEFT JOIN users u ON u.id = a.user_id
         WHERE a.order_id = ?
         ORDER BY a.created_at DESC, a.id DESC`,
        [orderId]
      );
      for (const row of activityRows as any[]) {
        let meta: Record<string, unknown> | null = null;
        if (row.meta_json) {
          try {
            meta = JSON.parse(row.meta_json);
          } catch {
            meta = null;
          }
        }
        events.push({
          id: `activity-${row.id}`,
          order_id: Number(row.order_id),
          event_type: String(row.event_type || 'activity'),
          message: String(row.message || 'Изменение заказа'),
          old_value: row.old_value ?? null,
          new_value: row.new_value ?? null,
          comment: row.comment ?? null,
          user_id: row.user_id ?? null,
          user_name: row.user_name ?? null,
          created_at: String(row.created_at || ''),
          meta,
        });
      }
    }

    const hasCancellation = !!(await db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='order_cancellation_events'"
    ));
    if (hasCancellation) {
      const cancellationRows = await db.all<any>(
        `SELECT e.id, e.order_id, e.event_type, e.reason, e.status_before, e.user_id, e.created_at,
                COALESCE(u.name, u.email, 'Система') as user_name
         FROM order_cancellation_events e
         LEFT JOIN users u ON u.id = e.user_id
         WHERE e.order_id = ?
         ORDER BY e.created_at DESC, e.id DESC`,
        [orderId]
      );
      for (const row of cancellationRows as any[]) {
        const eventType = row.event_type === 'delete' ? 'deleted' : 'cancelled';
        const message = row.event_type === 'delete' ? 'Заказ удалён' : 'Заказ отменён и перемещён в пул';
        events.push({
          id: `cancel-${row.id}`,
          order_id: Number(row.order_id),
          event_type: eventType,
          message,
          old_value: row.status_before != null ? String(row.status_before) : null,
          new_value: row.event_type === 'delete' ? 'deleted' : 'status=0',
          comment: row.reason ?? null,
          user_id: row.user_id ?? null,
          user_name: row.user_name ?? null,
          created_at: String(row.created_at || ''),
          meta: { event_type: row.event_type },
        });
      }
    }

    events.sort((a, b) => {
      const at = new Date(a.created_at).getTime();
      const bt = new Date(b.created_at).getTime();
      return bt - at;
    });

    return {
      order_id: order.id,
      notes: typeof order.notes === 'string' ? order.notes : '',
      events,
    };
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
        ? 'UPDATE orders SET prepaymentAmount = ?, prepaymentUpdatedAt = datetime(\'now\',\'localtime\'), updated_at = datetime(\'now\',\'localtime\') WHERE id = ?'
        : 'UPDATE orders SET prepaymentAmount = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?'
      await db.run(updateSql, newTotal, id)
    }

    const updated = await db.get<any>('SELECT * FROM orders WHERE id = ?', [id])
    return OrderService.orderForApi({ ...(updated as any), items: [] }) as Order
  }

  static async updateOrderStatus(id: number, status: number, userId?: number, cancelReason?: string) {
    const db = await getDb()
    const targetStatus = Number(status)
    if (!Number.isFinite(targetStatus)) {
      throw new Error('Некорректный статус заказа')
    }
    if (await this.isCancellationStatusId(db, targetStatus)) {
      throw new Error('Статус отмены назначается только через отмену заказа')
    }
    
    // Сначала проверяем, есть ли заказ в таблице photo_orders (Telegram заказы)
    let telegramOrder: any = null
    try {
      telegramOrder = await db.get('SELECT id FROM photo_orders WHERE id = ?', [id])
    } catch {
      // photo_orders может отсутствовать на некоторых инстансах/БД — считаем, что телеграм-заказа нет
      telegramOrder = null
    }
    
    if (telegramOrder) {
      await db.run('UPDATE photo_orders SET status = ?, updated_at = datetime("now") WHERE id = ?', [targetStatus, id])
      const updatedTelegramOrder = await OrderRepository.getPhotoOrderById(id)
      const updated: Order = updatedTelegramOrder ? mapPhotoOrderToOrder(updatedTelegramOrder) : { id, number: `tg-ord-${id}`, status: targetStatus, created_at: new Date().toISOString(), items: [] }
      return updated
    } else {
      // Проверяем, есть ли заказ в таблице orders
      const orderInOrders = await db.get('SELECT id FROM orders WHERE id = ?', [id])
      
      if (orderInOrders) {
        const prevRow = await db.get<{ status: number; source?: Order['source'] | null }>(
          'SELECT status, source FROM orders WHERE id = ?',
          [id]
        );
        const oldStatusId = Number(prevRow?.status ?? 0);
        // Статус 5 в order_statuses = «Передан в ПВЗ», не отмена. Запись в order_cancellation_events
        // только при deleteOrder (handleDeleteOrder). Отмена через статус не используется.
        // Обновляем обычный заказ
        try {
          await db.run('UPDATE orders SET status = ?, updatedAt = datetime(\"now\") WHERE id = ?', [targetStatus, id])
        } catch {
          // На некоторых схемах есть только updated_at
          await db.run('UPDATE orders SET status = ?, updated_at = datetime(\"now\") WHERE id = ?', [targetStatus, id])
        }

        // Если статус "Принят в работу", подтверждаем резервы по заказу
        const inWorkId = await this.getStatusIdByName(db, 'Принят в работу')
        if (inWorkId != null && targetStatus === Number(inWorkId)) {
          const reservations = await UnifiedWarehouseService.getReservationsByOrder(id)
          const reservationIds = reservations
            .filter(r => r.status === 'reserved')
            .map(r => r.id)
          if (reservationIds.length > 0) {
            await UnifiedWarehouseService.confirmReservations(reservationIds)
          }
        }

        const newStatusId = targetStatus;
        void tryEnqueueOrderStatusEmail({
          orderId: id,
          oldStatusId,
          newStatusId,
          source: prevRow?.source ?? 'crm',
        });
        void tryScheduleOrderStatusSms({ orderId: id, newStatusId });
        void tryNotifyTelegramOrderStatusForMiniappOrder({
          orderId: id,
          oldStatusId,
          newStatusId: targetStatus,
        });
        void trySyncWebsiteOrderStatusFromCrm(db, id);

        const raw = await db.get<any>('SELECT * FROM orders WHERE id = ?', [id])
        const updated: Order = { ...(raw as Order), items: [] }
        return OrderService.orderForApi(updated) as Order
      } else {
        throw new Error(`Заказ с ID ${id} не найден`)
      }
    }
  }

  // Возврат заказа в пул без отмены: снимаем ответственного, но не ставим is_cancelled.
  static async unassignOrderByNumber(orderNumber: string, actorUserId?: number) {
    const db = await getDb()
    const trimmed = String(orderNumber || '').trim()
    const siteMatch = /^site-ord-(\d+)$/i.exec(trimmed)
    let row: { id: number; status: number; userId?: number | null; is_cancelled?: number } | undefined
    const hasIsCancelled = await hasColumn('orders', 'is_cancelled').catch(() => false)
    const isCancelledSelect = hasIsCancelled ? ', is_cancelled' : ''
    if (siteMatch) {
      const orderId = parseInt(siteMatch[1], 10)
      row = await db.get<{ id: number; status: number; userId?: number | null; is_cancelled?: number }>(
        `SELECT id, status, userId${isCancelledSelect} FROM orders WHERE id = ? AND source = ?`,
        [orderId, 'website']
      )
    }
    if (!row) {
      row = await db.get<{ id: number; status: number; userId?: number | null; is_cancelled?: number }>(
        `SELECT id, status, userId${isCancelledSelect} FROM orders WHERE number = ?`,
        [trimmed]
      )
    }
    if (!row) {
      throw new Error('Заказ не найден')
    }

    const statusId = Number(row.status)
    if (statusId !== 0 && statusId !== 1) {
      throw new Error('Вернуть в пул можно только заказ в статусе «ожидает» (0 или 1)')
    }

    const previousUserId = row.userId != null && Number.isFinite(Number(row.userId)) ? Number(row.userId) : null
    const hasResponsible = await hasColumn('orders', 'responsible_user_id').catch(() => false)
    const hasUpdatedAt = await hasColumn('orders', 'updatedAt').catch(() => false)
    const hasUpdatedAtSnake = await hasColumn('orders', 'updated_at').catch(() => false)
    const updates = ['userId = NULL']
    if (hasResponsible) updates.push('responsible_user_id = NULL')
    if (hasIsCancelled) updates.push('is_cancelled = 0')
    if (hasUpdatedAt) updates.push('updatedAt = datetime("now")')
    else if (hasUpdatedAtSnake) updates.push('updated_at = datetime("now")')

    await db.run(`UPDATE orders SET ${updates.join(', ')} WHERE id = ?`, [row.id])
    try {
      await db.run(
        `DELETE FROM user_order_page_orders
         WHERE order_id = ? AND order_type IN ('website', 'manual', 'crm') AND status != 'completed'`,
        [row.id]
      )
    } catch {
      // Таблицы страниц заказов может не быть в старых схемах.
    }

    await this.recordOrderActivity(db, {
      orderId: row.id,
      eventType: 'reassign',
      message: 'Заказ возвращён в пул',
      oldValue: previousUserId != null ? String(previousUserId) : null,
      newValue: null,
      userId: actorUserId ?? null,
      meta: {
        previous_user_id: previousUserId,
        target_user_id: null,
        action: 'unassign',
      },
    })

    return { id: row.id, userId: null }
  }

  // Переназначение по номеру: ORD-*, MAP-*, site-ord-*, тг tg-ord-* (photo_orders) — одна и та же логика userId.
  static async reassignOrderByNumber(orderNumber: string, targetUserId: number, actorUserId?: number) {
    const db = await getDb()
    const trimmed = String(orderNumber || '').trim()
    const siteMatch = /^site-ord-(\d+)$/i.exec(trimmed)
    let row: { id: number; status: number; userId?: number | null } | undefined
    if (siteMatch) {
      const orderId = parseInt(siteMatch[1], 10)
      row = await db.get<{ id: number; status: number; userId?: number | null }>('SELECT id, status, userId FROM orders WHERE id = ? AND source = ?', [orderId, 'website'])
    }
    if (!row) {
      row = await db.get<{ id: number; status: number; userId?: number | null }>('SELECT id, status, userId FROM orders WHERE number = ?', [trimmed])
    }
    if (!row) {
      const tgMatch = /^tg-ord-(\d+)$/i.exec(trimmed)
      if (tgMatch) {
        const photoId = parseInt(tgMatch[1], 10)
        const hasUid = await hasColumn('photo_orders', 'userId')
        if (!hasUid) {
          throw new Error('Нужна миграция: колонка photo_orders.userId (перезапустите backend после деплоя)')
        }
        const po = await db.get<{ id: number; status: string | null; userId: number | null }>(
          'SELECT id, status, userId FROM photo_orders WHERE id = ?',
          [photoId]
        )
        if (!po) {
          throw new Error('Заказ не найден')
        }
        const st = String(po.status || '').toLowerCase()
        if (st === 'completed' || st === 'rejected') {
          throw new Error('Переназначение недоступно для завершённого заказа')
        }
        const previousUserId = po.userId != null && Number.isFinite(Number(po.userId)) ? Number(po.userId) : null
        await db.run('UPDATE photo_orders SET userId = ?, updated_at = datetime("now") WHERE id = ?', [targetUserId, photoId])
        await this.recordOrderActivity(db, {
          orderId: photoId,
          eventType: 'reassign',
          message: previousUserId == null ? 'Заказ взяли в работу' : 'Заказ переназначен',
          oldValue: previousUserId != null ? String(previousUserId) : null,
          newValue: String(targetUserId),
          userId: actorUserId ?? null,
          meta: {
            previous_user_id: previousUserId,
            target_user_id: targetUserId,
            action: previousUserId == null ? 'take' : 'reassign',
            orderKind: 'photo_telegram',
          },
        })
        return { id: photoId, userId: targetUserId }
      }
    }
    if (!row) {
      throw new Error('Заказ не найден')
    }
    const statusId = Number(row.status)
    if (statusId !== 0 && statusId !== 1) {
      throw new Error('Переназначение доступно только для заказов в статусе «ожидает» (0 или 1)')
    }
    const previousUserId = row.userId != null && Number.isFinite(Number(row.userId)) ? Number(row.userId) : null
    let hasUpdatedAt = false
    let hasUpdatedAtSnake = false
    try {
      hasUpdatedAt = await hasColumn('orders', 'updatedAt')
      hasUpdatedAtSnake = await hasColumn('orders', 'updated_at')
    } catch { /* ignore */ }
    if (hasUpdatedAt) {
      await db.run('UPDATE orders SET userId = ?, updatedAt = datetime("now") WHERE id = ?', [targetUserId, row.id])
    } else if (hasUpdatedAtSnake) {
      await db.run('UPDATE orders SET userId = ?, updated_at = datetime("now") WHERE id = ?', [targetUserId, row.id])
    } else {
      await db.run('UPDATE orders SET userId = ? WHERE id = ?', [targetUserId, row.id])
    }
    await this.recordOrderActivity(db, {
      orderId: row.id,
      eventType: 'reassign',
      message: previousUserId == null ? 'Заказ взяли в работу' : 'Заказ переназначен',
      oldValue: previousUserId != null ? String(previousUserId) : null,
      newValue: String(targetUserId),
      userId: actorUserId ?? null,
      meta: {
        previous_user_id: previousUserId,
        target_user_id: targetUserId,
        action: previousUserId == null ? 'take' : 'reassign',
      }
    })
    return { id: row.id, userId: targetUserId }
  }

  /**
   * Мягкая отмена: запись остаётся в БД (is_cancelled=1), заказ уходит из активного пула.
   * Для CRM/сайта/TG/mini-app — одна и та же логика. Без физического DELETE.
   */
  static async softCancelOrder(id: number, userId?: number, reason?: string): Promise<{ softCancelled: true; status: number }> {
    const reasonText = String(reason || '').trim()
    if (!reasonText) {
      throw new Error('Для отмены заказа необходимо указать причину')
    }
    await this.ensureOrdersIsCancelledColumn()
    const db = await getDb()
    const hasIsCancelled = await hasColumn('orders', 'is_cancelled')
    const ord = await db.get<{
      source?: string
      status?: number
      created_date?: string
      number?: string
      userId?: number | null
      is_cancelled?: number
    }>(
      hasIsCancelled
        ? 'SELECT source, status, number, userId, is_cancelled, COALESCE(createdAt, created_at) as created_date FROM orders WHERE id = ?'
        : 'SELECT source, status, number, userId, COALESCE(createdAt, created_at) as created_date FROM orders WHERE id = ?',
      [id]
    )
    if (!ord) {
      throw new Error('Заказ не найден')
    }
    if (hasIsCancelled && Number(ord.is_cancelled) === 1) {
      return { softCancelled: true, status: Number(ord.status ?? 0) }
    }
    const cancelledStatusId = await this.getOrCreateCancelledStatusId(db)

    await db.run('BEGIN')
    try {
      await this.recordCancellationEvent(db, {
        orderId: id,
        orderNumber: ord?.number ?? null,
        orderSource: ord?.source ?? null,
        statusBefore: Number(ord?.status ?? 0),
        eventType: 'soft_cancel',
        reason: reasonText,
        userId
      })
      if (hasIsCancelled) {
        try {
          await db.run(
            'UPDATE orders SET status = ?, userId = NULL, is_cancelled = 1, updatedAt = datetime("now") WHERE id = ?',
            [cancelledStatusId, id]
          )
        } catch {
          try {
            await db.run(
              'UPDATE orders SET status = ?, userId = NULL, is_cancelled = 1, updated_at = datetime("now") WHERE id = ?',
              [cancelledStatusId, id]
            )
          } catch {
            await db.run('UPDATE orders SET status = ?, userId = NULL, is_cancelled = 1 WHERE id = ?', [cancelledStatusId, id])
          }
        }
      } else {
        try {
          await db.run('UPDATE orders SET status = ?, userId = NULL, updatedAt = datetime("now") WHERE id = ?', [cancelledStatusId, id])
        } catch {
          try {
            await db.run('UPDATE orders SET status = ?, userId = NULL, updated_at = datetime("now") WHERE id = ?', [cancelledStatusId, id])
          } catch {
            await db.run('UPDATE orders SET status = ?, userId = NULL WHERE id = ?', [cancelledStatusId, id])
          }
        }
      }
      try {
        await db.run(
          `DELETE FROM user_order_page_orders
           WHERE order_id = ? AND order_type IN ('website', 'manual', 'crm') AND status != 'completed'`,
          [id]
        )
      } catch {
        // Таблицы страниц заказов может не быть в старых схемах.
      }
      await db.run('DELETE FROM material_reservations WHERE order_id = ?', [id])
      await db.run('COMMIT')
      if (ord?.created_date) {
        const date = String(ord.created_date).slice(0, 10)
        await EarningsService.recalculateForDate(date)
      }
      void trySyncWebsiteOrderStatusFromCrm(db, id)
      return { softCancelled: true, status: cancelledStatusId }
    } catch (e) {
      await db.run('ROLLBACK')
      throw e
    }
  }

  /**
   * Физическое удаление строки заказа. Только для отменённых (is_cancelled=1), только по решению админа.
   */
  static async permanentDeleteOrder(id: number, userId?: number, reason?: string): Promise<void> {
    const reasonText = String(reason || '').trim()
    if (!reasonText) {
      throw new Error('Для удаления заказа из базы необходимо указать причину')
    }
    await this.ensureOrdersIsCancelledColumn()
    const db = await getDb()
    const pre = await db.get<{
      is_cancelled?: number
      source?: string
      status?: number
      number?: string
      created_date?: string
    }>(
      'SELECT is_cancelled, source, status, number, COALESCE(createdAt, created_at) as created_date FROM orders WHERE id = ?',
      [id]
    )
    if (!pre) {
      throw new Error('Заказ не найден')
    }
    if (Number(pre.is_cancelled) !== 1) {
      throw new Error('Удалить из базы можно только отменённый заказ. Сначала отмените заказ.')
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
        const add = Math.ceil((c.qtyPerItem || 0) * Math.max(1, Number(item.quantity) || 1))
        returns[c.materialId] = (returns[c.materialId] || 0) + add
      }
    }

    const ord = pre

    await db.run('BEGIN')
    try {
      for (const mid of Object.keys(returns)) {
        const materialId = Number(mid)
        const addQty = Math.ceil(returns[materialId])
        if (addQty > 0) {
          await MaterialTransactionService.addInTransaction(db, {
            materialId,
            quantity: addQty,
            reason: 'order delete',
            orderId: id,
            userId
          })
        }
      }

      await db.run('DELETE FROM material_reservations WHERE order_id = ?', [id])

      await db.run('UPDATE material_moves SET order_id = NULL WHERE order_id = ?', [id])

      try {
        await db.run('DELETE FROM debt_closed_events WHERE order_id = ?', [id])
      } catch {
        // таблица может отсутствовать
      }

      try {
        await db.run('DELETE FROM user_order_page_orders WHERE order_id = ?', [id])
      } catch {
        // таблица может отсутствовать
      }

      try {
        await db.run('DELETE FROM order_item_earnings WHERE order_id = ?', [id])
      } catch {
        // таблица может отсутствовать
      }

      await db.run('DELETE FROM items WHERE orderId = ?', [id])
      await db.run('DELETE FROM order_files WHERE orderId = ?', [id])

      await this.recordCancellationEvent(db, {
        orderId: id,
        orderNumber: ord?.number ?? null,
        orderSource: ord?.source ?? null,
        statusBefore: Number(ord?.status ?? 0),
        eventType: 'delete',
        reason: reasonText,
        userId
      })

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
      return OrderService.orderForApi(newOrder)
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
    all?: boolean;
    light?: boolean;
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
    const targetStatus = Number(newStatus)
    
    if (orderIds.length === 0) {
      throw new Error('Не выбрано ни одного заказа')
    }
    if (!Number.isFinite(targetStatus)) {
      throw new Error('Некорректный статус заказа')
    }
    if (await this.isCancellationStatusId(db, targetStatus)) {
      throw new Error('Статус отмены назначается только через отмену заказа')
    }
    
    const placeholders = orderIds.map(() => '?').join(',')
    const before = (await db.all(
      `SELECT id, status, source FROM orders WHERE id IN (${placeholders})`,
      orderIds
    )) as { id: number; status: number; source?: Order['source'] | null }[];
    const params = [targetStatus, ...orderIds]
    
    await db.run(
      `UPDATE orders SET status = ? WHERE id IN (${placeholders})`,
      ...params
    )
    const n = targetStatus;
    for (const row of before) {
      const old = Number(row.status);
      if (old !== n) {
        void tryEnqueueOrderStatusEmail({
          orderId: row.id,
          oldStatusId: old,
          newStatusId: n,
          source: row.source ?? 'crm',
        });
        void tryScheduleOrderStatusSms({ orderId: row.id, newStatusId: n });
        void tryNotifyTelegramOrderStatusForMiniappOrder({
          orderId: row.id,
          oldStatusId: old,
          newStatusId: n,
        });
        void trySyncWebsiteOrderStatusFromCrm(db, row.id);
      }
    }
    
    return { updatedCount: orderIds.length, newStatus: targetStatus }
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
        await OrderService.permanentDeleteOrder(orderId, userId, reason)
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
