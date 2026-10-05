import type { Database } from 'sqlite'
import { getDb } from '../config/database'
import { normalizeCustomCalculatorPercent } from './earningsOperatorPercent'
import {
  CONTACT_ORDER_PERCENT_KEY,
  DEFAULT_CONTACT_ORDER_PERCENT,
  DEFAULT_RESPONSIBLE_ORDER_PERCENT,
  RESPONSIBLE_ORDER_PERCENT_KEY,
} from './earningsRoleSplit'

type SettingsDb = Pick<Database, 'get' | 'run'>

async function readPercent(db: Pick<Database, 'get'>, key: string, fallback: number): Promise<number> {
  try {
    const row = await db.get<{ setting_value?: string | null }>(
      'SELECT setting_value FROM crm_settings WHERE setting_key = ?',
      [key],
    )
    return normalizeCustomCalculatorPercent(row?.setting_value) ?? fallback
  } catch {
    return fallback
  }
}

export async function getRoleOrderPercents(db?: Pick<Database, 'get'>): Promise<{ contact: number; responsible: number }> {
  const database = db ?? (await getDb())
  const [contact, responsible] = await Promise.all([
    readPercent(database, CONTACT_ORDER_PERCENT_KEY, DEFAULT_CONTACT_ORDER_PERCENT),
    readPercent(database, RESPONSIBLE_ORDER_PERCENT_KEY, DEFAULT_RESPONSIBLE_ORDER_PERCENT),
  ])
  return { contact, responsible }
}

async function writePercent(db: SettingsDb, key: string, percent: number): Promise<number> {
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
    [key, String(normalized)],
  )
  return normalized
}

export async function setRoleOrderPercents(
  db: SettingsDb,
  percents: { contact: number; responsible: number },
): Promise<{ contact: number; responsible: number }> {
  const contact = await writePercent(db, CONTACT_ORDER_PERCENT_KEY, percents.contact)
  const responsible = await writePercent(db, RESPONSIBLE_ORDER_PERCENT_KEY, percents.responsible)
  return { contact, responsible }
}
