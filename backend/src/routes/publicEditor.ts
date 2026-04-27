import { Router, Request, Response } from 'express'
import { uploadOrderFilesMemory } from '../config/upload'
import { asyncHandler } from '../middleware'
import { requireWebsiteOrderApiKey } from '../middleware/websiteOrderApiKey'
import {
  addEditorDraftFile,
  createEditorDraft,
  finalizeEditorDraft,
  getEditorDraft,
  updateEditorDraftPayload,
} from '../services/publicEditorDraftService'

const router = Router()

router.use(requireWebsiteOrderApiKey)

/** POST /api/public-editor/drafts — создать editor draft для отдельного сайта */
router.post('/drafts', asyncHandler(async (req: Request, res: Response) => {
  const body = req.body ?? {}
  const draft = await createEditorDraft({
    designTemplateId: body.designTemplateId != null ? Number(body.designTemplateId) : undefined,
    productId: body.productId != null ? Number(body.productId) : undefined,
    typeId: body.typeId != null ? Number(body.typeId) : undefined,
    sizeId: body.sizeId != null ? String(body.sizeId) : undefined,
    mode: body.mode != null ? String(body.mode) : undefined,
    payload: body.payload && typeof body.payload === 'object' ? body.payload : {},
  })
  res.status(201).json(draft)
}))

/** GET /api/public-editor/drafts/:token — получить draft */
router.get('/drafts/:token', asyncHandler(async (req: Request, res: Response) => {
  const draft = await getEditorDraft(req.params.token)
  if (!draft) {
    res.status(404).json({ message: 'Draft не найден' })
    return
  }
  res.json(draft)
}))

/** PATCH /api/public-editor/drafts/:token — сохранить состояние редактора */
router.patch('/drafts/:token', asyncHandler(async (req: Request, res: Response) => {
  const draft = await updateEditorDraftPayload(req.params.token, req.body ?? {})
  res.json(draft)
}))

/** POST /api/public-editor/drafts/:token/files — загрузить файл клиента в draft */
router.post(
  '/drafts/:token/files',
  uploadOrderFilesMemory.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const file = await addEditorDraftFile(req.params.token, (req as any).file)
    res.status(201).json(file)
  }),
)

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
