import { Database } from 'sqlite'

/**
 * Ссылка чата сайта на заказ CRM, если номер или телефон совпали.
 * Колонка добавляется к каналу website в support_conversations.
 */
export async function up(db: Database): Promise<void> {
  const columns = await db.all<Array<{ name: string }>>('PRAGMA table_info(support_conversations)')
  if (!columns.some((column) => column.name === 'crm_order_id')) {
    await db.exec('ALTER TABLE support_conversations ADD COLUMN crm_order_id INTEGER')
  }
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_support_conversations_crm_order
      ON support_conversations(crm_order_id)
  `)
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP INDEX IF EXISTS idx_support_conversations_crm_order')
}
