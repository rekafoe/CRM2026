export type ExpenseCategoryKind = 'opex' | 'cogs' | 'other'

export interface ExpenseCategoryRow {
  id: number
  name: string
  kind: ExpenseCategoryKind
  sort_order: number
  is_active: number
  created_at: string
}

export interface ExpenseRow {
  id: number
  department_id: number | null
  category_id: number
  amount: number
  currency: string
  expense_date: string
  title: string | null
  notes: string | null
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface ExpenseWithRelations extends ExpenseRow {
  category_name?: string
  department_name?: string | null
  created_by_name?: string | null
}

export interface ExpenseCategoryInput {
  name: string
  kind?: ExpenseCategoryKind
  sort_order?: number
  is_active?: boolean
}

export interface ExpenseInput {
  department_id?: number | null
  category_id: number
  amount: number
  currency?: string
  expense_date: string
  title?: string | null
  notes?: string | null
}

export interface ExpenseListFilters {
  date_from?: string
  date_to?: string
  department_id?: number | null
  category_id?: number
}

export interface ExpenseSummaryByDepartment {
  department_id: number | null
  department_name: string
  total: number
}

export interface ExpenseSummary {
  by_department: ExpenseSummaryByDepartment[]
  company_wide: number
  total: number
}
