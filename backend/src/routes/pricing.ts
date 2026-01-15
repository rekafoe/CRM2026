import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { getDb } from '../config/database'
import { ServiceManagementService } from '../modules/pricing/services/serviceManagementService'
import { PricingServiceRepository } from '../modules/pricing/repositories/serviceRepository'

console.log('Loading pricing routes...')

const router = Router()

const toServiceResponse = (service: any) => ({
  id: service.id,
  name: service.name,
  type: service.type,
  service_type: service.type,
  unit: service.unit,
  price_unit: service.priceUnit,
  rate: service.rate,
  price_per_unit: service.rate,
  currency: service.currency ?? 'BYN',
  isActive: service.isActive,
  is_active: service.isActive,
  operation_type: service.operationType ?? service.operation_type, // 🆕
})

const toTierResponse = (tier: any) => ({
  id: tier.id,
  serviceId: tier.serviceId,
  service_id: tier.serviceId,
  minQuantity: tier.minQuantity,
  min_quantity: tier.minQuantity,
  rate: tier.rate,
  price_per_unit: tier.rate,
  isActive: tier.isActive,
  is_active: tier.isActive,
})

/**
 * @swagger
 * /api/pricing/test:
 *   get:
 *     summary: Тестовый роут для проверки работы pricing API
 *     tags: [Pricing]
 *     security: []
 *     responses:
 *       200:
 *         description: Успешный ответ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Pricing routes work!
 */
router.get('/test', (req: any, res: any) => {
  console.log('Pricing test route called')
  res.json({ message: 'Pricing routes work!' })
})

/**
 * @swagger
 * /api/pricing/product-types:
 *   get:
 *     summary: Получить список типов продуктов
 *     description: Возвращает список всех активных типов продуктов с их ключами и описаниями
 *     tags: [Pricing]
 *     responses:
 *       200:
 *         description: Список типов продуктов
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                     example: 1
 *                   key:
 *                     type: string
 *                     example: business_cards
 *                   name:
 *                     type: string
 *                     example: Визитки
 *                   category:
 *                     type: string
 *                     example: printing
 *                   description:
 *                     type: string
 *                   is_active:
 *                     type: integer
 *                     example: 1
 *                   sort_order:
 *                     type: integer
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *                   updated_at:
 *                     type: string
 *                     format: date-time
 */
router.get('/product-types', asyncHandler(async (req, res) => {
  const db = await getDb()
  const products = await db.all<any>(`
    SELECT
      p.id,
      CASE
        WHEN p.name = 'Визитки' THEN 'business_cards'
        WHEN p.name = 'Листовки' THEN 'flyers'
        WHEN p.name = 'Буклеты' THEN 'booklets'
        ELSE LOWER(REPLACE(p.name, ' ', '_'))
      END as key,
      p.name,
      'printing' as category,
      p.description,
      p.is_active,
      p.id as sort_order,
      p.created_at,
      p.updated_at
    FROM products p
    WHERE p.is_active = 1
    ORDER BY p.id
  `)
  res.json(products)
}))

/**
 * @swagger
 * /api/pricing/product-types/{key}/schema:
 *   get:
 *     summary: Получить схему продукта для калькулятора
 *     description: Возвращает схему конфигурации продукта с параметрами и операциями
 *     tags: [Pricing]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Ключ типа продукта (например, business_cards, flyers, booklets)
 *         example: business_cards
 *     responses:
 *       200:
 *         description: Схема продукта
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 key:
 *                   type: string
 *                   example: business_cards
 *                 name:
 *                   type: string
 *                   example: Визитки
 *                 parameters:
 *                   type: object
 *                   description: Параметры конфигурации продукта
 *                 operations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       operation:
 *                         type: string
 *                       service_id:
 *                         type: integer
 *                       service:
 *                         type: string
 *                       type:
 *                         type: string
 *                       unit:
 *                         type: string
 *                       rate:
 *                         type: number
 *                       price_unit:
 *                         type: string
 *                       formula:
 *                         type: string
 */
router.get('/product-types/:key/schema', asyncHandler(async (req, res) => {
  const { key } = req.params
  const db = await getDb()

  // Получаем схему продукта на основе operation_norms
  const operations = await db.all(`
    SELECT
      op.operation,
      op.service_id,
      pps.name as service_name,
      pps.unit,
      pps.price as price_per_unit,
      pps.operation_type,
      pps.price_unit,
      op.formula
    FROM operation_norms op
    JOIN post_processing_services pps ON op.service_id = pps.id
    WHERE op.product_type = ? AND op.is_active = 1
    ORDER BY op.operation
  `, [key])

  // Создаем схему на основе операций
  const schema = {
    key,
    name: key === 'flyers' ? 'Листовки' :
          key === 'business_cards' ? 'Визитки' :
          key === 'booklets' ? 'Буклеты' : key,
    parameters: {
      format: { type: 'select', options: ['A6', 'A5', 'A4', 'A3', 'SRA3'], required: true },
      quantity: { type: 'number', min: 1, required: true },
      sides: { type: 'select', options: [1, 2], default: 1 },
      paperType: { type: 'select', options: ['semi-matte', 'coated', 'matte'], default: 'semi-matte' },
      paperDensity: { type: 'select', options: [120, 150, 200, 300], default: 120 },
      lamination: { type: 'select', options: ['none', 'matte', 'glossy'], default: 'none' }
    },
    operations: operations.map(op => ({
      operation: op.operation,
      service_id: op.service_id,
      service: op.service_name,
      type: op.operation_type ?? 'general',
      unit: op.unit,
      rate: op.price_per_unit,
      price_unit: op.price_unit ?? 'per_item',
      formula: op.formula
    }))
  }

  res.json(schema)
}))

