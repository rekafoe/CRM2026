import { Router, Request, Response } from 'express'
import path from 'path'
import multer from 'multer'
import { asyncHandler, authenticate, type AuthenticatedRequest } from '../middleware'
import { isDesignAssetUploadExtension } from '../config/upload'
import {
  contentTypeForAssetFormat,
  createDesignAsset,
  createDesignAssetsBatch,
  deactivateDesignAsset,
  getDesignAssetById,
  listDesignAssets,
  resolveDesignAssetFilePath,
  updateDesignAsset,
  type DesignAssetKind,
} from '../services/designAssetService'

const router = Router()

function assetUploadFileFilter(
  _req: Request,
  file: { originalname?: string },
  cb: (error: Error | null, accept: boolean) => void,
): void {
  const ext = path.extname(file.originalname || '').toLowerCase()
  if (!isDesignAssetUploadExtension(ext)) {
    cb(new Error('Допустимы SVG, PNG и WebP'), false)
    return
  }
  cb(null, true)
}

const assetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: assetUploadFileFilter,
})

const assetBatchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 80 },
  fileFilter: assetUploadFileFilter,
})

function parseKind(value: unknown): DesignAssetKind | undefined {
  if (value === 'clipart' || value === 'background') return value
  return undefined
}

function sendAssetFile(
  res: Response,
  asset: { filename: string; format: string; thumb_filename?: string | null },
  variant: 'content' | 'thumb',
  cache: string,
): void {
  const filename = variant === 'thumb' && asset.thumb_filename
    ? asset.thumb_filename
    : asset.filename
  const filePath = resolveDesignAssetFilePath(filename)
  if (!filePath) {
    res.status(404).json({ error: 'Файл не найден' })
    return
  }
  const format = variant === 'thumb' && asset.thumb_filename
    ? path.extname(asset.thumb_filename).slice(1)
    : asset.format
  res.setHeader('Content-Type', contentTypeForAssetFormat(format))
  res.setHeader('Cache-Control', cache)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  if (format === 'svg' || asset.format === 'svg') {
    // SVG served as a document can execute scripts; block active content even if sanitizer misses a vector.
    res.setHeader('Content-Disposition', 'attachment')
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'none'; sandbox; style-src 'none'",
    )
  }
  res.sendFile(filePath)
}

router.get('/', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const assets = await listDesignAssets({ kind: parseKind(req.query.kind) })
  res.json(assets)
}))

router.post(
  '/batch',
  authenticate,
  assetBatchUpload.array('files', 80),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const files = req.files
    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'Выберите один или несколько файлов (SVG, PNG, WebP)' })
      return
    }
    const result = await createDesignAssetsBatch(
      files.map((file) => ({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      })),
      {
        kind: String(req.body.kind ?? ''),
        category: req.body.category ? String(req.body.category) : undefined,
      },
    )
    res.status(result.created > 0 ? 201 : 200).json(result)
  }),
)

router.post(
  '/',
  authenticate,
  assetUpload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const file = req.file
    if (!file?.buffer?.length) {
      res.status(400).json({ error: 'Загрузите файл SVG, PNG или WebP' })
      return
    }
    const created = await createDesignAsset(
      {
        label: req.body.label ? String(req.body.label) : undefined,
        kind: String(req.body.kind ?? ''),
        category: req.body.category ? String(req.body.category) : undefined,
        sort_order: req.body.sort_order != null ? Number(req.body.sort_order) : undefined,
        is_active: req.body.is_active !== '0' && req.body.is_active !== 'false',
      },
      { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype },
    )
    res.status(201).json(created)
  }),
)

router.get('/:id/content', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Некорректный ID' })
    return
  }
  const asset = await getDesignAssetById(id)
  if (!asset) {
    res.status(404).json({ error: 'Файл не найден' })
    return
  }
  sendAssetFile(res, asset, 'content', 'private, max-age=60')
}))

router.get('/:id/thumb', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Некорректный ID' })
    return
  }
  const asset = await getDesignAssetById(id)
  if (!asset) {
    res.status(404).json({ error: 'Файл не найден' })
    return
  }
  sendAssetFile(res, asset, 'thumb', 'private, max-age=60')
}))

router.put(
  '/:id',
  authenticate,
  assetUpload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Некорректный ID' })
      return
    }
    const updated = await updateDesignAsset(
      id,
      {
        label: req.body.label != null ? String(req.body.label) : undefined,
        kind: req.body.kind != null ? String(req.body.kind) : undefined,
        category: req.body.category != null ? String(req.body.category) : undefined,
        sort_order: req.body.sort_order != null ? Number(req.body.sort_order) : undefined,
        is_active: req.body.is_active === '0' || req.body.is_active === 'false' ? false
          : req.body.is_active === '1' || req.body.is_active === 'true' ? true
            : undefined,
      },
      req.file?.buffer?.length
        ? { buffer: req.file.buffer, originalname: req.file.originalname, mimetype: req.file.mimetype }
        : undefined,
    )
    if (!updated) {
      res.status(404).json({ error: 'Файл не найден' })
      return
    }
    res.json(updated)
  }),
)

router.delete('/:id', authenticate, asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Некорректный ID' })
    return
  }
  const ok = await deactivateDesignAsset(id)
  if (!ok) {
    res.status(404).json({ error: 'Файл не найден' })
    return
  }
  res.status(204).send()
}))

const servePublicList = asyncHandler(async (req: Request, res: Response) => {
  const assets = await listDesignAssets({
    activeOnly: true,
    kind: parseKind(req.query.kind),
  })
  res.json(assets)
})

router.get('/public', servePublicList)
router.get('/public/list', servePublicList)

router.get('/public/:id/content', asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Некорректный ID' })
    return
  }
  const asset = await getDesignAssetById(id)
  if (!asset || !asset.is_active) {
    res.status(404).json({ error: 'Файл не найден' })
    return
  }
  sendAssetFile(res, asset, 'content', 'public, max-age=86400')
}))

router.get('/public/:id/thumb', asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Некорректный ID' })
    return
  }
  const asset = await getDesignAssetById(id)
  if (!asset || !asset.is_active) {
    res.status(404).json({ error: 'Файл не найден' })
    return
  }
  sendAssetFile(res, asset, 'thumb', 'public, max-age=86400')
}))

export default router
