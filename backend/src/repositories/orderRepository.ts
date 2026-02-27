import { getDb } from '../config/database'
import { hasColumn } from '../utils/tableSchemaCache'
import { itemRowSelect, mapItemRowToItem, ItemRow } from '../models/mappers/itemMapper'
import { Item } from '../models/Item'
import { Order } from '../models/Order'
import { PhotoOrderRow } from '../models/mappers/telegramPhotoOrderMapper'

/** Если type — числовая строка (ID продукта с сайта), подставляем имя из products. */
async function enrichItemsWithProductNames(items: Item[]): Promise<Item[]> {
  const numericTypes = [...new Set(
    items
      .map((i) => i.type != null ? String(i.type).trim() : '')
      .filter((t) => /^\d+$/.test(t))
  )].map((t) => parseInt(t, 10))
  if (numericTypes.length === 0) return items

  const db = await getDb()
  let idToName: Map<number, string>
  try {
    const placeholders = numericTypes.map(() => '?').join(',')
    const rows = await db.all<{ id: number; name: string }>(
      `SELECT id, name FROM products WHERE id IN (${placeholders})`,
      ...numericTypes
    )
    idToName = new Map((Array.isArray(rows) ? rows : []).map((r) => [r.id, r.name]))
  } catch {
    return items
  }

  return items.map((item) => {
    const t = item.type != null ? String(item.type).trim() : ''
    if (!/^\d+$/.test(t)) return item
    const productId = parseInt(t, 10)
    const name = idToName.get(productId)
    if (!name) return item
    return { ...item, type: name }
  })
}