/**
 * @swagger
 * /api/pricing/print-prices:
 *   get:
 *     summary: Получить цены печати
 *     description: Возвращает список всех активных цен печати по технологиям
 *     tags: [Pricing]
 *     responses:
 *       200:
 *         description: Список цен печати
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   technology_code:
 *                     type: string
 *                     example: digital
 *                   counter_unit:
 *                     type: string
 *                     example: per_sheet
 *                   price_bw_single:
 *                     type: number
 *                   price_bw_duplex:
 *                     type: number
 *                   price_color_single:
 *                     type: number
 *                   price_color_duplex:
 *                     type: number
 *                   price_bw_per_meter:
 *                     type: number
 *                   price_color_per_meter:
 *                     type: number
 *                   is_active:
 *                     type: integer
 *                   created_at:
 *                     type: string
 *                     format: date-time
 *                   updated_at:
 *                     type: string
 *                     format: date-time
 */
router.get('/print-prices', asyncHandler(async (req, res) => {
  try {
    const db = await getDb()
    const printPrices = await db.all<any>(`
      SELECT
        pp.id,
        pp.technology_code,
        pp.counter_unit,
        pp.price_bw_single,
        pp.price_bw_duplex,
        pp.price_color_single,
        pp.price_color_duplex,
        pp.price_bw_per_meter,
        pp.price_color_per_meter,
        pp.is_active,
        pp.created_at,
        pp.updated_at
      FROM print_prices pp
      WHERE pp.is_active = 1
      ORDER BY pp.technology_code
    `)
    res.json(printPrices)
  } catch (error) {
    // Если таблицы не существуют, возвращаем пустой массив
    console.log('Print prices table not found, returning empty array')
    res.json([])
  }
}))

// GET /api/pricing/service-prices - цены услуг
router.get('/service-prices', asyncHandler(async (req, res) => {
  try {
    const db = await getDb()
    const servicePrices = await db.all<any>(`
      SELECT
        s.id,
        s.name,
        s.description,
        s.price as price_per_unit,
        s.unit,
        s.operation_type,
        s.price_unit,
        s.setup_cost,
        s.min_quantity,
        s.is_active,
        s.created_at,
        s.updated_at
      FROM post_processing_services s
      WHERE s.is_active = 1
      ORDER BY s.name
    `)
    res.json(servicePrices)
  } catch (error) {
    console.log('Service prices table not found, returning empty array')
    res.json([])
  }
}))

/**
 * @swagger
 * /api/pricing/services:
 *   get:
 *     summary: Получить список услуг
 *     description: Возвращает список всех активных услуг с их ценами и параметрами
 *     tags: [Pricing]
 *     responses:
 *       200:
 *         description: Список услуг
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                     example: Ламинация
 *                   type:
 *                     type: string
 *                     example: lamination
 *                   service_type:
 *                     type: string
 *                   unit:
 *                     type: string
 *                     example: per_item
 *                   price_unit:
 *                     type: string
 *                   rate:
 *                     type: number
 *                   price_per_unit:
 *                     type: number
 *                   currency:
 *                     type: string
 *                     example: BYN
 *                   isActive:
 *                     type: boolean
 *                   is_active:
 *                     type: boolean
 */
router.get('/services', asyncHandler(async (_req, res) => {
  const services = await ServiceManagementService.listServices()
  res.json(services.map(toServiceResponse))
}))

