import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { OrderController } from '../modules/orders/controllers/orderController'
import { OrderItemController } from '../modules/orders/controllers/orderItemController'
import { asyncHandler, authenticate } from '../middleware'
import { requireWebsiteOrderApiKey, isWebsiteOrderApiKeyValid } from '../middleware/websiteOrderApiKey'
import { upload, uploadMemory, saveBufferToUploads, uploadsDir } from '../config/upload'
import { getDb } from '../config/database'
import { PDFReportService } from '../services/pdfReportService'
import { hasColumn } from '../utils/tableSchemaCache'

const router = Router()

/**
 * @swagger
 * /api/orders/from-website:
 *   post:
 *     summary: Создать заказ с сайта (публичный API)
 *     description: |
 *       Публичный эндпоинт для приёма заказов с внешнего сайта. Не требует авторизации в CRM.
 *       Авторизация по API-ключу в заголовке X-API-Key или Authorization Bearer.
 *       Заказ создаётся с source=website, userId=null и попадает в пул заказов (unassigned).
 *       Переменная окружения WEBSITE_ORDER_API_KEY. Если не задана — эндпоинт возвращает 503.
 *     tags: [Orders]
 *     security: []
 *     parameters:
 *       - in: header
 *         name: X-API-Key
 *         schema:
 *           type: string
 *         description: API-ключ для заказов с сайта (альтернатива — Authorization Bearer <key>)
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Обязателен хотя бы один из customerName или customerPhone
 *             properties:
 *               customerName:
 *                 type: string
 *                 example: Иван Иванов
 *               customerPhone:
 *                 type: string
 *                 example: "+375 29 123 45 67"
 *               customerEmail:
 *                 type: string
 *                 format: email
 *               prepaymentAmount:
 *                 type: number
 *                 example: 0
 *               customer_id:
 *                 type: integer
 *                 description: ID клиента в CRM (опционально)
 *               items:
 *                 type: array
 *                 description: Позиции заказа. Если передан непустой массив — заказ создаётся с позициями и списанием материалов.
 *                 items:
 *                   type: object
 *                   required: [type, params, price, quantity]
 *                   properties:
 *                     type:
 *                       type: string
 *                     params:
 *                       type: string
 *                       description: JSON-строка параметров
 *                     price:
 *                       type: number
 *                     quantity:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Заказ создан
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 order:
 *                   type: object
 *                 deductionResult:
 *                   type: object
 *                   description: При наличии items
 *                 message:
 *                   type: string
 *       400:
 *         description: Не указано имя или телефон клиента
 *       401:
 *         description: Неверный или отсутствующий API-ключ
 *       503:
 *         description: WEBSITE_ORDER_API_KEY не настроен
 */
// Публичный эндпоинт для заказов с сайта (без авторизации CRM, проверка по X-API-Key)
router.post('/from-website', requireWebsiteOrderApiKey, asyncHandler(OrderController.createOrderFromWebsite))

// Создание заказа с сайта + файлы в одном запросе (multipart/form-data; файлы опциональны).
// Используем uploadMemory + ручная запись буфера, чтобы файлы не сохранялись как 0 КБ.
router.post('/from-website/with-files', requireWebsiteOrderApiKey, uploadMemory.array('file', 20), asyncHandler(OrderController.createOrderFromWebsiteWithFiles))

// Загрузка файлов к заказу с сайта (тот же API-ключ; только заказы с source=website)
router.post('/from-website/:orderId/files', requireWebsiteOrderApiKey, uploadMemory.single('file'), asyncHandler(async (req, res) => {
  const orderId = Number(req.params.orderId)
  const f = (req as any).file as { buffer?: Buffer; originalname?: string; mimetype?: string } | undefined
  if (!f) {
    res.status(400).json({ message: 'Файл не получен' })
    return
  }
  const saved = saveBufferToUploads(f.buffer, (f as any).originalname ?? (f as any).originalName)
  if (!saved) {
    res.status(400).json({ message: 'Файл пустой (0 байт). Проверьте отправку на клиенте.' })
    return
  }
  const db = await getDb()
  const order = await db.get<{ id: number; source?: string }>('SELECT id, source FROM orders WHERE id = ?', orderId)
  if (!order) {
    res.status(404).json({ message: 'Заказ не найден' })
    return
  }
  if (order.source !== 'website') {
    res.status(403).json({ message: 'Загрузка файлов разрешена только для заказов, созданных с сайта' })
    return
  }
  await db.run(
    'INSERT INTO order_files (orderId, orderItemId, filename, originalName, mime, size) VALUES (?, ?, ?, ?, ?, ?)',
    orderId,
    null,
    saved.filename,
    saved.originalName,
    f.mimetype || null,
    saved.size
  )
  const row = await db.get<any>(
    'SELECT id, orderId, orderItemId, filename, originalName, mime, size, uploadedAt, approved, approvedAt, approvedBy FROM order_files WHERE orderId = ? ORDER BY id DESC LIMIT 1',
    orderId
  )
  res.status(201).json(row)
}))

