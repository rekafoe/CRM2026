import { Database } from 'sqlite'
import { getDb } from '../db'

/** Добавляет технологию «Лазерный профессиональный» для использования по умолчанию в шаблонах продуктов */
export async function up(db?: Database): Promise<void> {
  const database = db || (await getDb())
  await database.run(
    `INSERT OR IGNORE INTO print_technologies (code, name, pricing_mode, supports_duplex, is_active) VALUES (?, ?, ?, ?, 1)`,
    'laser_prof',
    'Лазерный профессиональный',
    'per_sheet',
    1
  )
  await database.run(
    `INSERT OR IGNORE INTO print_technology_prices (technology_code, price_single, price_duplex, price_per_meter, is_active)
     VALUES (?, NULL, NULL, NULL, 1)`,
    'laser_prof'
  )
}

export async function down(db?: Database): Promise<void> {
  const database = db || (await getDb())
  await database.run('DELETE FROM print_technology_prices WHERE technology_code = ?', 'laser_prof')
  await database.run('DELETE FROM print_technologies WHERE code = ?', 'laser_prof')
}
