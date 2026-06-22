import { Router } from 'express'
import { OrderController } from '../modules/orders/controllers/orderController'
import { OrderItemController } from '../modules/orders/controllers/orderItemController'
import { asyncHandler, authenticate } from '../middleware'
import { requireWebsiteOrderApiKey, isWebsiteOrderApiKeyValid } from '../middleware/websiteOrderApiKey'
import { upload, uploadMemory, uploadOrderFilesMemory, saveBufferToOrderFiles, orderFilesDir, uploadsDir, resolveSafeExistingPath, resolveSafeFilePath } from '../config/upload'
import { getDb } from '../config/database'
import { PDFReportService } from '../services/pdfReportService'
import { hasColumn } from '../utils/tableSchemaCache'
import { getLastWebsiteOrderAt } from '../utils/poolSync'
import { cleanupOldOrderFiles } from '../services/orderFilesCleanupService'
import { runPreflight, parseTargetFormatFromParams } from '../services/preflightService'
import { OrderService } from '../modules/orders/services/orderService'
import { sendOrderSmsManual } from '../services/orderStatusSmsService'
import { EarningsService } from '../services/earningsService'
import { registerExternalOrderFiles, updateExternalOrderFile } from '../services/externalOrderFilesService'
import { buildEditorProductionManifest } from '../services/editorProductionExportService'
import {
  enqueueClientRenderedProductionIfReady,
  getProductionStatus,
  requestManualProductionRegeneration,
} from '../services/editorProductionJobService'

const router = Router()

function sanitizeOrderFileForClient(row: any): any {
  if (!row || !row.storage || row.storage === 'local') return row
  const { externalUrl, externalKey, externalBucket, metadata, ...safe } = row
  return {
    ...safe,
    hasExternalUrl: Boolean(externalUrl),
    hasExternalKey: Boolean(externalKey),
    hasExternalBucket: Boolean(externalBucket),
    hasExternalMetadata: Boolean(metadata),
  }
}

