import { Database } from 'sqlite'
import { ORDER_STATES, type OrderStateCode } from '../utils/orderStatusCatalog'

/**
 * Письмо «заказ завершён» для выдачи с сайта.
 * Уходит не при ручной смене статуса, а после закрытия долга.
 */

const COMPLETED_SUBJECT = 'Ваш заказ №{{orderNumber}} завершён'

const COMPLETED_HTML = `<p>Здравствуйте, {{customerName}}!</p>
<p>Ваш заказ №{{orderNumber}} <strong>завершён</strong>. Оплата получена, заказ выдан.</p>
<p><strong>Информация по заказу:</strong></p>
{{itemsHtml}}
<p>Итоговая стоимость: <strong>{{orderTotal}}</strong></p>
<p><strong>Способ получения:</strong><br/>{{deliveryHtml}}</p>
<p>История заказа в личном кабинете: <a href="{{cabinetUrl}}">{{cabinetUrl}}</a></p>
<p>Это автоматическое уведомление. Не требует ответа.</p>
<p>С наилучшими пожеланиями,<br/>
{{companyName}}.<br/>
e-mail: {{companyEmail}}<br/>
тел.: {{companyPhone}}</p>`

const COMPLETED_TEXT = `Здравствуйте, {{customerName}}!

Ваш заказ №{{orderNumber}} завершён. Оплата получена, заказ выдан.

Информация по заказу:
{{itemsText}}

Итоговая стоимость: {{orderTotal}}

Способ получения:
{{deliveryMethod}}

Личный кабинет: {{cabinetUrl}}

Это автоматическое уведомление. Не требует ответа.

С наилучшими пожеланиями,
{{companyName}}.
e-mail: {{companyEmail}}
тел.: {{companyPhone}}`

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

export async function up(db: Database): Promise<void> {
  if (!(await tableExists(db, 'email_templates')) || !(await tableExists(db, 'order_email_rules'))) return
  if (!(await tableExists(db, 'order_statuses'))) return

  const existing = await db.get<{ id: number }>(
    `SELECT id FROM email_templates WHERE slug = ?`,
    'order_completed',
  )
  let templateId = existing?.id ?? null
  if (templateId == null) {
    const inserted = await db.run(
      `INSERT INTO email_templates (slug, name, subject_template, body_html_template, body_text_template, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [
        'order_completed',
        'Заказ завершён',
        COMPLETED_SUBJECT,
        COMPLETED_HTML,
        COMPLETED_TEXT,
      ],
    )
    templateId = inserted.lastID ?? null
  }
  if (templateId == null) return

  const alreadyBound = await db.get<{ id: number }>(
    `SELECT id FROM order_email_rules WHERE email_template_id = ?`,
    templateId,
  )
  if (alreadyBound) return

  const completedId = await statusIdByCode(db, 'completed')
  if (completedId == null) return

  const occupant = await db.get<{ id: number }>(
    `SELECT id FROM order_email_rules WHERE to_status_id = ?`,
    completedId,
  )
  if (occupant) return

  await db.run(
    `INSERT INTO order_email_rules (to_status_id, email_template_id, is_active) VALUES (?, ?, 1)`,
    completedId,
    templateId,
  )
}

export async function down(_db: Database): Promise<void> {
  // Шаблон оставляем: его могли править в админке.
}
