import { Router, Request, Response } from 'express'
import { upload } from '../config/upload'
import { asyncHandler, authenticate } from '../middleware'
import {
  getAllDesignTemplates,
  getDesignTemplate,
  getDesignTemplatesByCategory,
  createDesignTemplate,
  updateDesignTemplate,
  deleteDesignTemplate,
  type DesignTemplateInput,
} from '../services/designTemplateService'

const router = Router()
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
  const body = req.body as Record<string, unknown>
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