// POST /:id/files — допускаем либо CRM-авторизацию, либо API-ключ сайта (для загрузки файлов к заказу с сайта)
router.post('/:id/files', (req, res, next) => {
  if (isWebsiteOrderApiKeyValid(req)) {
    (req as any).fromWebsite = true
    return next()
  }
  return authenticate(req, res, next)
}, uploadMemory.single('file'), asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id)
  const f = (req as any).file as { buffer?: Buffer; originalname?: string; mimetype?: string } | undefined
  if (!f) { res.status(400).json({ message: 'Файл не получен' }); return }
  const buf = f.buffer
  if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
    res.status(400).json({
      message: 'Тело файла пустое (0 байт). Убедитесь, что запрос отправляется как multipart/form-data с boundary (не задавайте Content-Type вручную).'
    })
    return
  }
  const saved = saveBufferToUploads(buf, (f as any).originalname ?? (f as any).originalName)
  if (!saved) {
    res.status(400).json({ message: 'Файл пустой (0 байт). Проверьте отправку на клиенте.' })
    return
  }
  const db = await getDb()
  if ((req as any).fromWebsite) {
    const order = await db.get<{ id: number; source?: string }>('SELECT id, source FROM orders WHERE id = ?', orderId)
    if (!order) {
      res.status(404).json({ message: 'Заказ не найден' })
      return
    }
    if (order.source !== 'website') {
      res.status(403).json({ message: 'Загрузка файлов по API-ключу разрешена только для заказов, созданных с сайта' })
      return
    }
  }
  const orderItemIdRaw = (req.body && (req.body as any).orderItemId) != null ? (req.body as any).orderItemId : null
  let orderItemId: number | null = null
  if (orderItemIdRaw !== '' && orderItemIdRaw != null) {
    const id = Number(orderItemIdRaw)
    if (!Number.isNaN(id)) {
      const item = await db.get<{ orderId: number }>('SELECT orderId FROM items WHERE id = ?', id)
      if (item && item.orderId === orderId) orderItemId = id
    }
  }
  await db.run(
    'INSERT INTO order_files (orderId, orderItemId, filename, originalName, mime, size) VALUES (?, ?, ?, ?, ?, ?)',
    orderId,
    orderItemId,
    saved.filename,
    saved.originalName,
    f.mimetype || null,
    saved.size
  )
  const row = await db.get<any>(
    'SELECT id, orderId, orderItemId, filename, originalName, mime, size, uploadedAt, approved, approvedAt, approvedBy FROM order_files WHERE orderId = ? ORDER BY id DESC LIMIT 1',
    orderId
  )
  res.status(201).json(row)
}))

// Все остальные маршруты заказов требуют аутентификации
router.use(authenticate)

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Получить список всех заказов
 *     description: Возвращает список всех заказов с возможностью фильтрации и пагинации
 *     tags: [Orders]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Номер страницы
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Количество элементов на странице
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Фильтр по статусу заказа
 *     responses:
 *       200:
 *         description: Список заказов
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orders:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 */
router.get('/', asyncHandler(OrderController.getAllOrders))

/**
 * @swagger
 * /api/orders/search:
 *   get:
 *     summary: Поиск заказов
 *     description: Поиск заказов по различным критериям
 *     tags: [Orders]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Поисковый запрос
 *     responses:
 *       200:
 *         description: Результаты поиска
 */
