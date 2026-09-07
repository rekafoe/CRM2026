import { open, type Database } from 'sqlite'
import sqlite3 from 'sqlite3'
import { up } from '../migrations/20260907180000_material_type_print_technologies'
import {
  MaterialPrintTechnologyService,
  type MaterialPrintTechnologyLink,
} from '../modules/warehouse/services/materialPrintTechnologyService'

function link(
  technologyCode: string,
  patch: Partial<MaterialPrintTechnologyLink> = {},
): MaterialPrintTechnologyLink {
  return {
    id: 1,
    material_type_id: 10,
    technology_code: technologyCode,
    technology_name: technologyCode,
    pricing_mode: 'per_sheet',
    supports_indoor: 1,
    supports_outdoor: 0,
    is_default: 0,
    priority: 100,
    is_active: 1,
    ...patch,
  }
}

describe('material type print technologies migration', () => {
  let db: Database

  beforeEach(async () => {
    db = await open({ filename: ':memory:', driver: sqlite3.Database })
    await db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE material_types (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      );
      CREATE TABLE print_technologies (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );
    `)
    await up(db)
  })

  afterEach(async () => {
    await db.close()
  })

  it('stores many technologies for one material type and rejects duplicate pairs', async () => {
    await db.run(`INSERT INTO material_types (id, name) VALUES (1, 'Плёнка')`)
    await db.run(`INSERT INTO print_technologies (code, name) VALUES ('solvent', 'Сольвент')`)
    await db.run(`INSERT INTO print_technologies (code, name) VALUES ('uv', 'УФ')`)

    await db.run(
      `INSERT INTO material_type_print_technologies
       (material_type_id, technology_code, supports_indoor, supports_outdoor, is_default, priority)
       VALUES (1, 'solvent', 1, 1, 1, 10)`,
    )
    await db.run(
      `INSERT INTO material_type_print_technologies
       (material_type_id, technology_code, supports_indoor, supports_outdoor, is_default, priority)
       VALUES (1, 'uv', 1, 0, 0, 20)`,
    )

    const rows = await db.all(`SELECT * FROM material_type_print_technologies`)
    expect(rows).toHaveLength(2)
    await expect(
      db.run(
        `INSERT INTO material_type_print_technologies
         (material_type_id, technology_code, supports_indoor, supports_outdoor)
         VALUES (1, 'solvent', 1, 0)`,
      ),
    ).rejects.toThrow()
  })
})

describe('MaterialPrintTechnologyService.chooseForUsage', () => {
  it('selects an outdoor default and ignores indoor-only technologies', () => {
    const chosen = MaterialPrintTechnologyService.chooseForUsage(
      [
        link('laser', { supports_indoor: 1, supports_outdoor: 0, is_default: 1 }),
        link('solvent', {
          id: 2,
          supports_indoor: 1,
          supports_outdoor: 1,
          is_default: 1,
          priority: 20,
        }),
      ],
      'outdoor',
    )
    expect(chosen.technology_code).toBe('solvent')
  })

  it('uses a unique lowest priority and rejects an ambiguous tie', () => {
    expect(
      MaterialPrintTechnologyService.chooseForUsage(
        [link('laser', { priority: 20 }), link('uv', { id: 2, priority: 10 })],
        'indoor',
      ).technology_code,
    ).toBe('uv')

    expect(() =>
      MaterialPrintTechnologyService.chooseForUsage(
        [link('laser', { priority: 10 }), link('uv', { id: 2, priority: 10 })],
        'indoor',
      ),
    ).toThrow(/неоднозначно/)
  })
})