async function ensureMarkupDefaults(db: any): Promise<void> {
  // Таблица могла не примениться на Railway (мigrations не запускались) — самовосстановление.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS markup_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_name TEXT NOT NULL UNIQUE,
      setting_value REAL NOT NULL,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Если таблица уже существовала (старая схема) — нужные колонки могли отсутствовать.
  // Пример: markup_settings без description => SQLITE_ERROR: no column named description
  try {
    const cols = await db.all(`PRAGMA table_info(markup_settings)`) as Array<{ name?: string }>
    const has = (name: string) => Array.isArray(cols) && cols.some(c => c?.name === name)

    if (!has('description')) await db.exec(`ALTER TABLE markup_settings ADD COLUMN description TEXT`)
    if (!has('is_active')) await db.exec(`ALTER TABLE markup_settings ADD COLUMN is_active INTEGER DEFAULT 1`)
    if (!has('created_at')) await db.exec(`ALTER TABLE markup_settings ADD COLUMN created_at TEXT DEFAULT CURRENT_TIMESTAMP`)
    if (!has('updated_at')) await db.exec(`ALTER TABLE markup_settings ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP`)
  } catch {
    // no-op
  }

  const seeds: Array<{ name: string; value: number; description: string }> = [
    { name: 'base_markup', value: 2.2, description: 'Базовый множитель наценки (умножается на себестоимость)' },
    { name: 'rush_multiplier', value: 1.5, description: 'Множитель срочности' },
    { name: 'complexity_multiplier', value: 1.0, description: 'Множитель сложности' },
    { name: 'operation_price_multiplier', value: 1.0, description: 'Общий множитель стоимости операций' },
  ]

  for (const s of seeds) {
    await db.run(
      `INSERT OR IGNORE INTO markup_settings (setting_name, setting_value, description, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))`,
      [s.name, s.value, s.description]
    )
    await db.run(
      `UPDATE markup_settings
       SET is_active = 1,
           description = COALESCE(description, ?),
           updated_at = datetime('now')
       WHERE setting_name = ? AND (is_active IS NULL OR is_active = 0)`,
      [s.description, s.name]
    )
  }
}

// POST /api/pricing/markup-settings/ensure-defaults — принудительно создать/активировать дефолтные наценки
router.post('/markup-settings/ensure-defaults', asyncHandler(async (_req, res) => {
  const db = await getDb()
  await ensureMarkupDefaults(db)
  const markupSettings = await db.all<any>(`
    SELECT
      ms.id,
      ms.setting_name,
      ms.setting_value,
      ms.description,
      ms.is_active,
      ms.created_at,
      ms.updated_at
    FROM markup_settings ms
    WHERE ms.is_active = 1
    ORDER BY ms.setting_name
  `)
  res.json(markupSettings)
}))

// GET /api/pricing/markup-settings - настройки наценки
router.get('/markup-settings', asyncHandler(async (req, res) => {
  try {
    const db = await getDb()
    let markupSettings = await db.all<any>(`
      SELECT
        ms.id,
        ms.setting_name,
        ms.setting_value,
        ms.description,
        ms.is_active,
        ms.created_at,
        ms.updated_at
      FROM markup_settings ms
      WHERE ms.is_active = 1
      ORDER BY ms.setting_name
    `)
    if (!markupSettings || markupSettings.length === 0) {
      await ensureMarkupDefaults(db)
      markupSettings = await db.all<any>(`
        SELECT
          ms.id,
          ms.setting_name,
          ms.setting_value,
          ms.description,
          ms.is_active,
          ms.created_at,
          ms.updated_at
        FROM markup_settings ms
        WHERE ms.is_active = 1
        ORDER BY ms.setting_name
      `)
    }
    res.json(markupSettings)
  } catch (error) {
    console.log('Markup settings table not found, returning empty array')
    res.json([])
  }
}))

// GET /api/pricing/quantity-discounts - скидки за количество
router.get('/quantity-discounts', asyncHandler(async (req, res) => {
  try {
    const db = await getDb()
    const quantityDiscounts = await db.all<any>(`
      SELECT
        qd.id,
        qd.min_quantity,
        qd.max_quantity,
        qd.discount_percent,
        '' as description,
        qd.is_active,
        qd.created_at,
        qd.updated_at
      FROM quantity_discounts qd
      WHERE qd.is_active = 1
      ORDER BY qd.min_quantity
    `)
    res.json(quantityDiscounts)
  } catch (error) {
    console.log('Quantity discounts table not found, returning empty array')
    res.json([])
  }
}))

