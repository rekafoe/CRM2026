import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import { orderFilesDir, resolveSafeExistingPath, uploadsDir } from '../config/upload'

const PREFLIGHT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/tiff',
] as const

export type PreflightFileType = 'pdf' | 'jpeg' | 'png' | 'tiff'

export interface PreflightIssue {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
}

export interface PreflightReport {
  type: PreflightFileType
  valid: boolean
  issues: PreflightIssue[]
  info: Record<string, unknown>
}

const BLEED_MM = 3
const PT_TO_MM = 25.4 / 72

function addIssue(issues: PreflightIssue[], severity: PreflightIssue['severity'], code: string, message: string): void {
  issues.push({ severity, code, message })
}

/** Парсит целевой формат (trim) из params позиции заказа */
export function parseTargetFormatFromParams(params: unknown): { width_mm: number; height_mm: number } | null {
  if (!params || typeof params !== 'object') return null
  const p = params as Record<string, unknown>

  // customFormat: { width, height }
  const cf = p.customFormat as { width?: number; height?: number } | undefined
  if (cf && typeof cf.width === 'number' && typeof cf.height === 'number' && cf.width > 0 && cf.height > 0) {
    return { width_mm: cf.width, height_mm: cf.height }
  }

  // formatInfo или specifications.format: "90×50" или "90×50 мм"
  const formatStr =
    (p.formatInfo as string) ||
    (p.specifications as Record<string, unknown>)?.format as string
  if (typeof formatStr === 'string') {
    const m = formatStr.match(/([\d.]+)\s*[×xX]\s*([\d.]+)/i)
    if (m) {
      const w = parseFloat(m[1])
      const h = parseFloat(m[2])
      if (w > 0 && h > 0) return { width_mm: w, height_mm: h }
    }
  }

  return null
}

/**
 * Префлайт для PDF: валидность, страницы, размеры, BleedBox, сравнение с форматом
 */
async function preflightPdf(
  filePath: string,
  targetFormat: { width_mm: number; height_mm: number } | null
): Promise<PreflightReport> {
  const issues: PreflightIssue[] = []
  const info: Record<string, unknown> = {}

  try {
    const buffer = fs.readFileSync(filePath)
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
    const pages = doc.getPages()

    info.pageCount = pages.length
    info.fileSize = buffer.length

    if (pages.length === 0) {
      addIssue(issues, 'error', 'NO_PAGES', 'PDF не содержит страниц')
      return { type: 'pdf', valid: false, issues, info }
    }

    const firstPage = pages[0]
    const { width, height } = firstPage.getSize()
    info.width = Math.round(width)
    info.height = Math.round(height)

    const widthMm = width * PT_TO_MM
    const heightMm = height * PT_TO_MM
    info.fileSizeMm = { width_mm: Math.round(widthMm * 10) / 10, height_mm: Math.round(heightMm * 10) / 10 }

    // Проверка BleedBox (если есть)
    try {
      const bleedBox = firstPage.getBleedBox?.()
      if (bleedBox) {
        info.bleedBox = {
          x: Math.round(bleedBox.x),
          y: Math.round(bleedBox.y),
          width: Math.round(bleedBox.width),
          height: Math.round(bleedBox.height),
        }
      }
    } catch {
      // BleedBox может отсутствовать
    }

    if (targetFormat) {
      info.targetFormat = targetFormat
      info.trimSize = targetFormat
      const requiredWithBleed = {
        width_mm: targetFormat.width_mm + 2 * BLEED_MM,
        height_mm: targetFormat.height_mm + 2 * BLEED_MM,
      }
      const hasBleed = widthMm >= requiredWithBleed.width_mm - 0.5 && heightMm >= requiredWithBleed.height_mm - 0.5
      info.hasBleed = hasBleed

      if (widthMm < targetFormat.width_mm - 0.5 || heightMm < targetFormat.height_mm - 0.5) {
        addIssue(issues, 'error', 'SIZE_MISMATCH', `Размер файла ${Math.round(widthMm)}×${Math.round(heightMm)} мм меньше формата ${targetFormat.width_mm}×${targetFormat.height_mm} мм`)
      } else if (!hasBleed) {
        addIssue(issues, 'warning', 'NO_BLEED', `Нет вылета ${BLEED_MM} мм — возможны белые края при обрезке. Нужно ${requiredWithBleed.width_mm}×${requiredWithBleed.height_mm} мм`)
      } else {
        addIssue(issues, 'info', 'BLEED_OK', `Вылет ${BLEED_MM} мм учтён`)
      }
    }

    addIssue(issues, 'info', 'PDF_OK', `PDF валиден: ${pages.length} стр., ${info.width}×${info.height} pt`)
    return { type: 'pdf', valid: !issues.some((i) => i.severity === 'error'), issues, info }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    addIssue(issues, 'error', 'PDF_PARSE_ERROR', `Ошибка чтения PDF: ${msg}`)
    return { type: 'pdf', valid: false, issues, info }
  }
}

const MIN_DPI = 300
const CMYK_SPACE = 'cmyk'

