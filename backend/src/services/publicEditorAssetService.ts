import sharp from 'sharp'
import path from 'path'
import { getDb } from '../config/database'
import { saveBufferToOrderFiles } from '../config/upload'
import { hasColumn, invalidateTableSchemaCache } from '../utils/tableSchemaCache'

type DraftUploadFile = {
  buffer?: Buffer
  originalname?: string
  mimetype?: string
}

const MAX_DRAFT_FILES_PER_DRAFT = Number(process.env.EDITOR_DRAFT_MAX_FILES || 250)
const allowedDraftImageMimes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',
  'image/heic',
  'image/heif',
])
const allowedDraftImageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.heic', '.heif'])

async function ensureEditorDraftAssetColumns(): Promise<void> {
  const required: Array<[string, string]> = [
    ['width', 'width INTEGER'],
    ['height', 'height INTEGER'],
    ['thumbFilename', 'thumbFilename TEXT'],
    ['uploadStatus', "uploadStatus TEXT DEFAULT 'ready'"],
    ['uploadError', 'uploadError TEXT'],
  ]
  const missing: Array<[string, string]> = []
  for (const column of required) {
    const exists = await hasColumn('editor_draft_files', column[0]).catch(() => false)
    if (!exists) missing.push(column)
  }
  if (missing.length === 0) return
  const db = await getDb()
  for (const [, definition] of missing) {
    await db.exec(`ALTER TABLE editor_draft_files ADD COLUMN ${definition}`)
  }
  invalidateTableSchemaCache('editor_draft_files')
}

export interface EditorDraftFileRecord {
  id: number
  draftId: number
  filename: string
  originalName: string | null
  mime: string | null
  size: number | null
  width: number | null
  height: number | null
  thumbFilename: string | null
  uploadStatus: string | null
  uploadError: string | null
  uploadedAt?: string | null
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
    const savedThumb = saveBufferToOrderFiles(thumb, `thumb-${originalName || 'photo'}.jpg`)

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

function assertDraftImageFile(file: DraftUploadFile): void {
  const mime = String(file.mimetype || '').toLowerCase()
  const ext = path.extname(String(file.originalname || '')).toLowerCase()
  if (!file.buffer?.length) throw new Error('Файл пустой или не загружен')
  if (!allowedDraftImageMimes.has(mime) || !allowedDraftImageExtensions.has(ext)) {
    throw new Error('Draft редактора принимает только изображения JPG, PNG, WEBP, TIFF или HEIC')
  }
}

function mapDraftFileRow(row: Record<string, unknown>): EditorDraftFileRecord {
  return {
    id: Number(row.id),
    draftId: Number(row.draft_id ?? row.draftId),
    filename: String(row.filename ?? ''),
    originalName: row.originalName == null ? null : String(row.originalName),
    mime: row.mime == null ? null : String(row.mime),
    size: row.size == null ? null : Number(row.size),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    thumbFilename: row.thumbFilename == null ? null : String(row.thumbFilename),
    uploadStatus: row.uploadStatus == null ? null : String(row.uploadStatus),
    uploadError: row.uploadError == null ? null : String(row.uploadError),
    uploadedAt: row.uploadedAt == null ? null : String(row.uploadedAt),
  }
}

export async function createEditorDraftAsset(
  draftId: number,
  file: DraftUploadFile,
): Promise<EditorDraftFileRecord> {
  await ensureEditorDraftAssetColumns()
  assertDraftImageFile(file)
  const db = await getDb()
  const currentCount = await db.get<{ count: number }>(
    'SELECT COUNT(*) as count FROM editor_draft_files WHERE draft_id = ?',
    [draftId],
  )
  if ((currentCount?.count ?? 0) >= MAX_DRAFT_FILES_PER_DRAFT) {
    throw new Error(`В draft можно загрузить не больше ${MAX_DRAFT_FILES_PER_DRAFT} файлов`)
  }
  const saved = saveBufferToOrderFiles(file.buffer, file.originalname)
  if (!saved) throw new Error('Файл пустой или не загружен')

  const meta = await buildImageMetadata(file.buffer, file.originalname)
  const result = await db.run(
    `INSERT INTO editor_draft_files
      (draft_id, filename, originalName, mime, size, width, height, thumbFilename, uploadStatus, uploadError)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      draftId,
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
    'SELECT * FROM editor_draft_files WHERE id = ? AND draft_id = ?',
    [result.lastID, draftId],
  )
  if (!row) throw new Error('Не удалось сохранить asset')
  return mapDraftFileRow(row)
}

export async function listEditorDraftAssets(draftId: number): Promise<EditorDraftFileRecord[]> {
  const db = await getDb()
  const rows = await db.all<Record<string, unknown>[]>(
    'SELECT * FROM editor_draft_files WHERE draft_id = ? ORDER BY id ASC',
    [draftId],
  )
  return (rows ?? []).map(mapDraftFileRow)
}

export async function getEditorDraftAsset(
  draftId: number,
  fileId: number,
): Promise<EditorDraftFileRecord | null> {
  const db = await getDb()
  const row = await db.get<Record<string, unknown>>(
    'SELECT * FROM editor_draft_files WHERE id = ? AND draft_id = ?',
    [fileId, draftId],
  )
  return row ? mapDraftFileRow(row) : null
}
