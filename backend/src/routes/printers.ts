import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { getDb } from '../config/database'
import { AuthenticatedRequest } from '../middleware'

const router = Router()

async function getTableColumns(tableName: string): Promise<Set<string>> {
  const db = await getDb()
  const rows = await db.all<Array<{ name: string }>>(`PRAGMA table_info(${tableName})`)
  return new Set(rows.map(r => r.name))
}

function buildPrintersSelect(cols: Set<string>) {
  const hasTechnologyCode = cols.has('technology_code')
  const hasCounterUnit = cols.has('counter_unit')
  const hasMaxWidth = cols.has('max_width_mm')
  const hasColorMode = cols.has('color_mode')
  const hasPrinterClass = cols.has('printer_class')
  const hasPriceSingle = cols.has('price_single')
  const hasPriceDuplex = cols.has('price_duplex')
  const hasPricePerMeter = cols.has('price_per_meter')
  const hasPriceBwSingle = cols.has('price_bw_single')
  const hasPriceBwDuplex = cols.has('price_bw_duplex')
  const hasPriceColorSingle = cols.has('price_color_single')
  const hasPriceColorDuplex = cols.has('price_color_duplex')
  const hasPriceBwPerMeter = cols.has('price_bw_per_meter')
  const hasPriceColorPerMeter = cols.has('price_color_per_meter')
  const hasIsActive = cols.has('is_active')

  return [
    'id',
    'code',
    'name',
    hasTechnologyCode ? 'technology_code' : 'NULL as technology_code',
    hasCounterUnit ? 'counter_unit' : "NULL as counter_unit",
    hasMaxWidth ? 'max_width_mm' : 'NULL as max_width_mm',
    hasColorMode ? 'color_mode' : "NULL as color_mode",
    hasPrinterClass ? 'printer_class' : "NULL as printer_class",
    hasPriceSingle ? 'price_single' : 'NULL as price_single',
    hasPriceDuplex ? 'price_duplex' : 'NULL as price_duplex',
    hasPricePerMeter ? 'price_per_meter' : 'NULL as price_per_meter',
    hasPriceBwSingle ? 'price_bw_single' : 'NULL as price_bw_single',
    hasPriceBwDuplex ? 'price_bw_duplex' : 'NULL as price_bw_duplex',
    hasPriceColorSingle ? 'price_color_single' : 'NULL as price_color_single',
    hasPriceColorDuplex ? 'price_color_duplex' : 'NULL as price_color_duplex',
    hasPriceBwPerMeter ? 'price_bw_per_meter' : 'NULL as price_bw_per_meter',
    hasPriceColorPerMeter ? 'price_color_per_meter' : 'NULL as price_color_per_meter',
    hasIsActive ? 'is_active' : '1 as is_active',
  ].join(', ')
}

// GET /api/printers — список принтеров (опционально фильтр по технологии)
router.get('/', asyncHandler(async (req, res) => {
  const technologyCode = (req.query as any)?.technology_code as string | undefined
  const db = await getDb()
  const cols = await getTableColumns('printers')
  const select = buildPrintersSelect(cols)
  const hasTechnologyCode = cols.has('technology_code')

  const where = hasTechnologyCode ? 'WHERE (? IS NULL OR technology_code = ?)' : ''
  const params = hasTechnologyCode ? [technologyCode || null, technologyCode || null] : []

  const rows = await db.all<any>(
    `
     SELECT ${select}
       FROM printers
       ${where}
      ORDER BY name
    `,
    ...(params as any)
  )
  res.json(rows)
}))

