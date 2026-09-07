import { getDb } from '../../../config/database'

export type MaterialUsageContext = 'indoor' | 'outdoor'

export interface MaterialPrintTechnologyLink {
  id: number
  material_type_id: number
  technology_code: string
  technology_name: string
  pricing_mode: string
  supports_indoor: number
  supports_outdoor: number
  is_default: number
  priority: number
  is_active: number
  created_at?: string
  updated_at?: string
}

export interface MaterialPrintTechnologyInput {
  technology_code: string
  supports_indoor?: boolean | number
  supports_outdoor?: boolean | number
  is_default?: boolean | number
  priority?: number
  is_active?: boolean | number
}

type NormalizedLink = {
  technology_code: string
  supports_indoor: number
  supports_outdoor: number
  is_default: number
  priority: number
  is_active: number
}

function badRequest(message: string): Error & { status: number } {
  const error = new Error(message) as Error & { status: number }
  error.status = 400
  return error
}

function normalizeBoolean(value: unknown, fallback: boolean): number {
  if (value == null) return fallback ? 1 : 0
  if (value === false || value === 0 || value === '0' || value === 'false') return 0
  return 1
}

function normalizePriority(value: unknown): number {
  if (value == null || value === '') return 100
  const priority = Number(value)
  if (!Number.isInteger(priority) || priority < 0) {
    throw badRequest('priority должен быть целым неотрицательным числом')
  }
  return priority
}

export class MaterialPrintTechnologyService {
  static async listForMaterialType(
    materialTypeId: number,
    options: { onlyActive?: boolean } = {},
  ): Promise<MaterialPrintTechnologyLink[]> {
    const db = await getDb()
    const activeClause = options.onlyActive ? 'AND mpt.is_active = 1 AND t.is_active = 1' : ''
    return db.all<MaterialPrintTechnologyLink[]>(
      `SELECT
         mpt.id,
         mpt.material_type_id,
         mpt.technology_code,
         t.name as technology_name,
         t.pricing_mode,
         mpt.supports_indoor,
         mpt.supports_outdoor,
         mpt.is_default,
         mpt.priority,
         mpt.is_active,
         mpt.created_at,
         mpt.updated_at
       FROM material_type_print_technologies mpt
       JOIN print_technologies t ON t.code = mpt.technology_code
       WHERE mpt.material_type_id = ?
         ${activeClause}
       ORDER BY mpt.is_default DESC, mpt.priority ASC, t.name ASC`,
      [materialTypeId],
    )
  }

  static async replaceForMaterialType(
    materialTypeId: number,
    inputs: MaterialPrintTechnologyInput[],
  ): Promise<MaterialPrintTechnologyLink[]> {
    if (!Number.isInteger(materialTypeId) || materialTypeId <= 0) {
      throw badRequest('Некорректный material_type_id')
    }
    if (!Array.isArray(inputs)) {
      throw badRequest('print_technologies должен быть массивом')
    }

    const db = await getDb()
    const materialType = await db.get<{ id: number }>(
      'SELECT id FROM material_types WHERE id = ?',
      [materialTypeId],
    )
    if (!materialType) {
      const error = new Error('Тип материала не найден') as Error & { status: number }
      error.status = 404
      throw error
    }

    const normalized: NormalizedLink[] = []
    const seenCodes = new Set<string>()
    for (const input of inputs) {
      const requestedCode = String(input?.technology_code || '').trim()
      if (!requestedCode) throw badRequest('technology_code обязателен')

      const technology = await db.get<{ code: string }>(
        'SELECT code FROM print_technologies WHERE LOWER(code) = LOWER(?)',
        [requestedCode],
      )
      if (!technology) {
        throw badRequest(`Технология печати "${requestedCode}" не найдена`)
      }
      const codeKey = technology.code.toLowerCase()
      if (seenCodes.has(codeKey)) {
        throw badRequest(`Технология "${technology.code}" указана дважды`)
      }
      seenCodes.add(codeKey)

      const link: NormalizedLink = {
        technology_code: technology.code,
        supports_indoor: normalizeBoolean(input.supports_indoor, true),
        supports_outdoor: normalizeBoolean(input.supports_outdoor, false),
        is_default: normalizeBoolean(input.is_default, false),
        priority: normalizePriority(input.priority),
        is_active: normalizeBoolean(input.is_active, true),
      }
      if (!link.supports_indoor && !link.supports_outdoor) {
        throw badRequest(`Для технологии "${technology.code}" выберите помещение и/или улицу`)
      }
      normalized.push(link)
    }

    for (const usage of ['indoor', 'outdoor'] as const) {
      const field = usage === 'indoor' ? 'supports_indoor' : 'supports_outdoor'
      const defaults = normalized.filter(
        (link) => link.is_active === 1 && link[field] === 1 && link.is_default === 1,
      )
      if (defaults.length > 1) {
        throw badRequest(
          `Для применения "${usage === 'indoor' ? 'В помещении' : 'На улице'}" может быть только одна технология по умолчанию`,
        )
      }
    }

    await db.run('BEGIN')
    try {
      await db.run(
        'DELETE FROM material_type_print_technologies WHERE material_type_id = ?',
        [materialTypeId],
      )
      for (const link of normalized) {
        await db.run(
          `INSERT INTO material_type_print_technologies (
             material_type_id,
             technology_code,
             supports_indoor,
             supports_outdoor,
             is_default,
             priority,
             is_active,
             created_at,
             updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [
            materialTypeId,
            link.technology_code,
            link.supports_indoor,
            link.supports_outdoor,
            link.is_default,
            link.priority,
            link.is_active,
          ],
        )
      }
      await db.run('COMMIT')
    } catch (error) {
      await db.run('ROLLBACK')
      throw error
    }

    return this.listForMaterialType(materialTypeId)
  }

  static chooseForUsage(
    links: MaterialPrintTechnologyLink[],
    usage: MaterialUsageContext,
  ): MaterialPrintTechnologyLink {
    const usageField = usage === 'outdoor' ? 'supports_outdoor' : 'supports_indoor'
    const candidates = links.filter(
      (link) => Number(link.is_active) !== 0 && Number(link[usageField]) === 1,
    )
    if (candidates.length === 0) {
      throw badRequest(
        `Для материала не настроена печать: ${usage === 'outdoor' ? 'на улице' : 'в помещении'}`,
      )
    }
    if (candidates.length === 1) return candidates[0]

    const defaults = candidates.filter((link) => Number(link.is_default) === 1)
    if (defaults.length === 1) return defaults[0]
    if (defaults.length > 1) {
      throw badRequest('Для материала настроено несколько технологий печати по умолчанию')
    }

    const bestPriority = Math.min(...candidates.map((link) => Number(link.priority)))
    const best = candidates.filter((link) => Number(link.priority) === bestPriority)
    if (best.length !== 1) {
      throw badRequest('Для материала неоднозначно настроена технология печати: задайте default или разные приоритеты')
    }
    return best[0]
  }
}
