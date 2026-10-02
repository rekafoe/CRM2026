import { createHash } from 'crypto'
import { Database } from 'sqlite'
import { initDB } from '../db'

export async function seedDemoData(): Promise<void> {
  const db = await initDB()

  await seedOrderStatuses(db)
  await seedPrinters(db)
  await seedUsers(db)
  await ensureSpecialUser(db)
  await seedPresets(db)
  await seedMaterials(db)

  console.log('Demo data seeded')
}

async function seedOrderStatuses(db: Database): Promise<void> {
  const existing = await db.get<{ c: number }>('SELECT COUNT(1) as c FROM order_statuses')
  if (existing && Number(existing.c) > 0) return

  const statuses = [
    { name: 'Ожидает', color: '#9e9e9e', sort: 1 },
    { name: 'Оформлен', color: '#1976d2', sort: 2 },
    { name: 'Принят в работу', color: '#5c6bc0', sort: 3 },
    { name: 'Выполнен', color: '#2e7d32', sort: 4 },
    { name: 'Передан в ПВЗ', color: '#ffa000', sort: 5 },
    { name: 'Получен в ПВЗ', color: '#7b1fa2', sort: 6 },
    { name: 'Завершён', color: '#1b5e20', sort: 7 },
  ]

  for (const status of statuses) {
    await db.run(
      'INSERT OR IGNORE INTO order_statuses (name, color, sort_order) VALUES (?, ?, ?)',
      status.name,
      status.color,
      status.sort
    )
  }
  console.log('Order statuses seeded')
}

async function seedPrinters(db: Database): Promise<void> {
  const existing = await db.get<{ c: number }>('SELECT COUNT(1) as c FROM printers')
  if (existing && Number(existing.c) > 0) return

  const printers = [
    { code: 'ch81', name: 'Коніка CH81 (цветная)' },
    { code: 'c554', name: 'Коніка C554 (офисная)' }
  ]

  for (const printer of printers) {
    await db.run('INSERT OR IGNORE INTO printers (code, name) VALUES (?, ?)', printer.code, printer.name)
  }
  console.log('Printers seeded')
}

async function seedUsers(db: Database): Promise<void> {
  const existing = await db.get<{ c: number }>('SELECT COUNT(1) as c FROM users')
  if (existing && Number(existing.c) > 0) return

  const hp = (value: string) => createHash('sha256').update(value).digest('hex')

  const users = [
    { name: 'Админ', email: 'admin@example.com', phone: '+375290000000', role: 'admin', api_token: 'admin-token-123', password: 'admin123' },
    { name: 'Менеджер 1', email: 'm1@example.com', phone: '+375290000001', role: 'manager', api_token: 'manager-token-111', password: 'manager123' },
    { name: 'Менеджер 2', email: 'm2@example.com', phone: '+375290000002', role: 'manager', api_token: 'manager-token-222', password: 'manager123' },
    { name: 'Наблюдатель', email: 'view@example.com', phone: '+375290000003', role: 'viewer', api_token: 'viewer-token-333', password: 'viewer123' },
    { name: 'Иванов Иван', email: 'ivanov@example.com', phone: '+375291234567', role: 'manager', api_token: 'manager-token-ivan', password: 'ivan123' },
    { name: 'Петрова Анна', email: 'petrova@example.com', phone: '+375291234568', role: 'manager', api_token: 'manager-token-anna', password: 'anna123' },
    { name: 'Сидоров Петр', email: 'sidorov@example.com', phone: '+375291234569', role: 'manager', api_token: 'manager-token-petr', password: 'petr123' },
    { name: 'Козлова Мария', email: 'kozlova@example.com', phone: '+375291234570', role: 'manager', api_token: 'manager-token-maria', password: 'maria123' },
    { name: 'Смирнов Алексей', email: 'smirnov@example.com', phone: '+375291234571', role: 'admin', api_token: 'admin-token-alex', password: 'alex123' },
    { name: 'Волкова Елена', email: 'volkova@example.com', phone: '+375291234572', role: 'viewer', api_token: 'viewer-token-elena', password: 'elena123' }
  ]

  for (const user of users) {
    await db.run(
      'INSERT OR IGNORE INTO users (name, email, phone, role, api_token, password_hash) VALUES (?, ?, ?, ?, ?, ?)',
      user.name,
      user.email,
      user.phone,
      user.role,
      user.api_token,
      hp(user.password)
    )
  }

  console.log('Users seeded')
}

async function ensureSpecialUser(db: Database): Promise<void> {
  const existing = await db.get<{ id: number }>('SELECT id FROM users WHERE name = ?', 'Войтюшкевич Максим')
  if (existing) return

  const hp = (value: string) => createHash('sha256').update(value).digest('hex')
  await db.run(
    'INSERT OR IGNORE INTO users (name, email, phone, role, api_token, password_hash) VALUES (?, ?, ?, ?, ?, ?)',
    'Войтюшкевич Максим',
    'maxim@example.com',
    '+375290000010',
    'manager',
    'manager-token-maksim',
    hp('maksim123')
  )
  console.log('Created user: Войтюшкевич Максим (email: maxim@example.com)')
}

