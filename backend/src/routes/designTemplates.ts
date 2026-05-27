import { Router, Request, Response } from 'express'
import { upload, uploadOrderFilesMemory } from '../config/upload'
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
import { importDesignTemplateFromFile } from '../services/designTemplateImporterService'

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
  const input: DesignTemplateInput = {
    name: String(body.name || '').trim(),
    description: body.description != null ? String(body.description) : undefined,
    category: body.category != null ? String(body.category) : undefined,
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
    const result = await importDesignTemplateFromFile({
      file: files?.file?.[0],
      sourceFile: files?.sourceFile?.[0],
      name: String(body.name || '').trim(),
      description: body.description != null ? String(body.description) : undefined,
      category: body.category != null ? String(body.category) : undefined,
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
  if (body.category != null) input.category = String(body.category)
  if (body.preview_url != null) input.preview_url = String(body.preview_url)
  if (body.spec != null) input.spec = typeof body.spec === 'string' ? JSON.parse(body.spec) : (body.spec as object)
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