// POST /api/pricing/print-prices - создать цену печати
router.post('/print-prices', asyncHandler(async (req, res) => {
  const {
    technology_code,
    counter_unit,
    price_bw_single,
    price_bw_duplex,
    price_color_single,
    price_color_duplex,
    price_bw_per_meter,
    price_color_per_meter
  } = req.body

  try {
    const db = await getDb()
    const result = await db.run(`
      INSERT INTO print_prices (
        technology_code,
        counter_unit,
        price_bw_single,
        price_bw_duplex,
        price_color_single,
        price_color_duplex,
        price_bw_per_meter,
        price_color_per_meter,
        is_active,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `, [
      technology_code,
      counter_unit || 'sheets',
      price_bw_single || 0,
      price_bw_duplex || 0,
      price_color_single || 0,
      price_color_duplex || 0,
      price_bw_per_meter || null,
      price_color_per_meter || null
    ])

    res.json({
      id: result.lastID,
      technology_code,
      counter_unit: counter_unit || 'sheets',
      price_bw_single: price_bw_single || 0,
      price_bw_duplex: price_bw_duplex || 0,
      price_color_single: price_color_single || 0,
      price_color_duplex: price_color_duplex || 0,
      price_bw_per_meter: price_bw_per_meter || null,
      price_color_per_meter: price_color_per_meter || null,
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  } catch (error) {
    // Если таблицы не существуют, возвращаем mock-данные
    console.log('Print prices table not found, returning mock data')
    res.json({
      id: Date.now(),
      technology_code: technology_code || 'unknown',
      counter_unit: counter_unit || 'sheets',
      price_bw_single: price_bw_single || 0,
      price_bw_duplex: price_bw_duplex || 0,
      price_color_single: price_color_single || 0,
      price_color_duplex: price_color_duplex || 0,
      price_bw_per_meter: price_bw_per_meter || null,
      price_color_per_meter: price_color_per_meter || null,
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  }
}))

// POST /api/pricing/service-prices - создать цену услуги
router.post('/service-prices', asyncHandler(async (req, res) => {
  const { name, description, price_per_unit, unit, operation_type, price_unit, setup_cost, min_quantity } = req.body

  try {
    const db = await getDb()
    const result = await db.run(`
      INSERT INTO post_processing_services (name, description, price, unit, operation_type, price_unit, setup_cost, min_quantity, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `, [name, description || '', price_per_unit, unit || 'per_item', operation_type || 'general', price_unit || 'per_item', setup_cost || 0, min_quantity || 1])

    res.json({
      id: result.lastID,
      name,
      description: description || '',
      price_per_unit,
      unit: unit || 'per_item',
      operation_type: operation_type || 'general',
      price_unit: price_unit || 'per_item',
      setup_cost: setup_cost || 0,
      min_quantity: min_quantity || 1,
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  } catch (error) {
    console.log('Service prices table not found, returning mock data')
    res.json({
      id: Date.now(),
      name: name || 'Новая услуга',
      description: description || '',
      price_per_unit: price_per_unit || 0,
      unit: unit || 'per_item',
      operation_type: operation_type || 'general',
      price_unit: price_unit || 'per_item',
      setup_cost: setup_cost || 0,
      min_quantity: min_quantity || 1,
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  }
}))

router.post('/services', asyncHandler(async (req, res) => {
  const { name, service_type, type, unit, price_unit, priceUnit, rate, currency, is_active, isActive } = req.body
  const created = await ServiceManagementService.createService({
    name,
    type: (service_type ?? type) || 'generic',
    unit,
    priceUnit: price_unit ?? priceUnit,
    rate: Number(rate ?? 0),
    currency,
    isActive: is_active !== undefined ? !!is_active : isActive,
  })
  res.status(201).json(toServiceResponse(created))
}))

router.put('/services/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name, service_type, type, unit, price_unit, priceUnit, rate, is_active, isActive } = req.body
  const updated = await ServiceManagementService.updateService(Number(id), {
    name,
    type: service_type ?? type,
    unit,
    priceUnit: price_unit ?? priceUnit,
    rate: rate !== undefined ? Number(rate) : undefined,
    isActive: is_active !== undefined ? !!is_active : isActive,
  })

  if (!updated) {
    res.status(404).json({ success: false })
    return
  }

  res.json(toServiceResponse(updated))
}))

router.delete('/services/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  await ServiceManagementService.deleteService(Number(id))
  res.json({ success: true })
}))

// --- Service volume tiers ---
router.get('/services/:serviceId/tiers', asyncHandler(async (req, res) => {
  const { serviceId } = req.params
  const tiers = await ServiceManagementService.listServiceTiers(Number(serviceId))
  res.json(tiers.map(toTierResponse))
}))

router.post('/services/:serviceId/tiers', asyncHandler(async (req, res) => {
  const { serviceId } = req.params
  const { min_quantity, minQuantity, price_per_unit, rate, is_active, isActive } = req.body
  const tier = await ServiceManagementService.createServiceTier(Number(serviceId), {
    minQuantity: Number(min_quantity ?? minQuantity ?? 0),
    rate: Number(price_per_unit ?? rate ?? 0),
    isActive: is_active !== undefined ? !!is_active : isActive,
  })
  res.status(201).json(toTierResponse(tier))
}))

router.put('/services/:serviceId/tiers/:tierId', asyncHandler(async (req, res) => {
  const { tierId } = req.params
  const { min_quantity, minQuantity, price_per_unit, rate, is_active, isActive } = req.body
  const updated = await ServiceManagementService.updateServiceTier(Number(tierId), {
    minQuantity: min_quantity ?? minQuantity,
    rate: rate ?? price_per_unit,
    isActive: is_active !== undefined ? !!is_active : isActive,
  })

  if (!updated) {
    res.status(404).json({ success: false })
    return
  }

  res.json(toTierResponse(updated))
}))

router.delete('/services/:serviceId/tiers/:tierId', asyncHandler(async (req, res) => {
  const { tierId } = req.params
  await ServiceManagementService.deleteServiceTier(Number(tierId))
  res.json({ success: true })
}))

// --- Service variants ---
const toVariantResponse = (variant: any) => ({
  id: variant.id,
  serviceId: variant.serviceId,
  service_id: variant.serviceId,
  variantName: variant.variantName,
  variant_name: variant.variantName,
  parameters: variant.parameters,
  sortOrder: variant.sortOrder,
  sort_order: variant.sortOrder,
  isActive: variant.isActive,
  is_active: variant.isActive,
  createdAt: variant.createdAt,
  created_at: variant.createdAt,
  updatedAt: variant.updatedAt,
  updated_at: variant.updatedAt,
})

router.get('/services/:serviceId/variants', asyncHandler(async (req, res) => {
  const { serviceId } = req.params
  const variants = await ServiceManagementService.listServiceVariants(Number(serviceId))
  res.json(variants.map(toVariantResponse))
}))

router.post('/services/:serviceId/variants', asyncHandler(async (req, res) => {
  const { serviceId } = req.params
  const { variant_name, variantName, parameters, sort_order, sortOrder, is_active, isActive } = req.body
  const variant = await ServiceManagementService.createServiceVariant(Number(serviceId), {
    variantName: variant_name ?? variantName ?? '',
    parameters: parameters ?? {},
    sortOrder: sort_order ?? sortOrder ?? 0,
    isActive: is_active !== undefined ? !!is_active : isActive,
  })
  res.status(201).json(toVariantResponse(variant))
}))

router.put('/services/:serviceId/variants/:variantId', asyncHandler(async (req, res) => {
  const { variantId } = req.params
  // 🆕 Нормализуем variantId - извлекаем только числовую часть (на случай, если пришла строка типа "154:1")
  const normalizedVariantId = typeof variantId === 'string' 
    ? parseInt(variantId.split(':')[0], 10) 
    : Number(variantId);
  
  if (isNaN(normalizedVariantId)) {
    res.status(400).json({ success: false, error: `Invalid variantId: ${variantId}` });
    return;
  }
  
  const { variant_name, variantName, parameters, sort_order, sortOrder, is_active, isActive } = req.body
  const updated = await ServiceManagementService.updateServiceVariant(normalizedVariantId, {
    variantName: variant_name ?? variantName,
    parameters,
    sortOrder: sort_order ?? sortOrder,
    isActive: is_active !== undefined ? !!is_active : isActive,
  })

  if (!updated) {
    res.status(404).json({ success: false, error: `Variant with id ${normalizedVariantId} not found` })
    return
  }

  res.json(toVariantResponse(updated))
}))

router.delete('/services/:serviceId/variants/:variantId', asyncHandler(async (req, res) => {
  const { variantId } = req.params
  // 🆕 Нормализуем variantId
  const normalizedVariantId = typeof variantId === 'string' 
    ? parseInt(variantId.split(':')[0], 10) 
    : Number(variantId);
  
  if (isNaN(normalizedVariantId)) {
    res.status(400).json({ success: false, error: `Invalid variantId: ${variantId}` });
    return;
  }
  
  await ServiceManagementService.deleteServiceVariant(normalizedVariantId)
  res.json({ success: true })
}))

// Tiers для вариантов
router.get('/services/:serviceId/variants/:variantId/tiers', asyncHandler(async (req, res) => {
  const { serviceId } = req.params
  const serviceIdNum = Number(serviceId)
  
  if (isNaN(serviceIdNum)) {
    res.status(400).json({ error: `Invalid serviceId: serviceId=${serviceId}` })
    return
  }
  
  // 🆕 Tiers теперь общие для всех вариантов одной услуги
  // variantId игнорируется, всегда возвращаем общие tiers (variant_id IS NULL)
  const tiers = await ServiceManagementService.listServiceTiers(serviceIdNum)
  res.json(tiers.map(toTierResponse))
}))

router.post('/services/:serviceId/variants/:variantId/tiers', asyncHandler(async (req, res) => {
  const { serviceId } = req.params
  const { min_quantity, minQuantity, price_per_unit, rate, is_active, isActive } = req.body
  
  const serviceIdNum = Number(serviceId)
  
  if (isNaN(serviceIdNum)) {
    res.status(400).json({ error: `Invalid serviceId: serviceId=${serviceId}` })
    return
  }
  
  // 🆕 Tiers теперь общие для всех вариантов одной услуги
  // variantId игнорируется, tiers создаются с variant_id = NULL
  const tier = await ServiceManagementService.createServiceTier(serviceIdNum, {
    minQuantity: Number(min_quantity ?? minQuantity ?? 0),
    rate: Number(price_per_unit ?? rate ?? 0),
    isActive: is_active !== undefined ? !!is_active : isActive,
    // variantId больше не используется
  })
  res.status(201).json(toTierResponse(tier))
}))

// PUT и DELETE для tiers вариантов
router.put('/services/:serviceId/variants/:variantId/tiers/:tierId', asyncHandler(async (req, res) => {
  const { tierId } = req.params
  const { min_quantity, minQuantity, price_per_unit, rate, is_active, isActive } = req.body
  
  const updated = await ServiceManagementService.updateServiceTier(Number(tierId), {
    minQuantity: min_quantity ?? minQuantity,
    rate: rate ?? price_per_unit,
    isActive: is_active !== undefined ? !!is_active : isActive,
  })

  if (!updated) {
    res.status(404).json({ error: 'Tier not found' })
    return
  }

  res.json(toTierResponse(updated))
}))

router.delete('/services/:serviceId/variants/:variantId/tiers/:tierId', asyncHandler(async (req, res) => {
  const { tierId } = req.params
  await ServiceManagementService.deleteServiceTier(Number(tierId))
  res.json({ success: true })
}))

// Batch endpoint: получить все tiers для всех вариантов услуги одним запросом
router.get('/services/:serviceId/variants/tiers', asyncHandler(async (req, res) => {
  const { serviceId } = req.params
  const serviceIdNum = Number(serviceId)
  
  if (isNaN(serviceIdNum)) {
    res.status(400).json({ error: 'Invalid serviceId' })
    return
  }
  
  const tiersMap = await ServiceManagementService.listAllVariantTiers(serviceIdNum)
  
  // Преобразуем Map в объект для JSON
  const result: Record<string, any[]> = {}
  tiersMap.forEach((tiers, variantId) => {
    result[variantId.toString()] = tiers.map(toTierResponse)
  })
  
  res.json(result)
}))

// ========== Новые endpoints для оптимизированной структуры диапазонов ==========

// POST /api/pricing/services/:serviceId/ranges - добавить границу диапазона
router.post('/services/:serviceId/ranges', asyncHandler(async (req, res) => {
  const { serviceId } = req.params
  const { minQuantity } = req.body
  const serviceIdNum = Number(serviceId)
  
  if (isNaN(serviceIdNum)) {
    res.status(400).json({ error: 'Invalid serviceId' })
    return
  }
  
  if (typeof minQuantity !== 'number' || minQuantity < 1) {
    res.status(400).json({ error: 'Invalid minQuantity. Must be a positive number' })
    return
  }
  
  try {
    const rangeId = await PricingServiceRepository.addRangeBoundary(serviceIdNum, minQuantity)
    res.json({ id: rangeId, serviceId: serviceIdNum, minQuantity, message: 'Range boundary added successfully' })
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ error: error.message })
    } else {
      res.status(500).json({ error: 'Failed to add range boundary' })
    }
  }
}))

// DELETE /api/pricing/services/:serviceId/ranges/:minQuantity - удалить границу диапазона
router.delete('/services/:serviceId/ranges/:minQuantity', asyncHandler(async (req, res) => {
  const { serviceId, minQuantity } = req.params
  const serviceIdNum = Number(serviceId)
  const minQuantityNum = Number(minQuantity)
  
  if (isNaN(serviceIdNum) || isNaN(minQuantityNum)) {
    res.status(400).json({ error: 'Invalid serviceId or minQuantity' })
    return
  }
  
  try {
    await PricingServiceRepository.removeRangeBoundary(serviceIdNum, minQuantityNum)
    res.json({ message: 'Range boundary removed successfully' })
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ error: error.message })
    } else {
      res.status(500).json({ error: 'Failed to remove range boundary' })
    }
  }
}))

