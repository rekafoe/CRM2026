import { api } from '../../../api'
import type { SimplifiedConfig, SimplifiedPrintPrice, SimplifiedSizeConfig, SimplifiedTypeConfig } from '../hooks/useProductTemplate'
import { getEffectiveAllowedMaterialIds } from '../hooks/useProductTemplate'

export type PrintTechForDerive = {
  code: string
  pricing_mode?: 'per_sheet' | 'per_meter' | 'per_m2' | string
}

export type PrintModeForDerive = {
  color_mode: 'color' | 'bw'
  sides_mode: 'single' | 'duplex' | 'duplex_bw_back'
}

export type WarehouseMaterialSheetDims = {
  id: number
  sheet_width?: number | null
  sheet_height?: number | null
}

export function printVariantKey(
  color_mode: string | undefined,
  sides_mode: string | undefined,
): string {
  const color = color_mode === 'bw' ? 'bw' : 'color'
  const sides = sides_mode === 'duplex' || sides_mode === 'duplex_bw_back' ? sides_mode : 'single'
  return `${color}|${sides}`
}

export function firstMaterialIdWithSheetDims(
  allMaterials: WarehouseMaterialSheetDims[] | undefined,
  allowedIds: number[] | undefined,
): number | undefined {
  if (!allMaterials?.length || !allowedIds?.length) return undefined
  for (const rawId of allowedIds) {
    const id = Number(rawId)
    if (!Number.isFinite(id)) continue
    const m = allMaterials.find((x) => Number(x.id) === id)
    const sw = m != null ? Number(m.sheet_width) : 0
    const sh = m != null ? Number(m.sheet_height) : 0
    if (sw > 0 && sh > 0) return id
  }
  return undefined
}

export function isPerSheetPrintTech(
  printTechs: PrintTechForDerive[],
  technologyCode: string,
): boolean {
  const tech = printTechs.find((t) => String(t.code) === String(technologyCode))
  return tech?.pricing_mode === 'per_sheet'
}

export function remainingPrintModesForTechnology(
  size: SimplifiedSizeConfig,
  technologyCode: string,
): PrintModeForDerive[] {
  const remainingForTech = (size.print_prices || []).filter(
    (row) => String(row.technology_code) === String(technologyCode),
  )
  const modes: PrintModeForDerive[] = []
  const seenModes = new Set<string>()
  for (const row of remainingForTech) {
    const key = printVariantKey(row.color_mode, row.sides_mode)
    if (seenModes.has(key)) continue
    seenModes.add(key)
    const [color_mode, sides_mode] = key.split('|') as [
      'color' | 'bw',
      'single' | 'duplex' | 'duplex_bw_back',
    ]
    modes.push({ color_mode, sides_mode })
  }
  return modes
}

export function printModeLabel(mode: PrintModeForDerive): string {
  const color = mode.color_mode === 'color' ? 'цвет' : 'ч/б'
  const sides = mode.sides_mode === 'duplex' || mode.sides_mode === 'duplex_bw_back' ? 'двусторонне' : 'односторонне'
  return `${color}, ${sides}`
}

export function mergeDerivedPrintPrices(
  size: SimplifiedSizeConfig,
  technologyCode: string,
  derivedRows: SimplifiedPrintPrice[],
  itemsPerSheet?: number,
): SimplifiedSizeConfig {
  const remainingForTech = (size.print_prices || []).filter(
    (row) => String(row.technology_code) === String(technologyCode),
  )
  const otherTechnologies = (size.print_prices || []).filter(
    (row) => String(row.technology_code) !== String(technologyCode),
  )
  const derivedByKey = new Map(
    derivedRows.map((row) => [printVariantKey(row.color_mode, row.sides_mode), row] as const),
  )
  const nextForTech = remainingForTech.map((row) =>
    derivedByKey.get(printVariantKey(row.color_mode, row.sides_mode)) ?? row,
  )
  const next: SimplifiedSizeConfig = {
    ...size,
    print_prices: [...otherTechnologies, ...nextForTech],
  }
  if (itemsPerSheet != null && itemsPerSheet > 0) {
    next.min_qty = itemsPerSheet
  }
  return next
}

