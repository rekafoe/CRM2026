import { Router, Request, Response } from 'express'
import { upload, uploadOrderFilesMemory } from '../config/upload'
import {
  buildDesignTemplateAssetContentPath,
  buildDesignTemplateAssetThumbPath,
  createDesignTemplateAsset,
  getDesignTemplateAsset,
  resolveDesignTemplateAssetPath,
} from '../services/designTemplateAssetService'
import { hasBlobUrl } from '../utils/fabricJsonValidation'
import { asyncHandler, authenticate, type AuthenticatedRequest } from '../middleware'
import {
  getAllDesignTemplates,
  getDesignTemplate,
  getPublicDesignTemplate,
  getPublicDesignTemplates,
  getDesignTemplatesByCategory,
  createDesignTemplate,
  updateDesignTemplate,
  deleteDesignTemplate,
  type DesignTemplateInput,
} from '../services/designTemplateService'
import {
  importDesignTemplateFromFile,
  reimportDesignTemplateFromFile,
} from '../services/designTemplateImporterService'
import {
  createDesignTemplateCategory,
  deleteDesignTemplateCategory,
  getDesignTemplateCategories,
  getPublicDesignTemplateCategories,
  updateDesignTemplateCategory,
} from '../services/designTemplateCategoryService'
import { getDesignTemplateUsageAnalytics } from '../services/designTemplateUsageService'

const router = Router()

function parseRoyaltyFields(body: Record<string, unknown>) {
  const usage_fee = body.usage_fee != null && body.usage_fee !== ''
    ? Number(body.usage_fee)
    : undefined
  const author_percent = body.author_percent != null && body.author_percent !== ''
    ? Number(body.author_percent)
    : undefined
  const author_user_id = body.author_user_id != null && body.author_user_id !== ''
    ? Number(body.author_user_id)
    : body.author_user_id === null
      ? null
      : undefined
  if (usage_fee !== undefined && (!Number.isFinite(usage_fee) || usage_fee < 0)) {
    return { error: 'Плата за макет должна быть неотрицательным числом' as const }
  }
  if (author_percent !== undefined && (!Number.isFinite(author_percent) || author_percent < 0 || author_percent > 100)) {
    return { error: '% автору должен быть от 0 до 100' as const }
  }
  if (author_user_id !== undefined && author_user_id !== null && (!Number.isFinite(author_user_id) || author_user_id <= 0)) {
    return { error: 'Некорректный автор макета' as const }
  }
  return { usage_fee, author_percent, author_user_id }
}

function parseCategoryFields(body: Record<string, unknown>): Pick<DesignTemplateInput, 'category_id' | 'category'> {
  const out: Pick<DesignTemplateInput, 'category_id' | 'category'> = {}
  if (Object.prototype.hasOwnProperty.call(body, 'category_id')) {
    if (body.category_id === null || body.category_id === '') {
      out.category_id = null
    } else {
      const id = Number(body.category_id)
      if (!Number.isFinite(id) || id <= 0) {
        throw new Error('Некорректный ID категории')
      }
      out.category_id = id
    }
  }
  if (body.category != null && String(body.category).trim() !== '') {
    out.category = String(body.category).trim()
  }
  return out
}

/**
 * @swagger
 * /api/design-templates/public/categories:
 *   get:
 *     summary: Рубрики шаблонов для галереи на сайте
 *     description: Публичный справочник категорий design_templates. API key не требуется.
 *     tags: [Client Editor, Website Catalog]
 *     security: []
 *     responses:
 *       200:
 *         description: Массив рубрик
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PublicDesignTemplateCategory'
 */
/** Public API: справочник категорий для галереи на сайте. */
router.get('/public/categories', asyncHandler(async (_req: Request, res: Response) => {
  const categories = await getPublicDesignTemplateCategories()
  res.json(categories)
}))

/**
 * @swagger
 * /api/design-templates/public:
 *   get:
 *     summary: Список шаблонов для галереи на сайте
 *     description: |
 *       Фильтрация по productId и typeId обязательна для галереи подтипа.
 *       Без typeId вернётся весь активный каталог — не использовать на экране галереи.
 *       spec — JSON-строка; для сетки достаточно preview_url, designState — в GET /public/{id}.
 *     tags: [Client Editor, Website Catalog]
 *     security: []
 *     parameters:
 *       - in: query
 *         name: productId
 *         schema: { type: integer }
 *         description: ID продукта CRM
 *       - in: query
 *         name: typeId
 *         schema: { type: integer }
 *         description: ID подтипа (types[].id в конфиге продукта)
 *       - in: query
 *         name: sizeId
 *         schema: { type: string }
 *         description: ID размера из калькулятора (например 90x50)
 *     responses:
 *       200:
 *         description: Массив шаблонов
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PublicDesignTemplate'
 */
