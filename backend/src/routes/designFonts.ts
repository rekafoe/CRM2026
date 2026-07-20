import { Router, Request, Response } from 'express'
import fs from 'fs'
import multer from 'multer'
import { asyncHandler, authenticate, type AuthenticatedRequest } from '../middleware'
import {
  contentTypeForFontFormat,
  createDesignFont,
  createDesignFontsBatch,
  deactivateDesignFont,
  getDesignFontById,
  listDesignFonts,
  resolveDesignFontFilePath,
  updateDesignFont,
} from '../services/designFontService'
import { isFontUploadExtension } from '../config/upload'
import { guessFontFamilyFromFilename } from '../utils/fontFamilyNormalize'

const router = Router()

function fontUploadFileFilter(
  _req: Request,
  file: { originalname?: string },
  cb: (error: Error | null, accept: boolean) => void,
): void {
  const name = file.originalname || ''
  const dot = name.lastIndexOf('.')
  const ext = (dot >= 0 ? name.slice(dot) : '').toLowerCase()
  if (!isFontUploadExtension(ext)) {
    cb(new Error('Допустимы woff2, woff, ttf, otf'), false)
    return
  }
  cb(null, true)
}

const fontUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: fontUploadFileFilter,
})

const fontBatchUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 500 },
  fileFilter: fontUploadFileFilter,
})

router.get('/', authenticate, asyncHandler(async (_req: Request, res: Response) => {
  const fonts = await listDesignFonts()
  res.json(fonts)
}))

router.post(
  '/batch',
  authenticate,
  fontBatchUpload.array('files', 500),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const files = req.files
    if (!Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'Выберите один или несколько файлов шрифтов (woff2, woff, ttf, otf)' })
      return
    }
    const result = await createDesignFontsBatch(
      files.map((file) => ({ buffer: file.buffer, originalname: file.originalname })),
    )
    res.status(result.created > 0 ? 201 : 200).json(result)
  }),
)

router.post(
  '/',
  authenticate,
  fontUpload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const file = req.file
    if (!file?.buffer?.length) {
      res.status(400).json({ error: 'Загрузите файл шрифта (woff2, woff, ttf, otf)' })
      return
    }
    const family_name = String(req.body.family_name ?? req.body.familyName ?? '').trim()
      || guessFontFamilyFromFilename(file.originalname || '')
    if (!family_name) {
      res.status(400).json({ error: 'Не удалось определить имя шрифта из файла' })
      return
    }
    const created = await createDesignFont(
      {
        family_name,
        label: req.body.label ? String(req.body.label) : undefined,
        weight: req.body.weight ? String(req.body.weight) : undefined,
        style: req.body.style ? String(req.body.style) : undefined,
        sort_order: req.body.sort_order != null ? Number(req.body.sort_order) : undefined,
        is_active: req.body.is_active !== '0' && req.body.is_active !== 'false',
      },
      { buffer: file.buffer, originalname: file.originalname },
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
  const font = await getDesignFontById(id)
  if (!font) {
    res.status(404).json({ error: 'Шрифт не найден' })
    return
  }
  const filePath = resolveDesignFontFilePath(font.filename)
  if (!filePath) {
    res.status(404).json({ error: 'Файл шрифта не найден' })
    return
  }
  res.setHeader('Content-Type', contentTypeForFontFormat(font.format))
  res.setHeader('Cache-Control', 'private, max-age=60')
  res.sendFile(filePath)
}))

router.put(
  '/:id',
  authenticate,
  fontUpload.single('file'),
  asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: 'Некорректный ID' })
      return
    }
    const updated = await updateDesignFont(
      id,
      {
        family_name: req.body.family_name != null ? String(req.body.family_name) : undefined,
        label: req.body.label != null ? String(req.body.label) : undefined,
        weight: req.body.weight != null ? String(req.body.weight) : undefined,
        style: req.body.style != null ? String(req.body.style) : undefined,
        sort_order: req.body.sort_order != null ? Number(req.body.sort_order) : undefined,
        is_active: req.body.is_active === '0' || req.body.is_active === 'false' ? false
          : req.body.is_active === '1' || req.body.is_active === 'true' ? true
            : undefined,
      },
      req.file?.buffer?.length ? { buffer: req.file.buffer, originalname: req.file.originalname } : undefined,
    )
    if (!updated) {
      res.status(404).json({ error: 'Шрифт не найден' })
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
  const ok = await deactivateDesignFont(id)
  if (!ok) {
    res.status(404).json({ error: 'Шрифт не найден' })
    return
  }
  res.status(204).send()
}))

const servePublicFontList = asyncHandler(async (_req: Request, res: Response) => {
  const fonts = await listDesignFonts(true)
  res.json(fonts)
})

/** Алиас для BFF сайта и старых клиентов (канонический путь — /public/list). */
router.get('/public', servePublicFontList)
router.get('/public/list', servePublicFontList)

router.get('/public/:id/content', asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'Некорректный ID' })
    return
  }
  const font = await getDesignFontById(id)
  if (!font || !font.is_active) {
    res.status(404).json({ error: 'Шрифт не найден' })
    return
  }
  const filePath = resolveDesignFontFilePath(font.filename)
  if (!filePath) {
    res.status(404).json({ error: 'Файл шрифта не найден' })
    return
  }
  res.setHeader('Content-Type', contentTypeForFontFormat(font.format))
  res.setHeader('Cache-Control', 'public, max-age=86400')
  res.sendFile(filePath)
}))

export default router
