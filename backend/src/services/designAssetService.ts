import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { getDb } from '../config/database'
import {
  designAssetsDir,
  detectDesignAssetFormat,
  resolveSafeExistingPath,
  saveBufferToDesignAssets,
  uploadsDir,
} from '../config/upload'
import { parseSvgSize, sanitizeSvg } from '../utils/sanitizeSvg'

export type DesignAssetKind = 'clipart' | 'background'
export type DesignAssetFormat = 'svg' | 'png' | 'webp'

export type DesignAsset = {
  id: number
  label: string
  kind: DesignAssetKind
  filename: string
  mime: string | null
  format: DesignAssetFormat
  width: number | null
  height: number | null
  thumb_filename: string | null
  category: string | null
  sort_order: number
  is_active: boolean
  url: string
  thumbUrl: string
  created_at?: string
  updated_at?: string
}

type DesignAssetRow = {
  id: number
  label: string
  kind: string
  filename: string
  mime: string | null
  format: string
  width: number | null
  height: number | null
  thumb_filename: string | null
  category: string | null
  sort_order: number
  is_active: number
  created_at: string
  updated_at: string
}

export type DesignAssetInput = {
  label?: string
  kind?: string
  category?: string
  sort_order?: number
  is_active?: boolean
}

export type DesignAssetBatchItemResult =
  | { status: 'created'; filename: string; asset: DesignAsset }
  | { status: 'error'; filename: string; error: string }

function publicContentUrl(id: number): string {
  return `/api/design-assets/public/${id}/content`
}

function publicThumbUrl(id: number): string {
  return `/api/design-assets/public/${id}/thumb`
}

function normalizeKind(value?: string): DesignAssetKind {
  return value === 'background' ? 'background' : 'clipart'
}

function labelFromFilename(originalName?: string): string {
  const raw = path.basename(originalName || '', path.extname(originalName || ''))
  return raw.replace(/[_-]+/g, ' ').trim() || 'Клипарт'
}

function mimeForFormat(format: DesignAssetFormat): string {
  if (format === 'png') return 'image/png'
  if (format === 'webp') return 'image/webp'
  return 'image/svg+xml'
}

