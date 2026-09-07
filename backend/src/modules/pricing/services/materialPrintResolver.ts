import { getDb } from '../../../db'
import {
  MaterialPrintTechnologyService,
  type MaterialUsageContext,
} from '../../warehouse/services/materialPrintTechnologyService'
import { computeOptimizedRollFeedMeters } from './plotterLayout'

export type MaterialPrintResolution = {
  usageContext: MaterialUsageContext
  requestedMaterialId: number
  materialTypeId: number
  materialKind: 'sheet' | 'roll' | 'consumable' | 'area'
  selectedMaterialId: number
  selectedMaterialName: string
  selectedMaterialWidthMm: number | null
  selectedMaterialHeightMm: number | null
  availableQuantity: number
  requiredQuantity: number
  stockSufficient: boolean
  technologyCode: string
  technologyName: string
  pricingMode: string
  m2PricingKind: 'roll_wide' | 'uv_flatbed' | null
  warnings: string[]
}

export type ResolveMaterialPrintInput = {
  requestedMaterialId: number
  allowedMaterialIds: number[]
  usageContext?: unknown
  trimMm: { width: number; height: number }
  quantity: number
  bleedMm?: number
  edgeMm?: number
  gapMm?: number
  configuredTechnologyCodes?: string[]
}

type MaterialCandidate = {
  id: number
  name: string
  material_type_id: number | null
  material_kind: string | null
  sheet_width: number | null
  sheet_height: number | null
  printable_width: number | null
  quantity: number
  reserved_quantity: number
}

function routingError(message: string, status = 400): Error & { status: number } {
  const error = new Error(message) as Error & { status: number }
  error.status = status
  return error
}

function normalizeUsageContext(raw: unknown): MaterialUsageContext {
  return String(raw || '').trim().toLowerCase() === 'outdoor' ? 'outdoor' : 'indoor'
}

function normalizeMaterialKind(raw: unknown): MaterialPrintResolution['materialKind'] {
  const value = String(raw || '').trim().toLowerCase()
  if (value === 'roll' || value === 'sheet' || value === 'area') return value
  return 'consumable'
}

function placeholders(values: unknown[]): string {
  return values.map(() => '?').join(',')
}

