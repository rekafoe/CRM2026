/**
 * Сборка многостраничного изделия.
 * Первый вопрос — печатается обложка или крышка уже готова.
 * Список переплётов здесь не задаётся: переплёт — услуга bind.
 */

export const SPRING_NOTEBOOK_COVER_PAGES = 2
export const SPRING_NOTEBOOK_DEFAULT_SHEETS = 50
export const SHEET_BLOCK_MAX_SHEETS = 500
export const READY_LID_COVERS_PER_ITEM = 2
export const READY_LID_CHANNELS_PER_ITEM = 1
/** Печатная обложка на картоне: перед и зад. */
export const WRAP_BOARDS_PER_ITEM = 2

export type CoverChoice = 'printed' | 'ready'
export type CoverPrintChoice = 'outside' | 'both'

export type BoundStructure = {
  coverChoice?: CoverChoice
  notebook?: {
    use_sheets?: boolean
    sheets?: number
    white_material_id?: number
    grid_material_id?: number
  }
  readyLid?: {
    cover_material_ids?: number[]
    channel_material_ids?: number[]
  }
  innerBlock?: {
    pagesSource?: 'parameter' | 'fixed'
    fixedPages?: number
    print?: {
      technology_code?: string
      color_mode?: 'color' | 'bw'
      sides_mode?: 'single' | 'duplex' | 'duplex_bw_back'
    }
  }
  cover?: {
    mode?: 'none' | 'self' | 'separate'
    page_count?: number
    /** Бумага клеится на картон и не режется раскладкой блока. Печатная обложка, не готовая крышка. */
    wrap?: boolean
    /** Переплётный картон. Списание: 2 шт на изделие. */
    board_material_ids?: number[]
    board_material_id?: number
    print?: {
      technology_code?: string
      color_mode?: 'color' | 'bw'
      sides_mode?: 'single' | 'duplex' | 'duplex_bw_back'
    }
    allowed_material_ids?: number[]
    material_id?: number
    lamination?: {
      service_id?: number
      variant_id?: number
    }
  }
  binding?: {
    service_id?: number
    variant_id?: number
  }
}

export type ThicknessMaterial = {
  id: number
  name?: string
  sheet_thickness_mm?: number | null
  spine_thickness_mm?: number | null
  channel_min_mm?: number | null
  channel_max_mm?: number | null
  sheet_price_single?: number | null
}