// POST /api/printers — добавить принтер
router.post('/', asyncHandler(async (req, res) => {
  const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  if (!user || user.role !== 'admin') { res.status(403).json({ message: 'Forbidden' }); return }

  const {
    code,
    name,
    technology_code,
    counter_unit = 'sheets',
    max_width_mm = null,
    color_mode = 'both',
    printer_class = 'office',
    price_single = null,
    price_duplex = null,
    price_per_meter = null,
    price_bw_single = null,
    price_bw_duplex = null,
    price_color_single = null,
    price_color_duplex = null,
    price_bw_per_meter = null,
    price_color_per_meter = null,
    is_active = 1
  } = req.body as {
    code: string
    name: string
    technology_code?: string | null
    counter_unit?: 'sheets' | 'meters'
    max_width_mm?: number | null
    color_mode?: 'bw' | 'color' | 'both'
    printer_class?: 'office' | 'pro'
    price_single?: number | null
    price_duplex?: number | null
    price_per_meter?: number | null
    price_bw_single?: number | null
    price_bw_duplex?: number | null
    price_color_single?: number | null
    price_color_duplex?: number | null
    price_bw_per_meter?: number | null
    price_color_per_meter?: number | null
    is_active?: number
  }

  if (!code || !name) {
    res.status(400).json({ message: 'code и name обязательны' })
    return
  }

  const db = await getDb()
  const cols = await getTableColumns('printers')
  const insertCols: string[] = ['code', 'name']
  const insertValues: any[] = [code, name]
  if (cols.has('technology_code')) { insertCols.push('technology_code'); insertValues.push(technology_code || null) }
  if (cols.has('counter_unit')) { insertCols.push('counter_unit'); insertValues.push(counter_unit || 'sheets') }
  if (cols.has('max_width_mm')) { insertCols.push('max_width_mm'); insertValues.push(max_width_mm ?? null) }
  if (cols.has('color_mode')) { insertCols.push('color_mode'); insertValues.push(color_mode || 'both') }
  if (cols.has('printer_class')) { insertCols.push('printer_class'); insertValues.push(printer_class || 'office') }
  if (cols.has('price_single')) { insertCols.push('price_single'); insertValues.push(price_single ?? null) }
  if (cols.has('price_duplex')) { insertCols.push('price_duplex'); insertValues.push(price_duplex ?? null) }
  if (cols.has('price_per_meter')) { insertCols.push('price_per_meter'); insertValues.push(price_per_meter ?? null) }
  if (cols.has('price_bw_single')) { insertCols.push('price_bw_single'); insertValues.push(price_bw_single ?? null) }
  if (cols.has('price_bw_duplex')) { insertCols.push('price_bw_duplex'); insertValues.push(price_bw_duplex ?? null) }
  if (cols.has('price_color_single')) { insertCols.push('price_color_single'); insertValues.push(price_color_single ?? null) }
  if (cols.has('price_color_duplex')) { insertCols.push('price_color_duplex'); insertValues.push(price_color_duplex ?? null) }
  if (cols.has('price_bw_per_meter')) { insertCols.push('price_bw_per_meter'); insertValues.push(price_bw_per_meter ?? null) }
  if (cols.has('price_color_per_meter')) { insertCols.push('price_color_per_meter'); insertValues.push(price_color_per_meter ?? null) }
  if (cols.has('is_active')) { insertCols.push('is_active'); insertValues.push(is_active ? 1 : 0) }

  await db.run(
    `INSERT INTO printers (${insertCols.join(', ')}) VALUES (${insertCols.map(() => '?').join(', ')})`,
    ...insertValues
  )

  const select = buildPrintersSelect(cols)
  const row = await db.get<any>(`SELECT ${select} FROM printers WHERE code = ?`, code)

  res.status(201).json(row)
}))