async function logOrderFileAccess(
  db: any,
  req: any,
  input: { orderId: number; fileId: number; action: 'download' | 'external_link'; storage?: string | null }
): Promise<void> {
  const user = req.user as { id?: number } | undefined
  try {
    await db.run(
      `INSERT INTO order_file_access_logs (orderId, fileId, userId, action, storage, ip, userAgent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      input.orderId,
      input.fileId,
      user?.id ?? null,
      input.action,
      input.storage ?? null,
      req.ip ?? null,
      req.get?.('User-Agent') ?? null
    )
  } catch (error) {
    console.error('order_file_access_logs insert failed', error)
  }
}

/** payment_channel='internal' когда is_internal=1 (для API) */
function orderForApi(order: any): any {
  if (!order) return order
  return order.is_internal ? { ...order, payment_channel: 'internal' } : order
}

/**
 * @swagger
 * /api/orders/from-website:
 *   post:
 *     summary: Создать заказ с сайта (публичный API)
 *     description: |
 *       Публичный эндпоинт для приёма заказов с внешнего сайта. Не требует JWT CRM.
 *       Авторизация по websiteApiKey (X-API-Key или Authorization Bearer).
 *       Заказ создаётся с source=website, userId=null и попадает в пул заказов (unassigned).
 *       Переменная окружения WEBSITE_ORDER_API_KEY. Если не задана — эндпоинт возвращает 503.
 *       POST /api/orders/from-website/with-files (multipart/form-data): те же поля.
 *       Позиции из клиентского редактора: params.editorDraftToken (+ designTemplateId).
 *       Группа открыток: params.editorLayoutGroup.slots[] с разными editorDraftToken.
 *       delivery — способ получения (самовывоз, курьер, Белпочта и т.д.); см. WebsiteOrderDelivery.
 *     tags: [Orders, Client Editor]
 *     security:
 *       - websiteApiKey: []
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
 *               delivery:
 *                 $ref: '#/components/schemas/WebsiteOrderDelivery'
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
 *                       oneOf:
 *                         - type: string
 *                           description: JSON-строка; парсится в объект (все поля сохраняются в позиции)
 *                         - $ref: '#/components/schemas/WebsiteOrderItemParams'
 *                     price:
 *                       type: number
 *                     quantity:
 *                       type: integer
 *             example:
 *               customerName: Иван Иванов
 *               customerPhone: "+375 29 123 45 67"
 *               delivery:
 *                 kind: pickup
 *                 providerId: pickup-dzerzhinsky-3b
 *                 label: Проспект Дзержинского 3б
 *                 cost: 0
 *               items:
 *                 - type: "58"
 *                   description: Визитки
 *                   quantity: 100
 *                   price: 25
 *                   params:
 *                     editorDraftToken: draft_secret_token_from_bff
 *                     designTemplateId: 321
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
router.post('/from-website/with-files', requireWebsiteOrderApiKey, uploadOrderFilesMemory.any(), asyncHandler(OrderController.createOrderFromWebsiteWithFiles))

/** Актуальный статус website-заказа для личного кабинета (pull-синхронизация на localhost). */
router.get('/from-website/:orderId/status', requireWebsiteOrderApiKey, asyncHandler(OrderController.getWebsiteOrderStatus))
router.post(
  '/from-website/confirm-prepayment',
  requireWebsiteOrderApiKey,
  asyncHandler(OrderController.confirmWebsiteOrderPrepayment)
)
router.post(
  '/from-website/:orderId/confirm-prepayment',
  requireWebsiteOrderApiKey,
  asyncHandler(OrderController.confirmWebsiteOrderPrepayment)
)

// Загрузка файлов к заказу с сайта (тот же API-ключ; только заказы с source=website)
router.post('/from-website/:orderId/files', requireWebsiteOrderApiKey, uploadOrderFilesMemory.single('file'), asyncHandler(async (req, res) => {
  const orderId = Number(req.params.orderId)
  const f = (req as any).file as { buffer?: Buffer; originalname?: string; mimetype?: string } | undefined
  if (!f) {
    res.status(400).json({ message: 'Файл не получен' })
    return
  }
  const saved = saveBufferToOrderFiles(f.buffer, (f as any).originalname ?? (f as any).originalName)
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
}, uploadOrderFilesMemory.single('file'), asyncHandler(async (req, res) => {
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
  const saved = saveBufferToOrderFiles(buf, (f as any).originalname ?? (f as any).originalName)
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
  const artifactType = typeof (req.body as any)?.artifactType === 'string'
    ? String((req.body as any).artifactType).trim()
    : ''
  const checksum = typeof (req.body as any)?.checksum === 'string'
    ? String((req.body as any).checksum).trim()
    : ''
  const partNumberRaw = (req.body as any)?.partNumber
  const partNumber = partNumberRaw != null && partNumberRaw !== ''
    ? Number(partNumberRaw)
    : null
  const metadata = typeof (req.body as any)?.metadata === 'string'
    ? String((req.body as any).metadata)
    : null
  await db.run(
    `INSERT INTO order_files (
      orderId, orderItemId, filename, originalName, mime, size, artifactType, checksum, partNumber, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    orderId,
    orderItemId,
    saved.filename,
    saved.originalName,
    f.mimetype || null,
    saved.size,
    artifactType || null,
    checksum || null,
    Number.isFinite(partNumber) ? partNumber : null,
    metadata
  )
  const row = await db.get<any>(
    `SELECT id, orderId, orderItemId, filename, originalName, mime, size, uploadedAt,
      approved, approvedAt, approvedBy, artifactType, checksum, partNumber, metadata
     FROM order_files WHERE orderId = ? ORDER BY id DESC LIMIT 1`,
    orderId
  )
  if (artifactType === 'client_rendered_page' && orderItemId != null) {
    await enqueueClientRenderedProductionIfReady(orderId, orderItemId)
  }
  res.status(201).json(row)
}))

