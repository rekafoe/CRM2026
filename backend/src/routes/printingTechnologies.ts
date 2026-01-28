import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { getDb } from '../config/database'
import { hasColumn } from '../utils/tableSchemaCache'
import { AuthenticatedRequest } from '../middleware'

const router = Router()

const validatePricingMode = (mode: string) => ['per_sheet', 'per_meter'].includes(mode)

async function tableExists(tableName: string) {
  const db = await getDb()
  const row = await db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    tableName
  )
  return !!row
}

// GET /api/printing-technologies — список с ценами
router.get('/', asyncHandler(async (_req, res) => {
  const hasTechnologies = await tableExists('print_technologies')
  if (!hasTechnologies) {
    // Миграция ещё не применена — отдаём пусто, чтобы UI не падал
    res.json([])
    return
  }
  const db = await getDb()
  const rows = await db.all<any>(
    `SELECT t.code, t.name, t.pricing_mode, t.supports_duplex, t.is_active,
            p.id as price_id, p.price_single, p.price_duplex, p.price_per_meter, p.is_active as price_is_active
       FROM print_technologies t
  LEFT JOIN print_technology_prices p ON p.technology_code = t.code
   ORDER BY t.name`
  )
  res.json(rows)
}))

// POST /api/printing-technologies — создать тип печати
router.post('/', asyncHandler(async (req, res) => {
  const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  if (!user || user.role !== 'admin') { res.status(403).json({ message: 'Forbidden' }); return }

  const hasTechnologies = await tableExists('print_technologies')
  if (!hasTechnologies) {
    res.status(400).json({ message: 'Таблица print_technologies не найдена. Примените миграции.' })
    return
  }

  const { code, name, pricing_mode, supports_duplex = 0, is_active = 1 } = req.body as {
    code: string
    name: string
    pricing_mode: string
    supports_duplex?: number | boolean
    is_active?: number | boolean
  }

  if (!code || !name || !validatePricingMode(pricing_mode)) {
    res.status(400).json({ message: 'code, name и pricing_mode обязательны' })
    return
  }

  const db = await getDb()
  await db.run(
    `INSERT INTO print_technologies (code, name, pricing_mode, supports_duplex, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
    code,
    name,
    pricing_mode,
    supports_duplex ? 1 : 0,
    is_active ? 1 : 0
  )
  await db.run(
    `INSERT OR IGNORE INTO print_technology_prices (technology_code, price_single, price_duplex, price_per_meter, is_active)
     VALUES (?, NULL, NULL, NULL, 1)`,
    code
  )

  const row = await db.get<any>(
    `SELECT t.code, t.name, t.pricing_mode, t.supports_duplex, t.is_active,
            p.id as price_id, p.price_single, p.price_duplex, p.price_per_meter, p.is_active as price_is_active
       FROM print_technologies t
  LEFT JOIN print_technology_prices p ON p.technology_code = t.code
      WHERE t.code = ?`,
    code
  )
  res.status(201).json(row)
}))

// PUT /api/printing-technologies/:code — обновить базовые поля
router.put('/:code', asyncHandler(async (req, res) => {
  const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  if (!user || user.role !== 'admin') { res.status(403).json({ message: 'Forbidden' }); return }

  const hasTechnologies = await tableExists('print_technologies')
  if (!hasTechnologies) {
    res.status(400).json({ message: 'Таблица print_technologies не найдена. Примените миграции.' })
    return
  }

  const code = String(req.params.code)
  const { name, pricing_mode, supports_duplex, is_active } = req.body as {
    name?: string
    pricing_mode?: string
    supports_duplex?: number | boolean
    is_active?: number | boolean
  }

  if (pricing_mode && !validatePricingMode(pricing_mode)) {
    res.status(400).json({ message: 'pricing_mode должен быть per_sheet или per_meter' })
    return
  }

  const db = await getDb()
  const existing = await db.get<any>('SELECT code FROM print_technologies WHERE code = ?', code)
  if (!existing) { res.status(404).json({ message: 'Print technology not found' }); return }

  await db.run(
    `UPDATE print_technologies
        SET name = COALESCE(?, name),
            pricing_mode = COALESCE(?, pricing_mode),
            supports_duplex = COALESCE(?, supports_duplex),
            is_active = COALESCE(?, is_active),
            updated_at = datetime('now')
      WHERE code = ?`,
    name ?? null,
    pricing_mode ?? null,
    supports_duplex === undefined ? null : (supports_duplex ? 1 : 0),
    is_active === undefined ? null : (is_active ? 1 : 0),
    code
  )

  const row = await db.get<any>(
    `SELECT t.code, t.name, t.pricing_mode, t.supports_duplex, t.is_active,
            p.id as price_id, p.price_single, p.price_duplex, p.price_per_meter, p.is_active as price_is_active
       FROM print_technologies t
  LEFT JOIN print_technology_prices p ON p.technology_code = t.code
      WHERE t.code = ?`,
    code
  )
  res.json(row)
}))

// PUT /api/printing-technologies/:code/prices — upsert цен
router.put('/:code/prices', asyncHandler(async (req, res) => {
  const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  if (!user || user.role !== 'admin') { res.status(403).json({ message: 'Forbidden' }); return }

  const hasTechnologies = await tableExists('print_technologies')
  if (!hasTechnologies) {
    res.status(400).json({ message: 'Таблица print_technologies не найдена. Примените миграции.' })
    return
  }

  const code = String(req.params.code)
  const { price_single, price_duplex, price_per_meter, is_active } = req.body as {
    price_single?: number | null
    price_duplex?: number | null
    price_per_meter?: number | null
    is_active?: number | boolean
  }

  const db = await getDb()
  const tech = await db.get<any>('SELECT code FROM print_technologies WHERE code = ?', code)
  if (!tech) { res.status(404).json({ message: 'Print technology not found' }); return }

  const existing = await db.get<any>('SELECT id FROM print_technology_prices WHERE technology_code = ?', code)
  if (existing) {
    await db.run(
      `UPDATE print_technology_prices
          SET price_single = COALESCE(?, price_single),
              price_duplex = COALESCE(?, price_duplex),
              price_per_meter = COALESCE(?, price_per_meter),
              is_active = COALESCE(?, is_active),
              updated_at = datetime('now')
        WHERE technology_code = ?`,
      price_single ?? null,
      price_duplex ?? null,
      price_per_meter ?? null,
      is_active === undefined ? null : (is_active ? 1 : 0),
      code
    )
  } else {
    await db.run(
      `INSERT INTO print_technology_prices
        (technology_code, price_single, price_duplex, price_per_meter, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      code,
      price_single ?? null,
      price_duplex ?? null,
      price_per_meter ?? null,
      is_active === undefined ? 1 : (is_active ? 1 : 0)
    )
  }

  const row = await db.get<any>(
    `SELECT t.code, t.name, t.pricing_mode, t.supports_duplex, t.is_active,
            p.id as price_id, p.price_single, p.price_duplex, p.price_per_meter, p.is_active as price_is_active
       FROM print_technologies t
  LEFT JOIN print_technology_prices p ON p.technology_code = t.code
      WHERE t.code = ?`,
    code
  )
  res.json(row)
}))

// DELETE /api/printing-technologies/:code — удалить тип печати
router.delete('/:code', asyncHandler(async (req, res) => {
  const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  if (!user || user.role !== 'admin') { res.status(403).json({ message: 'Forbidden' }); return }

  const code = String(req.params.code)

  const hasTechnologies = await tableExists('print_technologies')
  if (!hasTechnologies) {
    res.status(400).json({ message: 'Таблица print_technologies не найдена. Примените миграции.' })
    return
  }

  const db = await getDb()
  const existing = await db.get<any>('SELECT code FROM print_technologies WHERE code = ?', code)
  if (!existing) { res.status(404).json({ message: 'Print technology not found' }); return }

  try {
    if (await hasColumn('printers', 'technology_code')) {
      await db.run(`UPDATE printers SET technology_code = NULL WHERE technology_code = ?`, code)
    }
  } catch {}

  await db.run(`DELETE FROM print_technologies WHERE code = ?`, code)
  res.status(204).end()
}))

export default router

