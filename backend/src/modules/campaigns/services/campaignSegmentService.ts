import { getDb } from '../../../config/database'
import { buildUnsubscribeUrl } from '../../../services/customerEmailMarketingService'
import { effectiveBotRole } from '../../../services/telegramUserService'
import type {
  CampaignRecipientCandidate,
  CampaignSegmentFilters,
  CampaignSegmentInput,
  CampaignSegmentRow,
} from '../types'

function parseFilters(raw: string): CampaignSegmentFilters {
  if (!raw.trim()) return {}
  return JSON.parse(raw) as CampaignSegmentFilters
}

function likeParam(v: string): string {
  return `%${String(v || '').trim().toLowerCase()}%`
}

function displayCustomerName(row: {
  type?: string | null
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
  email?: string | null
  phone?: string | null
}): string {
  if ((row.type || '') === 'legal') {
    return String(row.company_name || row.email || row.phone || 'Клиент').trim()
  }
  const parts = [row.last_name, row.first_name].filter(Boolean)
  return (parts.join(' ').trim() || row.email || row.phone || 'Клиент').trim()
}

export class CampaignSegmentService {
  static async list(): Promise<CampaignSegmentRow[]> {
    const db = await getDb()
    const rows = await db.all<CampaignSegmentRow[]>(
      `SELECT * FROM campaign_segments ORDER BY updated_at DESC, id DESC`
    )
    return Array.isArray(rows) ? (rows as unknown as CampaignSegmentRow[]) : []
  }

  static async getById(id: number): Promise<CampaignSegmentRow | null> {
    const db = await getDb()
    const row = await db.get<CampaignSegmentRow>('SELECT * FROM campaign_segments WHERE id = ?', [id])
    return row ?? null
  }

