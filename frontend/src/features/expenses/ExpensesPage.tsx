import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminBack } from '../../hooks/useAdminBack';
import {
  createExpense,
  deleteExpense,
  getDepartments,
  getExpenseCategories,
  getExpenses,
  getExpenseSummary,
  updateExpense,
  type Department,
  type Expense,
  type ExpenseCategory,
} from '../../api';
import { Alert, Button } from '../../components/common';
import { MoneyAmount } from '../../components/ui';
import { getErrorMessage } from '../../utils/errorUtils';
import './ExpensesPage.css';

type DepartmentFilter = '' | 'company' | number;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

const emptyForm = () => ({
  department_id: '' as '' | 'company' | number,
  category_id: '',
  amount: '',
  expense_date: todayIso(),
  title: '',
  notes: '',
});

export const ExpensesPage: React.FC = () => {
  const goBack = useAdminBack();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [periodTotal, setPeriodTotal] = useState(0);
  const [dateFrom, setDateFrom] = useState(monthStartIso());
  const [dateTo, setDateTo] = useState(todayIso());
  const [departmentFilter, setDepartmentFilter] = useState<DepartmentFilter>('');
  const [categoryFilter, setCategoryFilter] = useState<number | ''>('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    const [deptRes, catRes] = await Promise.all([
      getDepartments(),
      getExpenseCategories(true),
    ]);
    setDepartments(deptRes.data ?? []);
    setCategories(catRes.data?.categories ?? []);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const listParams: {
        date_from?: string;
        date_to?: string;
        department_id?: number | 'company' | null;
        category_id?: number;
      } = {
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      };
      if (departmentFilter === 'company') {
        listParams.department_id = 'company';
      } else if (typeof departmentFilter === 'number') {
        listParams.department_id = departmentFilter;
      }
      if (categoryFilter !== '') {
        listParams.category_id = categoryFilter;
      }

      const [listRes, summaryRes] = await Promise.all([
        getExpenses(listParams),
        getExpenseSummary({ date_from: dateFrom || undefined, date_to: dateTo || undefined }),
      ]);
      setExpenses(listRes.data?.expenses ?? []);
      setPeriodTotal(summaryRes.data?.total ?? 0);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Ошибка загрузки расходов'));
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, dateFrom, dateTo, departmentFilter]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const departmentLabel = useMemo(() => {
    const map = new Map<number, string>();
    departments.forEach((d) => map.set(d.id, d.name));
    return (id: number | null) => {
      if (id == null) return 'Общие';
      return map.get(id) ?? `Департамент #${id}`;
    };
  }, [departments]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(form.amount);
    const categoryId = Number(form.category_id);
    if (!categoryId || !Number.isFinite(amount) || amount <= 0) {
      setErrorMessage('Укажите категорию и сумму больше 0');
      return;
    }
    if (!form.expense_date) {
      setErrorMessage('Укажите дату расхода');
      return;
    }

    const departmentId =
      form.department_id === '' || form.department_id === 'company' ? null : Number(form.department_id);

    const payload = {
      department_id: departmentId,
      category_id: categoryId,
      amount,
      expense_date: form.expense_date,
      title: form.title.trim() || null,
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    setErrorMessage(null);
    try {
      if (editingId) {
        await updateExpense(editingId, payload);
      } else {
        await createExpense(payload);
      }
      resetForm();
      await loadData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Ошибка сохранения расхода'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setForm({
      department_id: expense.department_id == null ? 'company' : expense.department_id,
      category_id: String(expense.category_id),
      amount: String(expense.amount),
      expense_date: expense.expense_date?.slice(0, 10) ?? todayIso(),
      title: expense.title ?? '',
      notes: expense.notes ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить этот расход?')) return;
    setErrorMessage(null);
    try {
      await deleteExpense(id);
      if (editingId === id) resetForm();
      await loadData();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Ошибка удаления расхода'));
    }
  };

  return (
    <div className="expenses-page">
      <div className="expenses-header">
        <div className="expenses-header-left">
          <button type="button" onClick={goBack} className="expenses-back-btn">
            ← Назад
          </button>
          <div>
            <h1 className="expenses-title">Расходы</h1>
            <p className="expenses-subtitle">Учёт операционных расходов по департаментам и компании</p>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-4">
          <Alert type="error">{errorMessage}</Alert>
        </div>
      )}

      <div className="expenses-filters">
        <div className="expenses-filter-field">
          <label htmlFor="expenses-date-from">Период с</label>
          <input
            id="expenses-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="expenses-filter-field">
          <label htmlFor="expenses-date-to">Период по</label>
          <input
            id="expenses-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className="expenses-filter-field">
          <label htmlFor="expenses-dept-filter">Департамент</label>
          <select
            id="expenses-dept-filter"
            value={departmentFilter === '' ? '' : departmentFilter === 'company' ? 'company' : String(departmentFilter)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') setDepartmentFilter('');
              else if (v === 'company') setDepartmentFilter('company');
              else setDepartmentFilter(Number(v));
            }}
          >
            <option value="">Все</option>
            <option value="company">Общие</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className="expenses-filter-field">
          <label htmlFor="expenses-cat-filter">Категория</label>
          <select
            id="expenses-cat-filter"
            value={categoryFilter === '' ? '' : String(categoryFilter)}
            onChange={(e) => setCategoryFilter(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">Все</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="expenses-summary-card">
        <span className="expenses-summary-label">Итого за период</span>
        <span className="expenses-summary-value">
          <MoneyAmount value={periodTotal} />
        </span>
      </div>

      <form className="expenses-form-card" onSubmit={handleSubmit}>
        <h2 className="expenses-form-title">{editingId ? 'Редактирование расхода' : 'Новый расход'}</h2>
        <div className="expenses-form-grid">
          <div className="expenses-form-field">
            <label htmlFor="expense-date">Дата</label>
            <input
              id="expense-date"
              type="date"
              value={form.expense_date}
              onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
              required
            />
          </div>
          <div className="expenses-form-field">
            <label htmlFor="expense-dept">Департамент</label>
            <select
              id="expense-dept"
              value={
                form.department_id === '' ? '' : form.department_id === 'company' ? 'company' : String(form.department_id)
              }
              onChange={(e) => {
                const v = e.target.value;
                if (v === '') setForm((f) => ({ ...f, department_id: '' }));
                else if (v === 'company') setForm((f) => ({ ...f, department_id: 'company' }));
                else setForm((f) => ({ ...f, department_id: Number(v) }));
              }}
            >
              <option value="company">Общие</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="expenses-form-field">
            <label htmlFor="expense-category">Категория</label>
            <select
              id="expense-category"
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
              required
            >
              <option value="">Выберите...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="expenses-form-field">
            <label htmlFor="expense-amount">Сумма, BYN</label>
            <input
              id="expense-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              required
            />
          </div>
          <div className="expenses-form-field">
            <label htmlFor="expense-title">Название</label>
            <input
              id="expense-title"
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Краткое описание"
            />
          </div>
        </div>
        <div className="expenses-form-field">
          <label htmlFor="expense-notes">Комментарий</label>
          <textarea
            id="expense-notes"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            placeholder="Дополнительные детали"
          />
        </div>
        <div className="expenses-form-actions">
          <Button type="submit" disabled={saving}>
            {saving ? 'Сохранение...' : editingId ? 'Сохранить' : 'Добавить расход'}
          </Button>
          {editingId && (
            <Button type="button" variant="secondary" onClick={resetForm}>
              Отмена
            </Button>
          )}
        </div>
      </form>

      <div className="expenses-table-wrap">
        {loading ? (
          <div className="expenses-empty">Загрузка...</div>
        ) : expenses.length === 0 ? (
          <div className="expenses-empty">Нет расходов за выбранный период</div>
        ) : (
          <table className="expenses-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Департамент</th>
                <th>Категория</th>
                <th>Название</th>
                <th>Сумма</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{expense.expense_date?.slice(0, 10)}</td>
                  <td>{departmentLabel(expense.department_id)}</td>
                  <td>{expense.category_name ?? '—'}</td>
                  <td>{expense.title || '—'}</td>
                  <td className="expenses-amount">
                    <MoneyAmount value={expense.amount} />
                  </td>
                  <td>
                    <div className="expenses-table-actions">
                      <Button type="button" variant="secondary" size="sm" onClick={() => handleEdit(expense)}>
                        Изменить
                      </Button>
                      <Button type="button" variant="error" size="sm" onClick={() => void handleDelete(expense.id)}>
                        Удалить
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ExpensesPage;
