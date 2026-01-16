import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { Alert, Button, FormField, Modal } from '../../components/common';
import { getAdminEarnings, getShifts, updateShift, createShift } from '../../api';
import '../EarningsPage.css';

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
      const res = await getAdminEarnings({ month, history_months: historyMonths });
      setRows(Array.isArray(res.data?.users) ? res.data.users : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Не удалось загрузить проценты сотрудников');
    } finally {
      setLoading(false);
    }
  }, [month, historyMonths]);

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

  const totalActive = useMemo(() => rows.filter((r) => r.isActive).length, [rows]);

  return (
    <AdminPageLayout title="Проценты сотрудников" icon="💼" onBack={() => navigate('/adminpanel')}>
      {error && <Alert type="error">{error}</Alert>}
      <div className="earnings-filters">
        <FormField label="Месяц">
          <input
            type="month"
            className="form-input"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </FormField>
        <FormField label="История (мес.)">
          <input
            type="number"
            min={1}
            max={6}
            className="form-input"
            value={historyMonths}
            onChange={(e) => setHistoryMonths(Number(e.target.value) || 3)}
          />
        </FormField>
        <Button variant="secondary" onClick={loadData} disabled={loading}>
          {loading ? 'Обновление…' : 'Обновить'}
        </Button>
      </div>

      <div className="earnings-summary">
        <div className="earnings-summary-card">
          <div className="earnings-summary-title">Активных сотрудников</div>
          <div className="earnings-summary-value">{totalActive}</div>
        </div>
      </div>

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
            <div className="earnings-filters">
              <FormField label="Дата">
                <input
                  type="date"
                  className="form-input"
                  value={newShiftDate}
                  onChange={(e) => setNewShiftDate(e.target.value)}
                />
              </FormField>
              <FormField label="Часы">
                <input
                  type="number"
                  className="form-input"
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
                          className="form-input"
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
