import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, FormField, Modal } from '../../components/common';
import { AppIcon } from '../../components/ui/AppIcon';
import { getAdminEarnings, getShifts, updateShift, createShift, getDepartments, getPenalties, createPenalty, deletePenalty, getBonuses, createBonus, deleteBonus, type Department, type Penalty, type Bonus } from '../../api';
import './EarningsAdminPage.css';

type AdminUserRow = {
  userId: number;
  name: string;
  role: string;
  isActive: boolean;
  totalCurrentMonth: number;
  totalPreviousMonth: number;
  totalPenalties?: number;
  totalBonuses?: number;
  totalNet?: number;
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
  const [penaltyUser, setPenaltyUser] = useState<AdminUserRow | null>(null);
  const [penaltyList, setPenaltyList] = useState<Penalty[]>([]);
  const [penaltyTotal, setPenaltyTotal] = useState(0);
  const [penaltyLoading, setPenaltyLoading] = useState(false);
  const [newPenaltyAmount, setNewPenaltyAmount] = useState('');
  const [newPenaltyReason, setNewPenaltyReason] = useState('');
  const [newPenaltyDate, setNewPenaltyDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [bonusUser, setBonusUser] = useState<AdminUserRow | null>(null);
  const [bonusList, setBonusList] = useState<Bonus[]>([]);
  const [bonusTotal, setBonusTotal] = useState(0);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [newBonusAmount, setNewBonusAmount] = useState('');
  const [newBonusReason, setNewBonusReason] = useState('');
  const [newBonusDate, setNewBonusDate] = useState(() => new Date().toISOString().slice(0, 10));

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

  const openPenaltyModal = useCallback(async (user: AdminUserRow) => {
    setPenaltyUser(user);
    setPenaltyLoading(true);
    try {
      const res = await getPenalties({ user_id: user.userId, month });
      setPenaltyList(Array.isArray(res.data?.penalties) ? res.data.penalties : []);
      setPenaltyTotal(Number(res.data?.totalPenalties) || 0);
    } catch {
      setPenaltyList([]);
      setPenaltyTotal(0);
    } finally {
      setPenaltyLoading(false);
    }
    setNewPenaltyAmount('');
    setNewPenaltyReason('');
    setNewPenaltyDate(new Date().toISOString().slice(0, 10));
  }, [month]);

  const handlePenaltyCreate = useCallback(async () => {
    if (!penaltyUser) return;
    const amount = Number(newPenaltyAmount);
    if (!Number.isFinite(amount) || amount < 0) return;
    try {
      const res = await createPenalty({
        user_id: penaltyUser.userId,
        amount,
        reason: newPenaltyReason.trim() || undefined,
        penalty_date: newPenaltyDate,
      });
      setPenaltyList((prev) => [res.data as Penalty, ...prev]);
      setPenaltyTotal((t) => t + amount);
      setNewPenaltyAmount('');
      setNewPenaltyReason('');
      setNewPenaltyDate(new Date().toISOString().slice(0, 10));
      loadData();
    } catch (e: any) {
      console.error(e);
    }
  }, [penaltyUser, newPenaltyAmount, newPenaltyReason, newPenaltyDate, loadData]);

  const handlePenaltyDelete = useCallback(async (id: number, amount: number) => {
    try {
      await deletePenalty(id);
      setPenaltyList((prev) => prev.filter((p) => p.id !== id));
      setPenaltyTotal((t) => Math.max(0, t - amount));
      loadData();
    } catch (e: any) {
      console.error(e);
    }
  }, [loadData]);

  const openBonusModal = useCallback(async (user: AdminUserRow) => {
    setBonusUser(user);
    setBonusLoading(true);
    try {
      const res = await getBonuses({ user_id: user.userId, month });
      setBonusList(Array.isArray(res.data?.bonuses) ? res.data.bonuses : []);
      setBonusTotal(Number(res.data?.totalBonuses) || 0);
    } catch {
      setBonusList([]);
      setBonusTotal(0);
    } finally {
      setBonusLoading(false);
    }
    setNewBonusAmount('');
    setNewBonusReason('');
    setNewBonusDate(new Date().toISOString().slice(0, 10));
  }, [month]);

  const handleBonusCreate = useCallback(async () => {
    if (!bonusUser) return;
    const amount = Number(newBonusAmount);
    if (!Number.isFinite(amount) || amount < 0) return;
    try {
      const res = await createBonus({
        user_id: bonusUser.userId,
        amount,
        reason: newBonusReason.trim() || undefined,
        bonus_date: newBonusDate,
      });
      setBonusList((prev) => [res.data as Bonus, ...prev]);
      setBonusTotal((t) => t + amount);
      setNewBonusAmount('');
      setNewBonusReason('');
      setNewBonusDate(new Date().toISOString().slice(0, 10));
      loadData();
    } catch (e: any) {
      console.error(e);
    }
  }, [bonusUser, newBonusAmount, newBonusReason, newBonusDate, loadData]);

  const handleBonusDelete = useCallback(async (id: number, amount: number) => {
    try {
      await deleteBonus(id);
      setBonusList((prev) => prev.filter((b) => b.id !== id));
      setBonusTotal((t) => Math.max(0, t - amount));
      loadData();
    } catch (e: any) {
      console.error(e);
    }
  }, [loadData]);

  const activeRows = useMemo(() => rows.filter((r) => r.isActive), [rows]);
  const totalActive = useMemo(() => activeRows.length, [activeRows]);
  const averageSalary = useMemo(() => {
    if (activeRows.length === 0) return 0;
    const total = activeRows.reduce((sum, row) => sum + Number(row.totalCurrentMonth || 0), 0);
    return total / activeRows.length;
  }, [activeRows]);
  const totalSalary = useMemo(() => rows.reduce((s, r) => s + Number(r.totalCurrentMonth || 0), 0), [rows]);

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
      return { direction: 'neutral' as const, delta: 0, percent: null as number | null };
    }
    const first = Number(analyticsHistory[0]?.total || 0);
    const last = Number(analyticsHistory[analyticsHistory.length - 1]?.total || 0);
    const delta = last - first;
    const percent = first > 0 ? (delta / first) * 100 : null;
    const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral';
    return { direction, delta, percent };
  }, [analyticsHistory]);

  return (
    <div className="earn-admin">
      {/* Header */}
      <div className="earn-admin__header">
        <div className="earn-admin__header-left">
          <Button variant="secondary" size="sm" onClick={() => navigate('/adminpanel')}>
            ← Назад
          </Button>
          <div className="earn-admin__title-row">
            <AppIcon name="briefcase" size="lg" circle />
            <div>
              <h1 className="earn-admin__title">Проценты сотрудников</h1>
              <p className="earn-admin__subtitle">Начисления, аналитика и управление часами</p>
            </div>
          </div>
        </div>
        <div className="earn-admin__header-actions">
          <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
            {loading ? 'Обновление…' : <><AppIcon name="refresh" size="xs" /> Обновить</>}
          </Button>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Stats */}
      <div className="earn-admin__stats">
        <div className="earn-stat-card">
          <div className="earn-stat-card__header">
            <span className="earn-stat-card__label">Активных сотрудников</span>
            <span className="earn-stat-card__icon"><AppIcon name="users" size="sm" /></span>
          </div>
          <div className="earn-stat-card__value">{totalActive}</div>
          <div className="earn-stat-card__trend earn-stat-card__trend--neutral">Из {rows.length} всего</div>
        </div>
        <div className="earn-stat-card">
          <div className="earn-stat-card__header">
            <span className="earn-stat-card__label">Средняя ЗП</span>
            <span className="earn-stat-card__icon"><AppIcon name="chart" size="sm" /></span>
          </div>
          <div className="earn-stat-card__value">{averageSalary.toFixed(0)}</div>
          <div className="earn-stat-card__trend earn-stat-card__trend--neutral">BYN за период</div>
        </div>
        <div className="earn-stat-card">
          <div className="earn-stat-card__header">
            <span className="earn-stat-card__label">Всего начислено</span>
            <span className="earn-stat-card__icon"><AppIcon name="money" size="sm" /></span>
          </div>
          <div className="earn-stat-card__value">{totalSalary.toFixed(0)}</div>
          <div className="earn-stat-card__trend">BYN за {month}</div>
        </div>
        <div className="earn-stat-card">
          <div className="earn-stat-card__header">
            <span className="earn-stat-card__label">Департаментов</span>
            <span className="earn-stat-card__icon"><AppIcon name="building" size="sm" /></span>
          </div>
          <div className="earn-stat-card__value">{departments.length}</div>
          <div className="earn-stat-card__trend earn-stat-card__trend--neutral">В системе</div>
        </div>
      </div>

      {/* Filters */}
      <div className="earn-admin__filters">
        <div className="earn-admin__filters-row">
          <FormField label="Месяц">
            <input type="month" className="earn-filter-input" value={month} onChange={(e) => setMonth(e.target.value)} />
          </FormField>
          <FormField label="История (мес.)">
            <input type="number" min={1} max={6} className="earn-filter-input" value={historyMonths} onChange={(e) => setHistoryMonths(Number(e.target.value) || 3)} />
          </FormField>
          <FormField label="Департамент">
            <select
              className="earn-filter-select"
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

      {/* Tabs */}
      <div className="earn-admin__tabs">
        <button
          type="button"
          className={`earn-tab ${activeTab === 'summary' ? 'earn-tab--active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          Сводка
        </button>
        <button
          type="button"
          className={`earn-tab ${activeTab === 'analytics' ? 'earn-tab--active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          Аналитика
        </button>
      </div>

      {/* Summary tab */}
      {activeTab === 'summary' && (
        <div className="earn-admin__card">
          <div className="earn-admin__card-header">
            <h3>Сотрудники</h3>
            <span className="earn-admin__card-badge">{rows.length}</span>
          </div>
          <div className="earn-table-wrapper">
            <table className="earn-table">
              <thead>
                <tr>
                  <th>Сотрудник</th>
                  <th>Текущий месяц</th>
                  <th>Премии</th>
                  <th>Штрафы</th>
                  <th>К выплате</th>
                  <th>Пред. месяц</th>
                  <th>Часы</th>
                  <th>Смены</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
                      Нет данных за выбранный месяц
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.userId}>
                    <td className="earn-cell-name">{row.name}</td>
                    <td className="earn-cell-money">{Number(row.totalCurrentMonth).toFixed(2)} BYN</td>
                    <td className="earn-cell-money earn-cell-money--bonus">
                      +{Number(row.totalBonuses ?? 0).toFixed(2)} BYN
                    </td>
                    <td className="earn-cell-money earn-cell-money--penalty">
                      −{Number(row.totalPenalties ?? 0).toFixed(2)} BYN
                    </td>
                    <td className="earn-cell-money earn-cell-money--net">
                      {Number(row.totalNet ?? row.totalCurrentMonth).toFixed(2)} BYN
                    </td>
                    <td>{Number(row.totalPreviousMonth).toFixed(2)} BYN</td>
                    <td>{Number(row.hours).toFixed(1)}</td>
                    <td>{row.shifts}</td>
                    <td>
                      <div className="earn-row-actions">
                        <Button variant="secondary" size="sm" onClick={() => setDetailUser(row)}>
                          Детали
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => openBonusModal(row)}>
                          Премии
                        </Button>
                        <Button variant="secondary" size="sm" onClick={() => openPenaltyModal(row)}>
                          Штрафы
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
      )}

      {/* Analytics tab */}
      {activeTab === 'analytics' && (
        <div className="earn-admin__card">
          <div className="earn-admin__card-header">
            <h3>Аналитика по сотруднику</h3>
          </div>
          <div className="earn-analytics">
            <div className="earn-analytics__controls">
              <FormField label="Сотрудник">
                <select
                  className="earn-filter-select"
                  value={analyticsUser?.userId ?? ''}
                  onChange={(e) => setAnalyticsUserId(Number(e.target.value) || null)}
                >
                  {rows.map((row) => (
                    <option key={row.userId} value={row.userId}>{row.name}</option>
                  ))}
                </select>
              </FormField>

              {analyticsHistory.length >= 2 && (
                <div className="earn-trend-card">
                  <div className={`earn-trend-badge earn-trend-badge--${analyticsTrend.direction}`}>
                    {analyticsTrend.direction === 'up' && '↑ Рост'}
                    {analyticsTrend.direction === 'down' && '↓ Снижение'}
                    {analyticsTrend.direction === 'neutral' && '— Без изменений'}
                  </div>
                  <div className="earn-trend-value">
                    {analyticsTrend.delta >= 0 ? '+' : ''}{analyticsTrend.delta.toFixed(2)} BYN
                    {analyticsTrend.percent !== null && (
                      <span className="earn-trend-pct">
                        ({analyticsTrend.percent >= 0 ? '+' : ''}{analyticsTrend.percent.toFixed(1)}%)
                      </span>
                    )}
                  </div>
                  <div className="earn-trend-period">
                    {analyticsHistory[0].month} → {analyticsHistory[analyticsHistory.length - 1].month}
                  </div>
                </div>
              )}
            </div>

            {analyticsHistory.length > 0 && (
              <>
                <div className="earn-chart">
                  <svg className="earn-chart__svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polyline className="earn-chart__line" points={analyticsChartPoints} />
                    {analyticsHistory.map((entry, index) => {
                      const points = analyticsChartPoints.split(' ');
                      const point = points[index];
                      if (!point) return null;
                      const [x, y] = point.split(',');
                      return <circle key={entry.month} className="earn-chart__dot" cx={x} cy={y} r="2.5" />;
                    })}
                  </svg>
                  <div className="earn-chart__labels">
                    {analyticsHistory.map((entry) => (
                      <span key={entry.month}>{entry.month}</span>
                    ))}
                  </div>
                </div>
                <div className="earn-table-wrapper" style={{ marginTop: 16 }}>
                  <table className="earn-table">
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
                          <td className="earn-cell-money">{Number(entry.total).toFixed(2)} BYN</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Detail modal */}
      <Modal isOpen={!!detailUser} onClose={() => setDetailUser(null)} title="Динамика начислений" size="md">
        {detailUser && (
          <div className="earn-table-wrapper">
            <table className="earn-table">
              <thead>
                <tr><th>Месяц</th><th>Начислено</th></tr>
              </thead>
              <tbody>
                {detailUser.history.map((h) => (
                  <tr key={h.month}>
                    <td>{h.month}</td>
                    <td className="earn-cell-money">{Number(h.total).toFixed(2)} BYN</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* Shift modal */}
      <Modal isOpen={!!shiftUser} onClose={() => setShiftUser(null)} title="Рабочие часы" size="lg">
        {shiftUser && (
          <>
            <div className="earn-shift-form">
              <FormField label="Дата">
                <input type="date" className="earn-filter-input" value={newShiftDate} onChange={(e) => setNewShiftDate(e.target.value)} />
              </FormField>
              <FormField label="Часы">
                <input type="number" className="earn-filter-input" min={0} step={0.5} value={newShiftHours} onChange={(e) => setNewShiftHours(e.target.value)} />
              </FormField>
              <Button variant="primary" onClick={handleShiftCreate} disabled={!newShiftDate || !newShiftHours}>
                Добавить
              </Button>
            </div>

            {shiftLoading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>Загрузка...</div>
            ) : (
              <div className="earn-table-wrapper">
                <table className="earn-table">
                  <thead>
                    <tr><th>Дата</th><th>Часы</th><th>Действия</th></tr>
                  </thead>
                  <tbody>
                    {shiftRows.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
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
                            className="earn-filter-input earn-filter-input--compact"
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
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Penalty modal — выписка штрафов */}
      <Modal isOpen={!!penaltyUser} onClose={() => setPenaltyUser(null)} title={penaltyUser ? `Штрафы: ${penaltyUser.name}` : 'Штрафы'} size="lg">
        {penaltyUser && (
          <>
            <div className="earn-shift-form earn-penalty-form">
              <FormField label="Сумма (BYN)">
                <input type="number" className="earn-filter-input" min={0} step={0.01} value={newPenaltyAmount} onChange={(e) => setNewPenaltyAmount(e.target.value)} />
              </FormField>
              <FormField label="Причина">
                <input type="text" className="earn-filter-input" placeholder="Опционально" value={newPenaltyReason} onChange={(e) => setNewPenaltyReason(e.target.value)} />
              </FormField>
              <FormField label="Дата">
                <input type="date" className="earn-filter-input" value={newPenaltyDate} onChange={(e) => setNewPenaltyDate(e.target.value)} />
              </FormField>
              <Button variant="primary" onClick={handlePenaltyCreate} disabled={newPenaltyAmount === '' || Number(newPenaltyAmount) < 0}>
                Выписать штраф
              </Button>
            </div>
            <div className="earn-penalty-summary">
              Итого штрафов за {month}: <strong>{penaltyTotal.toFixed(2)} BYN</strong>
              {' · '}
              К выплате: <strong>{Math.max(0, (penaltyUser.totalCurrentMonth ?? 0) + (penaltyUser.totalBonuses ?? 0) - penaltyTotal).toFixed(2)} BYN</strong>
            </div>
            {penaltyLoading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>Загрузка...</div>
            ) : (
              <div className="earn-table-wrapper">
                <table className="earn-table">
                  <thead>
                    <tr><th>Дата</th><th>Сумма</th><th>Причина</th><th></th></tr>
                  </thead>
                  <tbody>
                    {penaltyList.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                          Нет штрафов за выбранный месяц
                        </td>
                      </tr>
                    )}
                    {penaltyList.map((p) => (
                      <tr key={p.id}>
                        <td>{p.penaltyDate}</td>
                        <td className="earn-cell-money">{Number(p.amount).toFixed(2)} BYN</td>
                        <td>{p.reason || '—'}</td>
                        <td>
                          <Button variant="secondary" size="sm" onClick={() => handlePenaltyDelete(p.id, p.amount)}>
                            Удалить
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Bonus modal — начисление премий */}
      <Modal isOpen={!!bonusUser} onClose={() => setBonusUser(null)} title={bonusUser ? `Премии: ${bonusUser.name}` : 'Премии'} size="lg">
        {bonusUser && (
          <>
            <div className="earn-shift-form earn-penalty-form">
              <FormField label="Сумма (BYN)">
                <input type="number" className="earn-filter-input" min={0} step={0.01} value={newBonusAmount} onChange={(e) => setNewBonusAmount(e.target.value)} />
              </FormField>
              <FormField label="Причина">
                <input type="text" className="earn-filter-input" placeholder="Опционально" value={newBonusReason} onChange={(e) => setNewBonusReason(e.target.value)} />
              </FormField>
              <FormField label="Дата">
                <input type="date" className="earn-filter-input" value={newBonusDate} onChange={(e) => setNewBonusDate(e.target.value)} />
              </FormField>
              <Button variant="primary" onClick={handleBonusCreate} disabled={newBonusAmount === '' || Number(newBonusAmount) < 0}>
                Начислить премию
              </Button>
            </div>
            <div className="earn-bonus-summary">
              Итого премий за {month}: <strong>+{bonusTotal.toFixed(2)} BYN</strong>
              {' · '}
              К выплате: <strong>{Math.max(0, (bonusUser.totalCurrentMonth ?? 0) + bonusTotal - (bonusUser.totalPenalties ?? 0)).toFixed(2)} BYN</strong>
            </div>
            {bonusLoading ? (
              <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>Загрузка...</div>
            ) : (
              <div className="earn-table-wrapper">
                <table className="earn-table">
                  <thead>
                    <tr><th>Дата</th><th>Сумма</th><th>Причина</th><th></th></tr>
                  </thead>
                  <tbody>
                    {bonusList.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: '#94a3b8' }}>
                          Нет премий за выбранный месяц
                        </td>
                      </tr>
                    )}
                    {bonusList.map((b) => (
                      <tr key={b.id}>
                        <td>{b.bonusDate}</td>
                        <td className="earn-cell-money">+{Number(b.amount).toFixed(2)} BYN</td>
                        <td>{b.reason || '—'}</td>
                        <td>
                          <Button variant="secondary" size="sm" onClick={() => handleBonusDelete(b.id, b.amount)}>
                            Удалить
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
};