export function positiveInt(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function positiveNumber(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function springBlockPages(sheets: number): number {
  return positiveInt(sheets, SPRING_NOTEBOOK_DEFAULT_SHEETS) * 2
}

export function springTotalPages(
  sheets: number,
  coverPages: number = SPRING_NOTEBOOK_COVER_PAGES,
): number {
  return springBlockPages(sheets) + positiveInt(coverPages, SPRING_NOTEBOOK_COVER_PAGES)
}

export function coverPrintChoiceToSides(choice: CoverPrintChoice): 'single' | 'duplex' {
  return choice === 'both' ? 'duplex' : 'single'
}

export function sidesToCoverPrintChoice(sides?: string | null): CoverPrintChoice {
  return sides === 'duplex' || sides === 'duplex_bw_back' ? 'both' : 'outside'
}

export function coverChoiceOf(structure?: BoundStructure | null): CoverChoice {
  return structure?.coverChoice === 'ready' ? 'ready' : 'printed'
}

export function isReadyLid(structure?: BoundStructure | null): boolean {
  return coverChoiceOf(structure) === 'ready'
}

export function usesBlockSheets(structure?: BoundStructure | null): boolean {
  return !isReadyLid(structure) && structure?.notebook?.use_sheets === true
}

export function springSheetsOf(structure?: BoundStructure | null): number {
  return positiveInt(structure?.notebook?.sheets, SPRING_NOTEBOOK_DEFAULT_SHEETS)
}

export function paperChoiceOf(
  structure?: BoundStructure | null,
): { whiteId: number; gridId: number } | null {
  if (!usesBlockSheets(structure)) return null
  const whiteId = Number(structure?.notebook?.white_material_id)
  const gridId = Number(structure?.notebook?.grid_material_id)
  if (!Number.isFinite(whiteId) || whiteId <= 0) return null
  if (!Number.isFinite(gridId) || gridId <= 0) return null
  if (whiteId === gridId) return null
  return { whiteId, gridId }
}

/** Кашировка: бумага обложки клеится на картон. Только у печатной обложки «Своя бумага и печать». */
export function coverIsWrapped(structure?: BoundStructure | null): boolean {
  return !isReadyLid(structure) && structure?.cover?.mode === 'separate' && structure.cover.wrap === true
}

/**
 * Перед и зад: два картона на пружине или два листа бумаги под кашировку.
 * Число страниц обложки тогда не настраивается, это всегда 2.
 */
export function coverIsTwoPiece(structure?: BoundStructure | null): boolean {
  return usesBlockSheets(structure) || coverIsWrapped(structure)
}

export function sheetBlockError(sheets: unknown): string | null {
  const n = Number(sheets)
  if (!Number.isFinite(n) || n < 1) return 'Укажите листы блока'
  if (n > SHEET_BLOCK_MAX_SHEETS) return `Не более ${SHEET_BLOCK_MAX_SHEETS} листов`
  return null
}

export function applySheetBlock(
  structure: BoundStructure | undefined,
  sheets: number = SPRING_NOTEBOOK_DEFAULT_SHEETS,
): BoundStructure {
  const nextSheets = positiveInt(sheets, SPRING_NOTEBOOK_DEFAULT_SHEETS)
  const prevPrint = structure?.cover?.print
  const sides = prevPrint?.sides_mode === 'duplex' || prevPrint?.sides_mode === 'duplex_bw_back'
    ? prevPrint.sides_mode
    : 'single'
  return {
    ...(structure ?? {}),
    coverChoice: 'printed',
    notebook: {
      ...(structure?.notebook ?? {}),
      use_sheets: true,
      sheets: nextSheets,
    },
    innerBlock: {
      ...(structure?.innerBlock ?? {}),
      pagesSource: 'parameter',
      print: {
        ...(structure?.innerBlock?.print ?? {}),
        sides_mode: 'duplex',
      },
    },
    cover: {
      ...(structure?.cover ?? {}),
      mode: 'separate',
      page_count: SPRING_NOTEBOOK_COVER_PAGES,
      print: {
        ...(prevPrint ?? {}),
        sides_mode: sides,
      },
    },
  }
}

function coverHasPrintSetup(cover: BoundStructure['cover']): boolean {
  if (!cover) return false
  return Boolean(
    cover.print?.technology_code ||
    (cover.allowed_material_ids?.length ?? 0) > 0 ||
    cover.material_id != null ||
    cover.lamination?.service_id != null ||
    cover.wrap === true,
  )
}

/**
 * Возврат к печатной обложке. Бумага, печать, ламинация и картон остаются теми,
 * что были до готовой крышки: расчёт их не читал, пока обложка была выключена.
 */
export function applyPrintedCover(structure: BoundStructure | undefined): BoundStructure {
  const cover = structure?.cover
  const mode = cover?.mode && cover.mode !== 'none'
    ? cover.mode
    : coverHasPrintSetup(cover) ? 'separate' : cover?.mode
  return {
    ...(structure ?? {}),
    coverChoice: 'printed',
    cover: { ...(cover ?? {}), ...(mode ? { mode } : {}) },
  }
}

/** Готовая крышка выключает печатную обложку, но её настройки не стирает. */
export function applyReadyCover(structure: BoundStructure | undefined): BoundStructure {
  const cover = { ...(structure?.cover ?? {}) }
  const blockSides = structure?.innerBlock?.print?.sides_mode
  return {
    ...(structure ?? {}),
    coverChoice: 'ready',
    notebook: {
      ...(structure?.notebook ?? {}),
      use_sheets: false,
    },
    innerBlock: {
      ...(structure?.innerBlock ?? {}),
      print: {
        ...(structure?.innerBlock?.print ?? {}),
        sides_mode: blockSides === 'single' ? 'single' : 'duplex',
      },
    },
    cover: {
      ...cover,
      mode: 'none',
    },
    readyLid: {
      cover_material_ids: structure?.readyLid?.cover_material_ids ?? [],
      channel_material_ids: structure?.readyLid?.channel_material_ids ?? [],
    },
  }
}

export function blockSheetCount(blockPages: number, pagesPerSheet: number): number {
  const pages = positiveNumber(blockPages)
  const per = pagesPerSheet === 1 ? 1 : 2
  if (pages <= 0) return 0
  return Math.ceil(pages / per)
}

export function readyLidThicknessMm(
  sheetCount: number,
  sheetThicknessMm: number,
  spineThicknessMm: number,
): number {
  const sheets = positiveNumber(sheetCount)
  const caliper = positiveNumber(sheetThicknessMm)
  const block = sheets > 0 && caliper > 0 ? sheets * caliper : 0
  return block + positiveNumber(spineThicknessMm) * READY_LID_COVERS_PER_ITEM
}

export function pickChannel<T extends ThicknessMaterial>(
  channels: T[],
  thicknessMm: number,
): T | null {
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
  return String(Math.round(value * 100) / 100)
}

export type OperatorView = {
  hidePrint: boolean
  hideCover: boolean
  hideLamination: boolean
  hidePages: boolean
  showSheets: boolean
  showCoverPrint: boolean
  showReadyLid: boolean
  paperChoice: { whiteId: number; gridId: number } | null
  hiddenLabels: string[]
}

export function describeOperatorView(structure?: BoundStructure | null): OperatorView {
  if (isReadyLid(structure)) {
    return {
      hidePrint: true,
      hideCover: true,
      hideLamination: true,
      hidePages: false,
      showSheets: false,
      showCoverPrint: false,
      showReadyLid: true,
      paperChoice: null,
      hiddenLabels: ['печать', 'страницы обложки', 'ламинация'],
    }
  }
  if (usesBlockSheets(structure)) {
    return {
      hidePrint: false,
      hideCover: false,
      hideLamination: false,
      hidePages: true,
      showSheets: true,
      showCoverPrint: true,
      showReadyLid: false,
      paperChoice: paperChoiceOf(structure),
      hiddenLabels: ['поле «Страницы»'],
    }
  }
  return {
    hidePrint: false,
    hideCover: false,
    hideLamination: false,
    hidePages: false,
    showSheets: false,
    showCoverPrint: false,
    showReadyLid: false,
    paperChoice: null,
    hiddenLabels: [],
  }
}

export function isLaminationOperation(op: {
  operation_type?: string | null
  operation_name?: string | null
  name?: string | null
}): boolean {
  const operation = String(op.operation_type || '').toLowerCase()
  const name = String(op.operation_name || op.name || '').toLowerCase()
  return operation === 'laminate' || operation === 'lamination' || name.includes('ламин') || name.includes('laminat')
}
