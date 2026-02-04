import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { Alert, Button, FormField, Modal } from '../../components/common';
import { getAdminEarnings, getShifts, updateShift, createShift, getDepartments, type Department } from '../../api';
import '../EarningsPage.css';
import '../../components/admin/PricingManagement.css';

type AdminUserRow = {
  userId: number;
  name: string;
  role: string;
  isActive: boolean;
  totalCurrentMonth: number;
  totalPreviousMonth: number;
  hours: number;
  shifts: number;
  history: Array<{ month: string; total: number }>;
};

type ShiftRow = {
  id: number;
  user_id: number;
  work_date: string;
  hours: number;
  comment?: string;
};

export const EarningsAdminPage: React.FC = () => {
  const navigate = useNavigate();
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [historyMonths, setHistoryMonths] = useState(3);
  const [departmentId, setDepartmentId] = useState<number | ''>('');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [activeTab, setActiveTab] = useState<'summary' | 'analytics'>('summary');
  const [analyticsUserId, setAnalyticsUserId] = useState<number | null>(null);
  const [detailUser, setDetailUser] = useState<AdminUserRow | null>(null);
  const [shiftUser, setShiftUser] = useState<AdminUserRow | null>(null);
  const [shiftRows, setShiftRows] = useState<ShiftRow[]>([]);
  const [shiftLoading, setShiftLoading] = useState(false);
  const [newShiftDate, setNewShiftDate] = useState('');
  const [newShiftHours, setNewShiftHours] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: { month?: string; history_months?: number; department_id?: number } = { month, history_months: historyMonths };
      if (departmentId !== '' && Number.isFinite(departmentId)) params.department_id = departmentId;
      const res = await getAdminEarnings(params);
      setRows(Array.isArray(res.data?.users) ? res.data.users : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Не удалось загрузить проценты сотрудников');
    } finally {
      setLoading(false);
    }
  }, [month, historyMonths, departmentId]);

  useEffect(() => {
    getDepartments().then(r => setDepartments(r.data ?? [])).catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openShiftModal = useCallback(async (user: AdminUserRow) => {
    setShiftUser(user);
    setShiftLoading(true);
    try {
      const res = await getShifts({ user_id: user.userId, month });
      setShiftRows(Array.isArray(res.data) ? res.data : []);
    } catch {
      setShiftRows([]);
    } finally {
      setShiftLoading(false);
    }
  }, [month]);

  const handleShiftUpdate = useCallback(async (rowId: number, hours: number) => {
    await updateShift(rowId, { hours });
    setShiftRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, hours } : r)));
  }, []);

  const handleShiftCreate = useCallback(async () => {
    if (!shiftUser) return;
    const hoursValue = Number(newShiftHours);
    if (!Number.isFinite(hoursValue)) return;
    const res = await createShift({
      user_id: shiftUser.userId,
      date: newShiftDate,
      hours: hoursValue,
    });
    setShiftRows((prev) => [res.data as ShiftRow, ...prev]);
    setNewShiftDate('');
    setNewShiftHours('');
  }, [shiftUser, newShiftDate, newShiftHours]);

  const activeRows = useMemo(() => rows.filter((r) => r.isActive), [rows]);
  const totalActive = useMemo(() => activeRows.length, [activeRows]);
  const averageSalary = useMemo(() => {
    if (activeRows.length === 0) return 0;
    const total = activeRows.reduce((sum, row) => sum + Number(row.totalCurrentMonth || 0), 0);
    return total / activeRows.length;
  }, [activeRows]);
  const analyticsUser = useMemo(() => {
    if (rows.length === 0) return null;
    const selected = rows.find((row) => row.userId === analyticsUserId);
    return selected ?? rows[0];
  }, [rows, analyticsUserId]);
  const analyticsHistory = useMemo(() => {
    if (!analyticsUser) return [];
    return [...analyticsUser.history].sort((a, b) => a.month.localeCompare(b.month));
  }, [analyticsUser]);
  const analyticsChartPoints = useMemo(() => {
    if (analyticsHistory.length === 0) return '';
    const values = analyticsHistory.map((entry) => Number(entry.total || 0));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    return values
      .map((value, index) => {
        const x = analyticsHistory.length === 1 ? 50 : (index / (analyticsHistory.length - 1)) * 100;
        const y = 100 - ((value - min) / range) * 100;
        return `${x},${y}`;
      })
      .join(' ');
  }, [analyticsHistory]);
  const analyticsTrend = useMemo(() => {
    if (analyticsHistory.length < 2) {
      return {
        direction: 'neutral' as const,
        delta: 0,
        percent: null as number | null,
        first: null as number | null,
        last: null as number | null,
      };
    }
    const first = Number(analyticsHistory[0]?.total || 0);
    const last = Number(analyticsHistory[analyticsHistory.length - 1]?.total || 0);
    const delta = last - first;
    const percent = first > 0 ? (delta / first) * 100 : null;
    const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
    return { direction, delta, percent, first, last };
  }, [analyticsHistory]);

  return (
    <AdminPageLayout title="Проценты сотрудников" icon="💼" onBack={() => navigate('/adminpanel')}>
      {error && <Alert type="error">{error}</Alert>}
      <div className="pricing-section">
        <div className="data-card">
          <div className="card-header">
            <div className="card-title">
              <h4>Фильтры</h4>
            </div>
            <div className="card-actions">
              <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
                {loading ? 'Обновление…' : 'Обновить'}
              </Button>
            </div>
          </div>
          <div className="card-content">
            <div className="field-group earnings-filters-grid">
              <FormField label="Месяц">
                <input
                  type="month"
                  className="form-control"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                />
              </FormField>
              <FormField label="История (мес.)">
                <input
                  type="number"
                  min={1}
                  max={6}
                  className="form-control"
                  value={historyMonths}
                  onChange={(e) => setHistoryMonths(Number(e.target.value) || 3)}
                />
              </FormField>
              <FormField label="Департамент">
                <select
                  className="form-control"
                  value={departmentId === '' ? '' : departmentId}
                  onChange={(e) => setDepartmentId(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <option value="">Все департаменты</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </FormField>
            </div>
          </div>
        </div>
      </div>

      <div className="pricing-tabs earnings-tabs">
        <button
          type="button"
          className={`tab ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          Сводка
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          Аналитика
        </button>
      </div>

      {activeTab === 'summary' && (
        <>
          <div className="pricing-section">
            <div className="data-grid">
              <div className="data-card">
                <div className="card-header">
                  <div className="card-title">
                    <h4>Сводка</h4>
                  </div>
                </div>
                <div className="card-content">
                  <div className="earnings-summary earnings-summary--row">
                    <div className="earnings-summary-card">
                      <div className="earnings-summary-title">Активных сотрудников</div>
                      <div className="earnings-summary-value">{totalActive}</div>
                    </div>
                    <div className="earnings-summary-card">
                      <div className="earnings-summary-title">Средняя ЗП за период</div>
                      <div className="earnings-summary-value">{averageSalary.toFixed(2)} BYN</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pricing-section">
            <div className="data-card">
              <div className="card-header">
                <div className="card-title">
                  <h4>Сотрудники</h4>
                </div>
              </div>
              <div className="card-content">
                <div className="earnings-table-wrapper">
                  <table className="earnings-table">
                    <thead>
                      <tr>
                        <th>Сотрудник</th>
                        <th>Текущий месяц</th>
                        <th>Предыдущий месяц</th>
                        <th>Часы</th>
                        <th>Смены</th>
                        <th>Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="earnings-muted">
                            Нет данных за выбранный месяц
                          </td>
                        </tr>
                      )}
                      {rows.map((row) => (
                        <tr key={row.userId}>
                          <td>{row.name}</td>
                          <td>{Number(row.totalCurrentMonth).toFixed(2)} BYN</td>
                          <td>{Number(row.totalPreviousMonth).toFixed(2)} BYN</td>
                          <td>{Number(row.hours).toFixed(1)}</td>
                          <td>{row.shifts}</td>
                          <td>
                            <div className="earnings-actions">
                              <Button variant="secondary" size="sm" onClick={() => setDetailUser(row)}>
                                Детали
                              </Button>
                              <Button variant="secondary" size="sm" onClick={() => openShiftModal(row)}>
                                Часы
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {activeTab === 'analytics' && (
        <div className="pricing-section">
          <div className="data-card">
            <div className="card-header">
              <div className="card-title">
                <h4>Аналитика по сотруднику</h4>
              </div>
            </div>
            <div className="card-content">
              <div className="field-group earnings-analytics-grid">
                <FormField label="Сотрудник">
                  <select
                    className="form-control"
                    value={analyticsUser?.userId ?? ''}
                    onChange={(e) => setAnalyticsUserId(Number(e.target.value) || null)}
                  >
                    {rows.map((row) => (
                      <option key={row.userId} value={row.userId}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </FormField>
                <div className="earnings-trend-card">
                  <div className="earnings-trend-title">Тенденция за период</div>
                  {analyticsHistory.length < 2 ? (
                    <div className="earnings-muted">Недостаточно данных для расчета</div>
                  ) : (
                    <div className="earnings-trend-values">
                      <div className={`earnings-trend-indicator earnings-trend-indicator--${analyticsTrend.direction}`}>
                        {analyticsTrend.direction === 'up' && 'Рост'}
                        {analyticsTrend.direction === 'down' && 'Снижение'}
                        {analyticsTrend.direction === 'neutral' && 'Без изменений'}
                      </div>
                      <div className="earnings-trend-value">
                        {analyticsTrend.delta >= 0 ? '+' : ''}
                        {analyticsTrend.delta.toFixed(2)} BYN
                        {analyticsTrend.percent !== null && (
                          <span className="earnings-trend-percent">
                            ({analyticsTrend.percent >= 0 ? '+' : ''}
                            {analyticsTrend.percent.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                      <div className="earnings-trend-period">
                        {analyticsHistory[0].month} → {analyticsHistory[analyticsHistory.length - 1].month}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {analyticsHistory.length > 0 && (
                <>
                  <div className="earnings-chart">
                    <svg className="earnings-chart__svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <polyline className="earnings-chart__line" points={analyticsChartPoints} />
                      {analyticsHistory.map((entry, index) => {
                        const points = analyticsChartPoints.split(' ');
                        const point = points[index];
                        if (!point) return null;
                        const [x, y] = point.split(',');
                        return (
                          <circle
                            key={entry.month}
                            className="earnings-chart__dot"
                            cx={x}
                            cy={y}
                            r="2.5"
                          />
                        );
                      })}
                    </svg>
                    <div className="earnings-chart__labels">
                      {analyticsHistory.map((entry) => (
                        <span key={entry.month}>{entry.month}</span>
                      ))}
                    </div>
                  </div>
                  <div className="earnings-table-wrapper earnings-analytics-table">
                    <table className="earnings-table">
                      <thead>
                        <tr>
                          <th>Месяц</th>
                          <th>Начислено</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyticsHistory.map((entry) => (
                          <tr key={entry.month}>
                            <td>{entry.month}</td>
                            <td>{Number(entry.total).toFixed(2)} BYN</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={!!detailUser} onClose={() => setDetailUser(null)} title="Динамика начислений" size="md">
        {detailUser && (
          <table className="earnings-modal-table">
            <thead>
              <tr>
                <th>Месяц</th>
                <th>Начислено</th>
              </tr>
            </thead>
            <tbody>
              {detailUser.history.map((h) => (
                <tr key={h.month}>
                  <td>{h.month}</td>
                  <td>{Number(h.total).toFixed(2)} BYN</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      <Modal isOpen={!!shiftUser} onClose={() => setShiftUser(null)} title="Рабочие часы" size="lg">
        {shiftUser && (
          <>
            <div className="earnings-filters earnings-filters--compact">
              <FormField label="Дата">
                <input
                  type="date"
                  className="form-control"
                  value={newShiftDate}
                  onChange={(e) => setNewShiftDate(e.target.value)}
                />
              </FormField>
              <FormField label="Часы">
                <input
                  type="number"
                  className="form-control"
                  min={0}
                  step={0.5}
                  value={newShiftHours}
                  onChange={(e) => setNewShiftHours(e.target.value)}
                />
              </FormField>
              <Button variant="primary" onClick={handleShiftCreate} disabled={!newShiftDate || !newShiftHours}>
                Добавить
              </Button>
            </div>

            {shiftLoading ? (
              <div className="earnings-muted">Загрузка...</div>
            ) : (
              <table className="earnings-modal-table">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Часы</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {shiftRows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="earnings-muted">
                        Нет записей за месяц
                      </td>
                    </tr>
                  )}
                  {shiftRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.work_date}</td>
                      <td>
                        <input
                          type="number"
                          className="form-control form-control--compact"
                          min={0}
                          step={0.5}
                          value={row.hours}
                          onChange={(e) => {
                            const next = Number(e.target.value) || 0;
                            setShiftRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, hours: next } : r)));
                          }}
                        />
                      </td>
                      <td>
                        <Button variant="secondary" size="sm" onClick={() => handleShiftUpdate(row.id, row.hours)}>
                          Сохранить
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </Modal>
    </AdminPageLayout>
  );
};
