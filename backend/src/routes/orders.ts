import { Router } from 'express'
import { OrderController } from '../modules/orders/controllers/orderController'
import { OrderItemController } from '../modules/orders/controllers/orderItemController'
import { asyncHandler, authenticate } from '../middleware'
import { upload } from '../config/upload'
import { getDb } from '../config/database'
import { PDFReportService } from '../services/pdfReportService'

const router = Router()

// Все маршруты заказов требуют аутентификации
router.use(authenticate)

// Order routes
router.get('/', asyncHandler(OrderController.getAllOrders))
router.get('/search', asyncHandler(OrderController.searchOrders))
router.get('/stats', asyncHandler(OrderController.getOrdersStats))
router.post('/', asyncHandler(OrderController.createOrder))
router.post('/with-auto-deduction', asyncHandler(OrderController.createOrderWithAutoDeduction))
router.put('/:id/status', asyncHandler(OrderController.updateOrderStatus))
router.delete('/:id', asyncHandler(OrderController.deleteOrder))
router.post('/:id/duplicate', asyncHandler(OrderController.duplicateOrder))

// Bulk operations
router.post('/bulk/update-status', asyncHandler(OrderController.bulkUpdateStatus))
router.post('/bulk/delete', asyncHandler(OrderController.bulkDeleteOrders))

// Export
router.get('/export', asyncHandler(OrderController.exportOrders))

// PDF бланк заказа
router.get('/:id/blank-pdf', asyncHandler(async (req, res) => {
  try {
    const orderId = Number(req.params.id);
    
    if (!orderId || isNaN(orderId)) {
      res.status(400).json({ message: 'Неверный ID заказа' });
      return;
    }

    // Получаем телефон компании из query параметров или используем дефолтный
    const companyPhones = req.query.phones 
      ? (Array.isArray(req.query.phones) ? req.query.phones : [req.query.phones]).map(p => String(p))
      : ['+375 33 336 56 78'];
    
    // Получаем информацию о пользователе, который генерирует бланк
    const user = (req as any).user as { name?: string; email?: string } | undefined;
    const executedBy = user?.name || user?.email || undefined;

    const pdfBuffer = await PDFReportService.generateOrderBlank(orderId, companyPhones, executedBy);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="order-blank-${orderId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('❌ Error generating order blank PDF:', error);
    console.error('Error stack:', error?.stack);
    res.status(500).json({ 
      message: 'Ошибка генерации PDF бланка заказа',
      error: error?.message || 'Неизвестная ошибка',
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
}))

// Order items routes
router.post('/:id/items', asyncHandler(OrderItemController.addItem))
router.delete('/:orderId/items/:itemId', asyncHandler(OrderItemController.deleteItem))
router.patch('/:orderId/items/:itemId', asyncHandler(OrderItemController.updateItem))

// Order reassignment
router.post('/reassign/:number', asyncHandler(async (req, res) => {
  console.log('🔍 Reassign endpoint called:', req.params.number, req.body);
  
  const number = req.params.number;
  const { userId } = req.body;
  
  if (!userId) {
    console.log('❌ Missing userId');
    res.status(400).json({ message: 'userId is required' });
    return;
  }

  const db = await getDb();
  
  // Находим заказ по номеру
  const order = await db.get('SELECT * FROM orders WHERE number = ?', number);
  console.log('🔍 Found order:', order);
  
  if (!order) {
    console.log('❌ Order not found');
    res.status(404).json({ message: 'Order not found' });
    return;
  }

  // Назначаем заказ пользователю и обновляем дату назначения
  const currentDate = new Date().toISOString();
  await db.run('UPDATE orders SET userId = ?, created_at = ? WHERE number = ?', userId, currentDate, number);
  console.log('✅ Order reassigned successfully');
  
  res.json({ success: true, message: 'Order reassigned successfully' });
}));

// Order files routes
router.get('/:id/files', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const db = await getDb()
  const rows = await db.all<any>(
    'SELECT id, orderId, filename, originalName, mime, size, uploadedAt, approved, approvedAt, approvedBy FROM order_files WHERE orderId = ? ORDER BY id DESC',
    id
  )
  res.json(rows)
}))

router.post('/:id/files', upload.single('file'), asyncHandler(async (req, res) => {
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

router.delete('/:orderId/files/:fileId', asyncHandler(async (req, res) => {
  const orderId = Number(req.params.orderId)
  const fileId = Number(req.params.fileId)
  const { uploadsDir } = await import('../config/upload')
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

router.post('/:orderId/files/:fileId/approve', asyncHandler(async (req, res) => {
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
router.post('/:id/prepay', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const db = await getDb()
  const order = await db.get<any>('SELECT * FROM orders WHERE id = ?', id)
  if (!order) { res.status(404).json({ message: 'Заказ не найден' }); return }
  const amount = Number((req.body as any)?.amount ?? order.prepaymentAmount ?? 0)
  const paymentMethod = (req.body as any)?.paymentMethod ?? 'online'
  if (!amount || amount <= 0) { res.status(400).json({ message: 'Сумма предоплаты не задана' }); return }
  
  // BePaid integration stub: normally create payment via API and get redirect url
  const paymentId = `BEP-${Date.now()}-${id}`
  const paymentUrl = paymentMethod === 'online' ? `https://checkout.bepaid.by/redirect/${paymentId}` : null
  const prepaymentStatus = paymentMethod === 'offline' ? 'paid' : 'pending'
  
  await db.run('UPDATE orders SET prepaymentAmount = ?, prepaymentStatus = ?, paymentUrl = ?, paymentId = ?, paymentMethod = ? WHERE id = ?', 
    amount, prepaymentStatus, paymentUrl, paymentId, paymentMethod, id)
  const updated = await db.get<any>('SELECT * FROM orders WHERE id = ?', id)
  res.json(updated)
}))

// Admin utility: normalize item prices
router.post('/:id/normalize-prices', asyncHandler(async (req, res) => {
  const user = (req as any).user as { id: number; role: string } | undefined
  if (!user || user.role !== 'admin') { res.status(403).json({ message: 'Forbidden' }); return }
  const orderId = Number(req.params.id)
  const db = await getDb()
  const items = await db.all<any>('SELECT id, price, quantity FROM items WHERE orderId = ?', orderId)
  let updated = 0
  for (const it of items) {
    const qty = Math.max(1, Number(it.quantity) || 1)
    const price = Number(it.price) || 0
    // Heuristic: if qty>1 and price likely contains total (per-item > 10 BYN or qty>=50 and per-item > 3 BYN)
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
