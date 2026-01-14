import { Router, Request, Response } from 'express'
import { rateLimiter } from '../../../middleware/rateLimiter'
import { OrderController, OrderItemController } from '../controllers'
import { asyncHandler } from '../../../middleware'
import { upload } from '../../../config/upload'
import { getDb } from '../../../config/database'

const router = Router()

// Public-facing rate limits
const createOrderRateLimit = rateLimiter.middleware({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many order creations, please try again later'
})
const addItemRateLimit = rateLimiter.middleware({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many item additions, please slow down'
})
const prepayRateLimit = rateLimiter.middleware({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many prepayment requests, please try again later'
})

// Order routes
router.get('/', asyncHandler((req: Request, res: Response) => OrderController.getAllOrders(req, res)))
router.get('/search', asyncHandler((req: Request, res: Response) => OrderController.searchOrders(req, res)))
router.get('/stats', asyncHandler((req: Request, res: Response) => OrderController.getOrdersStats(req, res)))
router.post('/', createOrderRateLimit, asyncHandler((req: Request, res: Response) => OrderController.createOrder(req, res)))
router.post('/with-auto-deduction', asyncHandler((req: Request, res: Response) => OrderController.createOrderWithAutoDeduction(req, res)))
router.put('/:id/status', asyncHandler((req: Request, res: Response) => OrderController.updateOrderStatus(req, res)))
router.put('/:id/customer', asyncHandler((req: Request, res: Response) => OrderController.updateOrderCustomer(req, res)))
router.delete('/:id', asyncHandler((req: Request, res: Response) => OrderController.deleteOrder(req, res)))
router.post('/:id/duplicate', asyncHandler((req: Request, res: Response) => OrderController.duplicateOrder(req, res)))

// Reassign by number (only status 0)
router.post('/reassign/:number', asyncHandler((req: Request, res: Response) => OrderController.reassignOrder(req, res)))

// Soft cancel online order (moves to pool)
router.post('/:id/cancel-online', asyncHandler((req: Request, res: Response) => OrderController.cancelOnline(req, res)))

// Bulk operations
router.post('/bulk/update-status', asyncHandler((req: Request, res: Response) => OrderController.bulkUpdateStatus(req, res)))
router.post('/bulk/delete', asyncHandler((req: Request, res: Response) => OrderController.bulkDeleteOrders(req, res)))

// Export
router.get('/export', asyncHandler((req: Request, res: Response) => OrderController.exportOrders(req, res)))

// Order items routes
router.post('/:id/items', addItemRateLimit, asyncHandler((req: Request, res: Response) => OrderItemController.addItem(req, res)))
router.delete('/:orderId/items/:itemId', asyncHandler((req: Request, res: Response) => OrderItemController.deleteItem(req, res)))
router.patch('/:orderId/items/:itemId', asyncHandler((req: Request, res: Response) => OrderItemController.updateItem(req, res)))

// Order files routes
router.get('/:id/files', asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const db = await getDb()
  const rows = await db.all<any>(
    'SELECT id, orderId, filename, originalName, mime, size, uploadedAt, approved, approvedAt, approvedBy FROM order_files WHERE orderId = ? ORDER BY id DESC',
    id
  )
  res.json(rows)
}))

router.post('/:id/files', upload.single('file'), asyncHandler(async (req: Request, res: Response) => {
  const orderId = Number(req.params.id)
  const f = (req as any).file as { filename: string; originalname?: string; mimetype?: string; size?: number } | undefined
  if (!f) { res.status(400).json({ message: 'Файл не получен' }); return }
  const db = await getDb()
  await db.run(
    'INSERT INTO order_files (orderId, filename, originalName, mime, size) VALUES (?, ?, ?, ?, ?)',
    orderId,
    f.filename,
    f.originalname || null,
    f.mimetype || null,
    f.size || null
  )
  const row = await db.get<any>(
    'SELECT id, orderId, filename, originalName, mime, size, uploadedAt, approved, approvedAt, approvedBy FROM order_files WHERE orderId = ? ORDER BY id DESC LIMIT 1',
    orderId
  )
  res.status(201).json(row)
}))