export class MaterialPrintResolver {
  static async resolve(input: ResolveMaterialPrintInput): Promise<MaterialPrintResolution> {
    const requestedMaterialId = Number(input.requestedMaterialId)
    if (!Number.isInteger(requestedMaterialId) || requestedMaterialId <= 0) {
      throw routingError('Для автоматического выбора печати укажите материал')
    }

    const db = await getDb()
    const requested = await db.get<MaterialCandidate>(
      `SELECT
         m.id,
         m.name,
         m.material_type_id,
         m.material_kind,
         m.sheet_width,
         m.sheet_height,
         m.printable_width,
         COALESCE(m.quantity, 0) as quantity,
         COALESCE((
           SELECT SUM(mr.quantity_reserved)
           FROM material_reservations mr
           WHERE mr.material_id = m.id
             AND mr.status = 'active'
             AND (mr.expires_at IS NULL OR strftime('%s', mr.expires_at) > strftime('%s', 'now'))
         ), 0) as reserved_quantity
       FROM materials m
       WHERE m.id = ? AND m.is_active = 1`,
      [requestedMaterialId],
    )
    if (!requested) {
      throw routingError('Выбранный материал не найден или выключен')
    }

    const allowedIds = [...new Set(
      (input.allowedMaterialIds || [])
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
    )]
    if (allowedIds.length > 0 && !allowedIds.includes(requestedMaterialId)) {
      throw routingError('Выбранный материал не разрешён для этого размера')
    }
    if (!requested.material_type_id) {
      throw routingError(
        `Для материала «${requested.name}» не указан тип материала. Настройте его на складе.`,
      )
    }

    const usageContext = normalizeUsageContext(input.usageContext)
    const links = await MaterialPrintTechnologyService.listForMaterialType(
      Number(requested.material_type_id),
      { onlyActive: true },
    )
    const configuredCodes = new Set(
      (input.configuredTechnologyCodes || [])
        .map((code) => String(code || '').trim().toLowerCase())
        .filter(Boolean),
    )
    type CentralPrice = {
      counter_unit: string | null
      m2_pricing_kind: 'roll_wide' | 'uv_flatbed' | null
    }
    const centralPricesByCode = new Map<string, CentralPrice | undefined>()
    const candidatesWithPrice = []
    for (const link of links) {
      const codeKey = link.technology_code.toLowerCase()
      const centralPrice = await db.get<CentralPrice>(
        `SELECT counter_unit, m2_pricing_kind
         FROM print_prices
         WHERE LOWER(technology_code) = LOWER(?)
           AND is_active = 1
         ORDER BY id DESC
         LIMIT 1`,
        [link.technology_code],
      )
      centralPricesByCode.set(codeKey, centralPrice)
      const hasLocalPrice = configuredCodes.has(codeKey)
      const pricingMode = String(link.pricing_mode || '').trim().toLowerCase()
      const hasApplicablePrice =
        pricingMode === 'per_sheet'
          ? hasLocalPrice
          : pricingMode === 'per_m2'
            ? centralPrice?.counter_unit === 'm2'
            : hasLocalPrice || Boolean(centralPrice)
      if (hasApplicablePrice) candidatesWithPrice.push(link)
    }
    if (candidatesWithPrice.length === 0) {
      throw routingError(
        `Для материала «${requested.name}» нет совместимой технологии с настроенной ценой у выбранного размера`,
        422,
      )
    }
    const chosenTechnology = MaterialPrintTechnologyService.chooseForUsage(
      candidatesWithPrice,
      usageContext,
    )
    const centralPrice = centralPricesByCode.get(chosenTechnology.technology_code.toLowerCase())
    const technologyConfiguredInSize = configuredCodes.has(
      chosenTechnology.technology_code.toLowerCase(),
    )
    const pricingMode = String(chosenTechnology.pricing_mode || '').trim().toLowerCase()
    if (pricingMode === 'per_sheet' && !technologyConfiguredInSize) {
      throw routingError(
        `Для технологии «${chosenTechnology.technology_name}» нет тарифа печати у выбранного размера`,
        422,
      )
    }
    if (pricingMode !== 'per_sheet' && !technologyConfiguredInSize && !centralPrice) {
      throw routingError(
        `Для технологии «${chosenTechnology.technology_name}» не настроена цена печати`,
        422,
      )
    }

    const materialKind = normalizeMaterialKind(requested.material_kind)
    let selected = requested
    // Для листов точный расход появится после расчёта раскладки; здесь выбираем SKU.
    let requiredQuantity = 0
    const warnings: string[] = []

    if (materialKind === 'roll') {
      const candidateIds = allowedIds.length > 0 ? allowedIds : [requestedMaterialId]
      const rows = await db.all<MaterialCandidate[]>(
        `SELECT
           m.id,
           m.name,
           m.material_type_id,
           m.material_kind,
           m.sheet_width,
           m.sheet_height,
           m.printable_width,
           COALESCE(m.quantity, 0) as quantity,
           COALESCE((
             SELECT SUM(mr.quantity_reserved)
             FROM material_reservations mr
             WHERE mr.material_id = m.id
               AND mr.status = 'active'
               AND (mr.expires_at IS NULL OR strftime('%s', mr.expires_at) > strftime('%s', 'now'))
           ), 0) as reserved_quantity
         FROM materials m
         WHERE m.id IN (${placeholders(candidateIds)})
           AND m.material_type_id = ?
           AND m.material_kind = 'roll'
           AND m.is_active = 1`,
        [...candidateIds, requested.material_type_id],
      )

      const evaluated = rows
        .map((row) => {
          const stockWidthMm = Number(row.sheet_width ?? 0)
          const layoutWidthMm = Number(row.printable_width ?? row.sheet_width ?? 0)
          if (!Number.isFinite(stockWidthMm) || stockWidthMm <= 0) return null
          if (!Number.isFinite(layoutWidthMm) || layoutWidthMm <= 0) return null
          const layout = computeOptimizedRollFeedMeters({
            rollWidthMm: layoutWidthMm,
            trimMm: input.trimMm,
            bleedMm: Math.max(0, Number(input.bleedMm) || 0),
            quantity: Math.max(1, Math.floor(Number(input.quantity) || 1)),
            margins: {
              edgeMm: Math.max(0, Number(input.edgeMm) || 0),
              gapMm: Math.max(0, Number(input.gapMm) || 0),
            },
          })
          if (!layout) return null
          const available = Math.max(0, Number(row.quantity || 0) - Number(row.reserved_quantity || 0))
          const required = layout.feedMeters
          const pieceAreaM2 =
            (Math.max(0, Number(input.trimMm.width)) *
              Math.max(0, Number(input.trimMm.height)) *
              Math.max(1, Math.floor(Number(input.quantity) || 1))) /
            1_000_000
          const consumedAreaM2 = (stockWidthMm / 1000) * required
          return {
            row,
            required,
            available,
            stockSufficient: available >= required,
            wasteAreaM2: Math.max(0, consumedAreaM2 - pieceAreaM2),
            rollWidthMm: stockWidthMm,
          }
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry != null)

      if (evaluated.length === 0) {
        throw routingError(
          `Ни одна разрешённая ширина материала «${requested.name}» не подходит для размера изделия`,
        )
      }
      evaluated.sort((left, right) => {
        if (left.stockSufficient !== right.stockSufficient) return left.stockSufficient ? -1 : 1
        if (Math.abs(left.wasteAreaM2 - right.wasteAreaM2) > 0.000001) {
          return left.wasteAreaM2 - right.wasteAreaM2
        }
        if (Math.abs(left.required - right.required) > 0.000001) {
          return left.required - right.required
        }
        if (left.rollWidthMm !== right.rollWidthMm) return left.rollWidthMm - right.rollWidthMm
        return left.row.id - right.row.id
      })

      const best = evaluated[0]
      selected = best.row
      requiredQuantity = best.required
      if (!best.stockSufficient) {
        warnings.push(
          `Для материала «${best.row.name}» недостаточный свободный остаток: ` +
            `${best.available.toFixed(2)} м при расчётном расходе ${best.required.toFixed(2)} м.`,
        )
      }
    }

    const availableQuantity = Math.max(
      0,
      Number(selected.quantity || 0) - Number(selected.reserved_quantity || 0),
    )

    return {
      usageContext,
      requestedMaterialId,
      materialTypeId: Number(requested.material_type_id),
      materialKind,
      selectedMaterialId: Number(selected.id),
      selectedMaterialName: String(selected.name),
      selectedMaterialWidthMm:
        selected.sheet_width != null && Number.isFinite(Number(selected.sheet_width))
          ? Number(selected.sheet_width)
          : null,
      selectedMaterialHeightMm:
        selected.sheet_height != null && Number.isFinite(Number(selected.sheet_height))
          ? Number(selected.sheet_height)
          : null,
      availableQuantity,
      requiredQuantity,
      stockSufficient: availableQuantity >= requiredQuantity,
      technologyCode: chosenTechnology.technology_code,
      technologyName: chosenTechnology.technology_name,
      pricingMode: chosenTechnology.pricing_mode,
      m2PricingKind: centralPrice?.m2_pricing_kind ?? null,
      warnings,
    }
  }
}
