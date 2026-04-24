import { getDb } from '../../../config/database'
import type {
  CampaignInput,
  CampaignRunMode,
  CampaignRunRow,
  CampaignRunStatus,
  CampaignRow,
} from '../types'
import { CampaignSegmentService } from './campaignSegmentService'
import { CampaignTemplateService } from './campaignTemplateService'

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export class CampaignService {
  static async list(filters?: { channel?: string; status?: string }): Promise<any[]> {
    const db = await getDb()
    const where: string[] = ['1=1']
    const params: unknown[] = []
    if (filters?.channel) {
      where.push('c.channel = ?')
      params.push(filters.channel)
    }
    if (filters?.status) {
      where.push('c.status = ?')
      params.push(filters.status)
    }
    const rows = await db.all<any[]>(
      `SELECT c.*, t.name as template_name, t.slug as template_slug, s.name as segment_name
       FROM campaigns c
       INNER JOIN campaign_templates t ON t.id = c.template_id
       INNER JOIN campaign_segments s ON s.id = c.segment_id
       WHERE ${where.join(' AND ')}
       ORDER BY c.updated_at DESC, c.id DESC`,
      params
    )
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      ...row,
      settings: parseJson<Record<string, unknown>>(row.settings_json, {}),
    }))
  }

  static async getById(id: number): Promise<any | null> {
    const db = await getDb()
    const row = await db.get<any>(
      `SELECT c.*, t.name as template_name, t.slug as template_slug, s.name as segment_name
       FROM campaigns c
       INNER JOIN campaign_templates t ON t.id = c.template_id
       INNER JOIN campaign_segments s ON s.id = c.segment_id
       WHERE c.id = ?`,
      [id]
    )
    if (!row) return null
    return {
      ...row,
      settings: parseJson<Record<string, unknown>>(row.settings_json, {}),
    }
  }

  static async create(payload: CampaignInput, createdBy?: number | null): Promise<any> {
    await this.assertRefs(payload)
    const db = await getDb()
    const status = payload.scheduled_at ? 'scheduled' : 'draft'
    const result = await db.run(
      `INSERT INTO campaigns
       (name, channel, kind, status, template_id, segment_id, created_by, scheduled_at, settings_json, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        String(payload.name || '').trim(),
        payload.channel,
        payload.kind,
        status,
        payload.template_id,
        payload.segment_id,
        createdBy ?? null,
        payload.scheduled_at ?? null,
        payload.settings_json ?? null,
      ]
    )
    const row = await this.getById(Number(result.lastID))
    if (!row) throw new Error('Не удалось создать кампанию')
    return row
  }

  static async update(id: number, payload: Partial<CampaignInput>): Promise<any> {
    const current = await this.getById(id)
    if (!current) throw new Error('Кампания не найдена')
    const merged: CampaignInput = {
      name: payload.name ?? current.name,
      channel: payload.channel ?? current.channel,
      kind: payload.kind ?? current.kind,
      template_id: payload.template_id ?? current.template_id,
      segment_id: payload.segment_id ?? current.segment_id,
      scheduled_at: payload.scheduled_at === undefined ? current.scheduled_at : payload.scheduled_at,
      settings_json:
        payload.settings_json === undefined
          ? current.settings_json ?? JSON.stringify(current.settings || {})
          : payload.settings_json,
    }
    await this.assertRefs(merged)
    const db = await getDb()
    const status =
      current.status === 'running' || current.status === 'completed' || current.status === 'cancelled'
        ? current.status
        : merged.scheduled_at
          ? 'scheduled'
          : 'draft'
    await db.run(
      `UPDATE campaigns
       SET name = ?, channel = ?, kind = ?, status = ?, template_id = ?, segment_id = ?,
           scheduled_at = ?, settings_json = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        merged.name,
        merged.channel,
        merged.kind,
        status,
        merged.template_id,
        merged.segment_id,
        merged.scheduled_at ?? null,
        merged.settings_json ?? null,
        id,
      ]
    )
    const row = await this.getById(id)
    if (!row) throw new Error('Не удалось обновить кампанию')
    return row
  }

  static async createRun(campaignId: number, mode: CampaignRunMode, createdBy?: number | null): Promise<CampaignRunRow> {
    const db = await getDb()
    const result = await db.run(
      `INSERT INTO campaign_runs (campaign_id, mode, status, created_by) VALUES (?, ?, 'queued', ?)`,
      [campaignId, mode, createdBy ?? null]
    )
    const row = await db.get<CampaignRunRow>('SELECT * FROM campaign_runs WHERE id = ?', [result.lastID])
    if (!row) throw new Error('Не удалось создать запуск кампании')
    return row
  }

  static async updateRunStatus(id: number, status: CampaignRunStatus, extra?: { statsJson?: string | null; errorText?: string | null; finished?: boolean }): Promise<void> {
    const db = await getDb()
    await db.run(
      `UPDATE campaign_runs
       SET status = ?, stats_json = COALESCE(?, stats_json), error_text = ?, started_at = COALESCE(started_at, datetime('now')),
           finished_at = CASE WHEN ? = 1 THEN datetime('now') ELSE finished_at END
       WHERE id = ?`,
      [status, extra?.statsJson ?? null, extra?.errorText ?? null, extra?.finished ? 1 : 0, id]
    )
  }

  static async listRuns(campaignId?: number): Promise<any[]> {
    const db = await getDb()
    const rows = campaignId
      ? await db.all<any[]>(
          `SELECT r.*, c.name as campaign_name, c.channel FROM campaign_runs r
           INNER JOIN campaigns c ON c.id = r.campaign_id
           WHERE r.campaign_id = ? ORDER BY r.id DESC`,
          [campaignId]
        )
      : await db.all<any[]>(
          `SELECT r.*, c.name as campaign_name, c.channel FROM campaign_runs r
           INNER JOIN campaigns c ON c.id = r.campaign_id ORDER BY r.id DESC LIMIT 100`
        )
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      ...row,
      stats: parseJson<Record<string, number>>(row.stats_json, {}),
    }))
  }

  static async getRunById(id: number): Promise<any | null> {
    const db = await getDb()
    const row = await db.get<any>(
      `SELECT r.*, c.name as campaign_name, c.channel, c.template_id, c.segment_id
       FROM campaign_runs r INNER JOIN campaigns c ON c.id = r.campaign_id WHERE r.id = ?`,
      [id]
    )
    if (!row) return null
    return { ...row, stats: parseJson<Record<string, number>>(row.stats_json, {}) }
  }

  static async setCampaignStatus(id: number, status: CampaignRow['status']): Promise<void> {
    const db = await getDb()
    await db.run(`UPDATE campaigns SET status = ?, updated_at = datetime('now') WHERE id = ?`, [status, id])
  }

  private static async assertRefs(payload: CampaignInput): Promise<void> {
    const template = await CampaignTemplateService.getById(Number(payload.template_id))
    if (!template) throw new Error('Шаблон кампании не найден')
    const segment = await CampaignSegmentService.getById(Number(payload.segment_id))
    if (!segment) throw new Error('Сегмент кампании не найден')
    if (template.channel !== payload.channel) {
      throw new Error('Шаблон не соответствует каналу кампании')
    }
    if (segment.channel_scope !== 'all' && segment.channel_scope !== payload.channel) {
      throw new Error('Сегмент не соответствует каналу кампании')
    }
  }
}
