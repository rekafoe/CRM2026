import { Router, Request, Response } from 'express'
import { getDb } from '../config/database'
import { orderFilesDir, resolveSafeExistingPath, uploadOrderFilesMemory } from '../config/upload'
import { asyncHandler, authenticate } from '../middleware'
import { requireWebsiteOrderApiKey } from '../middleware/websiteOrderApiKey'
import {
  addEditorDraftFile,
  EditorDraftRateLimitError,
  createEditorDraft,
  createEditorDraftFromOrderItem,
  finalizeEditorDraft,
  getEditorDraft,
  getEditorDraftFile,
  listEditorDraftFiles,
  updateEditorDraftPayload,
} from '../services/publicEditorDraftService'
import { cloneCustomerProjectToDraft } from '../services/customerProjectService'

const router = Router()

async function getPublicBranding(): Promise<{ logoUrl: string | null; organizationName: string | null }> {
  try {
    const db = await getDb()
    const row = await db.get<{ name: string | null; logo_url: string | null }>(
      `SELECT name, logo_url FROM organizations
       WHERE TRIM(COALESCE(logo_url, '')) != ''
       ORDER BY is_default DESC, sort_order ASC, id ASC
       LIMIT 1`,
    )
    return {
      logoUrl: row?.logo_url != null && String(row.logo_url).trim() ? String(row.logo_url).trim() : null,
      organizationName: row?.name != null && String(row.name).trim() ? String(row.name).trim() : null,
    }
  } catch {
    return { logoUrl: null, organizationName: null }
  }
}

function withDraftFileUrl<T extends { id: number | string; thumbFilename?: string | null }>(
  req: Request,
  token: string,
  file: T,
): T & { url: string; thumbUrl: string | null } {
  const fileId = encodeURIComponent(String(file.id))
  const base = `${req.baseUrl}/drafts/${encodeURIComponent(token)}/files/${fileId}`
  return {
    ...file,
    url: `${base}/content`,
    thumbUrl: file.thumbFilename ? `${base}/thumb` : null,
  }
}

function createDraftInput(body: Record<string, unknown>) {
  return {
    designTemplateId: body.designTemplateId != null ? Number(body.designTemplateId) : undefined,
    productId: body.productId != null ? Number(body.productId) : undefined,
    typeId: body.typeId != null ? Number(body.typeId) : undefined,
    sizeId: body.sizeId != null ? String(body.sizeId) : undefined,
    mode: body.mode != null ? String(body.mode) : undefined,
    payload: body.payload && typeof body.payload === 'object' ? body.payload as Record<string, unknown> : {},
  }
}

async function sendDraftFileContent(req: Request, res: Response): Promise<void> {
  const fileId = Number(req.params.fileId)
  if (!Number.isFinite(fileId)) {
    res.status(400).json({ message: 'Неверный ID файла' })
    return
  }
  const file = await getEditorDraftFile(req.params.token, fileId)
  const filePath = file ? resolveSafeExistingPath([orderFilesDir], file.filename) : null
  if (!file || !filePath) {
    res.status(404).json({ message: 'Файл не найден' })
    return
  }
  if (file.mime) res.type(file.mime)
  res.sendFile(filePath)
}

async function sendDraftFileThumb(req: Request, res: Response): Promise<void> {
  const fileId = Number(req.params.fileId)
  if (!Number.isFinite(fileId)) {
    res.status(400).json({ message: 'Неверный ID файла' })
    return
  }
  const file = await getEditorDraftFile(req.params.token, fileId)
  const filePath = file?.thumbFilename ? resolveSafeExistingPath([orderFilesDir], file.thumbFilename) : null
  if (!file || !filePath) {
    res.status(404).json({ message: 'Миниатюра не найдена' })
    return
  }
  res.type('image/jpeg')
  res.sendFile(filePath)
}

/**
 * @swagger
 * /api/public-editor/drafts/{token}/files/{fileId}/content:
 *   get:
 *     summary: Содержимое файла draft (для img в редакторе)
 *     description: Доступ по секретному token draft. JWT и API key не требуются.
 *     tags: [Client Editor]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Бинарное содержимое файла
 *       404:
 *         description: Файл не найден
 * /api/public-editor/drafts/{token}/files/{fileId}/thumb:
 *   get:
 *     summary: Миниатюра файла draft
 *     tags: [Client Editor]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: JPEG миниатюра
 *       404:
 *         description: Миниатюра не найдена
 */
/** Stable draft file URL for browser image rendering; token scopes file access. */
router.get('/drafts/:token/files/:fileId/content', asyncHandler(sendDraftFileContent))
router.get('/drafts/:token/files/:fileId/thumb', asyncHandler(sendDraftFileThumb))

