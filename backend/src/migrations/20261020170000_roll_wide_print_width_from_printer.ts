import type { Database } from 'sqlite'

/**
 * У рулонной м²-цены ширина печати живёт на принтере.
 * 600×900 в print_prices — стол УФ; на профиле roll_wide эти поля больше не храним.
 */
export async function up(db: Database): Promise<void> {
  const columns = await db.all<Array<{ name: string }>>(`PRAGMA table_info('print_prices')`)
  const names = new Set(columns.map((column) => column.name))
  if (!names.has('max_width_mm') || !names.has('max_height_mm') || !names.has('m2_pricing_kind')) return

  await db.run(
    `UPDATE print_prices
     SET max_width_mm = NULL,
         max_height_mm = NULL,
         updated_at = datetime('now')
     WHERE counter_unit = 'm2'
       AND m2_pricing_kind = 'roll_wide'`,
  )
}

export async function down(_db: Database): Promise<void> {
  // Возвращать 600×900 нельзя: это был чужой лимит стола УФ, а не ширина сольвента.
}
