import { Router } from 'express'
import { asyncHandler } from '../middleware'
import { getDb } from '../config/database'
import { AuthenticatedRequest } from '../middleware'
import { hasColumn } from '../utils/tableSchemaCache'

const router = Router()
const VALID_COUNTER_UNITS = new Set(['sheets', 'meters', 'm2'])

const PRINTERS_BASE_SELECT = [
  'p.id',
  'p.code',
  'p.name',
  'p.technology_code',
  'p.counter_unit',
  'p.max_width_mm',
  'p.color_mode',
  'p.printer_class',
  'p.price_single',
  'p.price_duplex',
  'p.price_per_meter',
  'p.price_bw_single',
  'p.price_bw_duplex',
  'p.price_color_single',
  'p.price_color_duplex',
  'p.price_bw_per_meter',
  'p.price_color_per_meter',
  'p.is_active',
].join(', ')

async function printersSelectSql(): Promise<{ select: string; from: string; hasDepartment: boolean }> {
  const hasDepartment = await hasColumn('printers', 'department_id').catch(() => false)
  if (!hasDepartment) {
    return {
      select: `${PRINTERS_BASE_SELECT}, NULL as department_id, NULL as department_name`,
      from: 'FROM printers p',
      hasDepartment: false,
    }
  }
  return {
    select: `${PRINTERS_BASE_SELECT}, p.department_id, d.name as department_name`,
    from: `FROM printers p LEFT JOIN departments d ON d.id = p.department_id`,
    hasDepartment: true,
  }
}

