import { getDb } from '../../config/database'
import type {
  ExpenseCategoryInput,
  ExpenseCategoryRow,
  ExpenseInput,
  ExpenseListFilters,
  ExpenseRow,
  ExpenseWithRelations,
} from './types'

const EXPENSE_SELECT = `
  e.id, e.department_id, e.category_id, e.amount, e.currency, e.expense_date,
  e.title, e.notes, e.created_by, e.created_at, e.updated_at,
  c.name AS category_name,
  d.name AS department_name,
  u.name AS created_by_name
`

export class ExpenseRepository {
  static async listCategories(activeOnly = false): Promise<ExpenseCategoryRow[]> {
    const db = await getDb()
    const where = activeOnly ? 'WHERE is_active = 1' : ''
    const rows = await db.all<ExpenseCategoryRow[]>(
      `SELECT id, name, kind, sort_order, is_active, created_at
       FROM expense_categories
       ${where}
       ORDER BY sort_order ASC, name ASC`
    )
    return Array.isArray(rows) ? rows : []
  }

  static async getCategoryById(id: number): Promise<ExpenseCategoryRow | null> {
    const db = await getDb()
    const row = await db.get<ExpenseCategoryRow>(
      `SELECT id, name, kind, sort_order, is_active, created_at
       FROM expense_categories WHERE id = ?`,
      id
    )
    return row ?? null
  }

