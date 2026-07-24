import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import {
  down,
  up,
} from '../migrations/20260724190000_add_polaroid_standard_print_type'

describe('polaroid standard print type migration', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE product_template_configs (
        id INTEGER PRIMARY KEY,
        product_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL,
        config_data TEXT,
        updated_at TEXT
      )
    `)
    await db.run(
      `INSERT INTO product_template_configs
       (id, product_id, name, is_active, config_data)
       VALUES (1, 52, 'template', 1, ?)`,
      [
        JSON.stringify({
          simplified: {
            types: [{ id: 100, name: 'Премиум', default: true }],
            typeConfigs: {
              100: {
                sizes: [{ id: 5, label: '5х7 см', print_prices: [{ technology_code: 'laser_sheet' }] }],
                allowed_price_types: ['standard', 'online'],
              },
            },
          },
        }),
      ]
    )
  })

  afterEach(async () => {
    await db.close()
  })

  it('clones premium calculator settings into a non-default digital type', async () => {
    await up(db)

    const row = await db.get<{ config_data: string }>(
      'SELECT config_data FROM product_template_configs WHERE id = 1'
    )
    const simplified = JSON.parse(row!.config_data).simplified
    const digital = simplified.types.find((type: any) => type.key === 'polaroid-standard-digital')

    expect(digital).toMatchObject({
      id: 101,
      name: 'Цифровая печать',
      default: false,
    })
    expect(simplified.typeConfigs['101']).toEqual(simplified.typeConfigs['100'])
  })

  it('is idempotent and removes only its own type on rollback', async () => {
    await up(db)
    await up(db)

    let row = await db.get<{ config_data: string }>(
      'SELECT config_data FROM product_template_configs WHERE id = 1'
    )
    expect(JSON.parse(row!.config_data).simplified.types).toHaveLength(2)

    await down(db)
    row = await db.get<{ config_data: string }>(
      'SELECT config_data FROM product_template_configs WHERE id = 1'
    )
    const simplified = JSON.parse(row!.config_data).simplified
    expect(simplified.types).toEqual([{ id: 100, name: 'Премиум', default: true }])
    expect(simplified.typeConfigs['100']).toBeDefined()
  })
})
