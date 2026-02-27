import { Request, Response } from 'express'
import { OrderService } from '../services/orderService'
import { asyncHandler } from '../../../middleware'
import { logger } from '../../../utils/logger'
import { getDb } from '../../../config/database'
import { saveBufferToUploads } from '../../../config/upload'
import { setLastWebsiteOrderAt } from '../../../utils/poolSync'

/** Приводит item.params к объекту: JSON-строка парсится, объект возвращается как есть, чтобы в CRM попадали все поля (printSize, paperType, withWhiteBorders и т.д.) */
function normalizeItemParams(params: unknown): Record<string, unknown> {
  if (params == null) return {}
  if (typeof params === 'object' && !Array.isArray(params)) return { ...params } as Record<string, unknown>
  if (typeof params === 'string') {
    const s = params.trim()
    if (!s) return {}
    try {
      const parsed = JSON.parse(s) as unknown
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? { ...(parsed as Record<string, unknown>) } : {}
    } catch {
      return {}
    }
  }
  return {}
}

/** Нормализует items с сайта: каждый item.params — объект (распарсенный из JSON-строки) */
function normalizeWebsiteItems(items: any[]): Array<{ type: string; params: Record<string, unknown>; price: number; quantity: number; priceType?: string; price_type?: string }> {
  return items.map((it: any) => ({
    type: String(it?.type ?? ''),
    params: normalizeItemParams(it?.params),
    price: Number(it?.price) || 0,
    quantity: Math.max(1, parseInt(String(it?.quantity), 10) || 1),
    ...(it?.priceType != null && { priceType: it.priceType }),
    ...(it?.price_type != null && { price_type: it.price_type }),
  }))
}

export class OrderController {
  static async getAllOrders(req: Request, res: Response) {
    try {
      const authUser = (req as any).user as { id: number; role: string } | undefined
      if (!authUser?.id) {
        res.status(401).json({ message: 'Unauthorized' })
        return
      }
      const issuedOn = (req as any).query?.issued_on as string | undefined
      const all = (req as any).query?.all === '1' || (req as any).query?.all === true
      if (issuedOn && /^\d{4}-\d{2}-\d{2}$/.test(issuedOn.slice(0, 10))) {
        const orders = all
          ? await OrderService.getOrdersIssuedOnAll(issuedOn)
          : await OrderService.getOrdersIssuedOn(authUser.id, issuedOn)
        res.json(orders)
        return
      }
      // all=1: страница Order Pool — все пользователи (не только админ) видят заказы всех
      const orders = all
        ? await OrderService.getAllOrdersForPool()
        : await OrderService.getAllOrders(authUser.id)
      res.json(orders)
    } catch (error: any) {
      const msg = error?.message ?? String(error)
      logger.error('Error in /api/orders', { error: msg, stack: error?.stack })
      res.status(500).json({ 
        error: 'Failed to load orders', 
        details: msg 
      })
    }
  }

  static async reassignOrder(req: Request, res: Response) {
    try {
      const { number } = req.params as { number: string }
      const { userId } = req.body as { userId: number }
      if (!number || !userId) {
        res.status(400).json({ error: 'number and userId are required' })
        return
      }
      const result = await OrderService.reassignOrderByNumber(number, userId)
      res.json(result)
    } catch (error: any) {
      const status = error?.message === 'Заказ не найден' ? 404 : 400
      res.status(status).json({ error: error?.message ?? 'Error' })
    }
  }

  static async cancelOnline(req: Request, res: Response) {
    try {
      const id = Number(req.params.id)
      const authUser = (req as any).user as { id: number } | undefined
      const cancelReason = String((req.body as any)?.cancel_reason || '').trim()
      if (!cancelReason) {
        res.status(400).json({ error: 'Необходимо указать причину отмены' })
        return
      }
      await OrderService.deleteOrder(id, authUser?.id, cancelReason)
      res.json({ id, softCancelled: true })
    } catch (error: any) {
      res.status(400).json({ error: error.message })
    }
  }

