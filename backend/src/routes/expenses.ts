import { Router } from 'express'
import { asyncHandler } from '../middleware'
import type { AuthenticatedRequest } from '../middleware/auth'
import { ExpenseService } from '../modules/expenses/expenseService'

const router = Router()

function requireAdmin(req: AuthenticatedRequest, res: import('express').Response): boolean {
  const user = req.user
  if (!user) {
    res.status(401).json({ message: 'Unauthorized' })
    return false
  }
  if (user.role !== 'admin') {
    res.status(403).json({ message: 'Только администратор может управлять расходами' })
    return false
  }
  return true
}

function parseDepartmentFilter(raw: unknown): number | null | undefined {
  if (raw === undefined || raw === '') return undefined
  if (raw === 'null' || raw === 'company') return null
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : undefined
}

router.get('/categories', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const activeOnly = String((req.query as { active?: string }).active ?? '1') !== '0'
  res.json({ categories: await ExpenseService.listCategories(activeOnly) })
}))

router.post('/categories', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  try {
    res.status(201).json(await ExpenseService.createCategory(req.body))
  } catch (e: any) {
    res.status(400).json({ message: e?.message || 'Ошибка создания категории' })
  }
}))

router.put('/categories/:id', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ message: 'Некорректный id категории' })
    return
  }
  try {
    res.json(await ExpenseService.updateCategory(id, req.body))
  } catch (e: any) {
    const status = e?.message?.includes('не найдена') ? 404 : 400
    res.status(status).json({ message: e?.message || 'Ошибка обновления категории' })
  }
}))

router.get('/summary', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const q = req.query as { date_from?: string; date_to?: string }
  res.json(
    await ExpenseService.getSummary({
      date_from: q.date_from || undefined,
      date_to: q.date_to || undefined,
    })
  )
}))

router.get('/', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const q = req.query as {
    date_from?: string
    date_to?: string
    department_id?: string
    category_id?: string
  }
  const departmentId = parseDepartmentFilter(q.department_id)
  const categoryId = q.category_id ? Number(q.category_id) : undefined
  res.json({
    expenses: await ExpenseService.list({
      date_from: q.date_from || undefined,
      date_to: q.date_to || undefined,
      department_id: departmentId,
      category_id: Number.isFinite(categoryId) && categoryId! > 0 ? categoryId : undefined,
    }),
  })
}))

router.post('/', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const user = (req as AuthenticatedRequest).user
  try {
    res.status(201).json(await ExpenseService.create(req.body, user?.id))
  } catch (e: any) {
    res.status(400).json({ message: e?.message || 'Ошибка создания расхода' })
  }
}))

router.put('/:id', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ message: 'Некорректный id расхода' })
    return
  }
  try {
    res.json(await ExpenseService.update(id, req.body))
  } catch (e: any) {
    const status = e?.message?.includes('не найден') ? 404 : 400
    res.status(status).json({ message: e?.message || 'Ошибка обновления расхода' })
  }
}))

router.delete('/:id', asyncHandler(async (req, res) => {
  if (!requireAdmin(req as AuthenticatedRequest, res)) return
  const id = Number(req.params.id)
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ message: 'Некорректный id расхода' })
    return
  }
  try {
    await ExpenseService.delete(id)
    res.json({ message: 'Расход удалён' })
  } catch (e: any) {
    const status = e?.message?.includes('не найден') ? 404 : 400
    res.status(status).json({ message: e?.message || 'Ошибка удаления расхода' })
  }
}))

export default router