/**
 * Префлайт для изображений (JPG, PNG, TIFF): размеры, DPI, цветовое пространство, сравнение с форматом
 */
async function preflightImage(
  filePath: string,
  type: PreflightFileType,
  targetFormat: { width_mm: number; height_mm: number } | null
): Promise<PreflightReport> {
  const issues: PreflightIssue[] = []
  const info: Record<string, unknown> = {}

  try {
    const metadata = await sharp(filePath).metadata()
    const stats = fs.statSync(filePath)

    const width = metadata.width ?? 0
    const height = metadata.height ?? 0
    const dpi = metadata.density != null ? Number(metadata.density) : 300
    const space = metadata.space

    info.width = width
    info.height = height
    info.fileSize = stats.size
    info.format = metadata.format

    const widthMm = width * 25.4 / dpi
    const heightMm = height * 25.4 / dpi
    info.fileSizeMm = { width_mm: Math.round(widthMm * 10) / 10, height_mm: Math.round(heightMm * 10) / 10 }

    if (metadata.density != null) {
      info.dpi = metadata.density
      if (metadata.density < MIN_DPI) {
        addIssue(issues, 'warning', 'LOW_DPI', `Разрешение ${metadata.density} DPI — рекомендуется ≥ ${MIN_DPI} DPI для печати`)
      } else {
        addIssue(issues, 'info', 'DPI_OK', `Разрешение: ${metadata.density} DPI`)
      }
    } else {
      addIssue(issues, 'warning', 'NO_DPI', 'DPI не указан в метаданных')
    }

    if (space && String(space).toLowerCase() === CMYK_SPACE) {
      addIssue(issues, 'warning', 'CMYK', 'Цветовое пространство CMYK — возможны отличия при печати')
    } else if (space) {
      info.colorSpace = space
      addIssue(issues, 'info', 'COLOR_SPACE', `Цветовое пространство: ${space}`)
    }

    if (targetFormat) {
      info.targetFormat = targetFormat
      info.trimSize = targetFormat
      const requiredWithBleed = {
        width_mm: targetFormat.width_mm + 2 * BLEED_MM,
        height_mm: targetFormat.height_mm + 2 * BLEED_MM,
      }
      const hasBleed = widthMm >= requiredWithBleed.width_mm - 0.5 && heightMm >= requiredWithBleed.height_mm - 0.5
      info.hasBleed = hasBleed

      if (widthMm < targetFormat.width_mm - 0.5 || heightMm < targetFormat.height_mm - 0.5) {
        addIssue(issues, 'error', 'SIZE_MISMATCH', `Размер файла ${Math.round(widthMm)}×${Math.round(heightMm)} мм меньше формата ${targetFormat.width_mm}×${targetFormat.height_mm} мм`)
      } else if (!hasBleed) {
        addIssue(issues, 'warning', 'NO_BLEED', `Нет вылета ${BLEED_MM} мм — возможны белые края при обрезке. Нужно ${requiredWithBleed.width_mm}×${requiredWithBleed.height_mm} мм`)
      } else {
        addIssue(issues, 'info', 'BLEED_OK', `Вылет ${BLEED_MM} мм учтён`)
      }
    }

    addIssue(issues, 'info', 'IMAGE_OK', `Изображение валидно: ${width}×${height} px`)
    return { type, valid: !issues.some((i) => i.severity === 'error'), issues, info }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    addIssue(issues, 'error', 'IMAGE_PARSE_ERROR', `Ошибка чтения изображения: ${msg}`)
    return { type, valid: false, issues, info }
  }
}

function resolveFilePath(filename: string): string | null {
  return resolveSafeExistingPath([orderFilesDir, uploadsDir], filename)
}

/**
 * Выполнить префлайт файла заказа
 */
export async function runPreflight(
  filename: string,
  mime: string | null,
  targetFormat: { width_mm: number; height_mm: number } | null = null
): Promise<PreflightReport> {
  const filePath = resolveFilePath(filename)
  if (!filePath) {
    return {
      type: 'pdf',
      valid: false,
      issues: [{ severity: 'error', code: 'FILE_NOT_FOUND', message: 'Файл не найден на диске' }],
      info: {},
    }
  }

  const mimeNorm = (mime || '').toLowerCase()

  if (mimeNorm === 'application/pdf') {
    return preflightPdf(filePath, targetFormat)
  }

  if (mimeNorm === 'image/jpeg' || mimeNorm === 'image/jpg') {
    return preflightImage(filePath, 'jpeg', targetFormat)
  }
  if (mimeNorm === 'image/png') {
    return preflightImage(filePath, 'png', targetFormat)
  }
  if (mimeNorm === 'image/tiff') {
    return preflightImage(filePath, 'tiff', targetFormat)
  }

  return {
    type: 'pdf',
    valid: false,
    issues: [{ severity: 'error', code: 'UNSUPPORTED', message: `Формат не поддерживается для префлайта: ${mime || 'неизвестно'}` }],
    info: {},
  }
}

export { PREFLIGHT_MIME_TYPES }
