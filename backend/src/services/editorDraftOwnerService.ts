import { getDb } from '../config/database'
import { CustomerService } from '../modules/customers/services/customerService'
import { logger } from '../utils/logger'
import { cleanupExpiredEditorDrafts } from './publicEditorDraftService'
import type { WebsiteLegalCustomerInput } from './websiteCorporateCheckoutService'

function digitsOnlyPhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

/**
 * Найти или создать CRM-клиента для сайта (по телефону, иначе email).
 */
export async function ensureWebsiteCustomer(input: {
  phone?: string | null
  email?: string | null
  name?: string | null
}): Promise<{ id: number }> {
  const phone = typeof input.phone === 'string' ? input.phone.trim() : ''
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (!phone && !email) {
    throw new Error('Нужен телефон или email клиента')
  }

  const db = await getDb()
  if (phone) {
    const phoneDigits = digitsOnlyPhone(phone)
    if (phoneDigits.length >= 7) {
      const rows = (await db.all(
        `SELECT id, phone FROM customers
         WHERE phone IS NOT NULL AND TRIM(phone) != ''
         ORDER BY id DESC
         LIMIT 500`,
      )) as Array<{ id: number; phone: string | null }>
      const matched = rows.find((row) => digitsOnlyPhone(String(row.phone ?? '')) === phoneDigits)
      if (matched) return { id: matched.id }
    }
  }

  if (email) {
    const byEmail = await db.get<{ id: number }>(
      `SELECT id FROM customers
       WHERE lower(trim(email)) = ?
       ORDER BY id DESC
       LIMIT 1`,
      [email],
    )
    if (byEmail?.id) return { id: byEmail.id }
  }

  const nameParts = name.split(/\s+/).filter(Boolean)
  const created = await CustomerService.createCustomer({
    type: 'individual',
    first_name: nameParts[0] || 'Клиент',
    last_name: nameParts.slice(1).join(' ') || undefined,
    phone: phone || undefined,
    email: email || undefined,
    source: 'website',
  })
  return { id: created.id }
}

/**
 * Найти или создать юрлицо сайта строго по УНП.
 * Телефон и email намеренно не участвуют в поиске, чтобы не связать юрлицо с физлицом.
 * Существующую legal-карточку не обновляем: website checkout не должен перезаписывать
 * bank_details / контакты / уполномоченное лицо (иначе любой corporate-заказ по УНП
 * портит карточку клиента в CRM).
 */
export async function ensureWebsiteLegalCustomer(
  input: WebsiteLegalCustomerInput,
): Promise<{ id: number }> {
  const taxId = input.tax_id.trim()
  if (!/^\d{9}$/.test(taxId)) {
    throw new Error('УНП должен содержать ровно 9 цифр')
  }

  const db = await getDb()
  const existing = await db.get<{ id: number }>(
    `SELECT id FROM customers
     WHERE type = 'legal' AND TRIM(tax_id) = ?
     ORDER BY id DESC
     LIMIT 1`,
    [taxId],
  )

  if (existing?.id) {
    return { id: existing.id }
  }

  const created = await CustomerService.createCustomer({
    type: 'legal',
    company_name: input.company_name.trim(),
    legal_name: input.legal_name.trim(),
    tax_id: taxId,
    address: input.address.trim(),
    bank_details: input.bank_details.trim(),
    authorized_person: input.authorized_person.trim(),
    phone: input.phone.trim(),
    email: input.email.trim().toLowerCase(),
    source: 'website',
  })
  return { id: created.id }
}

let editorDraftsCleanupInterval: NodeJS.Timeout | null = null

export function startEditorDraftsCleanup(config: { enabled: boolean; intervalMs: number }): void {
  if (!config.enabled) {
    logger.info('EditorDraftsCleanup: отключён')
    return
  }
  if (editorDraftsCleanupInterval) {
    clearInterval(editorDraftsCleanupInterval)
  }
  const run = () => {
    cleanupExpiredEditorDrafts()
      .then((result) => {
        if (result.deleted > 0) {
          logger.info('EditorDraftsCleanup: удалены просроченные drafts', result)
        }
      })
      .catch((err: unknown) => {
        logger.error('EditorDraftsCleanup: ошибка', {
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }
  run()
  editorDraftsCleanupInterval = setInterval(run, Math.max(60_000, config.intervalMs))
  logger.info('EditorDraftsCleanup: включён', { intervalMs: config.intervalMs })
}