router.delete('/:orderId/files/:fileId', asyncHandler(async (req: Request, res: Response) => {
  const orderId = Number(req.params.orderId)
  const fileId = Number(req.params.fileId)
  const { uploadsDir } = await import('../../../config/upload')
  const path = await import('path')
  const fs = await import('fs')
  const db = await getDb()
  const row = await db.get<any>('SELECT filename FROM order_files WHERE id = ? AND orderId = ?', fileId, orderId)
  if (row && row.filename) {
    const p = path.join(uploadsDir, String(row.filename))
    try { fs.unlinkSync(p) } catch {}
  }
  await db.run('DELETE FROM order_files WHERE id = ? AND orderId = ?', fileId, orderId)
  res.status(204).end()
}))

router.post('/:orderId/files/:fileId/approve', asyncHandler(async (req: Request, res: Response) => {
  const orderId = Number(req.params.orderId)
  const fileId = Number(req.params.fileId)
  const user = (req as any).user as { id: number } | undefined
  const db = await getDb()
  await db.run(
    "UPDATE order_files SET approved = 1, approvedAt = datetime('now'), approvedBy = ? WHERE id = ? AND orderId = ?",
    user?.id ?? null,
    fileId,
    orderId
  )
  const row = await db.get<any>(
    'SELECT id, orderId, filename, originalName, mime, size, uploadedAt, approved, approvedAt, approvedBy FROM order_files WHERE id = ? AND orderId = ?',
    fileId,
    orderId
  )
  res.json(row)
}))

// Prepayment routes
router.post('/:id/prepay', prepayRateLimit, asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  const db = await getDb()
  const order = await db.get<any>('SELECT * FROM orders WHERE id = ?', id)
  if (!order) { res.status(404).json({ message: 'Заказ не найден' }); return }
  const amount = Number((req.body as any)?.amount ?? order.prepaymentAmount ?? 0)
  const paymentMethod = (req.body as any)?.paymentMethod ?? 'online'
  
  if (amount < 0) { res.status(400).json({ message: 'Сумма предоплаты не может быть отрицательной' }); return }
  
  if (amount === 0) {
    // Удаляем предоплату
    await db.run('UPDATE orders SET prepaymentAmount = 0, prepaymentStatus = NULL, paymentUrl = NULL, paymentId = NULL, paymentMethod = NULL WHERE id = ?', id)
  } else {
    // Создаем/обновляем предоплату
    const paymentId = `BEP-${Date.now()}-${id}`
    const paymentUrl = paymentMethod === 'online' ? `https://checkout.bepaid.by/redirect/${paymentId}` : null
    const prepaymentStatus = paymentMethod === 'offline' ? 'paid' : 'pending'
    
    await db.run('UPDATE orders SET prepaymentAmount = ?, prepaymentStatus = ?, paymentUrl = ?, paymentId = ?, paymentMethod = ? WHERE id = ?', 
      amount, prepaymentStatus, paymentUrl, paymentId, paymentMethod, id)
  }
  const updated = await db.get<any>('SELECT * FROM orders WHERE id = ?', id)
  res.json(updated)
}))

// Admin utility: normalize item prices
router.post('/:id/normalize-prices', asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id: number; role: string } | undefined
  if (!user || user.role !== 'admin') { res.status(403).json({ message: 'Forbidden' }); return }
  const orderId = Number(req.params.id)
  const db = await getDb()
  const items = await db.all<any>('SELECT id, price, quantity FROM items WHERE orderId = ?', orderId)
  let updated = 0
  for (const it of items) {
    const qty = Math.max(1, Number(it.quantity) || 1)
    const price = Number(it.price) || 0
    const perItem = price / qty
    const shouldFix = qty > 1 && (perItem === 0 ? false : (perItem > 10 || (qty >= 50 && perItem > 3)))
    if (shouldFix) {
      await db.run('UPDATE items SET price = ? WHERE id = ? AND orderId = ?', perItem, it.id, orderId)
      updated++
    }
  }
  res.json({ orderId, updated })
}))

export default router