/**
 * @swagger
 * /api/orders/{orderId}/external-files:
 *   post:
 *     summary: Зарегистрировать внешние файлы заказа (S3/object storage)
 *     description: |
 *       Используется для тяжёлых файлов сайта: JPG/PDF уже загружены в S3/object storage,
 *       а CRM получает только метаданные. Файл телом запроса не передаётся.
 *       По WEBSITE_ORDER_API_KEY разрешено только для заказов с source=website.
 *       Регистрация идемпотентна по key, а если key не передан — по url.
 *       Обычный список файлов CRM не раскрывает url/key/bucket.
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID заказа в CRM
 *       - in: header
 *         name: X-API-Key
 *         schema:
 *           type: string
 *         required: false
 *         description: API-ключ сайта. Альтернатива для backend сайта — Authorization Bearer <WEBSITE_ORDER_API_KEY>. CRM-пользователь может использовать JWT.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 properties:
 *                   files:
 *                     type: array
 *                     items:
 *                       $ref: '#/components/schemas/ExternalOrderFileInput'
 *               - $ref: '#/components/schemas/ExternalOrderFileInput'
 *           examples:
 *             readyPdf:
 *               summary: Готовая часть PDF на SRA3
 *               value:
 *                 storage: s3
 *                 provider: s3
 *                 bucket: site-orders
 *                 key: orders/4745/production/sra3-part-001.pdf
 *                 url: https://signed-url.example/...
 *                 filename: 4745-sra3-part-001.pdf
 *                 mime: application/pdf
 *                 size: 734003200
 *                 status: ready
 *                 artifactType: sra3_pdf
 *                 partNumber: 1
 *                 checksum: sha256:...
 *             processing:
 *               summary: Файл ещё готовится
 *               value:
 *                 storage: s3
 *                 provider: s3
 *                 bucket: site-orders
 *                 key: orders/4745/production/sra3-part-001.pdf
 *                 filename: 4745-sra3-part-001.pdf
 *                 status: processing
 *                 artifactType: sra3_pdf
 *                 partNumber: 1
 *     responses:
 *       201:
 *         description: Внешние файлы зарегистрированы или обновлены
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 files:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ExternalOrderFile'
 *       400:
 *         description: Ошибка валидации payload или orderItemId
 *       401:
 *         description: Нет CRM JWT или неверный WEBSITE_ORDER_API_KEY
 *       403:
 *         description: API-ключ сайта использован для заказа не с source=website
 *       404:
 *         description: Заказ не найден
 */
// Регистрация внешних файлов заказа: сайт кладёт JPG/PDF в S3 и сообщает CRM метаданные.
router.post('/:id/external-files', (req, res, next) => {
  if (isWebsiteOrderApiKeyValid(req)) {
    (req as any).fromWebsite = true
    return next()
  }
  return authenticate(req, res, next)
}, asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id)
  if (!Number.isFinite(orderId)) {
    res.status(400).json({ message: 'Некорректный orderId' })
    return
  }

  const body = req.body || {}
  const files = Array.isArray(body.files) ? body.files : [body]
  if (files.length === 0) {
    res.status(400).json({ message: 'Передайте files[] или один объект файла' })
    return
  }

  const registered = await registerExternalOrderFiles({
    orderId,
    files,
    requireWebsiteSource: Boolean((req as any).fromWebsite),
  })

  res.status(201).json({ files: registered.map(sanitizeOrderFileForClient) })
}))

/**
 * @swagger
 * /api/orders/{orderId}/external-files/{fileId}:
 *   patch:
 *     summary: Обновить внешний файл заказа
 *     description: |
 *       Используется для перехода processing -> ready/failed.
 *       Например backend сайта сначала регистрирует будущий PDF, затем после загрузки в S3 передаёт signed URL, размер и checksum.
 *       По WEBSITE_ORDER_API_KEY разрешено только для заказов с source=website.
 *     tags: [Orders]
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: header
 *         name: X-API-Key
 *         schema:
 *           type: string
 *         required: false
 *         description: API-ключ сайта или CRM JWT в Authorization
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ExternalOrderFileInput'
 *           examples:
 *             ready:
 *               summary: Файл готов
 *               value:
 *                 url: https://signed-url.example/...
 *                 size: 734003200
 *                 status: ready
 *                 checksum: sha256:...
 *             failed:
 *               summary: Генерация упала
 *               value:
 *                 status: failed
 *                 metadata:
 *                   error: PDF render failed
 *     responses:
 *       200:
 *         description: Файл обновлён
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExternalOrderFile'
 *       400:
 *         description: Некорректный запрос или файл не является внешним
 *       403:
 *         description: API-ключ сайта использован для заказа не с source=website
 *       404:
 *         description: Заказ или файл не найден
 */
