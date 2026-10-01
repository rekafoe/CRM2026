import { Database } from 'sqlite'
import { ORDER_STATES, type OrderStateCode } from '../utils/orderStatusCatalog'

/**
 * Письма и SMS клиенту были повешены на первый попавшийся id из старых имён
 * («Новый», «Ожидает», «Готов»). Шаблоны переносим на коды нового набора.
 * Чужое правило на целевом статусе не затираем. Лишние копии на других статусах выключаем.
 */
const EMAIL_BINDINGS: Array<{ slug: string; allowed: OrderStateCode[]; primary: OrderStateCode }> = [
  { slug: 'order_accepted_in_work', allowed: ['in_work'], primary: 'in_work' },
  { slug: 'order_ready_for_pickup', allowed: ['done', 'at_pickup'], primary: 'done' },
]

const SMS_BINDINGS: Array<{ slug: string; allowed: OrderStateCode[]; primary: OrderStateCode }> = [
  { slug: 'order_status_default_sms', allowed: ['done', 'at_pickup'], primary: 'done' },
]

async function tableExists(db: Database, name: string): Promise<boolean> {
  const row = await db.get(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`, name)
  return !!row
}

async function statusIdByCode(db: Database, code: OrderStateCode): Promise<number | null> {
  const state = ORDER_STATES.find((item) => item.code === code)
  if (!state) return null
  try {
    const row = await db.get<{ id: number }>(
      `SELECT id FROM order_statuses
       WHERE code = ? OR name = ?
       ORDER BY CASE WHEN code = ? THEN 0 ELSE 1 END, id
       LIMIT 1`,
      code,
      state.name,
      code,
    )
    return row?.id != null ? Number(row.id) : null
  } catch {
    const row = await db.get<{ id: number }>(
      `SELECT id FROM order_statuses WHERE name = ? LIMIT 1`,
      state.name,
    )
    return row?.id != null ? Number(row.id) : null
  }
}

async function rebind(db: Database, options: {
  rulesTable: string
  templateTable: string
  templateColumn: string
  slug: string
  allowed: OrderStateCode[]
  primary: OrderStateCode
}): Promise<void> {
  if (!(await tableExists(db, options.rulesTable)) || !(await tableExists(db, options.templateTable))) return

  const template = await db.get<{ id: number }>(
    `SELECT id FROM ${options.templateTable} WHERE slug = ?`,
    options.slug,
  )
  if (!template?.id) return

  const allowedIds = new Set<number>()
  for (const code of options.allowed) {
    const id = await statusIdByCode(db, code)
    if (id != null) allowedIds.add(id)
  }
  const primaryId = await statusIdByCode(db, options.primary)
  if (primaryId == null) return

  const rules = await db.all<{ id: number; to_status_id: number; is_active: number }[]>(
    `SELECT id, to_status_id, is_active FROM ${options.rulesTable} WHERE ${options.templateColumn} = ?`,
    template.id,
  )
  const list = Array.isArray(rules) ? rules : []
  const onAllowed = list.filter((rule) => allowedIds.has(Number(rule.to_status_id)))
  const stray = list.filter((rule) => !allowedIds.has(Number(rule.to_status_id)))

  if (onAllowed.length === 0) {
    const occupant = await db.get<{ id: number }>(
      `SELECT id FROM ${options.rulesTable} WHERE to_status_id = ?`,
      primaryId,
    )
    const movable = stray[0]
    if (!occupant && movable) {
      await db.run(
        `UPDATE ${options.rulesTable} SET to_status_id = ? WHERE id = ?`,
        primaryId,
        movable.id,
      )
      stray.shift()
    } else if (!occupant) {
      await db.run(
        `INSERT INTO ${options.rulesTable} (to_status_id, ${options.templateColumn}, is_active) VALUES (?, ?, 1)`,
        primaryId,
        template.id,
      )
    }
  }

  for (const rule of stray) {
    await db.run(`UPDATE ${options.rulesTable} SET is_active = 0 WHERE id = ?`, rule.id)
  }
}

export async function up(db: Database): Promise<void> {
  if (!(await tableExists(db, 'order_statuses'))) return
  for (const binding of EMAIL_BINDINGS) {
    await rebind(db, {
      rulesTable: 'order_email_rules',
      templateTable: 'email_templates',
      templateColumn: 'email_template_id',
      ...binding,
    })
  }
  for (const binding of SMS_BINDINGS) {
    await rebind(db, {
      rulesTable: 'order_sms_rules',
      templateTable: 'sms_templates',
      templateColumn: 'sms_template_id',
      ...binding,
    })
  }
}

export async function down(_db: Database): Promise<void> {
  // Привязку к старому id не возвращаем.
}