async function seedPresets(db: Database): Promise<void> {
  const existing = await db.get<{ c: number }>('SELECT COUNT(1) as c FROM preset_categories')
  if (existing && Number(existing.c) > 0) return

  const presets = [
    {
      category: 'Визитки',
      color: '#1976d2',
      items: [
        { description: 'Визитки 90x50, односторонние', price: 30 },
        { description: 'Визитки 90x50, двусторонние', price: 40 }
      ],
      extras: [
        { name: 'Ламинация матовая', price: 10, type: 'checkbox' },
        { name: 'Ламинация глянцевая', price: 10, type: 'checkbox' }
      ]
    },
    {
      category: 'Листовки',
      color: '#43a047',
      items: [
        { description: 'Листовки A6, 4+0', price: 25 },
        { description: 'Листовки A5, 4+0', price: 35 },
        { description: 'Листовки A4, 4+0', price: 55 }
      ],
      extras: []
    },
    {
      category: 'Буклеты',
      color: '#ef6c00',
      items: [
        { description: 'Буклет A4, 2 фальца (евро)', price: 80 },
        { description: 'Буклет A3, 1 фальц', price: 95 }
      ],
      extras: []
    },
    {
      category: 'Плакаты',
      color: '#6d4c41',
      items: [
        { description: 'Плакат A3', price: 15 },
        { description: 'Плакат A2', price: 25 },
        { description: 'Плакат A1', price: 45 }
      ],
      extras: []
    },
    {
      category: 'Наклейки',
      color: '#8e24aa',
      items: [
        { description: 'Наклейки вырубные, малый формат', price: 20 },
        { description: 'Наклейки листовые A4', price: 12 }
      ],
      extras: []
    },
    {
      category: 'Баннеры',
      color: '#0097a7',
      items: [
        { description: 'Баннер 1×1 м', price: 30 },
        { description: 'Баннер 2×1 м', price: 50 }
      ],
      extras: [
        { name: 'Проклейка люверсов', price: 10, type: 'checkbox' }
      ]
    },
    {
      category: 'Календари',
      color: '#c2185b',
      items: [
        { description: 'Календарь настенный (перекидной)', price: 60 },
        { description: 'Календарь домик', price: 25 }
      ],
      extras: []
    }
  ]

  for (const preset of presets) {
    await db.run('INSERT OR IGNORE INTO preset_categories (category, color) VALUES (?, ?)', preset.category, preset.color)
    const categoryRow = await db.get<{ id: number }>('SELECT id FROM preset_categories WHERE category = ?', preset.category)
    const categoryId = categoryRow?.id
    if (!categoryId) continue

    for (const item of preset.items) {
      await db.run(
        'INSERT OR IGNORE INTO preset_items (category_id, description, price) VALUES (?, ?, ?)',
        categoryId,
        item.description,
        item.price
      )
    }

    for (const extra of preset.extras || []) {
      await db.run(
        'INSERT OR IGNORE INTO preset_extras (category_id, name, price, type, unit) VALUES (?, ?, ?, ?, ?)',
        categoryId,
        extra.name,
        extra.price,
        extra.type,
        (extra as any).unit || null
      )
    }
  }

  console.log('Presets seeded')
}

async function seedMaterials(db: Database): Promise<void> {
  const existing = await db.get<{ c: number }>('SELECT COUNT(1) as c FROM materials')
  if (existing && Number(existing.c) > 0) return

  const materials = [
    { name: 'Бумага мелованная 130 г/м², SRA3', unit: 'лист', quantity: 1500, min_quantity: 200 },
    { name: 'Бумага мелованная 150 г/м², SRA3', unit: 'лист', quantity: 1500, min_quantity: 150 },
    { name: 'Бумага офсетная 80 г/м², SRA3', unit: 'лист', quantity: 3000, min_quantity: 300 },
    { name: 'Плёнка ламинации матовая 35 мкм, SRA3', unit: 'лист', quantity: 1000, min_quantity: 100 },
    { name: 'Плёнка ламинации глянцевая 35 мкм, SRA3', unit: 'лист', quantity: 1000, min_quantity: 100 }
  ]

  for (const material of materials) {
    await db.run(
      'INSERT INTO materials (name, unit, quantity, min_quantity, sheet_price_single) VALUES (?, ?, ?, ?, ?)',
      material.name,
      material.unit,
      material.quantity,
      material.min_quantity,
      null
    )
  }

  const paperRow = await db.get<{ id: number }>('SELECT id FROM materials WHERE name = ?', 'Бумага мелованная 130 г/м², SRA3')
  const paper130Id = paperRow?.id
  if (paper130Id) {
    const productMaterialsColumns = await db.all<Array<{ name: string }>>(
      `PRAGMA table_info(product_materials)`
    )
    const hasPresetCategory = Array.isArray(productMaterialsColumns)
      ? productMaterialsColumns.some((col) => col.name === 'presetCategory')
      : false
    if (!hasPresetCategory) {
      console.log('product_materials использует новую структуру, пресеты не связываем')
      return
    }

    const flyers = [
      { desc: 'Листовки A6, 4+0', qtyPerItem: 1 / 8 },
      { desc: 'Листовки A5, 4+0', qtyPerItem: 1 / 4 },
      { desc: 'Листовки A4, 4+0', qtyPerItem: 1 / 2 }
    ]

    for (const flyer of flyers) {
      const presetExists = await db.get(
        'SELECT 1 FROM preset_items pi JOIN preset_categories pc ON pc.id = pi.category_id WHERE pc.category = ? AND pi.description = ? LIMIT 1',
        'Листовки',
        flyer.desc
      )
      if (presetExists) {
        await db.run(
          'INSERT OR IGNORE INTO product_materials (presetCategory, presetDescription, materialId, qtyPerItem) VALUES (?, ?, ?, ?)',
          'Листовки',
          flyer.desc,
          paper130Id,
          flyer.qtyPerItem
        )
      }
    }
  }

  console.log('Materials seeded')
}

if (require.main === module) {
  seedDemoData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Failed to seed demo data', error)
      process.exit(1)
    })
}