function parseOptionalDepartmentId(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined
  if (raw === 'null' || raw === 'none') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

async function resolvePrintersDepartmentFilter(
  req: AuthenticatedRequest,
  db: Awaited<ReturnType<typeof getDb>>,
  hasPrinterDepartment: boolean
): Promise<number | null | undefined> {
  if (!hasPrinterDepartment) return undefined

  const hasUserDepartment = await hasColumn('users', 'department_id').catch(() => false)

  const executorUserId = Number((req.query as any)?.executor_user_id)
  if (Number.isFinite(executorUserId) && executorUserId > 0) {
    if (!hasUserDepartment) return undefined
    try {
      const executor = await db.get<{ department_id: number | null }>(
        'SELECT department_id FROM users WHERE id = ?',
        [executorUserId]
      )
      const dept = executor?.department_id != null ? Number(executor.department_id) : null
      if (dept != null && Number.isFinite(dept) && dept > 0) return dept
    } catch {
      return undefined
    }
    return undefined
  }

  const queryDept = parseOptionalDepartmentId((req.query as any)?.department_id)
  if (queryDept !== undefined) return queryDept

  const authUser = req.user
  if (!authUser || authUser.role === 'admin' || !hasUserDepartment) return undefined

  try {
    const userRow = await db.get<{ department_id: number | null }>(
      'SELECT department_id FROM users WHERE id = ?',
      [authUser.id]
    )
    const userDept = userRow?.department_id != null ? Number(userRow.department_id) : null
    if (userDept != null && Number.isFinite(userDept) && userDept > 0) {
      return userDept
    }
  } catch {
    return undefined
  }
  return undefined
}

// GET /api/printers — список принтеров (фильтр по технологии / департаменту)
router.get('/', asyncHandler(async (req, res) => {
  const technologyCode = (req.query as any)?.technology_code as string | undefined
  const db = await getDb()
  const { select, from, hasDepartment } = await printersSelectSql()
  const departmentId = await resolvePrintersDepartmentFilter(
    req as AuthenticatedRequest,
    db,
    hasDepartment
  )
  const filterByTech = technologyCode && String(technologyCode).trim()

  const where: string[] = []
  const params: any[] = []
  if (filterByTech) {
    where.push('p.technology_code = ?')
    params.push(filterByTech)
  }
  if (hasDepartment && departmentId !== undefined) {
    if (departmentId === null) {
      where.push('p.department_id IS NULL')
    } else {
      where.push('p.department_id = ?')
      params.push(departmentId)
    }
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const orderSql = hasDepartment
    ? 'ORDER BY d.name IS NULL, d.name, p.name'
    : 'ORDER BY p.name'
  const rows = await db.all<any>(
    `SELECT ${select} ${from} ${whereSql} ${orderSql}`,
    ...params
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
    department_id = null,
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
    counter_unit?: 'sheets' | 'meters' | 'm2'
    max_width_mm?: number | null
    color_mode?: 'bw' | 'color' | 'both'
    printer_class?: 'office' | 'pro'
    department_id?: number | null
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
  if (!VALID_COUNTER_UNITS.has(String(counter_unit))) {
    res.status(400).json({ message: 'counter_unit должен быть одним из: sheets, meters, m2' })
    return
  }

  const deptId =
    department_id == null || department_id === ('' as any)
      ? null
      : Number(department_id)
  if (deptId != null && (!Number.isFinite(deptId) || deptId <= 0)) {
    res.status(400).json({ message: 'Некорректный department_id' })
    return
  }

  const db = await getDb()
  const { select, from, hasDepartment } = await printersSelectSql()

  if (hasDepartment && deptId != null) {
    const dept = await db.get<{ id: number }>('SELECT id FROM departments WHERE id = ?', [deptId])
    if (!dept) {
      res.status(400).json({ message: 'Департамент не найден' })
      return
    }
  }

  if (hasDepartment) {
    await db.run(
      `INSERT INTO printers (code, name, technology_code, counter_unit, max_width_mm, color_mode, printer_class,
        department_id, price_single, price_duplex, price_per_meter, price_bw_single, price_bw_duplex,
        price_color_single, price_color_duplex, price_bw_per_meter, price_color_per_meter, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code, name, technology_code ?? null, counter_unit, max_width_mm ?? null, color_mode, printer_class,
      deptId,
      price_single ?? null, price_duplex ?? null, price_per_meter ?? null,
      price_bw_single ?? null, price_bw_duplex ?? null, price_color_single ?? null, price_color_duplex ?? null,
      price_bw_per_meter ?? null, price_color_per_meter ?? null, is_active ? 1 : 0
    )
  } else {
    await db.run(
      `INSERT INTO printers (code, name, technology_code, counter_unit, max_width_mm, color_mode, printer_class,
        price_single, price_duplex, price_per_meter, price_bw_single, price_bw_duplex,
        price_color_single, price_color_duplex, price_bw_per_meter, price_color_per_meter, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      code, name, technology_code ?? null, counter_unit, max_width_mm ?? null, color_mode, printer_class,
      price_single ?? null, price_duplex ?? null, price_per_meter ?? null,
      price_bw_single ?? null, price_bw_duplex ?? null, price_color_single ?? null, price_color_duplex ?? null,
      price_bw_per_meter ?? null, price_color_per_meter ?? null, is_active ? 1 : 0
    )
  }

  const row = await db.get<any>(
    `SELECT ${select} ${from} WHERE p.code = ?`,
    code
  )

  res.status(201).json(row)
}))

// PUT /api/printers/:id — обновить принтер
router.put('/:id', asyncHandler(async (req, res) => {
  const user = (req as AuthenticatedRequest).user as { id: number; role: string } | undefined
  if (!user || user.role !== 'admin') { res.status(403).json({ message: 'Forbidden' }); return }

  const id = Number(req.params.id)
  const {
    code,
    name,
    technology_code,
    counter_unit,
    max_width_mm,
    color_mode,
    printer_class,
    department_id,
    price_single,
    price_duplex,
    price_per_meter,
    price_bw_single,
    price_bw_duplex,
    price_color_single,
    price_color_duplex,
    price_bw_per_meter,
    price_color_per_meter,
    is_active,
  } = req.body as {
    code?: string
    name?: string
    technology_code?: string | null
    counter_unit?: 'sheets' | 'meters' | 'm2'
    max_width_mm?: number | null
    color_mode?: 'bw' | 'color' | 'both'
    printer_class?: 'office' | 'pro'
    department_id?: number | null
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
  const { select, from, hasDepartment } = await printersSelectSql()
  const existing = await db.get<any>('SELECT * FROM printers WHERE id = ?', id)
  if (!existing) { res.status(404).json({ message: 'Printer not found' }); return }

  if (hasDepartment && department_id !== undefined && department_id != null) {
    const deptId = Number(department_id)
    if (!Number.isFinite(deptId) || deptId <= 0) {
      res.status(400).json({ message: 'Некорректный department_id' })
      return
    }
    const dept = await db.get<{ id: number }>('SELECT id FROM departments WHERE id = ?', [deptId])
    if (!dept) {
      res.status(400).json({ message: 'Департамент не найден' })
      return
    }
  }
  if (counter_unit !== undefined && !VALID_COUNTER_UNITS.has(String(counter_unit))) {
    res.status(400).json({ message: 'counter_unit должен быть одним из: sheets, meters, m2' })
    return
  }

  const sets: string[] = []
  const values: any[] = []
  if (code !== undefined) { sets.push('code = ?'); values.push(code) }
  if (name !== undefined) { sets.push('name = ?'); values.push(name) }
  if (technology_code !== undefined) { sets.push('technology_code = ?'); values.push(technology_code ?? null) }
  if (counter_unit !== undefined) { sets.push('counter_unit = ?'); values.push(counter_unit) }
  if (max_width_mm !== undefined) { sets.push('max_width_mm = ?'); values.push(max_width_mm) }
  if (color_mode !== undefined) { sets.push('color_mode = ?'); values.push(color_mode) }
  if (printer_class !== undefined) { sets.push('printer_class = ?'); values.push(printer_class) }
  if (hasDepartment && department_id !== undefined) {
    sets.push('department_id = ?')
    values.push(department_id == null ? null : Number(department_id))
  }
  if (price_single !== undefined) { sets.push('price_single = ?'); values.push(price_single) }
  if (price_duplex !== undefined) { sets.push('price_duplex = ?'); values.push(price_duplex) }
  if (price_per_meter !== undefined) { sets.push('price_per_meter = ?'); values.push(price_per_meter) }
  if (price_bw_single !== undefined) { sets.push('price_bw_single = ?'); values.push(price_bw_single) }
  if (price_bw_duplex !== undefined) { sets.push('price_bw_duplex = ?'); values.push(price_bw_duplex) }
  if (price_color_single !== undefined) { sets.push('price_color_single = ?'); values.push(price_color_single) }
  if (price_color_duplex !== undefined) { sets.push('price_color_duplex = ?'); values.push(price_color_duplex) }
  if (price_bw_per_meter !== undefined) { sets.push('price_bw_per_meter = ?'); values.push(price_bw_per_meter) }
  if (price_color_per_meter !== undefined) { sets.push('price_color_per_meter = ?'); values.push(price_color_per_meter) }
  if (is_active !== undefined) { sets.push('is_active = ?'); values.push(is_active ? 1 : 0) }
  sets.push("updated_at = datetime('now')")

  if (sets.length > 0) {
    await db.run(
      `UPDATE printers SET ${sets.join(', ')} WHERE id = ?`,
      ...values,
      id
    )
  }

  const row = await db.get<any>(
    `SELECT ${select} ${from} WHERE p.id = ?`,
    id
  )

  res.json(row)
}))

// GET /api/printers/counters — счётчики принтеров по дате или за месяц (month=YYYY-MM)
router.get('/counters', asyncHandler(async (req, res) => {
  const date = String((req.query as any)?.date || '').slice(0, 10)
  const month = String((req.query as any)?.month || '').slice(0, 7)

  const db = await getDb()

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    // Режим месяца: возвращаем счётчики по каждому дню
    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    const byDate: Record<string, any[]> = {}
    for (let d = 1; d <= lastDay; d++) {
      const dayStr = String(d).padStart(2, '0')
      const dateStr = `${month}-${dayStr}`
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
        dateStr,
        dateStr
      )
      byDate[dateStr] = rows.map((r: any) => ({
        ...r,
        difference: r.value != null && r.prev_value != null ? r.value - r.prev_value : null,
      }))
    }
    res.json({ month, dates: Object.keys(byDate).sort(), byDate })
    return
  }

  if (!date) { res.status(400).json({ message: 'date=YYYY-MM-DD or month=YYYY-MM required' }); return }
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
