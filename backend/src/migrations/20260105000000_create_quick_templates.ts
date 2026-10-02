import { Database } from 'sqlite'

type SeedTemplate = {
  id: string
  name: string
  description: string
  icon: string
  category: string
  popularity: number
  specs: Record<string, any>
}

const seed: SeedTemplate[] = [
  {
    id: 'flyers_a6_1000',
    name: 'Листовки A6, 1000 шт',
    description: 'Стандартные листовки для рекламы',
    icon: '',
    category: 'popular',
    popularity: 95,
    specs: {
      productType: 'flyers',
      format: 'A6',
      quantity: 1000,
      sides: 2,
      paperType: 'semi-matte',
      paperDensity: 130,
      lamination: 'none',
      priceType: 'standard',
      customerType: 'regular'
    }
  },
  {
    id: 'business_cards_500',
    name: 'Визитки, 500 шт',
    description: 'Стандартные визитки с ламинацией',
    icon: '',
    category: 'popular',
    popularity: 90,
    specs: {
      productType: 'business_cards',
      format: 'стандартные',
      quantity: 500,
      sides: 2,
      paperType: 'semi-matte',
      paperDensity: 300,
      lamination: 'matte',
      priceType: 'standard',
      customerType: 'regular'
    }
  },
  {
    id: 'urgent_flyers',
    name: 'Срочные листовки',
    description: 'Листовки с ускоренным производством',
    icon: '',
    category: 'urgent',
    popularity: 75,
    specs: {
      productType: 'flyers',
      format: 'A6',
      quantity: 500,
      sides: 1,
      paperType: 'semi-matte',
      paperDensity: 130,
      lamination: 'none',
      priceType: 'urgent',
      customerType: 'regular'
    }
  },
  {
    id: 'vip_brochures',
    name: 'VIP брошюры',
    description: 'Премиум брошюры для VIP клиентов',
    icon: '',
    category: 'vip',
    popularity: 65,
    specs: {
      productType: 'brochures',
      format: 'A4',
      quantity: 500,
      sides: 2,
      paperType: 'coated',
      paperDensity: 200,
      lamination: 'glossy',
      priceType: 'standard',
      customerType: 'vip',
      pages: 16,
      folding: true
    }
  },
  {
    id: 'promo_stickers',
    name: 'Промо наклейки',
    description: 'Наклейки по акционной цене',
    icon: '',
    category: 'promo',
    popularity: 85,
    specs: {
      productType: 'stickers',
      format: '58x40',
      quantity: 2000,
      sides: 1,
      paperType: 'self-adhesive',
      paperDensity: 130,
      lamination: 'none',
      priceType: 'promo',
      customerType: 'regular',
      cutting: true
    }
  }
]

export async function up(db: Database) {
  await db.run(`
    CREATE TABLE IF NOT EXISTS quick_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL,
      category TEXT NOT NULL,
      popularity INTEGER NOT NULL DEFAULT 0,
      specs_json TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await db.run(`CREATE INDEX IF NOT EXISTS idx_quick_templates_category ON quick_templates(category);`)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_quick_templates_popularity ON quick_templates(popularity);`)

  for (const t of seed) {
    await db.run(
      `
      INSERT OR IGNORE INTO quick_templates (id, name, description, icon, category, popularity, specs_json, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `,
      t.id,
      t.name,
      t.description,
      t.icon,
      t.category,
      t.popularity,
      JSON.stringify(t.specs)
    )
  }

  console.log('Migration 20260105000000_create_quick_templates applied: quick_templates created and seeded.')
}

export async function down(db: Database) {
  await db.run('DROP TABLE IF EXISTS quick_templates;')
  console.log('Migration 20260105000000_create_quick_templates reverted: quick_templates dropped.')
}