router.get('/search', asyncHandler(OrderController.searchOrders))

/**
 * @swagger
 * /api/orders/stats:
 *   get:
 *     summary: Получить статистику по заказам
 *     description: Возвращает статистическую информацию о заказах
 *     tags: [Orders]
 *     responses:
 *       200:
 *         description: Статистика заказов
 */
router.get('/stats', asyncHandler(OrderController.getOrdersStats))

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Создать новый заказ
 *     description: Создает новый заказ с указанными параметрами
 *     tags: [Orders]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_name
 *               - items
 *             properties:
 *               customer_name:
 *                 type: string
 *                 example: Иван Иванов
 *               customer_phone:
 *                 type: string
 *                 example: +375 29 123 45 67
 *               customer_email:
 *                 type: string
 *                 format: email
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Заказ успешно создан
 *       400:
 *         description: Ошибка валидации данных
 */
router.post('/', asyncHandler(OrderController.createOrder))
router.post('/with-auto-deduction', asyncHandler(OrderController.createOrderWithAutoDeduction))
router.put('/:id/status', asyncHandler(OrderController.updateOrderStatus))
router.put('/:id/customer', asyncHandler(OrderController.updateOrderCustomer))
router.put('/:id/discount', asyncHandler(OrderController.updateOrderDiscount))
router.delete('/:id', asyncHandler(OrderController.deleteOrder))
router.post('/:id/duplicate', asyncHandler(OrderController.duplicateOrder))

// Bulk operations
router.post('/bulk/update-status', asyncHandler(OrderController.bulkUpdateStatus))
router.post('/bulk/delete', asyncHandler(OrderController.bulkDeleteOrders))

// Export
router.get('/export', asyncHandler(OrderController.exportOrders))

// PDF бланк товарного чека (пустая форма, без заказа)
router.get('/commodity-receipt-blank-pdf', asyncHandler(async (_req, res) => {
  try {
    const pdfBuffer = await PDFReportService.generateCommodityReceiptBlank();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="commodity-receipt-blank.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('❌ Error generating commodity receipt blank PDF:', error);
    res.status(500).json({
      message: 'Ошибка генерации бланка товарного чека',
      error: error?.message || 'Неизвестная ошибка',
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
}))

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

// PDF товарный чек (по образцу: орг., УНП, таблица, сумма прописью)
router.get('/:id/commodity-receipt-pdf', asyncHandler(async (req, res) => {
  try {
    const orderId = Number(req.params.id);

    if (!orderId || isNaN(orderId)) {
      res.status(400).json({ message: 'Неверный ID заказа' });
      return;
    }

    const user = (req as any).user as { name?: string; email?: string } | undefined;
    const executedBy = user?.name || user?.email || undefined;

    const pdfBuffer = await PDFReportService.generateCommodityReceipt(orderId, executedBy);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="commodity-receipt-${orderId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('❌ Error generating commodity receipt PDF:', error);
    res.status(500).json({
      message: 'Ошибка генерации товарного чека',
      error: error?.message || 'Неизвестная ошибка',
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    });
  }
}))

// Order items routes
router.post('/:id/items', asyncHandler(OrderItemController.addItem))
router.delete('/:orderId/items/:itemId', asyncHandler(OrderItemController.deleteItem))
router.patch('/:orderId/items/:itemId', asyncHandler(OrderItemController.updateItem))

// Order reassignment: по номеру (ORD-XXXX) или по site-ord-<id> для заказов с сайта
router.post('/reassign/:number', asyncHandler(async (req, res) => {
  const param = req.params.number;
  const { userId } = req.body;
  
  if (!userId) {
    res.status(400).json({ message: 'userId is required' });
    return;
  }

  const db = await getDb();
  let order: { id: number; number?: string } | undefined;

  const siteOrderMatch = /^site-ord-(\d+)$/i.exec(param);
  if (siteOrderMatch) {
    const orderId = parseInt(siteOrderMatch[1], 10);
    order = await db.get('SELECT id, number FROM orders WHERE id = ? AND source = ?', orderId, 'website');
  }
  if (!order) {
    order = await db.get('SELECT id, number FROM orders WHERE number = ?', param);
  }
  
  if (!order) {
    res.status(404).json({ message: 'Order not found' });
    return;
  }

  const currentDate = new Date().toISOString();
  await db.run('UPDATE orders SET userId = ?, created_at = ? WHERE id = ?', userId, currentDate, order.id);
  res.json({ success: true, message: 'Order reassigned successfully' });
}));

// Order files routes
router.get('/:id/files', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const db = await getDb()
  const rows = await db.all<any>(
    'SELECT id, orderId, orderItemId, filename, originalName, mime, size, uploadedAt, approved, approvedAt, approvedBy FROM order_files WHERE orderId = ? ORDER BY (orderItemId IS NULL), orderItemId, id DESC',
    id
  )
  res.json(rows)
}))

// Скачивание файла с правильным именем (кириллица), отдача целиком с Content-Length
router.get('/:id/files/:fileId/download', asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id)
  const fileId = Number(req.params.fileId)
  const db = await getDb()
  const row = await db.get<any>(
    'SELECT filename, originalName, mime FROM order_files WHERE id = ? AND orderId = ?',
    fileId,
    orderId
  )
  if (!row || !row.filename) {
    res.status(404).json({ message: 'Файл не найден' })
    return
  }
  const filePath = path.join(uploadsDir, String(row.filename))
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ message: 'Файл не найден на диске' })
    return
  }
  const buffer = fs.readFileSync(filePath)
  const displayName = (row.originalName || row.filename).trim() || row.filename
  res.setHeader('Content-Disposition', `attachment; filename="${displayName.replace(/"/g, '%22')}"; filename*=UTF-8''${encodeURIComponent(displayName)}`)
  res.setHeader('Content-Length', String(buffer.length))
  if (row.mime) res.setHeader('Content-Type', row.mime)
  res.send(buffer)
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
    'SELECT id, orderId, orderItemId, filename, originalName, mime, size, uploadedAt, approved, approvedAt, approvedBy FROM order_files WHERE id = ? AND orderId = ?',
    fileId,
    orderId
  )
  res.json(row)
}))