/** Public API for external website: templates filtered by product/type/size. */
router.get('/public', asyncHandler(async (req: Request, res: Response) => {
  const productId = req.query.productId != null ? Number(req.query.productId) : undefined
  const typeId = req.query.typeId != null ? Number(req.query.typeId) : undefined
  const sizeId = req.query.sizeId != null ? String(req.query.sizeId) : undefined
  const templates = await getPublicDesignTemplates({
    productId: Number.isFinite(productId) ? productId : undefined,
    typeId: Number.isFinite(typeId) ? typeId : undefined,
    sizeId,
  })
  res.json(templates)
}))

/**
 * @swagger
 * /api/design-templates/public/{id}:
 *   get:
 *     summary: Один шаблон с master designState для редактора
 *     description: |
 *       Активный шаблон с полем spec (JSON). Внутри spec — designState для копии в editor draft.
 *       Master в design_templates клиент не перезаписывает.
 *     tags: [Client Editor, Website Catalog]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: designTemplateId
 *     responses:
 *       200:
 *         description: Шаблон
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PublicDesignTemplate'
 *       400:
 *         description: Неверный ID
 *       404:
 *         description: Шаблон не найден или неактивен
 */
async function sendTemplateAssetContent(req: Request, res: Response, kind: 'content' | 'thumb'): Promise<void> {
  const templateId = parseInt(req.params.id)
  const fileId = Number(req.params.fileId)
  if (!Number.isFinite(templateId) || templateId <= 0 || !Number.isFinite(fileId)) {
    res.status(400).json({ message: 'Неверный ID' })
    return
  }
  const template = await getDesignTemplate(templateId)
  if (!template) {
    res.status(404).json({ message: 'Шаблон не найден' })
    return
  }
  const asset = await getDesignTemplateAsset(templateId, fileId)
  const filePath = asset ? resolveDesignTemplateAssetPath(asset, kind) : null
  if (!asset || !filePath) {
    res.status(404).json({ message: kind === 'thumb' ? 'Миниатюра не найдена' : 'Файл не найден' })
    return
  }
  if (kind === 'thumb') {
    res.type('image/jpeg')
  } else if (asset.mime) {
    res.type(asset.mime)
  }
  res.sendFile(filePath)
}

/** Public asset content for canvas image rendering (no JWT). */
router.get('/public/:id/assets/:fileId/content', asyncHandler(async (req: Request, res: Response) => {
  await sendTemplateAssetContent(req, res, 'content')
}))

router.get('/public/:id/assets/:fileId/thumb', asyncHandler(async (req: Request, res: Response) => {
  await sendTemplateAssetContent(req, res, 'thumb')
}))

/** Public API for external website: single active template with designState. */
router.get('/public/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID' })
    return
  }
  const template = await getPublicDesignTemplate(id)
  if (!template) {
    res.status(404).json({ message: 'Шаблон не найден' })
    return
  }
  res.json(template)
}))

router.use(authenticate)

/** GET /api/design-templates/analytics/usage — популярность шаблонов в заказах */
router.get('/analytics/usage', asyncHandler(async (req: Request, res: Response) => {
  const analytics = await getDesignTemplateUsageAnalytics(req.query as Record<string, string>)
  res.json(analytics)
}))

/** GET /api/design-templates — все шаблоны */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
  const templates = await getAllDesignTemplates()
  res.json(templates)
}))

/** GET /api/design-templates/category/:category — по категории */
router.get('/category/:category', asyncHandler(async (req: Request, res: Response) => {
  const { category } = req.params
  const templates = await getDesignTemplatesByCategory(decodeURIComponent(category))
  res.json(templates)
}))

/** GET /api/design-templates/categories — справочник категорий */
router.get('/categories', asyncHandler(async (_req: Request, res: Response) => {
  const categories = await getDesignTemplateCategories()
  res.json(categories)
}))

/** POST /api/design-templates/categories */
router.post('/categories', asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>
  const name = String(body.name ?? '').trim()
  try {
    const created = await createDesignTemplateCategory(name)
    res.status(201).json(created)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка создания категории'
    const status = msg.includes('уже есть') || msg.includes('Укажите') ? 400 : 500
    res.status(status).json({ message: msg })
  }
}))

/** PUT /api/design-templates/categories/:id */
router.put('/categories/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID' })
    return
  }
  const body = req.body as Record<string, unknown>
  try {
    const updated = await updateDesignTemplateCategory(id, {
      name: body.name != null ? String(body.name) : undefined,
      sort_order: body.sort_order != null ? Number(body.sort_order) : undefined,
    })
    if (!updated) {
      res.status(404).json({ message: 'Категория не найдена' })
      return
    }
    res.json(updated)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка обновления'
    res.status(400).json({ message: msg })
  }
}))

