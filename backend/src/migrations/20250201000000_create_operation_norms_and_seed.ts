import { Database } from 'sqlite'
import { getDb } from '../db'

type OperationSeed = {
  productType: string
  operationLabel: string
  candidates: string[]
  formula: string
}

const DEFAULT_FORMULAS: Record<string, string> = {
  printFlyers: 'ceil(quantity / max(itemsPerSheet, 1))',
  cutFlyers: 'ceil(quantity / 200)',
  laminateFlyers: 'quantity',
  printCards: 'ceil(quantity / 10)',
  cutCards: 'ceil(quantity / 10)',
  cornerCards: 'quantity * 4',
  laminateCards: 'ceil(quantity / 10)',
  printBooklets: 'ceil(quantity / 2)',
  cutBooklets: 'ceil(quantity / 2)',
  foldBooklets: 'ceil(quantity / 2)',
  stitchBooklets: 'quantity'
}

const OPERATION_SEEDS: OperationSeed[] = [
  {
    productType: 'flyers',
    operationLabel: 'Печать',
    candidates: ['Цифровая цветная печать (SRA3)', 'Цифровая печать SRA3', 'Цифровая печать'],
    formula: DEFAULT_FORMULAS.printFlyers
  },
  {
    productType: 'flyers',
    operationLabel: 'Резка',
    candidates: ['Резка на гильотине', 'Резка листов'],
    formula: DEFAULT_FORMULAS.cutFlyers
  },
  {
    productType: 'flyers',
    operationLabel: 'Ламинация',
    candidates: ['Ламинация матовая', 'Ламинация глянцевая'],
    formula: DEFAULT_FORMULAS.laminateFlyers
  },
  {
    productType: 'business_cards',
    operationLabel: 'Печать',
    candidates: ['Цифровая цветная печать (SRA3)', 'Цифровая печать визиток'],
    formula: DEFAULT_FORMULAS.printCards
  },
  {
    productType: 'business_cards',
    operationLabel: 'Резка',
    candidates: ['Резка на гильотине', 'Высечка визиток'],
    formula: DEFAULT_FORMULAS.cutCards
  },
  {
    productType: 'business_cards',
    operationLabel: 'Скругление углов',
    candidates: ['Скругление углов', 'Углорез'],
    formula: DEFAULT_FORMULAS.cornerCards
  },
  {
    productType: 'business_cards',
    operationLabel: 'Ламинация',
    candidates: ['Ламинация матовая', 'Ламинация глянцевая'],
    formula: DEFAULT_FORMULAS.laminateCards
  },
  {
    productType: 'booklets',
    operationLabel: 'Печать',
    candidates: ['Цифровая цветная печать (SRA3)', 'Цифровая печать буклетов'],
    formula: DEFAULT_FORMULAS.printBooklets
  },
  {
    productType: 'booklets',
    operationLabel: 'Резка',
    candidates: ['Резка на гильотине'],
    formula: DEFAULT_FORMULAS.cutBooklets
  },
  {
    productType: 'booklets',
    operationLabel: 'Биговка',
    candidates: ['Биговка', 'Фальцовка (1 сгиб)'],
    formula: DEFAULT_FORMULAS.foldBooklets
  },
  {
    productType: 'booklets',
    operationLabel: 'Сшивка',
    candidates: ['Сшивка', 'Скрепление на скобу'],
    formula: DEFAULT_FORMULAS.stitchBooklets
  }
]

async function seedDefaultNorms(db: Database): Promise<void> {
  const operations = await db.all<Array<{ id: number; name: string }>>(`
    SELECT id, name FROM post_processing_services WHERE is_active = 1
  `)

  if (!operations.length) {
    return
  }

  const normalized = operations.map((op) => ({ ...op, lower: op.name.toLowerCase() }))

  const resolveOperationId = (candidates: string[]): number | undefined => {
    for (const candidate of candidates) {
      const match = normalized.find((op) => op.lower === candidate.toLowerCase())
      if (match) return match.id
    }
    for (const candidate of candidates) {
      const match = normalized.find((op) => op.lower.includes(candidate.toLowerCase()))
      if (match) return match.id
    }
    return undefined
  }

  for (const seed of OPERATION_SEEDS) {
    const operationId = resolveOperationId(seed.candidates)
    if (!operationId) continue

    await db.run(
      `INSERT OR IGNORE INTO operation_norms (product_type, operation, service_id, formula, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      seed.productType,
      seed.operationLabel,
      operationId,
      seed.formula
    )
  }
}

export async function up(db?: Database): Promise<void> {
  const database = db ?? (await getDb())

  await database.exec(`
    CREATE TABLE IF NOT EXISTS operation_norms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_type TEXT NOT NULL,
      operation TEXT NOT NULL,
      service_id INTEGER NOT NULL,
      formula TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (service_id) REFERENCES post_processing_services(id) ON DELETE CASCADE,
      UNIQUE(product_type, service_id)
    )
  `)

  try {
    await seedDefaultNorms(database)
  } catch (error) {
    console.warn('⚠️  Failed to seed default operation norms:', error)
  }
}

export async function down(db?: Database): Promise<void> {
  const database = db ?? (await getDb())
  await database.exec('DROP TABLE IF EXISTS operation_norms')
}