function typeUsesSheetPrintPrices(
  typeConfig: SimplifiedTypeConfig | undefined,
  config: SimplifiedConfig,
): boolean {
  if (config.material_driven_printing === true) return true
  const uv = typeConfig?.uv_print ?? config.uv_print
  const roll = typeConfig?.roll_m2 ?? config.roll_m2
  if (uv?.mode === 'flatbed_m2') return false
  if (roll?.mode === 'roll_wide_m2') return false
  return true
}

function uniqueTechnologyCodes(size: SimplifiedSizeConfig, onlyTech?: string): string[] {
  if (onlyTech) return [onlyTech]
  const codes: string[] = []
  const seen = new Set<string>()
  const push = (code: string | undefined) => {
    const trimmed = String(code || '').trim()
    if (!trimmed || seen.has(trimmed)) return
    seen.add(trimmed)
    codes.push(trimmed)
  }
  push(size.default_print?.technology_code)
  for (const row of size.print_prices || []) push(row.technology_code)
  return codes
}

export async function deriveSizePrintPricesFromCentral(options: {
  size: SimplifiedSizeConfig
  printTechs: PrintTechForDerive[]
  allMaterials?: WarehouseMaterialSheetDims[]
  allowedMaterialIds?: number[]
  technologyCode?: string
}): Promise<{
  size: SimplifiedSizeConfig
  problems: string[]
  filledModes: number
  skipped?: string
}> {
  const { size, printTechs, allMaterials, allowedMaterialIds, technologyCode } = options
  if (!(size.width_mm > 0 && size.height_mm > 0)) {
    return { size, problems: [], filledModes: 0, skipped: 'нет размера изделия' }
  }

  const techs = uniqueTechnologyCodes(size, technologyCode).filter((code) =>
    isPerSheetPrintTech(printTechs, code),
  )
  if (techs.length === 0) {
    return { size, problems: [], filledModes: 0, skipped: 'нет листовой технологии печати' }
  }

  const layoutMaterialId = firstMaterialIdWithSheetDims(allMaterials, allowedMaterialIds)
  let nextSize = size
  const problems: string[] = []
  let filledModes = 0

  for (const tech of techs) {
    const modes = remainingPrintModesForTechnology(nextSize, tech)
    if (modes.length === 0) {
      problems.push(`${tech}: нет оставшихся режимов печати`)
      continue
    }

    const derivedRows: SimplifiedPrintPrice[] = []
    let itemsPerSheet: number | undefined

    for (const mode of modes) {
      try {
        const r = await api.get('/pricing/print-prices/derive', {
          params: {
            technology_code: tech,
            width_mm: nextSize.width_mm,
            height_mm: nextSize.height_mm,
            color_mode: mode.color_mode,
            sides_mode: mode.sides_mode === 'duplex' || mode.sides_mode === 'duplex_bw_back' ? 'duplex' : 'single',
            ...(layoutMaterialId != null ? { material_id: layoutMaterialId } : {}),
            ...(nextSize.cut_margin_mm != null ? { cut_margin_mm: nextSize.cut_margin_mm } : {}),
            ...(nextSize.cut_gap_mm != null ? { cut_gap_mm: nextSize.cut_gap_mm } : {}),
            ...(nextSize.items_per_sheet_override != null
              ? { items_per_sheet_override: nextSize.items_per_sheet_override }
              : {}),
          },
        })
        const raw = r.data as { data?: unknown } & Record<string, unknown> | undefined
        const data = (raw != null && raw.data !== undefined ? raw.data : raw) as {
          items_per_sheet?: number
          tiers?: Array<{ min_qty: number; max_qty?: number; unit_price: number }>
          message?: string
          error?: string
        }
        if (data?.items_per_sheet != null) itemsPerSheet = data.items_per_sheet
        const tiers = data?.tiers ?? []
        if (tiers.length > 0) {
          derivedRows.push({
            technology_code: tech,
            color_mode: mode.color_mode,
            sides_mode: mode.sides_mode,
            tiers: tiers.map((t) => ({
              min_qty: t.min_qty,
              max_qty: t.max_qty,
              unit_price: t.unit_price ?? 0,
            })),
          })
        } else {
          const hint = data?.message || data?.error || 'Нет диапазонов тиража для этой комбинации в центральных ценах печати.'
          problems.push(`${tech} (${printModeLabel(mode)}): ${hint}`)
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        problems.push(`${tech} (${printModeLabel(mode)}): ${msg}`)
      }
    }

    if (derivedRows.length > 0) {
      nextSize = mergeDerivedPrintPrices(nextSize, tech, derivedRows, itemsPerSheet)
      filledModes += derivedRows.length
    }
  }

  if (filledModes === 0 && !problems.length) {
    return { size, problems, filledModes: 0, skipped: 'нет параметров печати для заполнения' }
  }

  return { size: nextSize, problems, filledModes }
}

export async function deriveAllProductPrintPricesFromCentral(options: {
  config: SimplifiedConfig
  printTechs: PrintTechForDerive[]
  allMaterials?: WarehouseMaterialSheetDims[]
}): Promise<{
  config: SimplifiedConfig
  filledSizes: number
  skippedSizes: number
  problems: string[]
}> {
  const { printTechs, allMaterials } = options
  let config = options.config
  const problems: string[] = []
  let filledSizes = 0
  let skippedSizes = 0

  const typed = Array.isArray(config.types) && config.types.length > 0 && config.typeConfigs
  if (typed) {
    const nextTypeConfigs = { ...config.typeConfigs }
    for (const type of config.types || []) {
      const typeKey = String(type.id)
      const typeConfig = nextTypeConfigs[typeKey]
      if (!typeConfig) continue
      if (!typeUsesSheetPrintPrices(typeConfig, config)) {
        skippedSizes += (typeConfig.sizes || []).length
        continue
      }
      const nextSizes: SimplifiedSizeConfig[] = []
      for (const size of typeConfig.sizes || []) {
        const result = await deriveSizePrintPricesFromCentral({
          size,
          printTechs,
          allMaterials,
          allowedMaterialIds: getEffectiveAllowedMaterialIds(typeConfig, size),
        })
        const label = `${type.name || typeKey} / ${size.label || size.id}`
        if (result.filledModes > 0) {
          filledSizes += 1
          nextSizes.push(result.size)
        } else {
          skippedSizes += 1
          nextSizes.push(size)
        }
        for (const problem of result.problems) problems.push(`${label}: ${problem}`)
        if (
          result.skipped
          && result.filledModes === 0
          && result.skipped !== 'нет листовой технологии печати'
        ) {
          problems.push(`${label}: ${result.skipped}`)
        }
      }
      nextTypeConfigs[typeKey] = { ...typeConfig, sizes: nextSizes }
    }
    config = { ...config, typeConfigs: nextTypeConfigs }
    return { config, filledSizes, skippedSizes, problems }
  }

  if (!typeUsesSheetPrintPrices(undefined, config)) {
    return { config, filledSizes: 0, skippedSizes: (config.sizes || []).length, problems }
  }

  const nextSizes: SimplifiedSizeConfig[] = []
  for (const size of config.sizes || []) {
    const result = await deriveSizePrintPricesFromCentral({
      size,
      printTechs,
      allMaterials,
      allowedMaterialIds: size.allowed_material_ids,
    })
    const label = String(size.label || size.id)
    if (result.filledModes > 0) {
      filledSizes += 1
      nextSizes.push(result.size)
    } else {
      skippedSizes += 1
      nextSizes.push(size)
    }
    for (const problem of result.problems) problems.push(`${label}: ${problem}`)
    if (
      result.skipped
      && result.filledModes === 0
      && result.skipped !== 'нет листовой технологии печати'
    ) {
      problems.push(`${label}: ${result.skipped}`)
    }
  }

  return { config: { ...config, sizes: nextSizes }, filledSizes, skippedSizes, problems }
}
