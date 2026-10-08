import type { Database } from 'sqlite'
import { getDb } from '../config/database'

const SETTING_KEY = 'plotter_bare_calculator_material_ids'

type SettingsDb = Pick<Database, 'get' | 'all' | 'run'>

export type PlotterCalculatorMaterialRow = {
  id: number
  name: string
  sheet_width: number | null
  sheet_price_single: number | null
}

function parseIds(raw: string | null | undefined): number[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
  } catch {
    return []
  }
}

export async function getPlotterCalculatorMaterialIds(db?: SettingsDb): Promise<number[]> {
  const database = db ?? (await getDb())
  try {
    const row = await database.get<{ setting_value?: string | null }>(
      'SELECT setting_value FROM crm_settings WHERE setting_key = ?',
      [SETTING_KEY],
    )
    return parseIds(row?.setting_value)
  } catch {
    return []
  }
}

export async function listRollMaterials(db?: SettingsDb): Promise<PlotterCalculatorMaterialRow[]> {
  const database = db ?? (await getDb())
  const rows = await database.all<PlotterCalculatorMaterialRow[]>(
    `SELECT id, name, sheet_width, sheet_price_single
     FROM materials
     WHERE material_kind = 'roll' AND COALESCE(is_active, 1) = 1
     ORDER BY name COLLATE NOCASE`,
  )
  return rows ?? []
}

export async function setPlotterCalculatorMaterialIds(db: SettingsDb, ids: number[]): Promise<number[]> {
  const rolls = await listRollMaterials(db)
  const allowed = new Set(rolls.map((row) => Number(row.id)))
  const next = [...new Set(ids.map((id) => Number(id)).filter((id) => allowed.has(id)))]
  await db.run(
    `INSERT INTO crm_settings (setting_key, setting_value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(setting_key) DO UPDATE SET
       setting_value = excluded.setting_value,
       updated_at = datetime('now')`,
    [SETTING_KEY, JSON.stringify(next)],
  )
  return next
}
