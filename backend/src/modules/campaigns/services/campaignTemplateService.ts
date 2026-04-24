import { getDb } from '../../../config/database'
import type { CampaignTemplateInput, CampaignTemplateRow } from '../types'

function normalizeTemplatePayload(payload: CampaignTemplateInput): CampaignTemplateInput {
  return {
    ...payload,
    slug: String(payload.slug || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, ''),
    name: String(payload.name || '').trim(),
    body_template: String(payload.body_template || '').trim(),
    subject_template: payload.subject_template != null ? String(payload.subject_template) : null,
    body_html_template:
      payload.body_html_template != null ? String(payload.body_html_template) : null,
    variables_json: payload.variables_json != null ? String(payload.variables_json) : null,
  }
}

function ensureJsonOrNull(raw: string | null | undefined): string | null {
  if (raw == null || raw.trim() === '') return null
  JSON.parse(raw)
  return raw
}

export class CampaignTemplateService {
  static async list(channel?: string): Promise<CampaignTemplateRow[]> {
    const db = await getDb()
    const rows = channel
      ? await db.all<CampaignTemplateRow[]>(
          `SELECT * FROM campaign_templates WHERE channel = ? ORDER BY channel, name, id`,
          [channel]
        )
      : await db.all<CampaignTemplateRow[]>(
          `SELECT * FROM campaign_templates ORDER BY channel, name, id`
        )
    return Array.isArray(rows) ? (rows as unknown as CampaignTemplateRow[]) : []
  }

  static async getById(id: number): Promise<CampaignTemplateRow | null> {
    const db = await getDb()
    const row = await db.get<CampaignTemplateRow>('SELECT * FROM campaign_templates WHERE id = ?', [id])
    return row ?? null
  }

  static async create(payload: CampaignTemplateInput): Promise<CampaignTemplateRow> {
    const db = await getDb()
    const normalized = normalizeTemplatePayload(payload)
    if (!normalized.slug || !normalized.name || !normalized.body_template) {
      throw new Error('slug, name и body_template обязательны')
    }
    const variablesJson = ensureJsonOrNull(normalized.variables_json)
    const result = await db.run(
      `INSERT INTO campaign_templates
       (channel, slug, name, subject_template, body_template, body_html_template, variables_json, is_active, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        normalized.channel,
        normalized.slug,
        normalized.name,
        normalized.subject_template ?? null,
        normalized.body_template,
        normalized.body_html_template ?? null,
        variablesJson,
        normalized.is_active === false ? 0 : 1,
      ]
    )
    const row = await this.getById(Number(result.lastID))
    if (!row) throw new Error('Не удалось создать шаблон кампании')
    return row
  }

  static async update(id: number, payload: Partial<CampaignTemplateInput>): Promise<CampaignTemplateRow> {
    const current = await this.getById(id)
    if (!current) {
      throw new Error('Шаблон кампании не найден')
    }
    const merged = normalizeTemplatePayload({
      channel: payload.channel ?? current.channel,
      slug: payload.slug ?? current.slug,
      name: payload.name ?? current.name,
      subject_template: payload.subject_template ?? current.subject_template,
      body_template: payload.body_template ?? current.body_template,
      body_html_template: payload.body_html_template ?? current.body_html_template,
      variables_json: payload.variables_json ?? current.variables_json,
      is_active: payload.is_active ?? Boolean(current.is_active),
    })
    if (!merged.slug || !merged.name || !merged.body_template) {
      throw new Error('slug, name и body_template обязательны')
    }
    const db = await getDb()
    await db.run(
      `UPDATE campaign_templates
       SET channel = ?, slug = ?, name = ?, subject_template = ?, body_template = ?,
           body_html_template = ?, variables_json = ?, is_active = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        merged.channel,
        merged.slug,
        merged.name,
        merged.subject_template ?? null,
        merged.body_template,
        merged.body_html_template ?? null,
        ensureJsonOrNull(merged.variables_json),
        merged.is_active === false ? 0 : 1,
        id,
      ]
    )
    const row = await this.getById(id)
    if (!row) throw new Error('Не удалось обновить шаблон кампании')
    return row
  }
}