/**
 * @swagger
 * /api/public-editor/branding:
 *   get:
 *     summary: Брендинг для оболочки редактора на сайте
 *     description: Логотип и название организации. Реквизиты не отдаются. API key не требуется.
 *     tags: [Client Editor]
 *     security: []
 *     responses:
 *       200:
 *         description: Брендинг
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PublicEditorBranding'
 */
/** Public branding for website/client editor shell. Does not expose requisites. */
router.get('/branding', asyncHandler(async (_req: Request, res: Response) => {
  res.json(await getPublicBranding())
}))

/** Authenticated CRM sandbox for debugging public editor flow without exposing WEBSITE_ORDER_API_KEY. */
router.post('/admin-preview/drafts', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const draft = await createEditorDraft(createDraftInput(req.body ?? {}))
  res.status(201).json(draft)
}))

router.get('/admin-preview/drafts/:token', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const draft = await getEditorDraft(req.params.token)
  if (!draft) {
    res.status(404).json({ message: 'Draft не найден' })
    return
  }
  res.json(draft)
}))

router.get('/admin-preview/drafts/:token/files', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const files = await listEditorDraftFiles(req.params.token)
  res.json(files.map((file) => withDraftFileUrl(req, req.params.token, file)))
}))

router.post('/admin-preview/from-order-item', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.body?.orderId)
    const orderItemId = Number(req.body?.orderItemId)
    if (!Number.isFinite(orderId) || !Number.isFinite(orderItemId)) {
      res.status(400).json({ message: 'Нужны корректные orderId и orderItemId' })
      return
    }
    const draft = await createEditorDraftFromOrderItem({ orderId, orderItemId })
    res.status(201).json(draft)
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Не удалось создать draft из позиции заказа' })
  }
}))

router.patch('/admin-preview/drafts/:token', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const draft = await updateEditorDraftPayload(req.params.token, req.body ?? {})
    res.json(draft)
  } catch (err: unknown) {
    res.status(err instanceof EditorDraftRateLimitError ? 429 : 409)
      .json({ message: err instanceof Error ? err.message : 'Не удалось сохранить draft' })
  }
}))

router.post(
  '/admin-preview/drafts/:token/files',
  authenticate,
  uploadOrderFilesMemory.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const file = await addEditorDraftFile(req.params.token, (req as any).file)
      res.status(201).json(withDraftFileUrl(req, req.params.token, file))
    } catch (err: unknown) {
      res.status(400).json({ message: err instanceof Error ? err.message : 'Не удалось загрузить файл draft' })
    }
  }),
)

router.post('/admin-preview/drafts/:token/finalize', authenticate, asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await finalizeEditorDraft(req.params.token, req.body ?? {})
    res.status(201).json(result)
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Не удалось финализировать draft' })
  }
}))

router.use(requireWebsiteOrderApiKey)

/**
 * @swagger
 * /api/public-editor/drafts:
 *   post:
 *     summary: Создать черновик редактора
 *     description: |
 *       Создаёт editor_drafts для клиента на сайте. Ответ содержит token — сохраните как editorDraftToken в корзине.
 *       Master designState обычно копируется клиентом из GET /api/design-templates/public/:id в payload при создании или первом PATCH.
 *       WEBSITE_ORDER_API_KEY на CRM; вызывать через BFF сайта.
 *     tags: [Client Editor]
 *     security:
 *       - websiteApiKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EditorDraftCreate'
 *     responses:
 *       201:
 *         description: Draft создан
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EditorDraft'
 *       401:
 *         description: Неверный API key
 *       503:
 *         description: WEBSITE_ORDER_API_KEY не настроен
 */
/** POST /api/public-editor/drafts — создать editor draft для отдельного сайта */
router.post('/drafts', asyncHandler(async (req: Request, res: Response) => {
  const body = req.body ?? {}
  const draft = await createEditorDraft(createDraftInput(body))
  res.status(201).json(draft)
}))