/** DELETE /api/design-templates/categories/:id */
router.delete('/categories/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID' })
    return
  }
  try {
    const deleted = await deleteDesignTemplateCategory(id)
    if (!deleted) {
      res.status(404).json({ message: 'Категория не найдена' })
      return
    }
    res.status(204).send()
  } catch (err: unknown) {
    res.status(400).json({ message: (err as Error).message })
  }
}))

/** POST /api/design-templates/:id/reimport — обновить существующий шаблон из SVG/ZIP */
router.post('/:id/reimport', uploadOrderFilesMemory.fields([
  { name: 'file', maxCount: 1 },
  { name: 'sourceFile', maxCount: 1 },
]), asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID', errors: ['Неверный ID'], warnings: [] })
    return
  }
  try {
    const files = (req as any).files as Record<string, Array<{
      buffer?: Buffer
      originalname?: string
      mimetype?: string
    }>> | undefined
    const result = await reimportDesignTemplateFromFile({
      templateId: id,
      file: files?.file?.[0],
      sourceFile: files?.sourceFile?.[0],
    })
    res.json(result)
  } catch (err: unknown) {
    const details = err as Error & { importErrors?: string[]; importWarnings?: string[] }
    res.status(400).json({
      message: details.message || 'Ошибка повторного импорта',
      errors: details.importErrors ?? [details.message || 'Ошибка повторного импорта'],
      warnings: details.importWarnings ?? [],
    })
  }
}))

/** POST /api/design-templates/:id/assets — загрузить изображение в шаблон */
router.post('/:id/assets', uploadOrderFilesMemory.single('file'), asyncHandler(async (req: Request, res: Response) => {
  const templateId = parseInt(req.params.id)
  if (!Number.isFinite(templateId) || templateId <= 0) {
    res.status(400).json({ message: 'Неверный ID' })
    return
  }
  const file = (req as any).file as { buffer?: Buffer; originalname?: string; mimetype?: string } | undefined
  try {
    const asset = await createDesignTemplateAsset(templateId, file ?? {})
    res.status(201).json({
      id: asset.id,
      templateId: asset.templateId,
      filename: asset.filename,
      originalName: asset.originalName,
      mime: asset.mime,
      size: asset.size,
      width: asset.width,
      height: asset.height,
      url: buildDesignTemplateAssetContentPath(templateId, asset.id),
      thumbUrl: asset.thumbFilename ? buildDesignTemplateAssetThumbPath(templateId, asset.id) : null,
    })
  } catch (err: unknown) {
    res.status(400).json({ message: err instanceof Error ? err.message : 'Ошибка загрузки файла' })
  }
}))

/** GET /api/design-templates/:id/assets/:fileId/content — содержимое asset (админ) */
router.get('/:id/assets/:fileId/content', asyncHandler(async (req: Request, res: Response) => {
  await sendTemplateAssetContent(req, res, 'content')
}))

router.get('/:id/assets/:fileId/thumb', asyncHandler(async (req: Request, res: Response) => {
  await sendTemplateAssetContent(req, res, 'thumb')
}))

/** GET /api/design-templates/:id — один шаблон */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID' })
    return
  }
  const template = await getDesignTemplate(id)
  if (!template) {
    res.status(404).json({ message: 'Шаблон не найден' })
    return
  }
  res.json(template)
}))

/** POST /api/design-templates — создать шаблон */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as AuthenticatedRequest).user
  const body = req.body as Record<string, unknown>
  const royalty = parseRoyaltyFields(body)
  if ('error' in royalty) {
    res.status(400).json({ message: royalty.error })
    return
  }
  let categoryFields: Pick<DesignTemplateInput, 'category_id' | 'category'> = {}
  try {
    categoryFields = parseCategoryFields(body)
  } catch (err: unknown) {
    res.status(400).json({ message: (err as Error).message })
    return
  }
  const input: DesignTemplateInput = {
    name: String(body.name || '').trim(),
    description: body.description != null ? String(body.description) : undefined,
    ...categoryFields,
    preview_url: body.preview_url != null ? String(body.preview_url) : undefined,
    spec: body.spec != null
      ? (typeof body.spec === 'string' ? JSON.parse(body.spec) : (body.spec as object))
      : undefined,
    is_active: body.is_active !== false,
    sort_order: body.sort_order != null ? Number(body.sort_order) : undefined,
    author_user_id: royalty.author_user_id ?? authUser?.id ?? null,
    usage_fee: royalty.usage_fee,
    author_percent: royalty.author_percent,
  }
  if (!input.name) {
    res.status(400).json({ message: 'Укажите название шаблона' })
    return
  }
  const template = await createDesignTemplate(input)
  res.status(201).json(template)
}))