  static async createOrder(req: Request, res: Response) {
    try {
      const authUser = (req as any).user as { id: number } | undefined
      const { customerName, customerPhone, customerEmail, prepaymentAmount, date, customer_id, payment_channel } = req.body || {}
      
      const order = await OrderService.createOrder(
        customerName,
        customerPhone,
        customerEmail,
        prepaymentAmount,
        authUser?.id,
        date,
        undefined,
        customer_id,
        payment_channel
      )
      
      res.status(201).json(order)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  /**
   * Публичный эндпоинт для создания заказа с сайта (без авторизации CRM).
   * Требует заголовок X-API-Key или Authorization: Bearer <WEBSITE_ORDER_API_KEY>.
   * Заказ создаётся с source='website', userId=null и попадает в пул заказов.
   */
  static async createOrderFromWebsite(req: Request, res: Response) {
    try {
      const body = req.body || {}
      const { customerName, customerPhone, customerEmail, prepaymentAmount, items, customer_id } = body

      // Логируем входящие данные с сайта для отладки (без больших полей)
      logger.info('createOrderFromWebsite: входящий запрос', {
        bodyKeys: Object.keys(body),
        customerName: customerName ?? null,
        customerPhone: customerPhone ?? null,
        customerEmail: customerEmail ?? null,
        prepaymentAmount: prepaymentAmount ?? null,
        customer_id: customer_id ?? null,
        itemsCount: Array.isArray(items) ? items.length : 0,
        items: Array.isArray(items)
          ? items.map((it: any, i: number) => ({
              index: i,
              type: it?.type ?? null,
              paramsKeys: it?.params && typeof it.params === 'object' ? Object.keys(it.params) : (typeof it?.params === 'string' ? ['string'] : []),
              params: typeof it?.params === 'object' ? it.params : (typeof it?.params === 'string' ? '(string)' : null),
              price: it?.price ?? null,
              quantity: it?.quantity ?? null,
              priceType: it?.priceType ?? it?.price_type ?? (it?.params && typeof it.params === 'object' ? (it.params.priceType ?? it.params.price_type) : null),
            }))
          : null,
      })

      if (!customerName && !customerPhone) {
        res.status(400).json({
          error: 'Необходимо указать имя или телефон клиента',
          message: 'customerName or customerPhone is required'
        })
        return
      }

      if (items != null && Array.isArray(items) && items.length > 0) {
        const normalizedItems = normalizeWebsiteItems(items)
        const result = await OrderService.createOrderWithAutoDeduction({
          customerName: customerName || undefined,
          customerPhone: customerPhone || undefined,
          customerEmail: customerEmail || undefined,
          prepaymentAmount,
          userId: undefined,
          customer_id,
          source: 'website',
          items: normalizedItems
        })
        setLastWebsiteOrderAt(Date.now())
        res.status(201).json({
          order: result.order,
          deductionResult: result.deductionResult,
          message: 'Заказ с сайта создан'
        })
        return
      }

      const order = await OrderService.createOrder(
        customerName || undefined,
        customerPhone || undefined,
        customerEmail || undefined,
        prepaymentAmount,
        undefined,
        undefined,
        'website',
        customer_id
      )
      setLastWebsiteOrderAt(Date.now())
      res.status(201).json({ order, message: 'Заказ с сайта создан' })
    } catch (error: any) {
      logger.error('createOrderFromWebsite error', { error: error?.message, stack: error?.stack })
      res.status(500).json({
        error: error?.message ?? 'Ошибка создания заказа',
        message: 'Internal server error'
      })
    }
  }

  /**
   * Создание заказа с сайта в одном запросе с файлами (multipart/form-data).
   * Поля: customerName, customerPhone, customerEmail, prepaymentAmount, customer_id, items (JSON-строка).
   * Файлы: поле "file" (можно несколько — file[] или несколько полей file).
   */
  static async createOrderFromWebsiteWithFiles(req: Request, res: Response) {
    try {
      const body = req.body || {}
      let items = body.items

      // Логируем входящие данные с сайта для отладки (без файлов)
      logger.info('createOrderFromWebsiteWithFiles: входящий запрос', {
        bodyKeys: Object.keys(body),
        customerName: body.customerName ?? null,
        customerPhone: body.customerPhone ?? null,
        customerEmail: body.customerEmail ?? null,
        prepaymentAmount: body.prepaymentAmount ?? null,
        customer_id: body.customer_id ?? null,
        itemsRawType: typeof items,
        itemsCount: Array.isArray(items) ? items.length : (typeof items === 'string' ? '(JSON string)' : 0),
        items: Array.isArray(items)
          ? items.map((it: any, i: number) => ({
              index: i,
              type: it?.type ?? null,
              paramsKeys: it?.params && typeof it.params === 'object' ? Object.keys(it.params) : [],
              price: it?.price ?? null,
              quantity: it?.quantity ?? null,
              priceType: it?.priceType ?? it?.price_type ?? null,
            }))
          : null,
      })
      if (typeof items === 'string') {
        try {
          items = JSON.parse(items)
        } catch {
          items = undefined
        }
      }
      if (Array.isArray(items) && items.length > 0) {
        logger.info('createOrderFromWebsiteWithFiles: разобранные items', {
          items: items.map((it: any, i: number) => ({
            index: i,
            type: it?.type ?? null,
            paramsKeys: it?.params && typeof it.params === 'object' ? Object.keys(it.params) : [],
            params: typeof it?.params === 'object' ? it.params : null,
            priceType: it?.priceType ?? it?.price_type ?? (it?.params && typeof it.params === 'object' ? (it.params.priceType ?? it.params.price_type) : null),
          })),
        })
      }
      const customerName = body.customerName != null ? String(body.customerName) : undefined
      const customerPhone = body.customerPhone != null ? String(body.customerPhone) : undefined
      const customerEmail = body.customerEmail != null ? String(body.customerEmail) : undefined
      const prepaymentAmount = body.prepaymentAmount != null ? Number(body.prepaymentAmount) : undefined
      const customer_id = body.customer_id != null ? Number(body.customer_id) : undefined

      if (!customerName && !customerPhone) {
        res.status(400).json({
          error: 'Необходимо указать имя или телефон клиента',
          message: 'customerName or customerPhone is required'
        })
        return
      }

      let order: { id: number; [key: string]: any }
      let deductionResult: any

      if (items != null && Array.isArray(items) && items.length > 0) {
        const normalizedItems = normalizeWebsiteItems(items)
        const result = await OrderService.createOrderWithAutoDeduction({
          customerName,
          customerPhone,
          customerEmail,
          prepaymentAmount,
          userId: undefined,
          customer_id,
          source: 'website',
          items: normalizedItems
        })
        order = result.order as any
        deductionResult = result.deductionResult
      } else {
        order = await OrderService.createOrder(
          customerName,
          customerPhone,
          customerEmail,
          prepaymentAmount,
          undefined,
          undefined,
          'website',
          customer_id
        ) as any
      }
      setLastWebsiteOrderAt(Date.now())

      const files = (req as any).files as Array<{ buffer?: Buffer; originalname?: string; originalName?: string; mimetype?: string }> | undefined
      let insertedFiles: any[] = []
      if (files && files.length > 0) {
        const db = await getDb()
        for (const f of files) {
          const nameFromClient = f.originalname ?? (f as any).originalName
          const saved = saveBufferToUploads(f.buffer, nameFromClient)
          if (!saved) {
            logger.warn('createOrderFromWebsiteWithFiles: пропущен пустой файл', { originalname: nameFromClient })
            continue
          }
          await db.run(
            'INSERT INTO order_files (orderId, filename, originalName, mime, size) VALUES (?, ?, ?, ?, ?)',
            order.id,
            saved.filename,
            saved.originalName,
            f.mimetype || null,
            saved.size
          )
        }
        const rows = await db.all<any>(
          'SELECT id, orderId, filename, originalName, mime, size, uploadedAt, approved, approvedAt, approvedBy FROM order_files WHERE orderId = ? ORDER BY id ASC',
          order.id
        )
        insertedFiles = rows || []
      }

      const payload: any = { order, files: insertedFiles, message: 'Заказ с сайта создан' }
      if (deductionResult !== undefined) payload.deductionResult = deductionResult
      res.status(201).json(payload)
    } catch (error: any) {
      logger.error('createOrderFromWebsiteWithFiles error', { error: error?.message, stack: error?.stack })
      res.status(500).json({
        error: error?.message ?? 'Ошибка создания заказа',
        message: 'Internal server error'
      })
    }
  }

  static async createOrderWithAutoDeduction(req: Request, res: Response) {
    try {
      const authUser = (req as any).user as { id: number } | undefined
      const { customerName, customerPhone, customerEmail, prepaymentAmount, items, customer_id } = req.body || {}
      
      if (!items || !Array.isArray(items)) {
        res.status(400).json({ 
          error: 'Необходимо указать массив товаров (items)' 
        })
        return
      }
      
      const result = await OrderService.createOrderWithAutoDeduction({
        customerName,
        customerPhone,
        customerEmail,
        prepaymentAmount,
        userId: authUser?.id,
        customer_id,
        items
      })
      
      res.status(201).json({
        order: result.order,
        deductionResult: result.deductionResult,
        message: 'Заказ создан с автоматическим списанием материалов'
      })
    } catch (error: any) {
      res.status(500).json({ 
        error: error.message,
        details: 'Ошибка создания заказа с автоматическим списанием'
      })
    }
  }

  static async updateOrderStatus(req: Request, res: Response) {
    try {
      const id = Number(req.params.id)
      const { status, cancel_reason } = req.body as { status: number; cancel_reason?: string }
      const authUser = (req as any).user as { id: number } | undefined
      
      logger.info(`Updating order ${id} status to ${status}`)
      const updated = await OrderService.updateOrderStatus(id, status, authUser?.id, cancel_reason)
      logger.info(`Order ${id} status updated successfully`)
      res.json(updated)
    } catch (error: any) {
      logger.error(`Error updating order ${req.params.id} status`, error)
      res.status(500).json({ error: error.message })
    }
  }

  static async updateOrderCustomer(req: Request, res: Response) {
    try {
      const id = Number(req.params.id)
      const { customer_id } = req.body
      if (isNaN(id)) {
        res.status(400).json({ error: 'Неверный ID заказа' })
        return
      }
      const customerId = customer_id === null || customer_id === undefined ? null : Number(customer_id)
      if (customerId !== null && isNaN(customerId)) {
        res.status(400).json({ error: 'Неверный ID клиента' })
        return
      }
      const updated = await OrderService.updateOrderCustomer(id, customerId)
      res.json(updated)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  static async updateOrderDiscount(req: Request, res: Response) {
    try {
      const id = Number(req.params.id)
      const { discount_percent } = req.body as { discount_percent: number }
      if (isNaN(id)) {
        res.status(400).json({ error: 'Неверный ID заказа' })
        return
      }
      const updated = await OrderService.updateOrderDiscount(id, discount_percent)
      res.json(updated)
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  static async updateOrderPaymentChannel(req: Request, res: Response) {
    try {
      const id = Number(req.params.id)
      const { payment_channel } = req.body as { payment_channel: string }
      if (isNaN(id)) {
        res.status(400).json({ error: 'Неверный ID заказа' })
        return
      }
      const updated = await OrderService.updateOrderPaymentChannel(id, payment_channel)
      res.json(updated)
    } catch (error: any) {
      const status = error.message?.includes('не найден') ? 404 : 400
      res.status(status).json({ error: error.message })
    }
  }

  static async updateOrderNotes(req: Request, res: Response) {
    try {
      const id = Number(req.params.id)
      const { notes } = req.body as { notes?: string | null }
      if (isNaN(id)) {
        res.status(400).json({ error: 'Неверный ID заказа' })
        return
      }
      const updated = await OrderService.updateOrderNotes(id, notes ?? null)
      res.json(updated)
    } catch (error: any) {
      const status = error.message?.includes('не найден') ? 404 : 400
      res.status(status).json({ error: error.message })
    }
  }

  static async deleteOrder(req: Request, res: Response) {
    try {
      const id = Number(req.params.id)
      const authUser = (req as any).user as { id: number } | undefined
      const deleteReason = String((req.body as any)?.delete_reason || (req.query as any)?.delete_reason || '').trim()
      if (!deleteReason) {
        res.status(400).json({ error: 'Необходимо указать причину удаления/отмены заказа' })
        return
      }
      
      await OrderService.deleteOrder(id, authUser?.id, deleteReason)
      res.status(204).end()
    } catch (error: any) {
      res.status(500).json({ error: error.message })
    }
  }

  static async duplicateOrder(req: Request, res: Response) {
    try {
      const originalOrderId = Number(req.params.id)
      const newOrder = await OrderService.duplicateOrder(originalOrderId)
      res.status(201).json(newOrder)
    } catch (error: any) {
      const status = error.message === 'Заказ не найден' ? 404 : 500
      res.status(status).json({ message: error.message })
    }
  }

  static async addOrderItem(req: Request, res: Response) {
    try {
      const orderId = Number(req.params.id)
      const itemData = req.body
      
      const item = await OrderService.addOrderItem(orderId, itemData)
      res.status(201).json(item)
    } catch (error: any) {
      logger.error('Error adding order item', error)
      res.status(500).json({ 
        error: 'Failed to add item to order', 
        details: error.message 
      })
    }
  }

  // Новые методы для расширенного управления заказами

  static async searchOrders(req: Request, res: Response) {
    try {
      const authUser = (req as any).user as { id: number; role: string } | undefined
      if (!authUser?.id) { 
        res.status(401).json({ message: 'Unauthorized' })
        return 
      }
      
      const q = req.query as Record<string, string | undefined>
      const departmentId = q.department_id != null ? parseInt(q.department_id, 10) : undefined
      const searchParams = {
        ...q,
        department_id: Number.isFinite(departmentId) ? departmentId : undefined
      }
      const orders = await OrderService.searchOrders(authUser.id, searchParams)
      res.json(orders)
    } catch (error: any) {
      logger.error('Error searching orders', error)
      res.status(500).json({ 
        error: 'Failed to search orders', 
        details: error.message 
      })
    }
  }

  static async getOrdersStats(req: Request, res: Response) {
    try {
      const authUser = (req as any).user as { id: number; role: string } | undefined
      if (!authUser?.id) { 
        res.status(401).json({ message: 'Unauthorized' })
        return 
      }
      
      const { dateFrom, dateTo } = req.query
      const stats = await OrderService.getOrdersStats(authUser.id, dateFrom as string, dateTo as string)
      res.json(stats)
    } catch (error: any) {
      logger.error('Error getting orders stats', error)
      res.status(500).json({ 
        error: 'Failed to get orders stats', 
        details: error.message 
      })
    }
  }

  static async bulkUpdateStatus(req: Request, res: Response) {
    try {
      const authUser = (req as any).user as { id: number; role: string } | undefined
      if (!authUser?.id) { 
        res.status(401).json({ message: 'Unauthorized' })
        return 
      }
      
      const { orderIds, newStatus } = req.body
      
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        res.status(400).json({ error: 'orderIds must be a non-empty array' })
        return
      }
      
      const result = await OrderService.bulkUpdateOrderStatus(orderIds, newStatus, authUser.id)
      res.json(result)
    } catch (error: any) {
      logger.error('Error bulk updating order status', error)
      res.status(500).json({ 
        error: 'Failed to bulk update order status', 
        details: error.message 
      })
    }
  }

  static async bulkDeleteOrders(req: Request, res: Response) {
    try {
      const authUser = (req as any).user as { id: number; role: string } | undefined
      if (!authUser?.id) { 
        res.status(401).json({ message: 'Unauthorized' })
        return 
      }
      
      const { orderIds, delete_reason } = req.body
      
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        res.status(400).json({ error: 'orderIds must be a non-empty array' })
        return
      }
      const reasonText = String(delete_reason || '').trim()
      if (!reasonText) {
        res.status(400).json({ error: 'Необходимо указать причину удаления/отмены заказов' })
        return
      }
      
      const result = await OrderService.bulkDeleteOrders(orderIds, authUser.id, reasonText)
      res.json(result)
    } catch (error: any) {
      logger.error('Error bulk deleting orders', error)
      res.status(500).json({ 
        error: 'Failed to bulk delete orders', 
        details: error.message 
      })
    }
  }

  static async exportOrders(req: Request, res: Response) {
    try {
      const authUser = (req as any).user as { id: number; role: string } | undefined
      if (!authUser?.id) { 
        res.status(401).json({ message: 'Unauthorized' })
        return 
      }
      
      const { format = 'csv', ...searchParams } = req.query
      const data = await OrderService.exportOrders(authUser.id, format as 'csv' | 'json', searchParams)
      
      const filename = `orders_export_${new Date().toISOString().split('T')[0]}.${format}`
      const mimeType = format === 'csv' ? 'text/csv' : 'application/json'
      
      res.setHeader('Content-Type', mimeType)
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.send(data)
    } catch (error: any) {
      logger.error('Error exporting orders', error)
      res.status(500).json({ 
        error: 'Failed to export orders', 
        details: error.message 
      })
    }
  }
}