/**
 * @swagger
 * /api/public-editor/drafts/{token}:
 *   get:
 *     summary: Получить черновик редактора
 *     tags: [Client Editor]
 *     security:
 *       - websiteApiKey: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Draft
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EditorDraft'
 *       404:
 *         description: Draft не найден
 *       401:
 *         description: Неверный API key
 *       503:
 *         description: WEBSITE_ORDER_API_KEY не настроен
 *   patch:
 *     summary: Autosave состояния редактора
 *     description: |
 *       Тело — поля payload (designState, photoBatch, selectedParams).
 *       Опционально expectedVersion для защиты от конфликта (409 при несовпадении).
 *     tags: [Client Editor]
 *     security:
 *       - websiteApiKey: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             allOf:
 *               - $ref: '#/components/schemas/EditorDraftPayload'
 *               - type: object
 *                 properties:
 *                   expectedVersion:
 *                     type: integer
 *                     description: Ожидаемая версия draft
 *     responses:
 *       200:
 *         description: Draft обновлён
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EditorDraft'
 *       409:
 *         description: Конфликт версии или draft финализирован
 *       404:
 *         description: Draft не найден
 */
/** GET /api/public-editor/drafts/:token — получить draft */
router.get('/drafts/:token', asyncHandler(async (req: Request, res: Response) => {
  const draft = await getEditorDraft(req.params.token)
  if (!draft) {
    res.status(404).json({ message: 'Draft не найден' })
    return
  }
  res.json(draft)
}))

/**
 * @swagger
 * /api/public-editor/drafts/{token}/files:
 *   get:
 *     summary: Список файлов черновика
 *     description: Каждый элемент содержит url и thumbUrl для Fabric JSON.
 *     tags: [Client Editor]
 *     security:
 *       - websiteApiKey: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Массив файлов
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/EditorDraftFile'
 *   post:
 *     summary: Загрузить файл в черновик
 *     tags: [Client Editor]
 *     security:
 *       - websiteApiKey: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Файл загружен
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/EditorDraftFile'
 *       400:
 *         description: Ошибка загрузки
 */
router.get('/drafts/:token/files', asyncHandler(async (req: Request, res: Response) => {
  const files = await listEditorDraftFiles(req.params.token)
  res.json(files.map((file) => withDraftFileUrl(req, req.params.token, file)))
}))

/** PATCH /api/public-editor/drafts/:token — сохранить состояние редактора */
router.patch('/drafts/:token', asyncHandler(async (req: Request, res: Response) => {
  try {
    const draft = await updateEditorDraftPayload(req.params.token, req.body ?? {})
    res.json(draft)
  } catch (err: unknown) {
    res.status(err instanceof EditorDraftRateLimitError ? 429 : 409)
      .json({ message: err instanceof Error ? err.message : 'Не удалось сохранить draft' })
  }
}))

router.post(
  '/drafts/:token/files',
  uploadOrderFilesMemory.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const file = await addEditorDraftFile(req.params.token, (req as any).file)
      res.status(201).json(withDraftFileUrl(req, req.params.token, file))
    } catch (err: unknown) {
      res.status(400).json({ message: err instanceof Error ? err.message : 'Не удалось загрузить файл draft' })
    }
  }),
)

/**
 * @swagger
 * /api/public-editor/projects/{id}/clone-draft:
 *   post:
 *     summary: Новый draft из проекта клиента
 *     description: Клонирует customer_projects в новый editor draft (личный кабинет / повтор заказа).
 *     tags: [Client Editor]
 *     security:
 *       - websiteApiKey: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       201:
 *         description: Draft создан
 *       400:
 *         description: Ошибка клонирования
 */
/** POST /api/public-editor/projects/:id/clone-draft — новый draft из проекта клиента (сайт) */
router.post('/projects/:id/clone-draft', asyncHandler(async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.id)
    if (!Number.isFinite(projectId)) {
      res.status(400).json({ message: 'Некорректный id проекта' })
      return
    }
    const result = await cloneCustomerProjectToDraft(projectId)
    res.status(201).json(result)
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Не удалось создать draft из проекта' })
  }
}))

/**
 * @swagger
 * /api/public-editor/drafts/{token}/finalize:
 *   post:
 *     summary: Финализировать draft в заказ (sandbox)
 *     description: |
 *       Создаёт заказ source=website из одного draft. Для отладки и CRM preview.
 *       **Не использовать** вместо checkout сайта с корзиной и POST /api/orders/from-website.
 *     tags: [Client Editor]
 *     security:
 *       - websiteApiKey: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customerName: { type: string }
 *               customerPhone: { type: string }
 *               customerEmail: { type: string, format: email }
 *     responses:
 *       201:
 *         description: Заказ создан из draft
 *       400:
 *         description: Ошибка финализации
 */
/** POST /api/public-editor/drafts/:token/finalize — создать заказ source=website */
router.post('/drafts/:token/finalize', asyncHandler(async (req: Request, res: Response) => {
  try {
    const result = await finalizeEditorDraft(req.params.token, req.body ?? {})
    res.status(201).json(result)
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Не удалось финализировать draft' })
  }
}))

export default router
