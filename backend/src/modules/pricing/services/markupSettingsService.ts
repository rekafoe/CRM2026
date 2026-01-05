import { getDb } from '../../../config/database'

export interface MarkupSettingRow {
  id: number
  setting_name: string
  setting_value: number
  description?: string | null
  is_active: number
  created_at: string
  updated_at: string
}

export class MarkupSettingsService {
  static async list(): Promise<MarkupSettingRow[]> {
    const db = await getDb()
    return db.all<MarkupSettingRow[]>(`
      SELECT
        id,
        setting_name,
        setting_value,
        description,
        is_active,
        created_at,
        updated_at
      FROM markup_settings
      WHERE is_active = 1
      ORDER BY setting_name
    `)
  }

  static async create(input: {
    setting_name: string
    setting_value: number
    description?: string | null
    is_active?: boolean | number
  }): Promise<MarkupSettingRow> {
    const db = await getDb()

    const result = await db.run(
      `
      INSERT INTO markup_settings (setting_name, setting_value, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `,
      input.setting_name,
      Number(input.setting_value ?? 0),
      input.description ?? null,
      input.is_active === undefined ? 1 : (input.is_active ? 1 : 0)
    )

    const row = await db.get<MarkupSettingRow>('SELECT * FROM markup_settings WHERE id = ?', result.lastID)
    if (!row) throw new Error('Не удалось создать настройку наценки')
    return row
  }

  static async update(
    id: number,
    updates: Partial<{
      setting_name: string
      setting_value: number
      description: string | null
      is_active: boolean | number
    }>
  ): Promise<MarkupSettingRow | null> {
    const db = await getDb()

    const existing = await db.get<{ id: number }>('SELECT id FROM markup_settings WHERE id = ?', id)
    if (!existing) return null

    const set: string[] = []
    const params: any[] = []

    if (updates.setting_name !== undefined) {
      set.push('setting_name = ?')
      params.push(updates.setting_name)
    }
    if (updates.setting_value !== undefined) {
      set.push('setting_value = ?')
      params.push(Number(updates.setting_value))
    }
    if (updates.description !== undefined) {
      set.push('description = ?')
      params.push(updates.description)
    }
    if (updates.is_active !== undefined) {
      set.push('is_active = ?')
      params.push(updates.is_active ? 1 : 0)
    }

    set.push("updated_at = datetime('now')")
    params.push(id)

    await db.run(`UPDATE markup_settings SET ${set.join(', ')} WHERE id = ?`, ...params)

    return db.get<MarkupSettingRow>('SELECT * FROM markup_settings WHERE id = ?', id)
  }

  static async delete(id: number): Promise<void> {
    const db = await getDb()
    // мягкое удаление
    await db.run(`UPDATE markup_settings SET is_active = 0, updated_at = datetime('now') WHERE id = ?`, id)
  }
}

