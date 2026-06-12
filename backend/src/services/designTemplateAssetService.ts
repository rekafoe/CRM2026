import sharp from 'sharp'
import path from 'path'
import { getDb } from '../config/database'
import {
  designTemplateAssetsDir,
  resolveSafeExistingPath,
  saveBufferToDesignTemplateAssets,
} from '../config/upload'
import { getDesignTemplate } from './designTemplateService'

type TemplateUploadFile = {
  buffer?: Buffer
  originalname?: string
  mimetype?: string
}

const MAX_ASSETS_PER_TEMPLATE = Number(process.env.DESIGN_TEMPLATE_MAX_ASSETS || 500)
const allowedImageMimes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/heic',
  'image/heif',
])
const allowedImageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.heic', '.heif'])

export interface DesignTemplateAssetRecord {
  id: number
  templateId: number
  filename: string
  originalName: string | null
  mime: string | null
  size: number | null
  width: number | null
  height: number | null
  thumbFilename: string | null
  uploadStatus: string | null
  uploadError: string | null
  createdAt?: string | null
}

function mapAssetRow(row: Record<string, unknown>): DesignTemplateAssetRecord {
  return {
    id: Number(row.id),
    templateId: Number(row.template_id ?? row.templateId),
    filename: String(row.filename ?? ''),
    originalName: row.original_name == null && row.originalName == null
      ? null
      : String(row.original_name ?? row.originalName),
    mime: row.mime == null ? null : String(row.mime),
    size: row.size == null ? null : Number(row.size),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    thumbFilename: row.thumb_filename == null && row.thumbFilename == null
      ? null
      : String(row.thumb_filename ?? row.thumbFilename),
    uploadStatus: row.upload_status == null && row.uploadStatus == null
      ? null
      : String(row.upload_status ?? row.uploadStatus),
    uploadError: row.upload_error == null && row.uploadError == null
      ? null
      : String(row.upload_error ?? row.uploadError),
    createdAt: row.created_at == null && row.createdAt == null
      ? null
      : String(row.created_at ?? row.createdAt),
  }
}

function assertTemplateImageFile(file: TemplateUploadFile): void {
  const mime = String(file.mimetype || '').toLowerCase()
  const ext = path.extname(String(file.originalname || '')).toLowerCase()
  if (!file.buffer?.length) throw new Error('Файл пустой или не загружен')
  if (!allowedImageMimes.has(mime) || !allowedImageExtensions.has(ext)) {
    throw new Error('Шаблон принимает только изображения JPG, PNG, WEBP, TIFF или HEIC')
  }
}

async function buildImageMetadata(buffer: Buffer | undefined, originalName?: string): Promise<{
  width: number | null
  height: number | null
  thumbFilename: string | null
  uploadStatus: string
  uploadError: string | null
}> {
  if (!buffer?.length) {
    return { width: null, height: null, thumbFilename: null, uploadStatus: 'error', uploadError: 'empty_file' }
  }

  try {
    const image = sharp(buffer, { failOn: 'none' }).rotate()
    const meta = await image.metadata()
    const thumb = await image
      .clone()
      .resize({ width: 420, height: 420, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()
    const savedThumb = saveBufferToDesignTemplateAssets(thumb, `thumb-${originalName || 'photo'}.jpg`)

    return {
      width: meta.width ?? null,
      height: meta.height ?? null,
      thumbFilename: savedThumb?.filename ?? null,
      uploadStatus: 'ready',
      uploadError: null,
    }
  } catch (err) {
    return {
      width: null,
      height: null,
      thumbFilename: null,
      uploadStatus: 'ready',
      uploadError: err instanceof Error ? err.message.slice(0, 500) : 'metadata_failed',
    }
  }
}

export function buildDesignTemplateAssetContentPath(templateId: number, fileId: number): string {
  return `/api/design-templates/public/${templateId}/assets/${fileId}/content`
}

export function buildDesignTemplateAssetThumbPath(templateId: number, fileId: number): string {
  return `/api/design-templates/public/${templateId}/assets/${fileId}/thumb`
}

export async function createDesignTemplateAsset(
  templateId: number,
  file: TemplateUploadFile,
): Promise<DesignTemplateAssetRecord> {
  const template = await getDesignTemplate(templateId)
  if (!template) throw new Error('Шаблон не найден')

  assertTemplateImageFile(file)
  const db = await getDb()
  const currentCount = await db.get<{ count: number }>(
    'SELECT COUNT(*) as count FROM design_template_assets WHERE template_id = ?',
    [templateId],
  )
  if ((currentCount?.count ?? 0) >= MAX_ASSETS_PER_TEMPLATE) {
    throw new Error(`В шаблон можно загрузить не больше ${MAX_ASSETS_PER_TEMPLATE} файлов`)
  }

  const saved = saveBufferToDesignTemplateAssets(file.buffer, file.originalname)
  if (!saved) throw new Error('Файл пустой или не загружен')

  const meta = await buildImageMetadata(file.buffer, file.originalname)
  const result = await db.run(
    `INSERT INTO design_template_assets
      (template_id, filename, original_name, mime, size, width, height, thumb_filename, upload_status, upload_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      templateId,
      saved.filename,
      saved.originalName,
      file.mimetype ?? null,
      saved.size,
      meta.width,
      meta.height,
      meta.thumbFilename,
      meta.uploadStatus,
      meta.uploadError,
    ],
  )

  const row = await db.get<Record<string, unknown>>(
    'SELECT * FROM design_template_assets WHERE id = ? AND template_id = ?',
    [result.lastID, templateId],
  )
  if (!row) throw new Error('Не удалось сохранить asset')
  return mapAssetRow(row)
}

export async function getDesignTemplateAsset(
  templateId: number,
  fileId: number,
): Promise<DesignTemplateAssetRecord | null> {
  const db = await getDb()
  const row = await db.get<Record<string, unknown>>(
    'SELECT * FROM design_template_assets WHERE id = ? AND template_id = ?',
    [fileId, templateId],
  )
  return row ? mapAssetRow(row) : null
}

export function resolveDesignTemplateAssetPath(
  asset: DesignTemplateAssetRecord,
  kind: 'content' | 'thumb',
): string | null {
  const filename = kind === 'thumb' ? asset.thumbFilename : asset.filename
  if (!filename) return null
  return resolveSafeExistingPath([designTemplateAssetsDir], filename)
}
