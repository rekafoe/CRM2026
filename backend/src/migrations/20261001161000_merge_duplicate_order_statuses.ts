import { Database } from 'sqlite'

/**
 * Старый справочник («Новый», «В производстве», …) и новый («Ожидает», «Принят в работу», …)
 * оказывались в одной базе сразу оба: переименование пропускалось, если новое имя уже было.
 * Это два названия одного шага. Заказы переносим на канонический id и старую строку удаляем.
 * Статус 0 не строка справочника: это пул просчёта и старая отмена, его не сливаем.
 */
const STATUS_ALIASES: Array<{ from: string; to: string }> = [
  { from: 'Новый', to: 'Ожидает' },
  { from: 'новый', to: 'Ожидает' },
  { from: 'НОВЫЙ', to: 'Ожидает' },
  { from: 'New', to: 'Ожидает' },
  { from: 'new', to: 'Ожидает' },
  { from: 'Pending', to: 'Ожидает' },
  { from: 'pending', to: 'Ожидает' },
  { from: 'ожидает', to: 'Ожидает' },
  { from: 'ОЖИДАЕТ', to: 'Ожидает' },
  { from: 'В производстве', to: 'Принят в работу' },
  { from: 'Готов к отправке', to: 'Выполнен' },
  { from: 'Отправлен', to: 'Передан в ПВЗ' },
]

async function tableExists(db: Database, name: string): Promise<boolean> {
  const row = await db.get(`SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?`, name)
  return !!row
}

async function repointUniqueStatus(
  db: Database,
  table: string,
  column: string,
  fromId: number,
  toId: number,
): Promise<void> {
  if (!(await tableExists(db, table))) return
  const target = await db.get(`SELECT id FROM ${table} WHERE ${column} = ?`, toId)
  if (target) {
    await db.run(`DELETE FROM ${table} WHERE ${column} = ?`, fromId)
    return
  }
  await db.run(`UPDATE ${table} SET ${column} = ? WHERE ${column} = ?`, toId, fromId)
}

async function mergePair(db: Database, fromName: string, toName: string): Promise<void> {
  const source = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE name = ?`, fromName)
  if (!source?.id) return
  const target = await db.get<{ id: number }>(`SELECT id FROM order_statuses WHERE name = ?`, toName)

  if (!target?.id) {
    await db.run(`UPDATE order_statuses SET name = ? WHERE id = ?`, toName, source.id)
    return
  }
  if (Number(target.id) === Number(source.id)) return

  const fromId = Number(source.id)
  const toId = Number(target.id)
  if (await tableExists(db, 'orders')) {
    await db.run(`UPDATE orders SET status = ? WHERE status = ?`, toId, fromId)
  }
  await repointUniqueStatus(db, 'order_email_rules', 'to_status_id', fromId, toId)
  await repointUniqueStatus(db, 'order_sms_rules', 'to_status_id', fromId, toId)
  if (await tableExists(db, 'sms_debounce')) {
    await db.run(
      `UPDATE sms_debounce SET target_status_id = ? WHERE target_status_id = ?`,
      toId,
      fromId,
    )
  }
  await db.run(`DELETE FROM order_statuses WHERE id = ?`, fromId)
}

export async function up(db: Database): Promise<void> {
  if (!(await tableExists(db, 'order_statuses'))) return
  for (const pair of STATUS_ALIASES) {
    await mergePair(db, pair.from, pair.to)
  }
}

export async function down(_db: Database): Promise<void> {
  // Слитые статусы не разводим обратно.
}
