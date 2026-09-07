import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import {
  buildPrintingTechnologyProductUsage,
  collectPrintingTechnologyCodes,
  getPrintingTechnologyUsageCounts,
} from '../services/printingTechnologyUsageService'

describe('printingTechnologyUsageService', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      CREATE TABLE printers (
        id INTEGER PRIMARY KEY,
        technology_code TEXT
      );
      CREATE TABLE print_prices (
        id INTEGER PRIMARY KEY,
        technology_code TEXT
      );
      CREATE TABLE material_type_print_technologies (
        id INTEGER PRIMARY KEY,
        material_type_id INTEGER,
        technology_code TEXT
      );
      CREATE TABLE product_template_configs (
        id INTEGER PRIMARY KEY,
        product_id INTEGER,
        config_data TEXT,
        is_active INTEGER
      );
      CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        print_settings TEXT
      );
    `)
  })

  afterEach(async () => {
    await db.close()
  })

  it('collects technology codes only from supported configuration keys', () => {
    const codes = collectPrintingTechnologyCodes({
      simplified: {
        sizes: [
          {
            default_print: { technology_code: 'laser_prof' },
            print_prices: [{ technology_code: 'inkjet_solvent' }],
          },
        ],
      },
      allowedTechnologies: ['uv'],
      description: 'laser_office is only text here',
    })

    expect([...codes].sort()).toEqual(['inkjet_solvent', 'laser_prof', 'uv'])
  })

  it('returns a visible breakdown of printers, products, prices and material types', async () => {
    await db.run(`INSERT INTO printers (id, technology_code) VALUES (1, 'laser_prof')`)
    await db.run(`INSERT INTO print_prices (id, technology_code) VALUES (1, 'laser_prof')`)
    await db.run(`INSERT INTO print_prices (id, technology_code) VALUES (2, 'laser_prof')`)
    await db.run(
      `INSERT INTO material_type_print_technologies
       (id, material_type_id, technology_code)
       VALUES (1, 10, 'laser_prof'), (2, 11, 'laser_prof')`,
    )
    await db.run(
      `INSERT INTO product_template_configs
       (id, product_id, config_data, is_active)
       VALUES (1, 46, ?, 1), (2, 46, ?, 1)`,
      [
        JSON.stringify({
          simplified: {
            sizes: [{ print_prices: [{ technology_code: 'laser_prof' }] }],
          },
        }),
        JSON.stringify({
          simplified: {
            sizes: [{ default_print: { technology_code: 'laser_prof' } }],
          },
        }),
      ],
    )
    await db.run(
      `INSERT INTO products (id, print_settings) VALUES (47, ?)`,
      [JSON.stringify({ allowedTechnologies: ['laser_prof'] })],
    )

    const productUsage = await buildPrintingTechnologyProductUsage(db)
    const counts = await getPrintingTechnologyUsageCounts(db, 'laser_prof', productUsage)

    expect(counts).toEqual({
      printers: 1,
      products: 2,
      print_prices: 2,
      material_types: 2,
      total: 7,
    })
  })
})
