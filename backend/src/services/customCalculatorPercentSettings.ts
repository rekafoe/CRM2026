import type { Database } from 'sqlite'
import { getDb } from '../config/database'
import {
  CUSTOM_CALCULATOR_PERCENT_KEY,
  DEFAULT_CUSTOM_CALCULATOR_OPERATOR_PERCENT,
  normalizeCustomCalculatorPercent,
} from './earningsOperatorPercent'

type SettingsDb = Pick<Database, 'get' | 'run'>

export async function getCustomCalculatorOperatorPercent(db?: SettingsDb): Promise<number> {
  const database = db ?? (await getDb())
  try {
    const row = await database.get<{ setting_value?: string | null }>(
      'SELECT setting_value FROM crm_settings WHERE setting_key = ?',
      [CUSTOM_CALCULATOR_PERCENT_KEY],
    )
    return (
      normalizeCustomCalculatorPercent(row?.setting_value) ??
      DEFAULT_CUSTOM_CALCULATOR_OPERATOR_PERCENT
    )
  } catch {
    return DEFAULT_CUSTOM_CALCULATOR_OPERATOR_PERCENT
  }
}

export async function setCustomCalculatorOperatorPercent(db: SettingsDb, percent: number): Promise<void> {
  const normalized = normalizeCustomCalculatorPercent(percent)
  if (normalized == null) {
    throw new Error('Процент должен быть числом от 0 до 100')
  }
  await db.run(
    `INSERT INTO crm_settings (setting_key, setting_value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(setting_key) DO UPDATE SET
       setting_value = excluded.setting_value,
       updated_at = datetime('now')`,
    [CUSTOM_CALCULATOR_PERCENT_KEY, String(normalized)],
  )
}
