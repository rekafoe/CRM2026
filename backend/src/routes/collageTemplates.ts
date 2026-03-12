import { Router, Request, Response } from 'express'
import { asyncHandler, authenticate } from '../middleware'
import {
  getCollageTemplates,
  getCollageTemplate,
  createCollageTemplate,
  updateCollageTemplate,
  deleteCollageTemplate,
  type CollageTemplateInput,
  type CollageLayout,
} from '../services/collageTemplateService'

const router = Router()
router.use(authenticate)

/** GET /api/collage-templates — список шаблонов (query: photo_count?, only_suitable?) */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const photo_count = req.query.photo_count != null ? parseInt(String(req.query.photo_count), 10) : undefined
  const only_suitable = req.query.only_suitable === 'true' || req.query.only_suitable === '1'
  const templates = await getCollageTemplates(
    Number.isInteger(photo_count) ? { photo_count: photo_count!, only_suitable } : undefined
  )
  res.json(templates)
}))

/** GET /api/collage-templates/:id — один шаблон */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID' })
    return
  }
  const template = await getCollageTemplate(id)
  if (!template) {
    res.status(404).json({ message: 'Шаблон не найден' })
    return
  }
  res.json(template)
}))

/** POST /api/collage-templates — создать шаблон */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>
  if (body.photo_count == null || !Array.isArray((body.layout as { cells?: unknown })?.cells)) {
    res.status(400).json({ message: 'Укажите photo_count и layout.cells' })
    return
  }
  const input: CollageTemplateInput = {
    name: body.name != null ? String(body.name) : undefined,
    photo_count: Number(body.photo_count),
    layout: body.layout as CollageTemplateInput['layout'],
    padding_default: body.padding_default != null ? Number(body.padding_default) : undefined,
    sort_order: body.sort_order != null ? Number(body.sort_order) : undefined,
    is_active: body.is_active !== false,
  }
  const template = await createCollageTemplate(input)
  res.status(201).json(template)
}))

/** PUT /api/collage-templates/:id — обновить шаблон */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID' })
    return
  }
  const body = req.body as Record<string, unknown>
  const input: Partial<CollageTemplateInput> = {}
  if (body.name !== undefined) input.name = String(body.name)
  if (body.photo_count !== undefined) input.photo_count = Number(body.photo_count)
  if (body.layout !== undefined) input.layout = body.layout as CollageLayout
  if (body.padding_default !== undefined) input.padding_default = Number(body.padding_default)
  if (body.sort_order !== undefined) input.sort_order = Number(body.sort_order)
  if (body.is_active !== undefined) input.is_active = body.is_active === true

  const template = await updateCollageTemplate(id, input)
  if (!template) {
    res.status(404).json({ message: 'Шаблон не найден' })
    return
  }
  res.json(template)
}))

/** DELETE /api/collage-templates/:id — удалить шаблон */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10)
  if (isNaN(id)) {
    res.status(400).json({ message: 'Неверный ID' })
    return
  }
  const deleted = await deleteCollageTemplate(id)
  if (!deleted) {
    res.status(404).json({ message: 'Шаблон не найден' })
    return
  }
  res.status(204).send()
}))

export default router
