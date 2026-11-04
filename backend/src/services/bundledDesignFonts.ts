import fs from 'fs'
import path from 'path'
import { logger } from '../utils/logger'
import {
  createDesignFont,
  getDesignFontByFamily,
  resolveDesignFontFilePath,
  updateDesignFont,
} from './designFontService'

/** Каноническое имя в шаблонах и в библиотеке — как в Google Fonts / fontsCatalog. */
export const BUNDLED_MANROPE_FAMILY = 'Manrope'
export const BUNDLED_MANROPE_FILENAME = 'Manrope-Regular.ttf'

/**
 * Regular 400, не variable ExtraLight: иначе OS/2 usWeightClass=200
 * переписал бы fontWeight в JSON при «открыть → сохранить».
 */
export function resolveBundledManropePath(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../assets/design-fonts', BUNDLED_MANROPE_FILENAME),
    path.resolve(process.cwd(), 'assets/design-fonts', BUNDLED_MANROPE_FILENAME),
    path.resolve(process.cwd(), 'backend/assets/design-fonts', BUNDLED_MANROPE_FILENAME),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

export type BundledDesignFontSeedResult = 'created' | 'restored' | 'exists' | 'skipped'

/**
 * Кладёт Manrope Regular в design_fonts, если его ещё нет.
 * Существующую запись с тем же family не перезаписывает.
 * Если строка есть, а файла на диске нет (пустой volume) — восстанавливает файл.
 */
export async function ensureBundledDesignFonts(): Promise<BundledDesignFontSeedResult> {
  const bundledPath = resolveBundledManropePath()
  if (!bundledPath) {
    logger.warn('Bundled Manrope font is missing from assets/design-fonts')
    return 'skipped'
  }

  let buffer: Buffer
  try {
    buffer = fs.readFileSync(bundledPath)
  } catch (error) {
    logger.warn('Failed to read bundled Manrope font', { error })
    return 'skipped'
  }
  if (!buffer.length) return 'skipped'

  const existing = await getDesignFontByFamily(BUNDLED_MANROPE_FAMILY)
  if (existing) {
    if (resolveDesignFontFilePath(existing.filename)) return 'exists'
    const updated = await updateDesignFont(
      existing.id,
      {
        family_name: existing.family_name,
        is_active: existing.is_active,
      },
      { buffer, originalname: BUNDLED_MANROPE_FILENAME },
    )
    if (!updated) return 'skipped'
    logger.info('Restored bundled Manrope font file', { id: existing.id, family: existing.family_name })
    return 'restored'
  }

  const created = await createDesignFont(
    {
      family_name: BUNDLED_MANROPE_FAMILY,
      label: BUNDLED_MANROPE_FAMILY,
      is_active: true,
    },
    { buffer, originalname: BUNDLED_MANROPE_FILENAME },
  )
  logger.info('Seeded bundled Manrope into design_fonts', { id: created.id })
  return 'created'
}