// Обновление внешнего файла: сайт может сначала зарегистрировать processing, потом ready/failed.
router.patch('/:id/external-files/:fileId', (req, res, next) => {
  if (isWebsiteOrderApiKeyValid(req)) {
    (req as any).fromWebsite = true
    return next()
  }
  return authenticate(req, res, next)
}, asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id)
  const fileId = Number(req.params.fileId)
  if (!Number.isFinite(orderId) || !Number.isFinite(fileId)) {
    res.status(400).json({ message: 'Некорректный orderId или fileId' })
    return
  }

  const file = await updateExternalOrderFile({
    orderId,
    fileId,
    data: req.body || {},
    requireWebsiteSource: Boolean((req as any).fromWebsite),
  })

  res.json(sanitizeOrderFileForClient(file))
}))

// Все остальные маршруты заказов требуют аутентификации
router.use(authenticate)

/** Лёгкий эндпоинт для CRM: при обращении к orderpool API с сайта (printcore.by) значение меняется — страница Order Pool принудительно обновляет список */
router.get('/pool-sync', (_req, res) => {
  res.json({ lastWebsiteOrderAt: getLastWebsiteOrderAt() })
})

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
router.put('/:id/payment-channel', asyncHandler(OrderController.updateOrderPaymentChannel))
router.put('/:id/notes', asyncHandler(OrderController.updateOrderNotes))
router.put('/:id/assignees', asyncHandler(OrderController.updateOrderAssignees))
router.get('/:id/activity', asyncHandler(OrderController.getOrderActivity))
router.delete('/:id', asyncHandler(OrderController.deleteOrder))
router.post('/:id/duplicate', asyncHandler(OrderController.duplicateOrder))
router.post('/:id/cancel-online', asyncHandler(OrderController.cancelOnline))

// Bulk operations
router.post('/bulk/update-status', asyncHandler(OrderController.bulkUpdateStatus))
router.post('/bulk/delete', asyncHandler(OrderController.bulkDeleteOrders))
router.post('/cleanup-old-files', authenticate, asyncHandler(async (_req, res) => {
  const result = await cleanupOldOrderFiles()
  res.json({ success: true, ...result })
}))

// Export
router.get('/export', asyncHandler(OrderController.exportOrders))

// PDF бланк товарного чека (пустая форма, без заказа). ?organization_id=1 — для выбора организации
router.get('/commodity-receipt-blank-pdf', asyncHandler(async (req, res) => {
  try {
    const orgId = req.query.organization_id != null ? Number(req.query.organization_id) : undefined;
    const pdfBuffer = await PDFReportService.generateCommodityReceiptBlank(orgId);
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

router.get('/:id/pricing-groups', authenticate, asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id)
  if (!Number.isFinite(orderId) || orderId <= 0) {
    res.status(400).json({ error: 'Некорректный ID заказа' })
    return
  }
  const { OrderPricingService } = await import('../modules/orders/services/orderPricingService')
  const groups = await OrderPricingService.getPricingGroupsForOrder(orderId)
  res.json({ success: true, groups })
}))

router.post('/:id/recalculate-prices', authenticate, asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id)
  if (!Number.isFinite(orderId) || orderId <= 0) {
    res.status(400).json({ error: 'Некорректный ID заказа' })
    return
  }
  const { OrderPricingService } = await import('../modules/orders/services/orderPricingService')
  const result = await OrderPricingService.recalculateOrderPrices(orderId)
  res.json({ success: true, ...result })
}))

// Order items routes
router.post('/:id/items', asyncHandler(OrderItemController.addItem))
router.delete('/:orderId/items/:itemId', asyncHandler(OrderItemController.deleteItem))
router.patch('/:orderId/items/:itemId', asyncHandler(OrderItemController.updateItem))

