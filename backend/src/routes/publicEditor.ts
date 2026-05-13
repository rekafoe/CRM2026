import { Router, Request, Response } from 'express'
import { orderFilesDir, resolveSafeExistingPath, uploadOrderFilesMemory } from '../config/upload'
import { asyncHandler, authenticate } from '../middleware'
import { requireWebsiteOrderApiKey } from '../middleware/websiteOrderApiKey'
import {
  addEditorDraftFile,
  createEditorDraft,
  finalizeEditorDraft,
  getEditorDraft,
  getEditorDraftFile,
  updateEditorDraftPayload,
} from '../services/publicEditorDraftService'

const router = Router()

function withDraftFileUrl(req: Request, token: string, file: Record<string, unknown>): Record<string, unknown> {
  return {
    ...file,
    url: `${req.baseUrl}/drafts/${encodeURIComponent(token)}/files/${encodeURIComponent(String(file.id))}/content`,
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

/** Stable draft file URL for browser image rendering; token scopes file access. */
router.get('/drafts/:token/files/:fileId/content', asyncHandler(sendDraftFileContent))

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

router.patch('/admin-preview/drafts/:token', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const draft = await updateEditorDraftPayload(req.params.token, req.body ?? {})
  res.json(draft)
}))

router.post(
  '/admin-preview/drafts/:token/files',
  authenticate,
  uploadOrderFilesMemory.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    const file = await addEditorDraftFile(req.params.token, (req as any).file)
    res.status(201).json(withDraftFileUrl(req, req.params.token, file))
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

/** POST /api/public-editor/drafts — создать editor draft для отдельного сайта */
router.post('/drafts', asyncHandler(async (req: Request, res: Response) => {
  const body = req.body ?? {}
  const draft = await createEditorDraft(createDraftInput(body))
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
    res.status(201).json(withDraftFileUrl(req, req.params.token, file))
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
