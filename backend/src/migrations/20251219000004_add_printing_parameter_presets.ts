import { Database } from 'sqlite'
import { getDb } from '../db'

const TABLE_NAME = 'product_parameter_presets'

type PresetRow = {
  product_type: string
  preset_key: string
  label: string
  field_type: 'select' | 'checkbox' | 'number' | 'text'
  options?: string | null
  help_text?: string | null
  default_value?: string | null
  is_required?: number
  sort_order?: number
}

const PRESETS: PresetRow[] = [
  // Базовые пресеты печати (опции для print_technology подтянем динамически из справочника)
  { product_type: 'business_cards', preset_key: 'print_technology', label: 'Тип печати (оборудование)', field_type: 'select', options: null, is_required: 1, sort_order: 35 },
  { product_type: 'business_cards', preset_key: 'print_color_mode', label: 'Режим печати (Ч/Б / Цвет)', field_type: 'select', options: '["bw","color"]', is_required: 0, sort_order: 36, help_text: 'Нужно, если принтер умеет и Ч/Б и цвет. Если не указать — выбирается при расчёте.' },

  { product_type: 'flyers', preset_key: 'print_technology', label: 'Тип печати (оборудование)', field_type: 'select', options: null, is_required: 1, sort_order: 25 },
  { product_type: 'flyers', preset_key: 'print_color_mode', label: 'Режим печати (Ч/Б / Цвет)', field_type: 'select', options: '["bw","color"]', is_required: 0, sort_order: 26 },

  { product_type: 'posters', preset_key: 'print_technology', label: 'Тип печати (оборудование)', field_type: 'select', options: null, is_required: 1, sort_order: 15 },
  { product_type: 'posters', preset_key: 'print_color_mode', label: 'Режим печати (Ч/Б / Цвет)', field_type: 'select', options: '["bw","color"]', is_required: 0, sort_order: 16 },

  { product_type: 'multi_page', preset_key: 'print_technology', label: 'Тип печати (оборудование)', field_type: 'select', options: null, is_required: 1, sort_order: 25 },
  { product_type: 'multi_page', preset_key: 'print_color_mode', label: 'Режим печати (Ч/Б / Цвет)', field_type: 'select', options: '["bw","color"]', is_required: 0, sort_order: 26 },
]

export async function up(db?: Database): Promise<void> {
  const database = db || (await getDb())

  // Таблица может быть не создана в старых базах — тогда просто пропустим
  const table = await database.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
    TABLE_NAME
  )
  if (!table) return

  await database.exec('BEGIN')
  try {
    for (const p of PRESETS) {
      await database.run(
        `INSERT OR IGNORE INTO ${TABLE_NAME}
          (product_type, product_name, preset_key, label, field_type, options, help_text, default_value, is_required, sort_order)
         VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?)`,
        p.product_type,
        p.preset_key,
        p.label,
        p.field_type,
        p.options ?? null,
        p.help_text ?? null,
        p.default_value ?? null,
        p.is_required ?? 0,
        p.sort_order ?? 0
      )
    }
    await database.exec('COMMIT')
  } catch (e) {
    await database.exec('ROLLBACK')
    throw e
  }
}

export async function down(db?: Database): Promise<void> {
  const database = db || (await getDb())
  const table = await database.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
    TABLE_NAME
  )
  if (!table) return

  await database.exec('BEGIN')
  try {
    for (const p of PRESETS) {
      await database.run(
        `DELETE FROM ${TABLE_NAME} WHERE product_type = ? AND preset_key = ?`,
        p.product_type,
        p.preset_key
      )
    }
    await database.exec('COMMIT')
  } catch (e) {
    await database.exec('ROLLBACK')
    throw e
  }
}