// Переназначение по номеру (ORD-*, site-ord-*, tg-ord-*). Для tg-ord — photo_orders, без UPDATE orders с тем же id
router.post('/reassign/:number', asyncHandler(async (req, res) => {
  const param = req.params.number;
  const { userId } = req.body;
  const authUser = (req as any).user as { id?: number } | undefined;
  
  if (!userId) {
    res.status(400).json({ message: 'userId is required' });
    return;
  }
  const targetUserId = Number(userId);
  if (!Number.isFinite(targetUserId)) {
    res.status(400).json({ message: 'userId must be a number' });
    return;
  }
  const result = await OrderService.reassignOrderByNumber(param, targetUserId, authUser?.id);
  if (/^tg-ord-/i.test(String(param).trim())) {
    res.json({ success: true, message: 'Order reassigned successfully' });
    return;
  }
  const db = await getDb();
  const preDay = await OrderService.shiftOrderToAssignmentDay(result.id);

  const hasResponsible = await hasColumn('orders', 'responsible_user_id').catch(() => false);
  const hasUpdatedAtSnake = await hasColumn('orders', 'updated_at').catch(() => false);
  const hasUpdatedAt = await hasColumn('orders', 'updatedAt').catch(() => false);
  if (hasResponsible) {
    if (hasUpdatedAtSnake) {
      await db.run('UPDATE orders SET responsible_user_id = ?, updated_at = datetime(\'now\') WHERE id = ?', targetUserId, result.id);
    } else if (hasUpdatedAt) {
      await db.run('UPDATE orders SET responsible_user_id = ?, updatedAt = datetime(\'now\') WHERE id = ?', targetUserId, result.id);
    } else {
      await db.run('UPDATE orders SET responsible_user_id = ? WHERE id = ?', targetUserId, result.id);
    }
  }
  try {
    await EarningsService.recalculateEarningsForOrderDays({
      orderId: result.id,
      orderCreatedDateBeforeUpdate: preDay,
    });
  } catch (e) {
    console.error('Earnings recalc after reassign failed', e);
  }
  res.json({ success: true, message: 'Order reassigned successfully' });
}));

// Возврат заказа в пул без отмены: снимаем ответственного, но не помечаем заказ отменённым.
router.post('/unassign/:number', asyncHandler(async (req, res) => {
  const param = req.params.number;
  const authUser = (req as any).user as { id?: number } | undefined;
  const result = await OrderService.unassignOrderByNumber(param, authUser?.id);
  if (!/^tg-ord-/i.test(String(param).trim())) {
    try {
      await EarningsService.recalculateEarningsForOrderDays({ orderId: result.id });
    } catch (e) {
      console.error('Earnings recalc after unassign failed', e);
    }
  }
  res.json({ success: true, message: 'Order returned to pool successfully' });
}));

// Order files routes
router.get('/:id/files', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const db = await getDb()
  const rows = await db.all<any>(
    `SELECT id, orderId, orderItemId, filename, originalName, mime, size, uploadedAt, approved, approvedAt, approvedBy,
      storage, externalProvider, externalBucket, externalKey, externalUrl, externalStatus, artifactType, checksum, partNumber, metadata
     FROM order_files WHERE orderId = ? ORDER BY (orderItemId IS NULL), orderItemId, id DESC`,
    id
  )
  res.json(rows.map(sanitizeOrderFileForClient))
}))

router.get('/:id/items/:itemId/editor-production-manifest', asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id)
  const orderItemId = Number(req.params.itemId)
  if (!Number.isFinite(orderId) || !Number.isFinite(orderItemId)) {
    res.status(400).json({ message: 'Некорректный orderId или itemId' })
    return
  }
  try {
    const manifest = await buildEditorProductionManifest(orderId, orderItemId)
    res.json(manifest)
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Не удалось подготовить production manifest' })
  }
}))

router.get('/:id/items/:itemId/production-status', authenticate, asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id)
  const orderItemId = Number(req.params.itemId)
  if (!Number.isFinite(orderId) || !Number.isFinite(orderItemId)) {
    res.status(400).json({ message: 'Некорректный orderId или itemId' })
    return
  }
  const status = await getProductionStatus(orderId, orderItemId)
  res.json(status)
}))

router.post('/:id/items/:itemId/generate-production', authenticate, asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id)
  const orderItemId = Number(req.params.itemId)
  if (!Number.isFinite(orderId) || !Number.isFinite(orderItemId)) {
    res.status(400).json({ message: 'Некорректный orderId или itemId' })
    return
  }
  const job = await requestManualProductionRegeneration(orderId, orderItemId)
  res.status(202).json({ jobId: job.jobId, message: 'Production export поставлен в очередь' })
}))