export const OrderRepository = {
  async getItemsByOrderId(orderId: number): Promise<Item[]> {
    const db = await getDb()
    try {
      const rows = await db.all<ItemRow>(
        `SELECT ${itemRowSelect} FROM items WHERE orderId = ?`,
        orderId
      )
      const items = Array.isArray(rows) ? rows.map(mapItemRowToItem) : []
      return enrichItemsWithProductNames(items)
    } catch (e: any) {
      // On fresh/partial DB some tables may be missing; don't break /api/orders
      console.warn('[OrderRepository] getItemsByOrderId failed:', e?.message || e)
      return []
    }
  },

  /**
   * Загружает items для нескольких заказов одним запросом (устранение N+1).
   * Возвращает Map<orderId, Item[]>.
   */
  async getItemsByOrderIds(orderIds: number[]): Promise<Map<number, Item[]>> {
    const map = new Map<number, Item[]>()
    if (orderIds.length === 0) return map

    const db = await getDb()
    try {
      const placeholders = orderIds.map(() => '?').join(',')
      const rows = await db.all<ItemRow>(
        `SELECT ${itemRowSelect} FROM items WHERE orderId IN (${placeholders})`,
        ...orderIds
      )
      for (const row of Array.isArray(rows) ? rows : []) {
        const item = mapItemRowToItem(row)
        const list = map.get(row.orderId) ?? []
        list.push(item)
        map.set(row.orderId, list)
      }
      const allItems = [...map.values()].flat()
      const enriched = await enrichItemsWithProductNames(allItems)
      let idx = 0
      for (const orderId of map.keys()) {
        const count = map.get(orderId)!.length
        map.set(orderId, enriched.slice(idx, idx + count))
        idx += count
      }
      return map
    } catch (e: any) {
      console.warn('[OrderRepository] getItemsByOrderIds failed:', e?.message || e)
      return map
    }
  },

  async listUserOrders(userId: number): Promise<Order[]> {
    const db = await getDb()
    let hasPaymentChannel = false
    let hasNotes = false
    try {
      hasPaymentChannel = await hasColumn('orders', 'payment_channel')
      hasNotes = await hasColumn('orders', 'notes')
    } catch { /* ignore */ }
    const paymentChannelSel = hasPaymentChannel ? "COALESCE(o.payment_channel, 'cash') as payment_channel" : "'cash' as payment_channel"
    const notesSel = hasNotes ? 'o.notes' : 'NULL as notes'
    const orders = await db.all<any>(
      `SELECT 
        o.id, 
        CASE 
          WHEN o.source = 'website' THEN 'site-ord-' || o.id
          ELSE o.number
        END as number,
        o.status, COALESCE(o.created_at, o.createdAt) as created_at, o.customerName, o.customerPhone, o.customerEmail, 
        o.prepaymentAmount, o.prepaymentStatus, o.paymentUrl, o.paymentId, o.paymentMethod, o.userId,
        o.source, o.customer_id, COALESCE(o.discount_percent, 0) as discount_percent,
        ${paymentChannelSel},
        ${notesSel},
        c.id as customer__id,
        c.first_name as customer__first_name,
        c.last_name as customer__last_name,
        c.middle_name as customer__middle_name,
        c.company_name as customer__company_name,
        c.legal_name as customer__legal_name,
        c.authorized_person as customer__authorized_person,
        c.phone as customer__phone,
        c.email as customer__email
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.userId = ?
      ORDER BY o.id DESC`,
      userId
    )
    // Преобразуем плоские поля customer__ в объект customer
    return orders.map((row: any) => {
      const { 
        customer__id, customer__first_name, customer__last_name, customer__middle_name,
        customer__company_name, customer__legal_name, customer__authorized_person,
        customer__phone, customer__email,
        ...order 
      } = row
      
      if (customer__id) {
        order.customer = {
          id: customer__id,
          first_name: customer__first_name,
          last_name: customer__last_name,
          middle_name: customer__middle_name,
          company_name: customer__company_name,
          legal_name: customer__legal_name,
          authorized_person: customer__authorized_person,
          phone: customer__phone,
          email: customer__email
        }
      }
      return order
    }) as unknown as Order[]
  },

  /** Заказы пользователя, выданные в указанную дату (status = 4). Дата выдачи — только debt_closed_events.closed_date. */
  async listUserOrdersIssuedOn(userId: number, dateYmd: string): Promise<Order[]> {
    const db = await getDb()
    const d = dateYmd.slice(0, 10)
    let hasPaymentChannel = false
    let hasNotes = false
    try {
      hasPaymentChannel = await hasColumn('orders', 'payment_channel')
      hasNotes = await hasColumn('orders', 'notes')
    } catch { /* ignore */ }
    const paymentChannelSel = hasPaymentChannel ? "COALESCE(o.payment_channel, 'cash') as payment_channel" : "'cash' as payment_channel"
    const notesSel = hasNotes ? 'o.notes' : 'NULL as notes'
    const orders = await db.all<any>(
      `SELECT 
        o.id, 
        CASE WHEN o.source = 'website' THEN 'site-ord-' || o.id ELSE o.number END as number,
        o.status, COALESCE(o.created_at, o.createdAt) as created_at, o.customerName, o.customerPhone, o.customerEmail, 
        o.prepaymentAmount, o.prepaymentStatus, o.paymentUrl, o.paymentId, o.paymentMethod, o.userId,
        o.source, o.customer_id, COALESCE(o.discount_percent, 0) as discount_percent,
        ${paymentChannelSel},
        ${notesSel},
        c.id as customer__id, c.first_name as customer__first_name, c.last_name as customer__last_name,
        c.middle_name as customer__middle_name, c.company_name as customer__company_name,
        c.legal_name as customer__legal_name, c.authorized_person as customer__authorized_person,
        c.phone as customer__phone, c.email as customer__email
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE (o.userId = ? OR EXISTS (
        SELECT 1 FROM user_order_page_orders uopo
        JOIN user_order_pages uop ON uopo.page_id = uop.id
        WHERE uopo.order_id = o.id AND uopo.order_type = 'website' AND uop.user_id = ?
      )) AND o.status = 4
        AND EXISTS (SELECT 1 FROM debt_closed_events d WHERE d.order_id = o.id AND d.closed_date = ?)
      ORDER BY o.id DESC`,
      userId,
      userId,
      d
    )
    return OrderRepository.mapOrdersWithCustomer(orders)
  },

  /**
   * Выданные за дату: владельческие (userId) + выданные этим юзером (debt_closed_events.issued_by).
   * Поле issued_by_me = 1, если заказ выдал текущий пользователь.
   */
  async listOrdersIssuedOnIncludingIssuedBy(userId: number, dateYmd: string): Promise<Order[]> {
    const db = await getDb()
    const d = dateYmd.slice(0, 10)
    let hasIssuedBy = false
    try {
      hasIssuedBy = await hasColumn('debt_closed_events', 'issued_by_user_id')
    } catch {
      /* ignore */
    }
    if (!hasIssuedBy) {
      return OrderRepository.listUserOrdersIssuedOn(userId, dateYmd)
    }
    let hasPaymentChannel = false
    let hasNotes = false
    try {
      hasPaymentChannel = await hasColumn('orders', 'payment_channel')
      hasNotes = await hasColumn('orders', 'notes')
    } catch { /* ignore */ }
    const paymentChannelSel = hasPaymentChannel ? "COALESCE(o.payment_channel, 'cash') as payment_channel" : "'cash' as payment_channel"
    const notesSel = hasNotes ? 'o.notes' : 'NULL as notes'
    const orders = await db.all<any>(
      `SELECT 
        o.id, 
        CASE WHEN o.source = 'website' THEN 'site-ord-' || o.id ELSE o.number END as number,
        o.status, COALESCE(o.created_at, o.createdAt) as created_at, o.customerName, o.customerPhone, o.customerEmail, 
        o.prepaymentAmount, o.prepaymentStatus, o.paymentUrl, o.paymentId, o.paymentMethod, o.userId,
        o.source, o.customer_id, COALESCE(o.discount_percent, 0) as discount_percent,
        ${paymentChannelSel},
        ${notesSel},
        c.id as customer__id, c.first_name as customer__first_name, c.last_name as customer__last_name,
        c.middle_name as customer__middle_name, c.company_name as customer__company_name,
        c.legal_name as customer__legal_name, c.authorized_person as customer__authorized_person,
        c.phone as customer__phone, c.email as customer__email,
        EXISTS (
          SELECT 1 FROM debt_closed_events d 
          WHERE d.order_id = o.id AND d.closed_date = ? AND d.issued_by_user_id = ?
        ) AS issued_by_me
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.status = 4
        AND EXISTS (SELECT 1 FROM debt_closed_events d3 WHERE d3.order_id = o.id AND d3.closed_date = ?)
        AND (
          o.userId = ?
          OR EXISTS (
            SELECT 1 FROM user_order_page_orders uopo
            JOIN user_order_pages uop ON uopo.page_id = uop.id
            WHERE uopo.order_id = o.id AND uopo.order_type = 'website' AND uop.user_id = ?
          )
          OR EXISTS (
            SELECT 1 FROM debt_closed_events d2 
            WHERE d2.order_id = o.id AND d2.closed_date = ? AND d2.issued_by_user_id = ?
          )
        )
      ORDER BY o.id DESC`,
      d,
      userId,
      userId,
      d,
      userId
    )
    return OrderRepository.mapOrdersWithCustomer(orders)
  },

  /** Все заказы, выданные в указанную дату (без фильтра по userId). Дата выдачи — только debt_closed_events.closed_date. */
  async listAllOrdersIssuedOn(dateYmd: string): Promise<Order[]> {
    const db = await getDb()
    const d = dateYmd.slice(0, 10)
    let hasPaymentChannel = false
    let hasNotes = false
    try {
      hasPaymentChannel = await hasColumn('orders', 'payment_channel')
      hasNotes = await hasColumn('orders', 'notes')
    } catch { /* ignore */ }
    const paymentChannelSel = hasPaymentChannel ? "COALESCE(o.payment_channel, 'cash') as payment_channel" : "'cash' as payment_channel"
    const notesSel = hasNotes ? 'o.notes' : 'NULL as notes'
    const orders = await db.all<any>(
      `SELECT 
        o.id, 
        CASE WHEN o.source = 'website' THEN 'site-ord-' || o.id ELSE o.number END as number,
        o.status, COALESCE(o.created_at, o.createdAt) as created_at, o.customerName, o.customerPhone, o.customerEmail, 
        o.prepaymentAmount, o.prepaymentStatus, o.paymentUrl, o.paymentId, o.paymentMethod, o.userId,
        o.source, o.customer_id, COALESCE(o.discount_percent, 0) as discount_percent,
        ${paymentChannelSel},
        ${notesSel},
        c.id as customer__id, c.first_name as customer__first_name, c.last_name as customer__last_name,
        c.middle_name as customer__middle_name, c.company_name as customer__company_name,
        c.legal_name as customer__legal_name, c.authorized_person as customer__authorized_person,
        c.phone as customer__phone, c.email as customer__email
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.status = 4
        AND EXISTS (SELECT 1 FROM debt_closed_events d WHERE d.order_id = o.id AND d.closed_date = ?)
      ORDER BY o.id DESC`,
      d
    )
    return OrderRepository.mapOrdersWithCustomer(orders)
  },

  mapOrdersWithCustomer(orders: any[]): Order[] {
    return orders.map((row: any) => {
      const {
        customer__id, customer__first_name, customer__last_name, customer__middle_name,
        customer__company_name, customer__legal_name, customer__authorized_person,
        customer__phone, customer__email,
        ...order
      } = row
      if (customer__id) {
        order.customer = {
          id: customer__id,
          first_name: customer__first_name,
          last_name: customer__last_name,
          middle_name: customer__middle_name,
          company_name: customer__company_name,
          legal_name: customer__legal_name,
          authorized_person: customer__authorized_person,
          phone: customer__phone,
          email: customer__email
        }
      }
      return order
    }) as unknown as Order[]
  },

  /** Все заказы (для пула): без фильтра по userId. Номер заказа — всегда из БД (ORD-XXXX). */
  async listAllOrders(): Promise<Order[]> {
    const db = await getDb()
    let hasIsCancelled = false
    let hasPaymentChannel = false
    let hasNotes = false
    try {
      hasIsCancelled = await hasColumn('orders', 'is_cancelled')
      hasPaymentChannel = await hasColumn('orders', 'payment_channel')
      hasNotes = await hasColumn('orders', 'notes')
    } catch { /* ignore */ }
    const isCancelledSel = hasIsCancelled ? 'o.is_cancelled' : '0 as is_cancelled'
    const paymentChannelSel = hasPaymentChannel ? "COALESCE(o.payment_channel, 'cash') as payment_channel" : "'cash' as payment_channel"
    const notesSel = hasNotes ? 'o.notes' : 'NULL as notes'
    const orders = await db.all<any>(
      `SELECT 
        o.id, 
        o.number,
        o.status, COALESCE(o.created_at, o.createdAt) as created_at, o.customerName, o.customerPhone, o.customerEmail, 
        o.prepaymentAmount, o.prepaymentStatus, o.paymentUrl, o.paymentId, o.paymentMethod, o.userId,
        o.source, o.customer_id, COALESCE(o.discount_percent, 0) as discount_percent,
        ${paymentChannelSel},
        ${notesSel},
        ${isCancelledSel},
        c.id as customer__id,
        c.first_name as customer__first_name,
        c.last_name as customer__last_name,
        c.middle_name as customer__middle_name,
        c.company_name as customer__company_name,
        c.legal_name as customer__legal_name,
        c.authorized_person as customer__authorized_person,
        c.phone as customer__phone,
        c.email as customer__email
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      ORDER BY o.id DESC`
    )
    return orders.map((row: any) => {
      const {
        customer__id, customer__first_name, customer__last_name, customer__middle_name,
        customer__company_name, customer__legal_name, customer__authorized_person,
        customer__phone, customer__email,
        ...order
      } = row
      if (customer__id) {
        order.customer = {
          id: customer__id,
          first_name: customer__first_name,
          last_name: customer__last_name,
          middle_name: customer__middle_name,
          company_name: customer__company_name,
          legal_name: customer__legal_name,
          authorized_person: customer__authorized_person,
          phone: customer__phone,
          email: customer__email,
        }
      }
      return order
    }) as unknown as Order[]
  },

  async listAssignedOrdersForUser(userId: number): Promise<any[]> {
    const db = await getDb()
    try {
      const assignedOrders = await db.all(
        `SELECT 
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
            WHEN uopo.order_type = 'website' THEN COALESCE(o.created_at, o.createdAt)
            WHEN uopo.order_type = 'telegram' THEN uopo.assigned_at
            ELSE uopo.assigned_at
          END as created_at,
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
        ORDER BY uopo.assigned_at DESC`,
        [userId]
      )
      return assignedOrders
    } catch (e: any) {
      console.warn('[OrderRepository] listAssignedOrdersForUser failed:', e?.message || e)
      return []
    }
  },

  async getPhotoOrderById(id: number): Promise<PhotoOrderRow | undefined> {
    const db = await getDb()
    try {
      const row = await db.get<PhotoOrderRow>(
        `SELECT id, status, created_at, first_name, chat_id, total_price, selected_size, processing_options, quantity
         FROM photo_orders WHERE id = ?`,
        [id]
      )
      return row || undefined
    } catch (e: any) {
      console.warn('[OrderRepository] getPhotoOrderById failed:', e?.message || e)
      return undefined
    }
  },

  /** Загружает photo_orders для нескольких id одним запросом (устранение N+1). */
  async getPhotoOrdersByIds(ids: number[]): Promise<Map<number, PhotoOrderRow>> {
    const map = new Map<number, PhotoOrderRow>()
    if (ids.length === 0) return map
    const db = await getDb()
    try {
      const placeholders = ids.map(() => '?').join(',')
      const rows = await db.all<PhotoOrderRow>(
        `SELECT id, status, created_at, first_name, chat_id, total_price, selected_size, processing_options, quantity
         FROM photo_orders WHERE id IN (${placeholders})`,
        ...ids
      )
      for (const row of Array.isArray(rows) ? rows : []) {
        map.set(row.id, row)
      }
    } catch (e: any) {
      console.warn('[OrderRepository] getPhotoOrdersByIds failed:', e?.message || e)
    }
    return map
  },

  async searchOrders(
    userId: number,
    searchParams: {
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
    }
  ): Promise<Order[]> {
    const db = await getDb()

    let whereConditions = [
      '(o.userId = ? OR EXISTS (SELECT 1 FROM user_order_page_orders uopo JOIN user_order_pages uop ON uopo.page_id = uop.id WHERE uopo.order_id = o.id AND uopo.order_type = \'website\' AND uop.user_id = ?))'
    ]
    const params: any[] = [userId, userId]

    if (searchParams.department_id != null && Number.isFinite(searchParams.department_id)) {
      whereConditions.push('o.userId IN (SELECT id FROM users WHERE department_id = ?)')
      params.push(searchParams.department_id)
    }

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
      const s = `%${searchParams.query}%`
      params.push(s, s, s, s, s, s)
    }

    if (searchParams.status !== undefined) {
      whereConditions.push('o.status = ?')
      params.push(searchParams.status)
    }
    if (searchParams.dateFrom) {
      whereConditions.push('DATE(o.created_at) >= ?')
      params.push(searchParams.dateFrom)
    }
    if (searchParams.dateTo) {
      whereConditions.push('DATE(o.created_at) <= ?')
      params.push(searchParams.dateTo)
    }
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
    if (searchParams.hasPrepayment !== undefined) {
      if (searchParams.hasPrepayment) {
        whereConditions.push('o.prepaymentAmount > 0')
      } else {
        whereConditions.push('(o.prepaymentAmount IS NULL OR o.prepaymentAmount = 0)')
      }
    }
    if (searchParams.paymentMethod) {
      whereConditions.push('o.paymentMethod = ?')
      params.push(searchParams.paymentMethod)
    }

    const whereClause = whereConditions.join(' AND ')
    const hasAmountFilter = searchParams.minAmount !== undefined || searchParams.maxAmount !== undefined
    const hasPagination = searchParams.limit !== undefined || searchParams.offset !== undefined

    let query = ''
    if (!hasAmountFilter && hasPagination) {
      // Быстрый путь для UI-списка:
      // 1) выбираем только текущую страницу заказов
      // 2) считаем суммы только по orderId этой страницы (без full scan по items)
      query = `
        WITH paged_orders AS (
          SELECT o.*
          FROM orders o
          WHERE ${whereClause}
          ORDER BY COALESCE(o.created_at, o.createdAt) DESC
          LIMIT ? OFFSET ?
        ),
        order_totals AS (
          SELECT i.orderId, SUM(i.price * i.quantity) as totalAmount
          FROM items i
          WHERE i.orderId IN (SELECT id FROM paged_orders)
          GROUP BY i.orderId
        )
        SELECT p.*, COALESCE(t.totalAmount, 0) as totalAmount
        FROM paged_orders p
        LEFT JOIN order_totals t ON t.orderId = p.id
        ORDER BY COALESCE(p.created_at, p.createdAt) DESC
      `
      params.push(searchParams.limit ?? 100, searchParams.offset ?? 0)
    } else {
      // Общий путь: один запрос с агрегацией totalAmount.
      query = `
        SELECT
          o.*,
          COALESCE(agg.totalAmount, 0) as totalAmount
        FROM orders o
        LEFT JOIN (
          SELECT orderId, SUM(price * quantity) as totalAmount
          FROM items
          GROUP BY orderId
        ) agg ON agg.orderId = o.id
        WHERE ${whereClause}
      `

      if (hasAmountFilter) {
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

      query += ' ORDER BY COALESCE(created_at, createdAt) DESC'
      if (searchParams.limit) {
        query += ' LIMIT ?'
        params.push(searchParams.limit)
      }
      if (searchParams.offset) {
        query += ' OFFSET ?'
        params.push(searchParams.offset)
      }
    }

    const orders = await db.all<Order>(query, ...params)
    return orders as unknown as Order[]
  },

  async getOrdersStats(userId: number, dateFrom?: string, dateTo?: string): Promise<{
    totalOrders: number
    newOrders: number
    inProgressOrders: number
    readyOrders: number
    shippedOrders: number
    completedOrders: number
    totalRevenue: number
    averageOrderValue: number
    ordersWithPrepayment: number
    totalPrepayment: number
  }> {
    const db = await getDb()
    const whereConditions = [
      '(o.userId = ? OR EXISTS (SELECT 1 FROM user_order_page_orders uopo JOIN user_order_pages uop ON uopo.page_id = uop.id WHERE uopo.order_id = o.id AND uopo.order_type = \'website\' AND uop.user_id = ?))'
    ]
    const params: any[] = [userId, userId]
    if (dateFrom) { whereConditions.push('DATE(o.created_at) >= ?'); params.push(dateFrom) }
    if (dateTo) { whereConditions.push('DATE(o.created_at) <= ?'); params.push(dateTo) }
    const whereClause = whereConditions.join(' AND ')
    const stats = await db.get(`
      SELECT
        COUNT(*) as totalOrders,
        COUNT(CASE WHEN base.status = 1 THEN 1 END) as newOrders,
        COUNT(CASE WHEN base.status = 2 THEN 1 END) as inProgressOrders,
        COUNT(CASE WHEN base.status = 3 THEN 1 END) as readyOrders,
        COUNT(CASE WHEN base.status = 4 THEN 1 END) as shippedOrders,
        COUNT(CASE WHEN base.status = 5 THEN 1 END) as completedOrders,
        COALESCE(SUM(base.totalAmount), 0) as totalRevenue,
        COALESCE(AVG(base.totalAmount), 0) as averageOrderValue,
        COUNT(CASE WHEN base.prepaymentAmount > 0 THEN 1 END) as ordersWithPrepayment,
        COALESCE(SUM(base.prepaymentAmount), 0) as totalPrepayment
      FROM (
        SELECT
          o.status,
          o.prepaymentAmount,
          COALESCE(agg.totalAmount, 0) as totalAmount
        FROM orders o
        LEFT JOIN (
          SELECT orderId, SUM(price * quantity) as totalAmount
          FROM items
          GROUP BY orderId
        ) agg ON agg.orderId = o.id
        WHERE ${whereClause}
      ) base
    `, ...params)
    return stats as any
  },
}


