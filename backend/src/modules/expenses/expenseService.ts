import { ExpenseRepository } from './expenseRepository'
import type {
  ExpenseCategoryInput,
  ExpenseCategoryRow,
  ExpenseInput,
  ExpenseListFilters,
  ExpenseSummary,
  ExpenseWithRelations,
} from './types'

function assertPositiveAmount(amount: number): void {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Сумма расхода должна быть больше 0')
  }
}

function normalizeDate(raw: string): string {
  const value = String(raw || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Некорректная дата расхода (ожидается YYYY-MM-DD)')
  }
  return value
}

export class ExpenseService {
  static async listCategories(activeOnly = true): Promise<ExpenseCategoryRow[]> {
    return ExpenseRepository.listCategories(activeOnly)
  }

  static async createCategory(payload: ExpenseCategoryInput): Promise<ExpenseCategoryRow> {
    const name = String(payload.name || '').trim()
    if (!name) throw new Error('Название категории обязательно')
    return ExpenseRepository.createCategory({ ...payload, name })
  }

  static async updateCategory(id: number, payload: Partial<ExpenseCategoryInput>): Promise<ExpenseCategoryRow> {
    if (payload.name !== undefined && !String(payload.name).trim()) {
      throw new Error('Название категории обязательно')
    }
    return ExpenseRepository.updateCategory(id, payload)
  }

  static async list(filters?: ExpenseListFilters): Promise<ExpenseWithRelations[]> {
    return ExpenseRepository.listExpenses(filters)
  }

  static async create(payload: ExpenseInput, createdBy?: number | null): Promise<ExpenseWithRelations> {
    assertPositiveAmount(Number(payload.amount))
    if (!payload.category_id) throw new Error('Категория обязательна')
    const category = await ExpenseRepository.getCategoryById(payload.category_id)
    if (!category || !category.is_active) throw new Error('Категория расходов не найдена')
    return ExpenseRepository.createExpense(
      {
        ...payload,
        amount: Number(payload.amount),
        expense_date: normalizeDate(payload.expense_date),
        title: payload.title != null ? String(payload.title).trim() || null : null,
        notes: payload.notes != null ? String(payload.notes).trim() || null : null,
      },
      createdBy
    )
  }

  static async update(id: number, payload: Partial<ExpenseInput>): Promise<ExpenseWithRelations> {
    if (payload.amount !== undefined) {
      assertPositiveAmount(Number(payload.amount))
    }
    if (payload.category_id) {
      const category = await ExpenseRepository.getCategoryById(payload.category_id)
      if (!category || !category.is_active) throw new Error('Категория расходов не найдена')
    }
    const normalized: Partial<ExpenseInput> = { ...payload }
    if (payload.expense_date !== undefined) {
      normalized.expense_date = normalizeDate(payload.expense_date)
    }
    if (payload.amount !== undefined) {
      normalized.amount = Number(payload.amount)
    }
    return ExpenseRepository.updateExpense(id, normalized)
  }

  static async delete(id: number): Promise<void> {
    await ExpenseRepository.deleteExpense(id)
  }

  static async getSummary(filters?: { date_from?: string; date_to?: string }): Promise<ExpenseSummary> {
    const [byDeptRows, companyWide, total] = await Promise.all([
      ExpenseRepository.sumByDepartment(filters),
      ExpenseRepository.sumCompanyWide(filters),
      ExpenseRepository.sumTotal(filters),
    ])

    const by_department = byDeptRows.map((row) => ({
      department_id: row.department_id,
      department_name: row.department_id == null ? 'Общие' : String(row.department_name || `Департамент #${row.department_id}`),
      total: Number(row.total ?? 0),
    }))

    return {
      by_department,
      company_wide: companyWide,
      total,
    }
  }
}