// Выдать заказ: 100% остатка → предоплата, debt_closed_events, статус 4. Учёт в отчёте и счётчиках принтеров по дате выдачи.
// Заказ не переносится выдавшему: сдельная остаётся у создателя; «долги закрыты» учитываются у выдавшего.
router.post('/:id/issue', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const authUser = (req as any).user as { id: number } | undefined
  const issuerId = authUser?.id ?? null
  const db = await getDb()
  const order = await db.get<any>('SELECT id, prepaymentAmount, discount_percent FROM orders WHERE id = ?', id)
  if (!order) { res.status(404).json({ message: 'Заказ не найден' }); return }
  const items = await db.all<any>('SELECT price, quantity FROM items WHERE orderId = ?', id)
  const subtotal = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0)
  const discount = Number(order.discount_percent) || 0
  const total = Math.round((1 - discount / 100) * subtotal * 100) / 100
  const prepay = Number(order.prepaymentAmount ?? 0)
  const remainder = Math.round((total - prepay) * 100) / 100

  let hasPrepaymentUpdatedAt = false
  try { hasPrepaymentUpdatedAt = await hasColumn('orders', 'prepaymentUpdatedAt') } catch { /* ignore */ }

  const paymentId = `ISSUE-${Date.now()}-${id}`
  // datetime('now','localtime') — чтобы заказ попадал в «Выданные заказы» за текущий день (SQLite datetime('now') = UTC).
  const updateSql = hasPrepaymentUpdatedAt
    ? 'UPDATE orders SET prepaymentAmount = ?, prepaymentStatus = \'paid\', paymentUrl = NULL, paymentId = ?, paymentMethod = \'offline\', prepaymentUpdatedAt = datetime(\'now\',\'localtime\'), updated_at = datetime(\'now\',\'localtime\'), status = 4 WHERE id = ?'
    : 'UPDATE orders SET prepaymentAmount = ?, prepaymentStatus = \'paid\', paymentUrl = NULL, paymentId = ?, paymentMethod = \'offline\', updated_at = datetime(\'now\',\'localtime\'), status = 4 WHERE id = ?'
  await db.run(updateSql, total, paymentId, id)

  // Всегда пишем debt_closed_events при выдаче (в т.ч. remainder=0), чтобы выдавший видел заказ во вкладке «Выданные заказы».
  // Дата выдачи — локальная дата сервера (toISOString() даёт UTC и сдвигает день).
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  try {
    let hasIssuedBy = false
    try { hasIssuedBy = await hasColumn('debt_closed_events', 'issued_by_user_id') } catch { /* ignore */ }
    if (hasIssuedBy) {
      await db.run(
        'INSERT INTO debt_closed_events (order_id, closed_date, amount, issued_by_user_id) VALUES (?, ?, ?, ?)',
        id,
        today,
        remainder,
        issuerId
      )
    } else {
      await db.run(
        'INSERT INTO debt_closed_events (order_id, closed_date, amount) VALUES (?, ?, ?)',
        id,
        today,
        remainder
      )
    }
  } catch (e) {
    console.warn('[issue] debt_closed_events insert failed:', (e as Error)?.message)
  }

  const updated = await db.get<any>('SELECT * FROM orders WHERE id = ?', id)
  res.json(updated)
}))

