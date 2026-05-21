import { Database } from 'sqlite'

/**
 * Привязка дизайнов к размеру подтипа (size_id = id из config_data.simplified.typeConfigs[].sizes).
 * Пустой size_id — legacy «на весь подтип» (постепенно убираем).
 */
export async function up(db: Database): Promise<void> {
  const tableExists = await db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='product_subtype_designs'",
  )
  if (!tableExists) {
    await db.exec(`
      CREATE TABLE product_subtype_designs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        type_id INTEGER NOT NULL,
        size_id TEXT NOT NULL DEFAULT '',
        design_template_id INTEGER NOT NULL REFERENCES design_templates(id) ON DELETE CASCADE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(product_id, type_id, size_id, design_template_id)
      )
    `)
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_psd_product_type_size ON product_subtype_designs(product_id, type_id, size_id)`)
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_psd_design_template ON product_subtype_designs(design_template_id)`)
    return
  }

  const cols = (await db.all('PRAGMA table_info(product_subtype_designs)')) as Array<{ name: string }>
  if (cols.some((c) => c.name === 'size_id')) return

  await db.exec(`
    CREATE TABLE product_subtype_designs_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      type_id INTEGER NOT NULL,
      size_id TEXT NOT NULL DEFAULT '',
      design_template_id INTEGER NOT NULL REFERENCES design_templates(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(product_id, type_id, size_id, design_template_id)
    )
  `)

  await db.exec(`
    INSERT INTO product_subtype_designs_new (id, product_id, type_id, size_id, design_template_id, sort_order, created_at)
    SELECT id, product_id, type_id, '', design_template_id, sort_order, created_at
    FROM product_subtype_designs
  `)

  const links = await db.all<Array<{ id: number; design_template_id: number }>>(
    'SELECT id, design_template_id FROM product_subtype_designs_new WHERE size_id = \'\'',
  )
  for (const link of links ?? []) {
    const row = await db.get<{ spec: string | null }>(
      'SELECT spec FROM design_templates WHERE id = ?',
      [link.design_template_id],
    )
    if (!row?.spec) continue
    try {
      const spec = JSON.parse(row.spec) as Record<string, unknown>
      const sizeId = spec.sizeId != null ? String(spec.sizeId).trim() : ''
      if (sizeId) {
        await db.run('UPDATE product_subtype_designs_new SET size_id = ? WHERE id = ?', [sizeId, link.id])
      }
    } catch {
      // ignore invalid spec
    }
  }

  await db.exec('DROP TABLE product_subtype_designs')
  await db.exec('ALTER TABLE product_subtype_designs_new RENAME TO product_subtype_designs')
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_psd_product_type_size ON product_subtype_designs(product_id, type_id, size_id)`)
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_psd_design_template ON product_subtype_designs(design_template_id)`)
}

export async function down(db: Database): Promise<void> {
  // no-op: reverting would lose size granularity
}