function mapRow(row: DesignAssetRow): DesignAsset {
  return {
    id: row.id,
    label: row.label,
    kind: normalizeKind(row.kind),
    filename: row.filename,
    mime: row.mime,
    format: (row.format === 'png' || row.format === 'webp' ? row.format : 'svg') as DesignAssetFormat,
    width: row.width,
    height: row.height,
    thumb_filename: row.thumb_filename,
    category: row.category,
    sort_order: row.sort_order,
    is_active: row.is_active === 1,
    url: publicContentUrl(row.id),
    thumbUrl: publicThumbUrl(row.id),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

function prepareUploadBuffer(
  file: { buffer: Buffer; originalname?: string; mimetype?: string },
): { buffer: Buffer; format: DesignAssetFormat; mime: string } {
  const format = detectDesignAssetFormat(file.originalname)
  if (format === 'svg') {
    const sanitized = sanitizeSvg(file.buffer.toString('utf8'))
    return {
      buffer: Buffer.from(sanitized, 'utf8'),
      format,
      mime: 'image/svg+xml',
    }
  }
  return {
    buffer: file.buffer,
    format,
    mime: file.mimetype || mimeForFormat(format),
  }
}

async function buildAssetMetadata(
  buffer: Buffer,
  format: DesignAssetFormat,
  originalName?: string,
): Promise<{ width: number | null; height: number | null; thumbFilename: string | null }> {
  if (format === 'svg') {
    const size = parseSvgSize(buffer.toString('utf8'))
    return { width: size.width, height: size.height, thumbFilename: null }
  }
  try {
    const image = sharp(buffer, { failOn: 'none' }).rotate()
    const meta = await image.metadata()
    const thumb = await image
      .clone()
      .resize({ width: 240, height: 240, fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 8 })
      .toBuffer()
    const savedThumb = saveBufferToDesignAssets(thumb, `thumb-${originalName || 'asset'}.png`)
    return {
      width: meta.width ?? null,
      height: meta.height ?? null,
      thumbFilename: savedThumb?.filename ?? null,
    }
  } catch {
    return { width: null, height: null, thumbFilename: null }
  }
}

export function contentTypeForAssetFormat(format: string): string {
  return mimeForFormat(format === 'png' || format === 'webp' ? format : 'svg')
}

export function resolveDesignAssetFilePath(filename: string): string | null {
  return resolveSafeExistingPath([designAssetsDir, path.join(uploadsDir, 'design-assets')], filename)
}

export async function listDesignAssets(options?: {
  activeOnly?: boolean
  kind?: DesignAssetKind
}): Promise<DesignAsset[]> {
  const db = await getDb()
  const clauses: string[] = []
  const params: Array<string | number> = []
  if (options?.activeOnly) clauses.push('is_active = 1')
  if (options?.kind) {
    clauses.push('kind = ?')
    params.push(options.kind)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const rows = await db.all(
    `SELECT * FROM design_assets ${where} ORDER BY sort_order ASC, id DESC`,
    params,
  ) as DesignAssetRow[]
  return (rows ?? []).map(mapRow)
}

export async function getDesignAssetById(id: number): Promise<DesignAsset | null> {
  const db = await getDb()
  const row = await db.get('SELECT * FROM design_assets WHERE id = ?', [id]) as DesignAssetRow | undefined
  return row ? mapRow(row) : null
}

export async function createDesignAsset(
  input: DesignAssetInput,
  file: { buffer: Buffer; originalname?: string; mimetype?: string },
): Promise<DesignAsset> {
  const prepared = prepareUploadBuffer(file)
  const label = String(input.label || '').trim() || labelFromFilename(file.originalname)
  const saved = saveBufferToDesignAssets(prepared.buffer, file.originalname, label)
  if (!saved) throw new Error('Не удалось сохранить файл. Допустимы SVG, PNG и WebP')
  const meta = await buildAssetMetadata(prepared.buffer, prepared.format, file.originalname)
  const db = await getDb()
  const result = await db.run(
    `INSERT INTO design_assets
      (label, kind, filename, mime, format, width, height, thumb_filename, category, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      label,
      normalizeKind(input.kind),
      saved.filename,
      prepared.mime,
      prepared.format,
      meta.width,
      meta.height,
      meta.thumbFilename,
      input.category?.trim() || null,
      Number.isFinite(input.sort_order) ? Number(input.sort_order) : 0,
      input.is_active === false ? 0 : 1,
    ],
  )
  const created = await getDesignAssetById(Number(result.lastID))
  if (!created) throw new Error('Не удалось создать клипарт')
  return created
}

export async function createDesignAssetsBatch(
  files: Array<{ buffer: Buffer; originalname?: string; mimetype?: string }>,
  input: DesignAssetInput = {},
): Promise<{ results: DesignAssetBatchItemResult[]; created: number; failed: number }> {
  const results: DesignAssetBatchItemResult[] = []
  let created = 0
  let failed = 0
  for (const file of files) {
    const filename = file.originalname || 'asset'
    try {
      const asset = await createDesignAsset(input, file)
      results.push({ status: 'created', filename, asset })
      created += 1
    } catch (error) {
      results.push({
        status: 'error',
        filename,
        error: error instanceof Error ? error.message : 'Не удалось загрузить файл',
      })
      failed += 1
    }
  }
  return { results, created, failed }
}

export async function updateDesignAsset(
  id: number,
  input: DesignAssetInput,
  file?: { buffer: Buffer; originalname?: string; mimetype?: string },
): Promise<DesignAsset | null> {
  const existing = await getDesignAssetById(id)
  if (!existing) return null
  const db = await getDb()
  let filename = existing.filename
  let mime = existing.mime
  let format = existing.format
  let width = existing.width
  let height = existing.height
  let thumbFilename = existing.thumb_filename

  if (file?.buffer?.length) {
    const prepared = prepareUploadBuffer(file)
    const saved = saveBufferToDesignAssets(
      prepared.buffer,
      file.originalname,
      input.label?.trim() || existing.label,
    )
    if (!saved) throw new Error('Не удалось сохранить файл. Допустимы SVG, PNG и WebP')
    const meta = await buildAssetMetadata(prepared.buffer, prepared.format, file.originalname)
    const previous = resolveDesignAssetFilePath(existing.filename)
    if (previous) {
      try { fs.unlinkSync(previous) } catch { /* ignore */ }
    }
    if (existing.thumb_filename) {
      const previousThumb = resolveDesignAssetFilePath(existing.thumb_filename)
      if (previousThumb) {
        try { fs.unlinkSync(previousThumb) } catch { /* ignore */ }
      }
    }
    filename = saved.filename
    mime = prepared.mime
    format = prepared.format
    width = meta.width
    height = meta.height
    thumbFilename = meta.thumbFilename
  }

  await db.run(
    `UPDATE design_assets SET
      label = ?,
      kind = ?,
      filename = ?,
      mime = ?,
      format = ?,
      width = ?,
      height = ?,
      thumb_filename = ?,
      category = ?,
      sort_order = ?,
      is_active = ?,
      updated_at = datetime('now')
     WHERE id = ?`,
    [
      input.label != null ? String(input.label).trim() || existing.label : existing.label,
      input.kind != null ? normalizeKind(input.kind) : existing.kind,
      filename,
      mime,
      format,
      width,
      height,
      thumbFilename,
      input.category !== undefined ? (input.category.trim() || null) : existing.category,
      input.sort_order != null && Number.isFinite(input.sort_order) ? Number(input.sort_order) : existing.sort_order,
      input.is_active === false ? 0 : input.is_active === true ? 1 : (existing.is_active ? 1 : 0),
      id,
    ],
  )
  return getDesignAssetById(id)
}

export async function deactivateDesignAsset(id: number): Promise<boolean> {
  const existing = await getDesignAssetById(id)
  if (!existing) return false
  const db = await getDb()
  await db.run(
    `UPDATE design_assets SET is_active = 0, updated_at = datetime('now') WHERE id = ?`,
    [id],
  )
  return true
}
