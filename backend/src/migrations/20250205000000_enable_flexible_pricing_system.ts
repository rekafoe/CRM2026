import { Database } from 'sqlite'

async function addColumnIfMissing(db: Database, table: string, columnDefinition: string): Promise<void> {
  let definition = columnDefinition
  let postUpdate: string | null = null

  if (definition.includes('DEFAULT CURRENT_TIMESTAMP')) {
    definition = definition.replace('DEFAULT CURRENT_TIMESTAMP', "DEFAULT '1970-01-01T00:00:00Z'")
    const columnName = columnDefinition.trim().split(/\s+/)[0]
    postUpdate = `UPDATE ${table} SET ${columnName} = CURRENT_TIMESTAMP WHERE ${columnName} IS NULL OR ${columnName} = '1970-01-01T00:00:00Z'`
  }

  try {
    await db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`)
    if (postUpdate) {
      await db.exec(postUpdate)
    }
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : ''
    if (message.includes('duplicate column name') || message.includes('already exists') || message.includes('no such table')) {
      return
    }
    throw error
  }
}

async function tableHasRows(db: Database, table: string): Promise<boolean> {
  const row = await db.get<{ count: number }>(`SELECT COUNT(*) as count FROM ${table}`)
  return (row?.count ?? 0) > 0
}

export async function up(db: Database): Promise<void> {
  await db.exec(`
    DROP TABLE IF EXISTS minimum_order_costs;
    DROP TABLE IF EXISTS product_base_prices;
    DROP TABLE IF EXISTS material_prices;
    DROP TABLE IF EXISTS pricing_multipliers;
    DROP TABLE IF EXISTS discount_rules;
    DROP TABLE IF EXISTS ai_model_configs;
    DROP TABLE IF EXISTS base_prices;
    DROP TABLE IF EXISTS urgency_multipliers;
    DROP TABLE IF EXISTS volume_discounts;
    DROP TABLE IF EXISTS loyalty_discounts;
  `)

  await db.exec(`
    CREATE TABLE IF NOT EXISTS post_processing_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'шт',
      operation_type TEXT NOT NULL DEFAULT 'other',
      price_unit TEXT NOT NULL DEFAULT 'per_item',
      setup_cost REAL NOT NULL DEFAULT 0,
      min_quantity INTEGER NOT NULL DEFAULT 1,
      parameters TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await addColumnIfMissing(db, 'post_processing_services', "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP")
  await addColumnIfMissing(db, 'post_processing_services', "price_unit TEXT NOT NULL DEFAULT 'per_item'")
  await addColumnIfMissing(db, 'post_processing_services', "setup_cost REAL NOT NULL DEFAULT 0")
  await addColumnIfMissing(db, 'post_processing_services', "min_quantity INTEGER NOT NULL DEFAULT 1")
  await addColumnIfMissing(db, 'post_processing_services', 'parameters TEXT')
  await addColumnIfMissing(db, 'post_processing_services', "operation_type TEXT NOT NULL DEFAULT 'other'")

  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_operations_link (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      operation_id INTEGER NOT NULL,
      sequence INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 1,
      is_required INTEGER NOT NULL DEFAULT 1,
      is_default INTEGER NOT NULL DEFAULT 1,
      price_multiplier REAL NOT NULL DEFAULT 1,
      default_params TEXT,
      conditions TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY (operation_id) REFERENCES post_processing_services(id) ON DELETE CASCADE,
      UNIQUE(product_id, operation_id, sequence)
    )
  `)

  await addColumnIfMissing(db, 'product_operations_link', 'sequence INTEGER NOT NULL DEFAULT 1')
  await addColumnIfMissing(db, 'product_operations_link', 'sort_order INTEGER NOT NULL DEFAULT 1')
  await addColumnIfMissing(db, 'product_operations_link', 'is_default INTEGER NOT NULL DEFAULT 1')
  await addColumnIfMissing(db, 'product_operations_link', 'price_multiplier REAL NOT NULL DEFAULT 1')
  await addColumnIfMissing(db, 'product_operations_link', 'default_params TEXT')
  await addColumnIfMissing(db, 'product_operations_link', 'conditions TEXT')
  await addColumnIfMissing(db, 'product_operations_link', "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP")

  await db.exec(`
    CREATE TABLE IF NOT EXISTS operation_pricing_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_id INTEGER NOT NULL,
      rule_name TEXT NOT NULL,
      rule_type TEXT NOT NULL,
      conditions TEXT,
      pricing_data TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (operation_id) REFERENCES post_processing_services(id) ON DELETE CASCADE
    )
  `)

  await addColumnIfMissing(db, 'operation_pricing_rules', 'pricing_data TEXT NOT NULL DEFAULT "{}"')
  await addColumnIfMissing(db, 'operation_pricing_rules', "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP")

  await db.exec(`
    CREATE TABLE IF NOT EXISTS markup_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_name TEXT NOT NULL UNIQUE,
      setting_value REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await addColumnIfMissing(db, 'markup_settings', "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP")

  await db.exec(`
    CREATE TABLE IF NOT EXISTS quantity_discounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      min_quantity INTEGER NOT NULL,
      max_quantity INTEGER,
      discount_percent REAL NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await addColumnIfMissing(db, 'quantity_discounts', "updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP")
  await addColumnIfMissing(db, 'quantity_discounts', 'max_quantity INTEGER')

  await db.run(
    `INSERT OR IGNORE INTO markup_settings (setting_name, setting_value, is_active) VALUES (?, ?, 1)`,
    ['base_markup', 2.2]
  )

  const discountTiers = [
    { min: 100, max: 499, percent: 5 },
    { min: 500, max: 999, percent: 10 },
    { min: 1000, max: null, percent: 15 }
  ]

  for (const tier of discountTiers) {
    const existing = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM quantity_discounts WHERE min_quantity = ? AND IFNULL(max_quantity, -1) = IFNULL(?, -1)` ,
      [tier.min, tier.max]
    )
    if ((existing?.count ?? 0) === 0) {
      await db.run(
        `INSERT INTO quantity_discounts (min_quantity, max_quantity, discount_percent, is_active) VALUES (?, ?, ?, 1)`,
        [tier.min, tier.max, tier.percent]
      )
    }
  }

  if (!(await tableHasRows(db, 'product_operations_link'))) {
    const products = await db.all<Array<{ id: number; name: string }>>('SELECT id, name FROM products WHERE is_active = 1')
    const operations = await db.all<Array<{ id: number; name: string }>>('SELECT id, name FROM post_processing_services WHERE is_active = 1')

    const operationMap = new Map<string, number>()
    for (const operation of operations) {
      if (!operationMap.has(operation.name)) {
        operationMap.set(operation.name, operation.id)
      }
    }

    const productOperationPlan: Array<{
      productName: string
      operations: Array<{ name: string; sequence: number; required?: boolean; isDefault?: boolean; multiplier?: number; conditions?: any; defaultParams?: any }>
    }> = [
      {
        productName: 'Визитки стандартные',
        operations: [
          { name: 'Цифровая цветная печать (SRA3)', sequence: 1, required: true, isDefault: true },
          { name: 'Резка на гильотине', sequence: 2, required: true, isDefault: true }
        ]
      },
      {
        productName: 'Листовки',
        operations: [
          { name: 'Цифровая цветная печать (SRA3)', sequence: 1, required: true, isDefault: true },
          { name: 'Резка на гильотине', sequence: 2, required: true, isDefault: true },
          { name: 'Фальцовка 1 сгиб', sequence: 3, required: false, isDefault: false }
        ]
      },
      {
        productName: 'Каталоги',
        operations: [
          { name: 'Цифровая цветная печать (SRA3)', sequence: 1, required: true, isDefault: true },
          { name: 'Биговка', sequence: 2, required: true, isDefault: true },
          { name: 'Резка на гильотине', sequence: 3, required: true, isDefault: true }
        ]
      }
    ]

    for (const plan of productOperationPlan) {
      const matchingProducts = products.filter((p) => p.name === plan.productName)
      if (matchingProducts.length === 0) continue

      for (const product of matchingProducts) {
        for (const op of plan.operations) {
          const operationId = operationMap.get(op.name)
          if (!operationId) continue

          await db.run(
            `INSERT OR IGNORE INTO product_operations_link (
              product_id,
              operation_id,
              sequence,
              sort_order,
              is_required,
              is_default,
              price_multiplier,
              default_params,
              conditions
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              product.id,
              operationId,
              op.sequence,
              op.sequence,
              op.required === false ? 0 : 1,
              op.isDefault === false ? 0 : 1,
              op.multiplier ?? 1,
              op.defaultParams ? JSON.stringify(op.defaultParams) : null,
              op.conditions ? JSON.stringify(op.conditions) : null
            ]
          )
        }
      }
    }
  }

  if (!(await tableHasRows(db, 'operation_pricing_rules'))) {
    const colorPrint = await db.get<{ id: number }>(
      `SELECT id FROM post_processing_services WHERE name = ? AND is_active = 1 LIMIT 1`,
      ['Цифровая цветная печать (SRA3)']
    )

    if (colorPrint?.id) {
      const rules = [
        {
          ruleName: 'Скидка 10% от 500 листов',
          ruleType: 'quantity_discount',
          conditions: { min_quantity: 500 },
          pricingData: { discount_percent: 10 }
        },
        {
          ruleName: 'Скидка 15% от 1000 листов',
          ruleType: 'quantity_discount',
          conditions: { min_quantity: 1000 },
          pricingData: { discount_percent: 15 }
        }
      ]

      for (const rule of rules) {
        await db.run(
          `INSERT INTO operation_pricing_rules (operation_id, rule_name, rule_type, conditions, pricing_data, is_active)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [
            colorPrint.id,
            rule.ruleName,
            rule.ruleType,
            JSON.stringify(rule.conditions),
            JSON.stringify(rule.pricingData)
          ]
        )
      }
    }
  }
}

export async function down(db: Database): Promise<void> {
  await db.exec('DROP TABLE IF EXISTS operation_pricing_rules')
  await db.exec('DROP TABLE IF EXISTS product_operations_link')
  await db.exec('DROP TABLE IF EXISTS quantity_discounts')
  await db.exec('DROP TABLE IF EXISTS markup_settings')
}