  static async create(payload: CampaignSegmentInput): Promise<CampaignSegmentRow> {
    parseFilters(payload.filters_json)
    const db = await getDb()
    const result = await db.run(
      `INSERT INTO campaign_segments (name, channel_scope, filters_json, updated_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [String(payload.name || '').trim(), payload.channel_scope, payload.filters_json]
    )
    const row = await this.getById(Number(result.lastID))
    if (!row) throw new Error('Не удалось создать сегмент')
    return row
  }

  static async update(id: number, payload: Partial<CampaignSegmentInput>): Promise<CampaignSegmentRow> {
    const current = await this.getById(id)
    if (!current) throw new Error('Сегмент не найден')
    const nextFilters = payload.filters_json ?? current.filters_json
    parseFilters(nextFilters)
    const db = await getDb()
    await db.run(
      `UPDATE campaign_segments
       SET name = ?, channel_scope = ?, filters_json = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        String(payload.name ?? current.name).trim(),
        payload.channel_scope ?? current.channel_scope,
        nextFilters,
        id,
      ]
    )
    const row = await this.getById(id)
    if (!row) throw new Error('Не удалось обновить сегмент')
    return row
  }

  static async resolveRecipients(segment: CampaignSegmentRow, channel: 'email' | 'sms' | 'telegram'): Promise<CampaignRecipientCandidate[]> {
    const filters = parseFilters(segment.filters_json)
    if (channel === 'telegram') {
      return this.resolveTelegramRecipients(filters)
    }
    return this.resolveCustomerRecipients(filters, channel)
  }

  static async estimate(segmentId: number, channel: 'email' | 'sms' | 'telegram'): Promise<number> {
    const segment = await this.getById(segmentId)
    if (!segment) throw new Error('Сегмент не найден')
    const recipients = await this.resolveRecipients(segment, channel)
    const db = await getDb()
    await db.run(
      `UPDATE campaign_segments SET estimated_count_cache = ?, updated_at = datetime('now') WHERE id = ?`,
      [recipients.length, segmentId]
    )
    return recipients.length
  }

  private static async resolveCustomerRecipients(filters: CampaignSegmentFilters, channel: 'email' | 'sms'): Promise<CampaignRecipientCandidate[]> {
    const db = await getDb()
    const where: string[] = ['1=1']
    const params: unknown[] = []
    if (channel === 'email' || filters.hasEmail) {
      where.push(`email IS NOT NULL AND trim(email) != ''`)
    }
    if (channel === 'sms' || filters.hasPhone) {
      where.push(`phone IS NOT NULL AND trim(phone) != ''`)
    }
    if (filters.requireMarketingOptIn) {
      where.push(`marketing_opt_in = 1 AND email_unsubscribed_at IS NULL`)
      where.push(`unsubscribe_token IS NOT NULL AND trim(unsubscribe_token) != ''`)
    }
    if (filters.customerType && filters.customerType !== 'any') {
      where.push(`type = ?`)
      params.push(filters.customerType)
    }
    if (Array.isArray(filters.customerIds) && filters.customerIds.length > 0) {
      const ids = filters.customerIds.filter((v) => Number.isFinite(Number(v))).map((v) => Number(v))
      if (ids.length > 0) {
        where.push(`id IN (${ids.map(() => '?').join(', ')})`)
        params.push(...ids)
      }
    }
    if (filters.query && filters.query.trim()) {
      const q = likeParam(filters.query)
      where.push(
        `(lower(coalesce(first_name,'')) LIKE ? OR lower(coalesce(last_name,'')) LIKE ? OR lower(coalesce(company_name,'')) LIKE ? OR lower(coalesce(email,'')) LIKE ? OR lower(coalesce(phone,'')) LIKE ?)`
      )
      params.push(q, q, q, q, q)
    }
    const rows = await db.all<any[]>(
      `SELECT id, type, first_name, last_name, company_name, email, phone, unsubscribe_token
       FROM customers
       WHERE ${where.join(' AND ')}
       ORDER BY id DESC`,
      params
    )
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      channel,
      customerId: Number(row.id),
      destination: channel === 'email' ? String(row.email).trim() : String(row.phone).trim(),
      displayName: displayCustomerName(row),
      firstName: row.first_name ?? undefined,
      lastName: row.last_name ?? undefined,
      companyName: row.company_name ?? undefined,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
      unsubscribeToken: row.unsubscribe_token ?? undefined,
    }))
  }

  private static async resolveTelegramRecipients(filters: CampaignSegmentFilters): Promise<CampaignRecipientCandidate[]> {
    const db = await getDb()
    const where: string[] = ['1=1']
    const params: unknown[] = []
    if (!filters.includeInactiveTelegramUsers) {
      where.push(`is_active = 1 AND notifications_enabled = 1`)
    }
    if (filters.telegramRole && filters.telegramRole.trim()) {
      where.push(`lower(role) = ?`)
      params.push(filters.telegramRole.trim().toLowerCase())
    }
    if (Array.isArray(filters.telegramUserIds) && filters.telegramUserIds.length > 0) {
      const ids = filters.telegramUserIds.filter((v) => Number.isFinite(Number(v))).map((v) => Number(v))
      if (ids.length > 0) {
        where.push(`id IN (${ids.map(() => '?').join(', ')})`)
        params.push(...ids)
      }
    }
    if (filters.query && filters.query.trim()) {
      const q = likeParam(filters.query)
      where.push(
        `(lower(coalesce(first_name,'')) LIKE ? OR lower(coalesce(last_name,'')) LIKE ? OR lower(coalesce(username,'')) LIKE ? OR lower(coalesce(chat_id,'')) LIKE ?)`
      )
      params.push(q, q, q, q)
    }
    const rows = await db.all<any[]>(
      `SELECT id, chat_id, username, first_name, last_name, role
       FROM telegram_users
       WHERE ${where.join(' AND ')}
       ORDER BY id DESC`,
      params
    )
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      channel: 'telegram',
      telegramUserId: Number(row.id),
      destination: String(row.chat_id),
      displayName: String(
        [row.first_name, row.last_name].filter(Boolean).join(' ').trim() ||
          row.username ||
          row.chat_id
      ),
      firstName: row.first_name ?? undefined,
      lastName: row.last_name ?? undefined,
      telegramRole: effectiveBotRole(row.role),
    }))
  }

  static buildRecipientVars(recipient: CampaignRecipientCandidate): Record<string, string> {
    return {
      customerName: recipient.displayName || 'Клиент',
      first_name: recipient.firstName || '',
      last_name: recipient.lastName || '',
      company_name: recipient.companyName || '',
      email: recipient.email || '',
      phone: recipient.phone || '',
      unsubscribeUrl: recipient.unsubscribeToken ? buildUnsubscribeUrl(recipient.unsubscribeToken) : '',
    }
  }
}