// PUT /api/printers/:id — обновить принтер
router.put('/:id', asyncHandler(async (req, res) => {
  const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  if (!user || user.role !== 'admin') { res.status(403).json({ message: 'Forbidden' }); return }

  const id = Number(req.params.id)
  const { code, name, technology_code, counter_unit, max_width_mm, color_mode, printer_class, price_single, price_duplex, price_per_meter, price_bw_single, price_bw_duplex, price_color_single, price_color_duplex, price_bw_per_meter, price_color_per_meter, is_active } = req.body as {
    code?: string
    name?: string
    technology_code?: string | null
    counter_unit?: 'sheets' | 'meters'
    max_width_mm?: number | null
    color_mode?: 'bw' | 'color' | 'both'
    printer_class?: 'office' | 'pro'
    price_single?: number | null
    price_duplex?: number | null
    price_per_meter?: number | null
    price_bw_single?: number | null
    price_bw_duplex?: number | null
    price_color_single?: number | null
    price_color_duplex?: number | null
    price_bw_per_meter?: number | null
    price_color_per_meter?: number | null
    is_active?: number
  }

  const db = await getDb()
  const existing = await db.get<any>('SELECT * FROM printers WHERE id = ?', id)
  if (!existing) { res.status(404).json({ message: 'Printer not found' }); return }

  const cols = await getTableColumns('printers')
  const sets: string[] = []
  const values: any[] = []
  if (code !== undefined) { sets.push('code = ?'); values.push(code) }
  if (name !== undefined) { sets.push('name = ?'); values.push(name) }
  if (technology_code !== undefined && cols.has('technology_code')) { sets.push('technology_code = ?'); values.push(technology_code || null) }
  if (counter_unit !== undefined && cols.has('counter_unit')) { sets.push('counter_unit = ?'); values.push(counter_unit) }
  if (max_width_mm !== undefined && cols.has('max_width_mm')) { sets.push('max_width_mm = ?'); values.push(max_width_mm) }
  if (color_mode !== undefined && cols.has('color_mode')) { sets.push('color_mode = ?'); values.push(color_mode) }
  if (printer_class !== undefined && cols.has('printer_class')) { sets.push('printer_class = ?'); values.push(printer_class) }
  if (price_single !== undefined && cols.has('price_single')) { sets.push('price_single = ?'); values.push(price_single) }
  if (price_duplex !== undefined && cols.has('price_duplex')) { sets.push('price_duplex = ?'); values.push(price_duplex) }
  if (price_per_meter !== undefined && cols.has('price_per_meter')) { sets.push('price_per_meter = ?'); values.push(price_per_meter) }
  if (price_bw_single !== undefined && cols.has('price_bw_single')) { sets.push('price_bw_single = ?'); values.push(price_bw_single) }
  if (price_bw_duplex !== undefined && cols.has('price_bw_duplex')) { sets.push('price_bw_duplex = ?'); values.push(price_bw_duplex) }
  if (price_color_single !== undefined && cols.has('price_color_single')) { sets.push('price_color_single = ?'); values.push(price_color_single) }
  if (price_color_duplex !== undefined && cols.has('price_color_duplex')) { sets.push('price_color_duplex = ?'); values.push(price_color_duplex) }
  if (price_bw_per_meter !== undefined && cols.has('price_bw_per_meter')) { sets.push('price_bw_per_meter = ?'); values.push(price_bw_per_meter) }
  if (price_color_per_meter !== undefined && cols.has('price_color_per_meter')) { sets.push('price_color_per_meter = ?'); values.push(price_color_per_meter) }
  if (is_active !== undefined && cols.has('is_active')) { sets.push('is_active = ?'); values.push(is_active ? 1 : 0) }
  if (cols.has('updated_at')) { sets.push("updated_at = datetime('now')") }

  if (sets.length > 0) {
    await db.run(
      `UPDATE printers SET ${sets.join(', ')} WHERE id = ?`,
      ...values,
      id
    )
  }

  const select = buildPrintersSelect(cols)
  const row = await db.get<any>(`SELECT ${select} FROM printers WHERE id = ?`, id)

  res.json(row)
}))

// GET /api/printers/counters — счётчики принтеров по дате
router.get('/counters', asyncHandler(async (req, res) => {
  const date = String((req.query as any)?.date || '').slice(0, 10)
  if (!date) { res.status(400).json({ message: 'date=YYYY-MM-DD required' }); return }
  const db = await getDb()
  const rows = await db.all<any>(
    `SELECT p.id, p.code, p.name,
            pc.value as value,
            (
              SELECT pc2.value FROM printer_counters pc2
               WHERE pc2.printer_id = p.id AND pc2.counter_date < ?
               ORDER BY pc2.counter_date DESC LIMIT 1
            ) as prev_value
       FROM printers p
  LEFT JOIN printer_counters pc ON pc.printer_id = p.id AND pc.counter_date = ?
      ORDER BY p.name`,
    date,
    date
  )
  res.json(rows)
}))

// POST /api/printers/:id/counters — добавить счётчик принтера (доступно всем авторизованным пользователям)
router.post('/:id/counters', asyncHandler(async (req, res) => {
  const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  if (!user) { res.status(401).json({ message: 'Unauthorized' }); return }
  const id = Number(req.params.id)
  const { counter_date, value } = req.body as { counter_date: string; value: number }
  const db = await getDb()
  try {
    await db.run('INSERT OR REPLACE INTO printer_counters (printer_id, counter_date, value) VALUES (?, ?, ?)', id, counter_date, Number(value))
  } catch (e) { throw e }
  const row = await db.get<any>('SELECT id, printer_id, counter_date, value, created_at FROM printer_counters WHERE printer_id = ? AND counter_date = ?', id, counter_date)
  res.status(201).json(row)
}))

export default router
