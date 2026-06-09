import fs from 'fs'
import path from 'path'
import { getDb } from '../config/database'
import {
  designFontsDir,
  resolveSafeExistingPath,
  saveBufferToDesignFonts,
  uploadsDir,
} from '../config/upload'
import {
  buildRequiredFontEntries,
  extractUsedFontFamiliesFromDesignState,
  hasMissingRequiredFonts,
  type BundledTemplateFont,
  type RequiredFontEntry,
} from '../utils/extractDesignStateFonts'
import {
  fontFamilyCompactKey,
  fontFamilyNamesMatch,
  guessFontFamilyFromFilename,
  normalizeFontFamilyName,
} from '../utils/fontFamilyNormalize'

export interface DesignFontRow {
  id: number
  family_name: string
  label: string
  filename: string
  format: string
  weight: string
  style: string
  sort_order: number
  is_active: number
  created_at: string
  updated_at: string
}

export type DesignFontInput = {
  family_name: string
  label?: string
  weight?: string
  style?: string
  sort_order?: number
  is_active?: boolean
}

function publicFontUrl(id: number): string {
  return `/api/design-fonts/public/${id}/content`
}

function mapRow(row: DesignFontRow) {
  return {
    ...row,
    is_active: row.is_active === 1,
    url: publicFontUrl(row.id),
  }
}

export async function listDesignFonts(activeOnly = false): Promise<ReturnType<typeof mapRow>[]> {
  const db = await getDb()
  const rows = await db.all(
    `SELECT * FROM design_fonts
     ${activeOnly ? 'WHERE is_active = 1' : ''}
     ORDER BY sort_order ASC, family_name ASC`,
  ) as DesignFontRow[]
  return (rows ?? []).map(mapRow)
}

export async function getDesignFontById(id: number): Promise<ReturnType<typeof mapRow> | null> {
  const db = await getDb()
  const row = await db.get('SELECT * FROM design_fonts WHERE id = ?', [id]) as DesignFontRow | undefined
  return row ? mapRow(row) : null
}

export async function getActiveDesignFontByFamily(familyName: string): Promise<ReturnType<typeof mapRow> | null> {
  const normalized = normalizeFontFamilyName(familyName)
  if (!normalized) return null
  const db = await getDb()
  const rows = await db.all(
    'SELECT * FROM design_fonts WHERE is_active = 1',
  ) as DesignFontRow[]
  const row = rows?.find((r) => fontFamilyNamesMatch(r.family_name, normalized))
  return row ? mapRow(row) : null
}

export type DesignFontBatchItemResult =
  | { status: 'created'; filename: string; family_name: string; font: ReturnType<typeof mapRow> }
  | { status: 'skipped'; filename: string; family_name: string; reason: string }
  | { status: 'error'; filename: string; family_name?: string; error: string }

export async function createDesignFontsBatch(
  files: Array<{ buffer: Buffer; originalname?: string }>,
): Promise<{ results: DesignFontBatchItemResult[]; created: number; skipped: number; failed: number }> {
  const results: DesignFontBatchItemResult[] = []
  const seenInBatch = new Set<string>()
  let created = 0
  let skipped = 0
  let failed = 0

  for (const file of files) {
    const filename = file.originalname || 'font'
    const family_name = guessFontFamilyFromFilename(filename)
    if (!family_name) {
      results.push({ status: 'error', filename, error: 'Не удалось определить имя из файла' })
      failed += 1
      continue
    }
    const batchKey = fontFamilyCompactKey(family_name)
    if (seenInBatch.has(batchKey)) {
      results.push({
        status: 'skipped',
        filename,
        family_name,
        reason: 'Дубликат в этой загрузке',
      })
      skipped += 1
      continue
    }
    seenInBatch.add(batchKey)

    const existing = await getActiveDesignFontByFamily(family_name)
    if (existing) {
      results.push({
        status: 'skipped',
        filename,
        family_name,
        reason: `Уже в библиотеке (ID ${existing.id})`,
      })
      skipped += 1
      continue
    }

    try {
      const font = await createDesignFont({ family_name }, file)
      results.push({ status: 'created', filename, family_name, font })
      created += 1
    } catch (err) {
      results.push({
        status: 'error',
        filename,
        family_name,
        error: err instanceof Error ? err.message : 'Не удалось сохранить',
      })
      failed += 1
    }
  }

  return { results, created, skipped, failed }
}

