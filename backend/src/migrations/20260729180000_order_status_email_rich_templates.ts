import { Database } from 'sqlite'

/**
 * Богатые шаблоны писем о движении заказа (в духе конкурентов) + правила на ключевые статусы.
 */

const ACCEPTED_SUBJECT = 'Ваш заказ №{{orderNumber}} {{statusPhrase}}'

const ACCEPTED_HTML = `<p>Здравствуйте, {{customerName}}!</p>
<p>Ваш заказ №{{orderNumber}} {{statusPhrase}}. О готовности заказа вы получите уведомление на e-mail или по SMS (если был указан номер мобильного телефона).</p>
<p><strong>Информация по заказу:</strong></p>
{{itemsHtml}}
<p>Стоимость заказа: <strong>{{orderTotal}}</strong></p>
<p><strong>Способ получения:</strong><br/>{{deliveryHtml}}</p>
<p>Итоговая стоимость: <strong>{{orderTotal}}</strong>.</p>
<p>Срок изготовления: {{productionTerm}}<br/>
Планируемое время получения: {{readyAt}}</p>
<p>Если в заказе указаны некорректные данные или в случае изменения параметров и стоимости заказа, с вами свяжется оператор по телефону, указанному при оформлении. Если с вами невозможно связаться, заказ в работу не передаётся.</p>
<p>Если в заказе содержатся товары с разными сроками изготовления, срок выполнения всего заказа равен наибольшему сроку.</p>
<p>Проверить статус заказа вы можете в личном кабинете: <a href="{{cabinetUrl}}">{{cabinetUrl}}</a></p>
<p>Это автоматическое уведомление. Не требует ответа.</p>
<p>С наилучшими пожеланиями,<br/>
{{companyName}}.<br/>
e-mail: {{companyEmail}}<br/>
тел.: {{companyPhone}}<br/>
{{companySite}}</p>`

const ACCEPTED_TEXT = `Здравствуйте, {{customerName}}!

Ваш заказ №{{orderNumber}} {{statusPhrase}}. О готовности заказа вы получите уведомление на e-mail или по SMS.

Информация по заказу:
{{itemsText}}

Стоимость заказа: {{orderTotal}}

Способ получения:
{{deliveryMethod}}

Итоговая стоимость: {{orderTotal}}.

Срок изготовления: {{productionTerm}}
Планируемое время получения: {{readyAt}}

Проверить статус: {{cabinetUrl}}

Это автоматическое уведомление. Не требует ответа.

С наилучшими пожеланиями,
{{companyName}}.
e-mail: {{companyEmail}}
тел.: {{companyPhone}}
{{companySite}}`

const READY_SUBJECT = 'Ваш заказ №{{orderNumber}} готов к выдаче'

const READY_HTML = `<p>Здравствуйте, {{customerName}}!</p>
<p>Ваш заказ №{{orderNumber}} <strong>готов к выдаче</strong>.</p>
<p><strong>Информация по заказу:</strong></p>
{{itemsHtml}}
<p>Итоговая стоимость: <strong>{{orderTotal}}</strong></p>
<p><strong>Способ получения:</strong><br/>{{deliveryHtml}}</p>
<p>Проверить статус или повторить заказ: <a href="{{cabinetUrl}}">{{cabinetUrl}}</a></p>
<p>Это автоматическое уведомление. Не требует ответа.</p>
<p>С наилучшими пожеланиями,<br/>
{{companyName}}.<br/>
e-mail: {{companyEmail}}<br/>
тел.: {{companyPhone}}</p>`

const READY_TEXT = `Здравствуйте, {{customerName}}!

Ваш заказ №{{orderNumber}} готов к выдаче.

Информация по заказу:
{{itemsText}}

Итоговая стоимость: {{orderTotal}}

Способ получения:
{{deliveryMethod}}

Личный кабинет: {{cabinetUrl}}

С наилучшими пожеланиями,
{{companyName}}.
e-mail: {{companyEmail}}
тел.: {{companyPhone}}`

async function upsertTemplate(
  db: Database,
  slug: string,
  name: string,
  subject: string,
  html: string,
  text: string
): Promise<number | null> {
  const existing = await db.get<{ id: number }>(`SELECT id FROM email_templates WHERE slug = ?`, [slug])
  if (existing?.id) {
    await db.run(
      `UPDATE email_templates
       SET name = ?, subject_template = ?, body_html_template = ?, body_text_template = ?, is_active = 1
       WHERE id = ?`,
      [name, subject, html, text, existing.id]
    )
    return existing.id
  }
  const r = await db.run(
    `INSERT INTO email_templates (slug, name, subject_template, body_html_template, body_text_template, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [slug, name, subject, html, text]
  )
  return r.lastID ?? null
}

async function ensureRule(
  db: Database,
  statusNames: string[],
  templateId: number,
  active: boolean
): Promise<void> {
  const placeholders = statusNames.map(() => '?').join(',')
  const status = await db.get<{ id: number }>(
    `SELECT id FROM order_statuses WHERE name IN (${placeholders}) ORDER BY id LIMIT 1`,
    ...statusNames
  )
  if (!status?.id) return
  const existing = await db.get<{ id: number }>(
    `SELECT id FROM order_email_rules WHERE to_status_id = ?`,
    [status.id]
  )
  if (existing?.id) {
    await db.run(
      `UPDATE order_email_rules SET email_template_id = ?, is_active = ? WHERE id = ?`,
      [templateId, active ? 1 : 0, existing.id]
    )
    return
  }
  await db.run(
    `INSERT INTO order_email_rules (to_status_id, email_template_id, is_active) VALUES (?, ?, ?)`,
    [status.id, templateId, active ? 1 : 0]
  )
}

export async function up(db: Database): Promise<void> {
  const acceptedId = await upsertTemplate(
    db,
    'order_accepted_in_work',
    'Заказ принят в работу',
    ACCEPTED_SUBJECT,
    ACCEPTED_HTML,
    ACCEPTED_TEXT
  )
  const readyId = await upsertTemplate(
    db,
    'order_ready_for_pickup',
    'Заказ готов к выдаче',
    READY_SUBJECT,
    READY_HTML,
    READY_TEXT
  )
  // Обновляем общий дефолт тем же «принят в работу» текстом (для прочих статусов)
  await upsertTemplate(
    db,
    'order_status_default',
    'Уведомление о статусе заказа',
    ACCEPTED_SUBJECT,
    ACCEPTED_HTML,
    ACCEPTED_TEXT
  )

  if (acceptedId != null) {
    await ensureRule(db, ['Оформлен', 'Ожидает', 'Новый', 'В работе', 'Принят'], acceptedId, true)
  }
  if (readyId != null) {
    await ensureRule(db, ['Готов', 'Выполнен', 'Передан в ПВЗ'], readyId, true)
  }
}

export async function down(_db: Database): Promise<void> {
  // no-op
}
