/** Готовая крышка: 2 штуки на изделие, канал подставляется один. */
export const READY_LID_COVERS_PER_ITEM = 2
export const READY_LID_CHANNELS_PER_ITEM = 1
/** Печатная обложка на картоне: перед и зад, не готовая крышка. */
export const WRAP_BOARDS_PER_ITEM = 2

export type ChannelCandidate = {
  id: number
  name?: string
  channel_min_mm: number
  channel_max_mm: number
  sheet_price_single?: number | null
}

export function positiveNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Листы блока: двухсторонняя печать — две страницы на лист. */
export function blockSheetCount(blockPages: number, pagesPerSheet: number): number {
  const pages = positiveNumber(blockPages)
  const per = pagesPerSheet === 1 ? 1 : 2
  if (pages <= 0) return 0
  return Math.ceil(pages / per)
}

export function blockThicknessMm(sheetCount: number, sheetThicknessMm: number): number {
  const sheets = positiveNumber(sheetCount)
  const caliper = positiveNumber(sheetThicknessMm)
  if (sheets <= 0 || caliper <= 0) return 0
  return sheets * caliper
}

/**
 * В канал входят корешки обеих крышек, не толщина лица.
 * Толщина блока + 2 × корешок выбранной крышки.
 */
export function readyLidThicknessMm(
  sheetCount: number,
  sheetThicknessMm: number,
  spineThicknessMm: number,
): number {
  return blockThicknessMm(sheetCount, sheetThicknessMm) + positiveNumber(spineThicknessMm) * READY_LID_COVERS_PER_ITEM
}

export function pickChannel<T extends ChannelCandidate>(channels: T[], thicknessMm: number): T | null {
  const mm = Number(thicknessMm)
  if (!Number.isFinite(mm) || mm <= 0) return null
  const fits = channels.filter((channel) => {
    const min = Number(channel.channel_min_mm)
    const max = Number(channel.channel_max_mm)
    return Number.isFinite(min) && Number.isFinite(max) && min <= mm && mm <= max
  })
  if (fits.length === 0) return null
  fits.sort((a, b) => {
    const aSpan = Number(a.channel_max_mm) - Number(a.channel_min_mm)
    const bSpan = Number(b.channel_max_mm) - Number(b.channel_min_mm)
    if (aSpan !== bSpan) return aSpan - bSpan
    if (Number(a.channel_min_mm) !== Number(b.channel_min_mm)) {
      return Number(a.channel_min_mm) - Number(b.channel_min_mm)
    }
    return Number(a.id) - Number(b.id)
  })
  return fits[0]
}

export function formatMm(value: number): string {
  const rounded = Math.round(value * 100) / 100
  return String(rounded)
}
