import { getDb } from '../config/database'
import { hasColumn } from '../utils/tableSchemaCache'
import { itemRowSelect, mapItemRowToItem, ItemRow } from '../models/mappers/itemMapper'
import { Item } from '../models/Item'
import { Order } from '../models/Order'
import { PhotoOrderRow } from '../models/mappers/telegramPhotoOrderMapper'

export const OrderRepository = {
  async getItemsByOrderId(orderId: number): Promise<Item[]> {
    const db = await getDb()
    try {
      const rows = await db.all<ItemRow>(
        `SELECT ${itemRowSelect} FROM items WHERE orderId = ?`,
        orderId
      )
      return Array.isArray(rows) ? rows.map(mapItemRowToItem) : []
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
      return map
    } catch (e: any) {
      console.warn('[OrderRepository] getItemsByOrderIds failed:', e?.message || e)
      return map
    }
  },

  async listUserOrders(userId: number): Promise<Order[]> {
    const db = await getDb()
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
      WHERE o.userId = ? OR o.userId IS NULL 
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

  /** Заказы пользователя, выданные в указанную дату (status = 4, дата по updated_at). */
  async listUserOrdersIssuedOn(userId: number, dateYmd: string): Promise<Order[]> {
    const db = await getDb()
    const d = dateYmd.slice(0, 10)
    const orders = await db.all<any>(
      `SELECT 
        o.id, 
        CASE WHEN o.source = 'website' THEN 'site-ord-' || o.id ELSE o.number END as number,
        o.status, COALESCE(o.created_at, o.createdAt) as created_at, o.customerName, o.customerPhone, o.customerEmail, 
        o.prepaymentAmount, o.prepaymentStatus, o.paymentUrl, o.paymentId, o.paymentMethod, o.userId,
        o.source, o.customer_id, COALESCE(o.discount_percent, 0) as discount_percent,
        c.id as customer__id, c.first_name as customer__first_name, c.last_name as customer__last_name,
        c.middle_name as customer__middle_name, c.company_name as customer__company_name,
        c.legal_name as customer__legal_name, c.authorized_person as customer__authorized_person,
        c.phone as customer__phone, c.email as customer__email
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE (o.userId = ? OR o.userId IS NULL) AND o.status = 4
        AND substr(COALESCE(o.updated_at, o.created_at, o.createdAt), 1, 10) = ?
      ORDER BY o.id DESC`,
      userId,
      d
    )
    return OrderRepository.mapOrdersWithCustomer(orders)
  },

  /** Все заказы, выданные в указанную дату (без фильтра по userId). */
  async listAllOrdersIssuedOn(dateYmd: string): Promise<Order[]> {
    const db = await getDb()
    const d = dateYmd.slice(0, 10)
    const orders = await db.all<any>(
      `SELECT 
        o.id, 
        CASE WHEN o.source = 'website' THEN 'site-ord-' || o.id ELSE o.number END as number,
        o.status, COALESCE(o.created_at, o.createdAt) as created_at, o.customerName, o.customerPhone, o.customerEmail, 
        o.prepaymentAmount, o.prepaymentStatus, o.paymentUrl, o.paymentId, o.paymentMethod, o.userId,
        o.source, o.customer_id, COALESCE(o.discount_percent, 0) as discount_percent,
        c.id as customer__id, c.first_name as customer__first_name, c.last_name as customer__last_name,
        c.middle_name as customer__middle_name, c.company_name as customer__company_name,
        c.legal_name as customer__legal_name, c.authorized_person as customer__authorized_person,
        c.phone as customer__phone, c.email as customer__email
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      WHERE o.status = 4
        AND substr(COALESCE(o.updated_at, o.created_at, o.createdAt), 1, 10) = ?
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

  /** Все заказы (для пула): без фильтра по userId */
  async listAllOrders(): Promise<Order[]> {
    const db = await getDb()
    let hasIsCancelled = false
    try {
      hasIsCancelled = await hasColumn('orders', 'is_cancelled')
    } catch { /* ignore */ }
    const isCancelledSel = hasIsCancelled ? 'o.is_cancelled' : '0 as is_cancelled'
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
      limit?: number;
      offset?: number;
    }
  ): Promise<Order[]> {
    const db = await getDb()

    let whereConditions = ['(o.userId = ? OR o.userId IS NULL)']
    const params: any[] = [userId]

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
    const totalAmountSubquery = `
      (SELECT COALESCE(SUM(i.price * i.quantity), 0) 
       FROM items i 
       WHERE i.orderId = o.id)
    `

    let query = `
      SELECT o.* , ${totalAmountSubquery} as totalAmount
      FROM orders o
      WHERE ${whereClause}
    `

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
    if (searchParams.limit) {
      query += ' LIMIT ?'
      params.push(searchParams.limit)
    }
    if (searchParams.offset) {
      query += ' OFFSET ?'
      params.push(searchParams.offset)
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
    const whereConditions = ['(o.userId = ? OR o.userId IS NULL)']
    const params: any[] = [userId]
    if (dateFrom) { whereConditions.push('DATE(o.created_at) >= ?'); params.push(dateFrom) }
    if (dateTo) { whereConditions.push('DATE(o.created_at) <= ?'); params.push(dateTo) }
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
    return stats as any
  },
}