// Скачивание файла с правильным именем (кириллица), отдача целиком с Content-Length
router.get('/:id/files/:fileId/download', asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id)
  const fileId = Number(req.params.fileId)
  const db = await getDb()
  const row = await db.get<any>(
    'SELECT filename, originalName, mime, storage, externalUrl, externalKey FROM order_files WHERE id = ? AND orderId = ?',
    fileId,
    orderId
  )
  if (!row || !row.filename) {
    res.status(404).json({ message: 'Файл не найден' })
    return
  }
  if (row.storage && row.storage !== 'local') {
    if (row.externalUrl) {
      await logOrderFileAccess(db, req, { orderId, fileId, action: 'external_link', storage: row.storage })
      res.redirect(302, String(row.externalUrl))
      return
    }
    res.status(409).json({
      message: 'Файл хранится во внешнем хранилище, но download URL не зарегистрирован',
      storage: row.storage,
    })
    return
  }
  const filePath = resolveSafeExistingPath([orderFilesDir, uploadsDir], String(row.filename))
  if (!filePath) {
    res.status(404).json({ message: 'Файл не найден на диске' })
    return
  }
  const fs = await import('fs')
  const buffer = fs.readFileSync(filePath)
  const displayName = (row.originalName || row.filename).trim() || row.filename
  res.setHeader('Content-Disposition', `attachment; filename="${displayName.replace(/"/g, '%22')}"; filename*=UTF-8''${encodeURIComponent(displayName)}`)
  res.setHeader('Content-Length', String(buffer.length))
  if (row.mime) res.setHeader('Content-Type', row.mime)
  await logOrderFileAccess(db, req, { orderId, fileId, action: 'download', storage: 'local' })
  res.send(buffer)
}))

/**
 * @swagger
 * /api/orders/{orderId}/files/{fileId}/external-link:
 *   get:
 *     summary: Получить signed URL внешнего файла
 *     description: |
 *       Возвращает ссылку на внешний файл только по явному авторизованному действию "Скачать".
 *       Обычный список файлов не раскрывает url/key/bucket.
 *       WEBSITE_ORDER_API_KEY не даёт доступ к этому endpoint — нужен CRM JWT.
 *       Каждая выдача ссылки пишется в order_file_access_logs.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Signed URL для скачивания
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   format: uri
 *       400:
 *         description: Файл локальный, используйте download endpoint
 *       401:
 *         description: Не авторизован в CRM
 *       404:
 *         description: Файл не найден
 *       409:
 *         description: Файл ещё не готов или ссылка не зарегистрирована
 */
// Получить внешнюю ссылку только по явному действию "Скачать".
// В обычном списке файлов URL/key не раскрываем.
router.get('/:id/files/:fileId/external-link', asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id)
  const fileId = Number(req.params.fileId)
  const db = await getDb()
  const row = await db.get<any>(
    'SELECT storage, externalUrl, externalStatus FROM order_files WHERE id = ? AND orderId = ?',
    fileId,
    orderId
  )
  if (!row) {
    res.status(404).json({ message: 'Файл не найден' })
    return
  }
  if (!row.storage || row.storage === 'local') {
    res.status(400).json({ message: 'Файл хранится локально в CRM' })
    return
  }
  if (row.externalStatus && row.externalStatus !== 'ready') {
    res.status(409).json({ message: `Файл ещё не готов: ${row.externalStatus}` })
    return
  }
  if (!row.externalUrl) {
    res.status(409).json({ message: 'Внешняя ссылка для скачивания не зарегистрирована' })
    return
  }
  await logOrderFileAccess(db, req, { orderId, fileId, action: 'external_link', storage: row.storage })
  res.json({ url: row.externalUrl })
}))

/**
 * @swagger
 * /api/orders/{orderId}/files/{fileId}/access-logs:
 *   get:
 *     summary: Журнал скачиваний файла заказа
 *     description: |
 *       Админский endpoint для аудита доступа к файлам клиента.
 *       Показывает скачивания локальных файлов и выдачу внешних ссылок.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Последние 100 событий доступа к файлу
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/OrderFileAccessLog'
 *       401:
 *         description: Не авторизован в CRM
 *       403:
 *         description: Только для администратора
 */