/** POST /api/design-templates/upload-preview — загрузить превью (multer → uploadsDir) */
router.post('/upload-preview', upload.single('preview'), asyncHandler(async (req: Request, res: Response) => {
  const file = (req as any).file
  if (!file || !file.filename) {
    res.status(400).json({ message: 'Файл не загружен' })
    return
  }
  res.json({ filename: file.filename, url: `/api/uploads/${file.filename}` })
}))

/** POST /api/design-templates/import — исходник шаблона + SVG по стандарту слоёв */
router.post('/import', uploadOrderFilesMemory.fields([
  { name: 'file', maxCount: 1 },
  { name: 'sourceFile', maxCount: 1 },
]), asyncHandler(async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>
    const files = (req as any).files as Record<string, Array<{
      buffer?: Buffer
      originalname?: string
      mimetype?: string
    }>> | undefined
    const authUser = (req as AuthenticatedRequest).user
    const royalty = parseRoyaltyFields(body)
    if ('error' in royalty) {
      res.status(400).json({ message: royalty.error, errors: [royalty.error], warnings: [] })
      return
    }
    let categoryFields: Pick<DesignTemplateInput, 'category_id' | 'category'> = {}
    try {
      categoryFields = parseCategoryFields(body)
    } catch (err: unknown) {
      res.status(400).json({
        message: (err as Error).message,
        errors: [(err as Error).message],
        warnings: [],
      })
      return
    }
    const result = await importDesignTemplateFromFile({
      file: files?.file?.[0],
      sourceFile: files?.sourceFile?.[0],
      name: String(body.name || '').trim(),
      description: body.description != null ? String(body.description) : undefined,
      ...categoryFields,
      productId: body.productId != null && body.productId !== '' ? Number(body.productId) : undefined,
      typeId: body.typeId != null && body.typeId !== '' ? Number(body.typeId) : undefined,
      sizeId: body.sizeId != null && body.sizeId !== '' ? String(body.sizeId) : undefined,
      sortOrder: body.sortOrder != null ? Number(body.sortOrder) : undefined,
      authorUserId: royalty.author_user_id ?? authUser?.id,
      usageFee: royalty.usage_fee,
      authorPercent: royalty.author_percent,
    })
    res.status(201).json(result)
  } catch (err: unknown) {
    const details = err as Error & { importErrors?: string[]; importWarnings?: string[] }
    res.status(400).json({
      message: details.message || 'Ошибка импорта шаблона',
      errors: details.importErrors ?? [details.message || 'Ошибка импорта шаблона'],
      warnings: details.importWarnings ?? [],
    })
  }
}))

/** PUT /api/design-templates/:id — обновить шаблон */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID' })
    return
  }
  const body = req.body as Record<string, unknown>
  const input: Partial<DesignTemplateInput> = {}
  if (body.name != null) input.name = String(body.name).trim()
  if (body.description != null) input.description = String(body.description)
  try {
    const categoryFields = parseCategoryFields(body)
    if (categoryFields.category_id !== undefined) input.category_id = categoryFields.category_id
    if (categoryFields.category !== undefined) input.category = categoryFields.category
  } catch (err: unknown) {
    res.status(400).json({ message: (err as Error).message })
    return
  }
  if (body.preview_url != null) input.preview_url = String(body.preview_url)
  if (body.spec != null) {
    const spec = typeof body.spec === 'string' ? JSON.parse(body.spec) : (body.spec as object)
    if (hasBlobUrl(spec)) {
      res.status(400).json({ message: 'В макете остались временные blob-ссылки на изображения. Загрузите фото через редактор и сохраните снова.' })
      return
    }
    input.spec = spec
  }
  if (body.is_active != null) input.is_active = body.is_active === true
  if (body.sort_order != null) input.sort_order = Number(body.sort_order)
  const royalty = parseRoyaltyFields(body)
  if ('error' in royalty) {
    res.status(400).json({ message: royalty.error })
    return
  }
  if (royalty.author_user_id !== undefined) input.author_user_id = royalty.author_user_id
  if (royalty.usage_fee !== undefined) input.usage_fee = royalty.usage_fee
  if (royalty.author_percent !== undefined) input.author_percent = royalty.author_percent

  const template = await updateDesignTemplate(id, input)
  if (!template) {
    res.status(404).json({ message: 'Шаблон не найден' })
    return
  }
  res.json(template)
}))

/** DELETE /api/design-templates/:id — удалить шаблон */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID' })
    return
  }
  const deleted = await deleteDesignTemplate(id)
  if (!deleted) {
    res.status(404).json({ message: 'Шаблон не найден' })
    return
  }
  res.status(204).send()
}))

export default router
