import fs from 'fs'
import { Router } from 'express'
import {
  knowledgeBaseAssetsDir,
  MAX_KNOWLEDGE_BASE_ASSET_BYTES,
  resolveSafeFilePath,
  saveBufferToKnowledgeBaseAssets,
  uploadKnowledgeBaseAssetMemory,
} from '../../config/upload'
import { asyncHandler, AuthenticatedRequest } from '../../middleware'
import { KnowledgeBaseError, KnowledgeBaseService } from './knowledgeBaseService'
import { KnowledgeActor, KnowledgeArticleStatus } from './types'

const router = Router()

function actorFrom(req: AuthenticatedRequest): KnowledgeActor {
  if (!req.user?.id) throw new KnowledgeBaseError(401, 'UNAUTHORIZED', 'Unauthorized')
  return { id: Number(req.user.id), role: String(req.user.role || '') }
}

function routeId(value: unknown, name = 'id'): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) {
    throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', `${name} должен быть положительным целым числом`)
  }
  return id
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

function isMatchingImageSignature(buffer: Buffer, mime: string): boolean {
  if (mime === 'image/jpeg') {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  if (mime === 'image/png') {
    return buffer.length >= 8
      && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (mime === 'image/gif') {
    const signature = buffer.subarray(0, 6).toString('ascii')
    return signature === 'GIF87a' || signature === 'GIF89a'
  }
  if (mime === 'image/webp') {
    return buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  }
  return false
}

router.get('/categories', asyncHandler(async (req, res) => {
  const items = await KnowledgeBaseService.listCategories(actorFrom(req as AuthenticatedRequest))
  res.json({ items })
}))

router.get('/articles', asyncHandler(async (req, res) => {
  const rawStatus = String(req.query.status || '').trim()
  const allowedStatuses = new Set<KnowledgeArticleStatus>(['draft', 'published', 'archived'])
  if (rawStatus && !allowedStatuses.has(rawStatus as KnowledgeArticleStatus)) {
    throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', 'Некорректный status статьи')
  }
  const rawScope = String(req.query.scope || '').trim()
  if (rawScope && rawScope !== 'my') {
    throw new KnowledgeBaseError(400, 'VALIDATION_ERROR', 'Поддерживается только scope=my')
  }
  const categoryRaw = req.query.category_id ?? req.query.categoryId
  const categoryId = categoryRaw == null || categoryRaw === ''
    ? undefined
    : routeId(categoryRaw, 'category_id')
  const result = await KnowledgeBaseService.listArticles(
    actorFrom(req as AuthenticatedRequest),
    {
      search: String(req.query.search || '').trim().slice(0, 200) || undefined,
      categoryId,
      tag: String(req.query.tag || '').trim().slice(0, 64) || undefined,
      scope: rawScope === 'my' ? 'my' : undefined,
      status: rawStatus ? rawStatus as KnowledgeArticleStatus : undefined,
      page: boundedInt(req.query.page, 1, 1, 100000),
      limit: boundedInt(req.query.limit, 20, 1, 100),
      sort: String(req.query.sort || '').trim() || undefined,
    },
  )
  res.json(result)
}))

router.post('/articles', asyncHandler(async (req, res) => {
  const article = await KnowledgeBaseService.createArticle(
    actorFrom(req as AuthenticatedRequest),
    req.body || {},
  )
  res.status(201).json(article)
}))

router.get('/proposals', asyncHandler(async (req, res) => {
  const items = await KnowledgeBaseService.listProposals(
    actorFrom(req as AuthenticatedRequest),
    String(req.query.status || '').trim() || undefined,
  )
  res.json({ items })
}))

router.get('/proposals/:id', asyncHandler(async (req, res) => {
  const proposal = await KnowledgeBaseService.getProposal(
    routeId(req.params.id),
    actorFrom(req as AuthenticatedRequest),
  )
  res.json(proposal)
}))

router.post('/proposals/:id/review', asyncHandler(async (req, res) => {
  const proposal = await KnowledgeBaseService.reviewProposal(
    routeId(req.params.id),
    actorFrom(req as AuthenticatedRequest),
    req.body?.decision,
    req.body?.note,
  )
  res.json(proposal)
}))

router.get('/assets/:id/content', asyncHandler(async (req, res) => {
  const asset = await KnowledgeBaseService.getAsset(
    routeId(req.params.id),
    actorFrom(req as AuthenticatedRequest),
  )
  const filePath = resolveSafeFilePath(knowledgeBaseAssetsDir, asset.storageName)
  if (!filePath || !fs.existsSync(filePath)) {
    throw new KnowledgeBaseError(404, 'ASSET_CONTENT_NOT_FOUND', 'Файл не найден на диске')
  }
  res.setHeader('Cache-Control', 'private, max-age=300')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.type(asset.mimeType)
  res.sendFile(filePath)
}))

router.delete('/assets/:id', asyncHandler(async (req, res) => {
  const deleted = await KnowledgeBaseService.deleteAsset(
    routeId(req.params.id),
    actorFrom(req as AuthenticatedRequest),
  )
  const filePath = resolveSafeFilePath(knowledgeBaseAssetsDir, deleted.storageName)
  if (filePath) {
    try { fs.unlinkSync(filePath) } catch {}
  }
  res.status(204).end()
}))

router.post('/questions/:questionId/replies', asyncHandler(async (req, res) => {
  const reply = await KnowledgeBaseService.createReply(
    routeId(req.params.questionId, 'questionId'),
    actorFrom(req as AuthenticatedRequest),
    req.body?.bodyJson ?? req.body?.contentJson ?? req.body?.body,
  )
  res.status(201).json(reply)
}))

router.patch('/questions/:questionId/resolve', asyncHandler(async (req, res) => {
  const question = await KnowledgeBaseService.resolveQuestion(
    routeId(req.params.questionId, 'questionId'),
    actorFrom(req as AuthenticatedRequest),
    req.body?.isResolved ?? req.body?.is_resolved,
  )
  res.json(question)
}))

router.get('/articles/:id', asyncHandler(async (req, res) => {
  const article = await KnowledgeBaseService.getArticle(
    routeId(req.params.id),
    actorFrom(req as AuthenticatedRequest),
  )
  res.json(article)
}))

router.post('/articles/:id/views', asyncHandler(async (req, res) => {
  const engagement = await KnowledgeBaseService.recordView(
    routeId(req.params.id),
    actorFrom(req as AuthenticatedRequest),
  )
  res.json(engagement)
}))

router.post('/articles/:id/reactions', asyncHandler(async (req, res) => {
  const engagement = await KnowledgeBaseService.toggleReaction(
    routeId(req.params.id),
    actorFrom(req as AuthenticatedRequest),
    req.body?.reaction ?? req.body?.type,
  )
  res.json(engagement)
}))

router.put('/articles/:id', asyncHandler(async (req, res) => {
  const article = await KnowledgeBaseService.updateArticle(
    routeId(req.params.id),
    actorFrom(req as AuthenticatedRequest),
    req.body || {},
  )
  res.json(article)
}))

router.post('/articles/:id/publish', asyncHandler(async (req, res) => {
  const article = await KnowledgeBaseService.publishArticle(
    routeId(req.params.id),
    actorFrom(req as AuthenticatedRequest),
  )
  res.json(article)
}))

router.post('/articles/:id/archive', asyncHandler(async (req, res) => {
  const article = await KnowledgeBaseService.archiveArticle(
    routeId(req.params.id),
    actorFrom(req as AuthenticatedRequest),
  )
  res.json(article)
}))

router.get('/articles/:id/revisions', asyncHandler(async (req, res) => {
  const items = await KnowledgeBaseService.listRevisions(
    routeId(req.params.id),
    actorFrom(req as AuthenticatedRequest),
  )
  res.json({ items })
}))

router.post('/articles/:id/revisions/:revisionId/restore', asyncHandler(async (req, res) => {
  const article = await KnowledgeBaseService.restoreRevision(
    routeId(req.params.id),
    routeId(req.params.revisionId, 'revisionId'),
    actorFrom(req as AuthenticatedRequest),
    req.body?.baseRevisionId ?? req.body?.base_revision_id,
  )
  res.json(article)
}))

router.post('/articles/:id/proposals', asyncHandler(async (req, res) => {
  const proposal = await KnowledgeBaseService.createProposal(
    routeId(req.params.id),
    actorFrom(req as AuthenticatedRequest),
    req.body || {},
  )
  res.status(201).json(proposal)
}))

router.post('/articles/:id/questions', asyncHandler(async (req, res) => {
  const question = await KnowledgeBaseService.createQuestion(
    routeId(req.params.id),
    actorFrom(req as AuthenticatedRequest),
    req.body?.bodyJson ?? req.body?.contentJson ?? req.body?.body,
  )
  res.status(201).json(question)
}))

router.post(
  '/articles/:id/assets',
  uploadKnowledgeBaseAssetMemory.fields([
    { name: 'file', maxCount: 1 },
    { name: 'image', maxCount: 1 },
  ]),
  asyncHandler(async (req, res) => {
    const actor = actorFrom(req as AuthenticatedRequest)
    const articleId = routeId(req.params.id)
    await KnowledgeBaseService.getArticle(articleId, actor, false)
    const files = req.files as Record<string, Express.Multer.File[]> | undefined
    const file = files?.file?.[0] || files?.image?.[0]
    if (!file?.buffer?.length) {
      throw new KnowledgeBaseError(400, 'FILE_REQUIRED', 'Передайте изображение в поле file или image')
    }
    if (file.size > MAX_KNOWLEDGE_BASE_ASSET_BYTES
      || !isMatchingImageSignature(file.buffer, String(file.mimetype || '').toLowerCase())) {
      throw new KnowledgeBaseError(400, 'INVALID_IMAGE', 'Содержимое файла не соответствует формату изображения')
    }
    const saved = saveBufferToKnowledgeBaseAssets(file.buffer, file.originalname)
    if (!saved) {
      throw new KnowledgeBaseError(400, 'INVALID_IMAGE', 'Не удалось сохранить изображение')
    }
    try {
      const asset = await KnowledgeBaseService.createAsset(articleId, actor, {
        filename: saved.filename,
        originalName: saved.originalName,
        mimeType: String(file.mimetype).toLowerCase(),
        size: saved.size,
      })
      res.status(201).json(asset)
    } catch (error) {
      const filePath = resolveSafeFilePath(knowledgeBaseAssetsDir, saved.filename)
      if (filePath) {
        try { fs.unlinkSync(filePath) } catch {}
      }
      throw error
    }
  }),
)

export default router