// PUT /api/pricing/services/:serviceId/ranges/:minQuantity - обновить границу диапазона
router.put('/services/:serviceId/ranges/:minQuantity', asyncHandler(async (req, res) => {
  const { serviceId, minQuantity } = req.params
  const { newMinQuantity } = req.body
  const serviceIdNum = Number(serviceId)
  const minQuantityNum = Number(minQuantity)
  const newMinQuantityNum = Number(newMinQuantity)
  
  if (isNaN(serviceIdNum) || isNaN(minQuantityNum) || isNaN(newMinQuantityNum)) {
    res.status(400).json({ error: 'Invalid serviceId, minQuantity or newMinQuantity' })
    return
  }
  
  if (newMinQuantityNum < 1) {
    res.status(400).json({ error: 'Invalid newMinQuantity. Must be a positive number' })
    return
  }
  
  try {
    await PricingServiceRepository.updateRangeBoundary(serviceIdNum, minQuantityNum, newMinQuantityNum)
    res.json({ message: 'Range boundary updated successfully' })
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ error: error.message })
    } else {
      res.status(500).json({ error: 'Failed to update range boundary' })
    }
  }
}))

// PUT /api/pricing/services/:serviceId/variants/:variantId/prices/:minQuantity - обновить цену варианта
router.put('/services/:serviceId/variants/:variantId/prices/:minQuantity', asyncHandler(async (req, res) => {
  const { serviceId, variantId, minQuantity } = req.params
  const { price } = req.body
  const serviceIdNum = Number(serviceId)
  // 🆕 Нормализуем variantId
  const normalizedVariantId = typeof variantId === 'string' 
    ? parseInt(variantId.split(':')[0], 10) 
    : Number(variantId);
  const minQuantityNum = Number(minQuantity)
  const priceNum = Number(price)
  
  if (isNaN(serviceIdNum) || isNaN(normalizedVariantId) || isNaN(minQuantityNum) || isNaN(priceNum)) {
    res.status(400).json({ error: `Invalid serviceId, variantId, minQuantity or price: serviceId=${serviceId}, variantId=${variantId}` })
    return
  }
  
  try {
    await PricingServiceRepository.updateVariantPrice(normalizedVariantId, minQuantityNum, priceNum)
    res.json({ message: 'Variant price updated successfully' })
  } catch (error: any) {
    if (error.status) {
      res.status(error.status).json({ error: error.message })
    } else {
      res.status(500).json({ error: 'Failed to update variant price' })
    }
  }
}))