  static async createCategory(payload: ExpenseCategoryInput): Promise<ExpenseCategoryRow> {
    const db = await getDb()
    const result = await db.run(
      `INSERT INTO expense_categories (name, kind, sort_order, is_active, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [
        String(payload.name || '').trim(),
        payload.kind ?? 'opex',
        payload.sort_order ?? 0,
        payload.is_active === false ? 0 : 1,
      ]
    )
    const row = await this.getCategoryById(Number(result.lastID))
    if (!row) throw new Error('Не удалось создать категорию расходов')
    return row
  }

  static async updateCategory(id: number, payload: Partial<ExpenseCategoryInput>): Promise<ExpenseCategoryRow> {
    const current = await this.getCategoryById(id)
    if (!current) throw new Error('Категория расходов не найдена')
    const db = await getDb()
    await db.run(
      `UPDATE expense_categories
       SET name = ?, kind = ?, sort_order = ?, is_active = ?
       WHERE id = ?`,
      [
        payload.name !== undefined ? String(payload.name).trim() : current.name,
        payload.kind ?? current.kind,
        payload.sort_order ?? current.sort_order,
        payload.is_active !== undefined ? (payload.is_active ? 1 : 0) : current.is_active,
        id,
      ]
    )
    const row = await this.getCategoryById(id)
    if (!row) throw new Error('Категория расходов не найдена')
    return row
  }

  static async listExpenses(filters?: ExpenseListFilters): Promise<ExpenseWithRelations[]> {
    const db = await getDb()
    const where: string[] = ['1=1']
    const params: unknown[] = []

    if (filters?.date_from) {
      where.push('e.expense_date >= ?')
      params.push(filters.date_from)
    }
    if (filters?.date_to) {
      where.push('e.expense_date <= ?')
      params.push(filters.date_to)
    }
    if (filters?.department_id !== undefined) {
      if (filters.department_id === null) {
        where.push('e.department_id IS NULL')
      } else {
        where.push('e.department_id = ?')
        params.push(filters.department_id)
      }
    }
    if (filters?.category_id) {
      where.push('e.category_id = ?')
      params.push(filters.category_id)
    }

    const rows = await db.all<ExpenseWithRelations[]>(
      `SELECT ${EXPENSE_SELECT}
       FROM expenses e
       INNER JOIN expense_categories c ON c.id = e.category_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN users u ON u.id = e.created_by
       WHERE ${where.join(' AND ')}
       ORDER BY e.expense_date DESC, e.id DESC`,
      params
    )
    return Array.isArray(rows) ? rows : []
  }

  static async getExpenseById(id: number): Promise<ExpenseWithRelations | null> {
    const db = await getDb()
    const row = await db.get<ExpenseWithRelations>(
      `SELECT ${EXPENSE_SELECT}
       FROM expenses e
       INNER JOIN expense_categories c ON c.id = e.category_id
       LEFT JOIN departments d ON d.id = e.department_id
       LEFT JOIN users u ON u.id = e.created_by
       WHERE e.id = ?`,
      id
    )
    return row ?? null
  }

  static async createExpense(payload: ExpenseInput, createdBy?: number | null): Promise<ExpenseWithRelations> {
    const db = await getDb()
    const result = await db.run(
      `INSERT INTO expenses
       (department_id, category_id, amount, currency, expense_date, title, notes, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [
        payload.department_id ?? null,
        payload.category_id,
        payload.amount,
        payload.currency ?? 'BYN',
        payload.expense_date,
        payload.title ?? null,
        payload.notes ?? null,
        createdBy ?? null,
      ]
    )
    const row = await this.getExpenseById(Number(result.lastID))
    if (!row) throw new Error('Не удалось создать расход')
    return row
  }

  static async updateExpense(id: number, payload: Partial<ExpenseInput>): Promise<ExpenseWithRelations> {
    const current = await this.getExpenseById(id)
    if (!current) throw new Error('Расход не найден')
    const db = await getDb()
    await db.run(
      `UPDATE expenses
       SET department_id = ?, category_id = ?, amount = ?, currency = ?,
           expense_date = ?, title = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [
        payload.department_id !== undefined ? payload.department_id : current.department_id,
        payload.category_id ?? current.category_id,
        payload.amount ?? current.amount,
        payload.currency ?? current.currency,
        payload.expense_date ?? current.expense_date,
        payload.title !== undefined ? payload.title : current.title,
        payload.notes !== undefined ? payload.notes : current.notes,
        id,
      ]
    )
    const row = await this.getExpenseById(id)
    if (!row) throw new Error('Расход не найден')
    return row
  }

  static async deleteExpense(id: number): Promise<void> {
    const db = await getDb()
    const result = await db.run('DELETE FROM expenses WHERE id = ?', id)
    if (result.changes === 0) throw new Error('Расход не найден')
  }

  static async sumByDepartment(filters?: { date_from?: string; date_to?: string }): Promise<
    Array<{ department_id: number | null; department_name: string | null; total: number }>
  > {
    const db = await getDb()
    const where: string[] = ['1=1']
    const params: unknown[] = []

    if (filters?.date_from) {
      where.push('e.expense_date >= ?')
      params.push(filters.date_from)
    }
    if (filters?.date_to) {
      where.push('e.expense_date <= ?')
      params.push(filters.date_to)
    }

    const rows = await db.all<Array<{ department_id: number | null; department_name: string | null; total: number }>>(
      `SELECT e.department_id, d.name AS department_name, SUM(e.amount) AS total
       FROM expenses e
       LEFT JOIN departments d ON d.id = e.department_id
       WHERE ${where.join(' AND ')}
       GROUP BY e.department_id
       ORDER BY total DESC`,
      params
    )
    return Array.isArray(rows) ? rows : []
  }

  static async sumTotal(filters?: { date_from?: string; date_to?: string }): Promise<number> {
    const db = await getDb()
    const where: string[] = ['1=1']
    const params: unknown[] = []

    if (filters?.date_from) {
      where.push('expense_date >= ?')
      params.push(filters.date_from)
    }
    if (filters?.date_to) {
      where.push('expense_date <= ?')
      params.push(filters.date_to)
    }

    const row = await db.get<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE ${where.join(' AND ')}`,
      params
    )
    return Number(row?.total ?? 0)
  }

  static async sumCompanyWide(filters?: { date_from?: string; date_to?: string }): Promise<number> {
    const db = await getDb()
    const where: string[] = ['department_id IS NULL']
    const params: unknown[] = []

    if (filters?.date_from) {
      where.push('expense_date >= ?')
      params.push(filters.date_from)
    }
    if (filters?.date_to) {
      where.push('expense_date <= ?')
      params.push(filters.date_to)
    }

    const row = await db.get<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE ${where.join(' AND ')}`,
      params
    )
    return Number(row?.total ?? 0)
  }

  static async getExpenseRow(id: number): Promise<ExpenseRow | null> {
    const db = await getDb()
    const row = await db.get<ExpenseRow>(
      `SELECT id, department_id, category_id, amount, currency, expense_date, title, notes, created_by, created_at, updated_at
       FROM expenses WHERE id = ?`,
      id
    )
    return row ?? null
  }
}