// Prepayment routes — любой авторизованный пользователь может вносить предоплату / закрывать долг по любому заказу (в т.ч. коллег)
router.post('/:id/prepay', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const db = await getDb()
  const order = await db.get<any>('SELECT * FROM orders WHERE id = ?', id)
  if (!order) { res.status(404).json({ message: 'Заказ не найден' }); return }
  let hasPrepaymentUpdatedAt = false
  try {
    hasPrepaymentUpdatedAt = await hasColumn('orders', 'prepaymentUpdatedAt')
  } catch {
    hasPrepaymentUpdatedAt = false
  }
  const rawAmount = (req.body as any)?.amount
  const wantsClear = rawAmount === 0 || rawAmount === '0' || rawAmount === '' || rawAmount === null
  if (wantsClear) {
    const clearSql = hasPrepaymentUpdatedAt
      ? `UPDATE orders
           SET prepaymentAmount = NULL,
               prepaymentStatus = NULL,
               paymentUrl = NULL,
               paymentId = NULL,
               paymentMethod = NULL,
               prepaymentUpdatedAt = datetime('now'),
               updated_at = datetime('now')
         WHERE id = ?`
      : `UPDATE orders
           SET prepaymentAmount = NULL,
               prepaymentStatus = NULL,
               paymentUrl = NULL,
               paymentId = NULL,
               paymentMethod = NULL,
               updated_at = datetime('now')
         WHERE id = ?`
    await db.run(clearSql, id)
    const updated = await db.get<any>('SELECT * FROM orders WHERE id = ?', id)
    res.json(updated)
    return
  }

  const amount = Number(rawAmount ?? order.prepaymentAmount ?? 0)
  const paymentMethod = (req.body as any)?.paymentMethod ?? 'online'
  if (!amount || amount <= 0) { res.status(400).json({ message: 'Сумма предоплаты не задана' }); return }

  // BePaid integration stub: normally create payment via API and get redirect url
  const paymentId = `BEP-${Date.now()}-${id}`
  const paymentUrl = paymentMethod === 'online' ? `https://checkout.bepaid.by/redirect/${paymentId}` : null
  const prepaymentStatus = paymentMethod === 'offline' ? 'paid' : 'pending'

  const assignToMe = (req.body as any)?.assignToMe === true || (req.body as any)?.assignToMe === 'true'
  const authUser = (req as any).user as { id: number } | undefined
  if (assignToMe && authUser?.id) {
    await db.run('UPDATE orders SET userId = ?, updated_at = datetime(\'now\') WHERE id = ?', authUser.id, id)
  }

  const updateSql = hasPrepaymentUpdatedAt
    ? 'UPDATE orders SET prepaymentAmount = ?, prepaymentStatus = ?, paymentUrl = ?, paymentId = ?, paymentMethod = ?, prepaymentUpdatedAt = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?'
    : 'UPDATE orders SET prepaymentAmount = ?, prepaymentStatus = ?, paymentUrl = ?, paymentId = ?, paymentMethod = ?, updated_at = datetime(\'now\') WHERE id = ?'
  await db.run(updateSql, amount, prepaymentStatus, paymentUrl, paymentId, paymentMethod, id)

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