// POST /api/pricing/markup-settings - создать настройку наценки
router.post('/markup-settings', asyncHandler(async (req, res) => {
  const { setting_name, setting_value, description } = req.body

  try {
    const db = await getDb()
    const result = await db.run(`
      INSERT INTO markup_settings (setting_name, setting_value, description, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
    `, [setting_name, setting_value, description || ''])

    res.json({
      id: result.lastID,
      setting_name,
      setting_value,
      description: description || '',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  } catch (error) {
    console.log('Markup settings table not found, returning mock data')
    res.json({
      id: Date.now(),
      setting_name: setting_name || 'new_setting',
      setting_value: setting_value || 0,
      description: description || '',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  }
}))

// POST /api/pricing/quantity-discounts - создать скидку за количество
router.post('/quantity-discounts', asyncHandler(async (req, res) => {
  const { min_quantity, max_quantity, discount_percent } = req.body

  try {
    const db = await getDb()
    const result = await db.run(`
      INSERT INTO quantity_discounts (min_quantity, max_quantity, discount_percent, is_active, created_at, updated_at)
      VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
    `, [min_quantity, max_quantity || null, discount_percent])

    res.json({
      id: result.lastID,
      min_quantity,
      max_quantity: max_quantity || null,
      discount_percent,
      description: '',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  } catch (error) {
    console.log('Quantity discounts table not found, returning mock data')
    res.json({
      id: Date.now(),
      min_quantity: min_quantity || 1,
      max_quantity: max_quantity || null,
      discount_percent: discount_percent || 0,
      description: '',
      is_active: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
  }
}))

// PUT /api/pricing/print-prices/:id - обновить цену печати
router.put('/print-prices/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  const {
    technology_code,
    counter_unit,
    price_bw_single,
    price_bw_duplex,
    price_color_single,
    price_color_duplex,
    price_bw_per_meter,
    price_color_per_meter,
    is_active
  } = req.body

  try {
    const db = await getDb()
    await db.run(`
      UPDATE print_prices SET
        technology_code = ?,
        counter_unit = ?,
        price_bw_single = ?,
        price_bw_duplex = ?,
        price_color_single = ?,
        price_color_duplex = ?,
        price_bw_per_meter = ?,
        price_color_per_meter = ?,
        is_active = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [
      technology_code,
      counter_unit || 'sheets',
      price_bw_single || 0,
      price_bw_duplex || 0,
      price_color_single || 0,
      price_color_duplex || 0,
      price_bw_per_meter || null,
      price_color_per_meter || null,
      is_active !== undefined ? is_active : 1,
      id
    ])

    res.json({
      id: parseInt(id),
      technology_code,
      counter_unit: counter_unit || 'sheets',
      price_bw_single: price_bw_single || 0,
      price_bw_duplex: price_bw_duplex || 0,
      price_color_single: price_color_single || 0,
      price_color_duplex: price_color_duplex || 0,
      price_bw_per_meter: price_bw_per_meter || null,
      price_color_per_meter: price_color_per_meter || null,
      is_active: is_active !== undefined ? is_active : 1,
      updated_at: new Date().toISOString()
    })
  } catch (error) {
    console.log('Print prices table update failed, returning mock data')
    res.json({
      id: parseInt(id),
      technology_code: technology_code || 'unknown',
      counter_unit: counter_unit || 'sheets',
      price_bw_single: price_bw_single || 0,
      price_bw_duplex: price_bw_duplex || 0,
      price_color_single: price_color_single || 0,
      price_color_duplex: price_color_duplex || 0,
      price_bw_per_meter: price_bw_per_meter || null,
      price_color_per_meter: price_color_per_meter || null,
      is_active: is_active !== undefined ? is_active : 1,
      updated_at: new Date().toISOString()
    })
  }
}))

// DELETE /api/pricing/print-prices/:id - удалить цену печати
router.delete('/print-prices/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  try {
    const db = await getDb()
    await db.run('UPDATE print_prices SET is_active = 0, updated_at = datetime(\'now\') WHERE id = ?', [id])
    res.json({ success: true, deleted: parseInt(id) })
  } catch (error) {
    console.log('Print prices table delete failed, returning mock success')
    res.json({ success: true, deleted: parseInt(id) })
  }
}))

// PUT /api/pricing/service-prices/:id - обновить цену услуги
router.put('/service-prices/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { name, description, price_per_unit, unit, operation_type, price_unit, setup_cost, min_quantity, is_active } = req.body

  try {
    const db = await getDb()
    await db.run(`
      UPDATE post_processing_services SET
        name = ?,
        description = ?,
        price = ?,
        unit = ?,
        operation_type = ?,
        price_unit = ?,
        setup_cost = ?,
        min_quantity = ?,
        is_active = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [
      name,
      description || '',
      price_per_unit,
      unit || 'per_item',
      operation_type || 'general',
      price_unit || 'per_item',
      setup_cost || 0,
      min_quantity || 1,
      is_active !== undefined ? is_active : 1,
      id
    ])

    res.json({
      id: parseInt(id),
      name: name || 'Обновленная услуга',
      description: description || '',
      price_per_unit,
      unit: unit || 'per_item',
      operation_type: operation_type || 'general',
      price_unit: price_unit || 'per_item',
      setup_cost: setup_cost || 0,
      min_quantity: min_quantity || 1,
      is_active: is_active !== undefined ? is_active : 1,
      updated_at: new Date().toISOString()
    })
  } catch (error) {
    console.log('Service prices table update failed, returning mock data')
    res.json({
      id: parseInt(id),
      name: name || 'Обновленная услуга',
      description: description || '',
      price_per_unit,
      unit: unit || 'per_item',
      operation_type: operation_type || 'general',
      price_unit: price_unit || 'per_item',
      setup_cost: setup_cost || 0,
      min_quantity: min_quantity || 1,
      is_active: is_active !== undefined ? is_active : 1,
      updated_at: new Date().toISOString()
    })
  }
}))

// DELETE /api/pricing/service-prices/:id - удалить цену услуги
router.delete('/service-prices/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  // Пока таблицы не созданы, просто возвращаем успешный ответ
  res.json({ success: true, deleted: parseInt(id) })
}))

// PUT /api/pricing/markup-settings/:id - обновить настройку наценки
router.put('/markup-settings/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { setting_name, setting_value, description, is_active } = req.body

  try {
    const db = await getDb()
    await db.run(`
      UPDATE markup_settings SET
        setting_name = ?,
        setting_value = ?,
        description = ?,
        is_active = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [
      setting_name,
      setting_value,
      description || '',
      is_active !== undefined ? is_active : 1,
      id
    ])

    res.json({
      id: parseInt(id),
      setting_name,
      setting_value,
      description: description || '',
      is_active: is_active !== undefined ? is_active : 1,
      updated_at: new Date().toISOString()
    })
  } catch (error) {
    console.log('Markup settings update failed, returning mock data')
    res.json({
      id: parseInt(id),
      setting_name: setting_name || 'updated_setting',
      setting_value: setting_value || 0,
      description: description || '',
      is_active: is_active !== undefined ? is_active : 1,
      updated_at: new Date().toISOString()
    })
  }
}))

// DELETE /api/pricing/markup-settings/:id - удалить настройку наценки
router.delete('/markup-settings/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  // Пока таблицы не созданы, просто возвращаем успешный ответ
  res.json({ success: true, deleted: parseInt(id) })
}))

// PUT /api/pricing/quantity-discounts/:id - обновить скидку за количество
router.put('/quantity-discounts/:id', asyncHandler(async (req, res) => {
  const { id } = req.params
  const { min_quantity, max_quantity, discount_percent, is_active } = req.body

  try {
    const db = await getDb()
    await db.run(`
      UPDATE quantity_discounts SET
        min_quantity = ?,
        max_quantity = ?,
        discount_percent = ?,
        is_active = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [
      min_quantity,
      max_quantity || null,
      discount_percent,
      is_active !== undefined ? is_active : 1,
      id
    ])

    res.json({
      id: parseInt(id),
      min_quantity,
      max_quantity: max_quantity || null,
      discount_percent,
      description: '',
      is_active: is_active !== undefined ? is_active : 1,
      updated_at: new Date().toISOString()
    })
  } catch (error) {
    console.log('Quantity discounts update failed, returning mock data')
    res.json({
      id: parseInt(id),
      min_quantity: min_quantity || 1,
      max_quantity: max_quantity || null,
      discount_percent: discount_percent || 0,
      description: '',
      is_active: is_active !== undefined ? is_active : 1,
      updated_at: new Date().toISOString()
    })
  }
}))

// DELETE /api/pricing/quantity-discounts/:id - удалить скидку за количество
router.delete('/quantity-discounts/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  // Пока таблицы не созданы, просто возвращаем успешный ответ
  res.json({ success: true, deleted: parseInt(id) })
}))

// GET /api/pricing/operations - список норм операций
router.get('/operations', asyncHandler(async (req, res) => {
  try {
    const db = await getDb()
    const operations = await db.all<any>(`
      SELECT
        on.id,
        on.product_type,
        on.operation,
        on.service_id,
        pps.name as service_name,
        pps.unit,
        pps.price as price_per_unit,
        pps.operation_type,
        pps.price_unit,
        on.formula,
        on.is_active,
        on.created_at,
        on.updated_at
      FROM operation_norms on
      LEFT JOIN post_processing_services pps ON on.service_id = pps.id
      WHERE on.is_active = 1
      ORDER BY on.product_type, on.operation
    `)
    res.json(operations)
  } catch (error) {
    // Если таблицы не существуют, возвращаем пустой массив
    console.log('Operation norms table not found, returning empty array')
    res.json([])
  }
}))

// POST /api/pricing/calculate - расчет цены продукта
router.post('/calculate', asyncHandler(async (req, res) => {
  // Перенаправляем на существующий calculateProductPrice из модуля pricing
  const { PricingController } = await import('../modules/pricing/controllers/pricingController')
  await PricingController.calculateProductPrice(req, res)
}))

export default router