export async function createDesignFont(
  input: DesignFontInput,
  file: { buffer: Buffer; originalname?: string },
): Promise<ReturnType<typeof mapRow>> {
  const family_name = normalizeFontFamilyName(input.family_name)
  if (!family_name) throw new Error('Укажите family_name шрифта')
  const stored = saveBufferToDesignFonts(file.buffer, file.originalname, family_name)
  if (!stored) throw new Error('Не удалось сохранить файл шрифта (woff2, woff, ttf, otf)')

  const db = await getDb()
  const result = await db.run(
    `INSERT INTO design_fonts (
      family_name, label, filename, format, weight, style, sort_order, is_active, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      family_name,
      input.label?.trim() || family_name,
      stored.filename,
      stored.format,
      input.weight?.trim() || 'normal',
      input.style?.trim() || 'normal',
      Number.isFinite(input.sort_order) ? input.sort_order! : 0,
      input.is_active === false ? 0 : 1,
    ],
  )
  const created = await getDesignFontById(Number(result.lastID))
  if (!created) throw new Error('Не удалось создать шрифт')
  return created
}

export async function updateDesignFont(
  id: number,
  input: Partial<DesignFontInput>,
  file?: { buffer: Buffer; originalname?: string },
): Promise<ReturnType<typeof mapRow> | null> {
  const existing = await getDesignFontById(id)
  if (!existing) return null

  let filename = existing.filename
  let format = existing.format
  if (file?.buffer?.length) {
    const stored = saveBufferToDesignFonts(file.buffer, file.originalname, input.family_name ?? existing.family_name)
    if (!stored) throw new Error('Не удалось сохранить файл шрифта')
    const oldPath = resolveSafeExistingPath([designFontsDir], existing.filename)
    if (oldPath) {
      try { fs.unlinkSync(oldPath) } catch { /* ignore */ }
    }
    filename = stored.filename
    format = stored.format
  }

  const db = await getDb()
  await db.run(
    `UPDATE design_fonts SET
      family_name = ?,
      label = ?,
      filename = ?,
      format = ?,
      weight = ?,
      style = ?,
      sort_order = ?,
      is_active = ?,
      updated_at = datetime('now')
     WHERE id = ?`,
    [
      input.family_name != null ? normalizeFontFamilyName(input.family_name) : existing.family_name,
      input.label?.trim() || existing.label,
      filename,
      format,
      input.weight?.trim() || existing.weight,
      input.style?.trim() || existing.style,
      input.sort_order != null ? input.sort_order : existing.sort_order,
      input.is_active === false ? 0 : input.is_active === true ? 1 : (existing.is_active ? 1 : 0),
      id,
    ],
  )
  return getDesignFontById(id)
}

export async function deactivateDesignFont(id: number): Promise<boolean> {
  const db = await getDb()
  const result = await db.run(
    'UPDATE design_fonts SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ?',
    [id],
  )
  return Number(result.changes) > 0
}

export function resolveDesignFontFilePath(filename: string): string | null {
  return resolveSafeExistingPath([designFontsDir], filename)
}

export function contentTypeForFontFormat(format: string): string {
  switch (format) {
    case 'woff2': return 'font/woff2'
    case 'woff': return 'font/woff'
    case 'otf': return 'font/otf'
    default: return 'font/ttf'
  }
}

async function buildGlobalFontMap(): Promise<Map<string, { id: number; url: string; format: string }>> {
  const fonts = await listDesignFonts(true)
  const map = new Map<string, { id: number; url: string; format: string }>()
  for (const font of fonts) {
    map.set(normalizeFontFamilyName(font.family_name).toLowerCase(), {
      id: font.id,
      url: font.url,
      format: font.format,
    })
  }
  return map
}

export async function buildRequiredFontsForDesignState(
  designState: unknown,
  bundledFonts: BundledTemplateFont[] = [],
): Promise<RequiredFontEntry[]> {
  const families = extractUsedFontFamiliesFromDesignState(designState)
  const globalByFamily = await buildGlobalFontMap()
  return buildRequiredFontEntries({ families, globalByFamily, bundledFonts })
}

export async function enrichSpecWithRequiredFonts(
  spec: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const designState = spec.designState
  const bundled = Array.isArray(spec.fonts) ? spec.fonts as BundledTemplateFont[] : []
  const requiredFonts = await buildRequiredFontsForDesignState(designState, bundled)
  const fontWarnings = requiredFonts
    .filter((f) => f.source === 'missing')
    .map((f) => `Шрифт «${f.family}» не найден в библиотеке CRM и не приложен к шаблону.`)
  const prevImport = (spec.import as Record<string, unknown> | undefined) ?? {}
  const prevWarnings = Array.isArray(prevImport.warnings) ? prevImport.warnings as string[] : []
  const mergedWarnings = [...prevWarnings]
  for (const w of fontWarnings) {
    if (!mergedWarnings.includes(w)) mergedWarnings.push(w)
  }
  return {
    ...spec,
    requiredFonts,
    fontsResolved: !hasMissingRequiredFonts(requiredFonts),
    import: {
      ...prevImport,
      warnings: mergedWarnings,
    },
  }
}

export async function resolveFontFilesForDesignState(
  designState: unknown,
  templateSpec?: Record<string, unknown> | null,
): Promise<Array<{ family: string; filePath: string; format: string }>> {
  const bundled = templateSpec && Array.isArray(templateSpec.fonts)
    ? templateSpec.fonts as BundledTemplateFont[]
    : []
  const required = await buildRequiredFontsForDesignState(designState, bundled)
  const resolved: Array<{ family: string; filePath: string; format: string }> = []
  for (const entry of required) {
    if (entry.source === 'missing' || !entry.url) continue
    if (entry.source === 'global' && entry.fontId) {
      const font = await getDesignFontById(entry.fontId)
      if (!font) continue
      const filePath = resolveDesignFontFilePath(font.filename)
      if (filePath) resolved.push({ family: entry.family, filePath, format: font.format })
      continue
    }
    if (entry.source === 'bundled') {
      const bundledEntry = bundled.find((b) => fontFamilyNamesMatch(b.family, entry.family))
      const filename = bundledEntry?.filename
      if (!filename) continue
      const filePath = resolveSafeExistingPath([uploadsDir, designFontsDir], filename)
      if (filePath) {
        resolved.push({
          family: entry.family,
          filePath,
          format: bundledEntry?.format ?? 'woff2',
        })
      }
    }
  }
  return resolved
}