router.get('/:id/files/:fileId/access-logs', asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id)
  const fileId = Number(req.params.fileId)
  const user = (req as any).user as { role?: string } | undefined
  if (user?.role !== 'admin') {
    res.status(403).json({ message: 'Доступ к журналу скачиваний только для администратора' })
    return
  }

  const db = await getDb()
  const rows = await db.all<any>(
    `SELECT l.id, l.orderId, l.fileId, l.userId, u.name as userName, u.email as userEmail,
      l.action, l.storage, l.ip, l.userAgent, l.createdAt
     FROM order_file_access_logs l
     LEFT JOIN users u ON u.id = l.userId
     WHERE l.orderId = ? AND l.fileId = ?
     ORDER BY l.id DESC
     LIMIT 100`,
    orderId,
    fileId
  )
  res.json(rows)
}))

// Префлайт: проверка макета (PDF, JPG, PNG, TIFF)
router.get('/:id/files/:fileId/preflight', asyncHandler(async (req, res) => {
  const orderId = Number(req.params.id)
  const fileId = Number(req.params.fileId)
  const db = await getDb()
  const row = await db.get<any>(
    'SELECT filename, mime, orderItemId, storage FROM order_files WHERE id = ? AND orderId = ?',
    fileId,
    orderId
  )
  if (!row || !row.filename) {
    res.status(404).json({ message: 'Файл не найден' })
    return
  }
  if (row.storage && row.storage !== 'local') {
    res.status(409).json({ message: 'Префлайт внешних файлов пока недоступен: файл не хранится на диске CRM' })
    return
  }
  let targetFormat: { width_mm: number; height_mm: number } | null = null
  if (row.orderItemId != null) {
    const item = await db.get<{ params: string }>('SELECT params FROM items WHERE id = ? AND orderId = ?', row.orderItemId, orderId)
    if (item?.params) {
      let params: unknown
      try {
        params = typeof item.params === 'string' ? JSON.parse(item.params) : item.params
      } catch {
        params = null
      }
      targetFormat = parseTargetFormatFromParams(params)
    }
  }
  const report = await runPreflight(String(row.filename), row.mime || null, targetFormat)
  res.json(report)
}))

router.delete('/:orderId/files/:fileId', asyncHandler(async (req, res) => {
  const orderId = Number(req.params.orderId)
  const fileId = Number(req.params.fileId)
  const fs = await import('fs')
  const db = await getDb()
  const row = await db.get<any>('SELECT filename FROM order_files WHERE id = ? AND orderId = ?', fileId, orderId)
  if (row && row.filename) {
    for (const dir of [orderFilesDir, uploadsDir]) {
      const p = resolveSafeFilePath(dir, String(row.filename))
      if (!p) continue
      try { fs.unlinkSync(p); break } catch {}
    }
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
    `SELECT id, orderId, orderItemId, filename, originalName, mime, size, uploadedAt, approved, approvedAt, approvedBy,
      storage, externalProvider, externalBucket, externalKey, externalUrl, externalStatus, artifactType, checksum, partNumber, metadata
     FROM order_files WHERE id = ? AND orderId = ?`,
    fileId,
    orderId
  )
  res.json(sanitizeOrderFileForClient(row))
}))

// Выдать заказ: 100% остатка → предоплата, debt_closed_events, статус 7. Учёт в отчёте по дате выдачи.
// Счётчики принтеров при выдаче не меняем: клики считаются только в день добавления позиции (addItem, заказ не в первом статусе).
// Заказ не переносится выдавшему: сдельная остаётся у создателя; «долги закрыты» учитываются у выдавшего.
router.post('/:id/issue', asyncHandler(async (req, res) => {
  const id = Number(req.params.id)
  const authUser = (req as any).user as { id: number } | undefined
  const issuerId = authUser?.id ?? null
  const db = await getDb()
  const order = await db.get<any>('SELECT id, status, prepaymentAmount, discount_percent FROM orders WHERE id = ?', id)
  if (!order) { res.status(404).json({ message: 'Заказ не найден' }); return }
  if (Number(order.status) === 7) {
    const updated = await db.get<any>('SELECT * FROM orders WHERE id = ?', id)
    res.json(orderForApi(updated))
    return
  }
  const amounts = await OrderService.getOrderAmountsById(id)
  const total = amounts.totalAmount
  const remainder = amounts.debt

  // Дата выдачи: из body.issued_on (дата, выбранная пользователем) или date('now','localtime').
  const bodyDate = (req.body as any)?.issued_on
  const isValidBodyDate = bodyDate && /^\d{4}-\d{2}-\d{2}$/.test(String(bodyDate).slice(0, 10))
  const today = isValidBodyDate
    ? String(bodyDate).slice(0, 10)
    : ((await db.get<{ d: string }>("SELECT date('now','localtime') as d"))?.d ?? new Date().toISOString().slice(0, 10)).slice(0, 10)

  let hasPrepaymentUpdatedAt = false
  try { hasPrepaymentUpdatedAt = await hasColumn('orders', 'prepaymentUpdatedAt') } catch { /* ignore */ }
  const paymentId = `ISSUE-${Date.now()}-${id}`
  // prepaymentUpdatedAt = дата выдачи (today), чтобы заказ попадал в отчёты по этой дате
  const issueDateTime = `${today} 12:00:00`
  if (hasPrepaymentUpdatedAt) {
    await db.run(
      'UPDATE orders SET prepaymentAmount = ?, prepaymentStatus = \'paid\', paymentUrl = NULL, paymentId = ?, paymentMethod = \'offline\', prepaymentUpdatedAt = ?, updated_at = ?, status = 7 WHERE id = ?',
      total, paymentId, issueDateTime, issueDateTime, id
    )
  } else {
    await db.run(
      'UPDATE orders SET prepaymentAmount = ?, prepaymentStatus = \'paid\', paymentUrl = NULL, paymentId = ?, paymentMethod = \'offline\', updated_at = ?, status = 7 WHERE id = ?',
      total, paymentId, issueDateTime, id
    )
  }

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
  res.json(orderForApi(updated))
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
  // Локальная дата/время: отчёты и счётчики режут prepaymentUpdatedAt по substr(...,1,10); datetime('now') в SQLite — UTC и даёт сдвиг дня.
  const todayRow = await db.get<{ d: string }>("SELECT date('now','localtime') as d")
  const todayLocal = (todayRow?.d ?? new Date().toISOString().slice(0, 10)).slice(0, 10)
  const prepaymentMoment = `${todayLocal} 12:00:00`

  const wantsClear = rawAmount === 0 || rawAmount === '0' || rawAmount === '' || rawAmount === null
  if (wantsClear) {
    const clearSql = hasPrepaymentUpdatedAt
      ? `UPDATE orders
           SET prepaymentAmount = NULL,
               prepaymentStatus = NULL,
               paymentUrl = NULL,
               paymentId = NULL,
               paymentMethod = NULL,
               prepaymentUpdatedAt = datetime('now','localtime'),
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
    res.json(orderForApi(updated))
    return
  }

  const amount = Number(rawAmount ?? order.prepaymentAmount ?? 0)
  const paymentMethod = (req.body as any)?.paymentMethod ?? 'offline'
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
    ? 'UPDATE orders SET prepaymentAmount = ?, prepaymentStatus = ?, paymentUrl = ?, paymentId = ?, paymentMethod = ?, prepaymentUpdatedAt = ?, updated_at = datetime(\'now\') WHERE id = ?'
    : 'UPDATE orders SET prepaymentAmount = ?, prepaymentStatus = ?, paymentUrl = ?, paymentId = ?, paymentMethod = ?, updated_at = datetime(\'now\') WHERE id = ?'
  if (hasPrepaymentUpdatedAt) {
    await db.run(updateSql, amount, prepaymentStatus, paymentUrl, paymentId, paymentMethod, prepaymentMoment, id)
  } else {
    await db.run(updateSql, amount, prepaymentStatus, paymentUrl, paymentId, paymentMethod, id)
  }

  const updated = await db.get<any>('SELECT * FROM orders WHERE id = ?', id)
  res.json(orderForApi(updated))
}))

/** Admin: ручная отправка SMS клиенту (8:30–20:00 Minsk, SMS_ENABLED) */
router.post('/:id/sms', asyncHandler(async (req, res) => {
  const user = (req as any).user as { role: string } | undefined
  if (!user || user.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden' })
    return
  }
  const id = Number(req.params.id)
  const { templateId, body } = (req.body || {}) as { templateId?: number; body?: string }
  const r = await sendOrderSmsManual({ orderId: id, templateId, body })
  if (!r.ok) {
    res.status('nextSendAt' in r && r.nextSendAt ? 409 : 400).json(r)
    return
  }
  res.json(r)
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
