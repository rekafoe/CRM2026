import React, { useEffect, useMemo, useState } from 'react';
import { AdminPageLayout } from '../../components/admin/AdminPageLayout';
import { api, getUsers } from '../../api';
import { parseNumberFlexible } from '../../utils/numberInput';
import '../../styles/admin-counters.css';

interface PrinterCounter {
  id: number;
  code: string;
  name: string;
  value: number | null;
  prev_value: number | null;
  difference?: number | null;
}

interface CashContribution {
  user_id: number;
  user_name?: string;
  amount: number;
}

export const CountersServicePage: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printerCounters, setPrinterCounters] = useState<PrinterCounter[]>([]);
  const [cashContributions, setCashContributions] = useState<CashContribution[]>([]);
  const [cashTotal, setCashTotal] = useState(0);
  const [users, setUsers] = useState<Array<{ id: number; name: string }>>([]);

  useEffect(() => {
    getUsers()
      .then((res) => setUsers(Array.isArray(res.data) ? res.data : []))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const countersResponse = await api.get(`/printers/counters?date=${selectedDate}`);
        const counters = Array.isArray(countersResponse.data)
          ? countersResponse.data.map((counter: any) => ({
              ...counter,
              difference:
                counter.value != null && counter.prev_value != null
                  ? counter.value - counter.prev_value
                  : null,
            }))
          : [];
        setPrinterCounters(counters);

        const ordersResponse = await api.get(`/reports/daily/${selectedDate}/orders`);
        const ordersForDate = Array.isArray(ordersResponse.data?.orders)
          ? ordersResponse.data.orders
          : [];
        const userNameById = new Map<number, string>(
          users.map((u) => [Number(u.id), u.name])
        );
        const contributionsByUser = new Map<number, number>();
        const total = ordersForDate.reduce((sum: number, order: any) => {
          const prepayment = parseNumberFlexible(order.prepaymentAmount ?? order.prepayment_amount ?? 0);
          const orderAmount = prepayment > 0 ? prepayment : 0;
          const rawUserId = order.userId ?? order.user_id ?? null;
          const userId = rawUserId != null ? Number(rawUserId) : null;
          if (userId && !Number.isNaN(userId) && orderAmount > 0) {
            contributionsByUser.set(userId, (contributionsByUser.get(userId) || 0) + orderAmount);
          }
          return sum + orderAmount;
        }, 0);

        const contributions = Array.from(contributionsByUser.entries()).map(([user_id, amount]) => ({
          user_id,
          user_name: userNameById.get(user_id) || `ID ${user_id}`,
          amount,
        }));
        setCashContributions(contributions);
        setCashTotal(total);
      } catch (err: any) {
        setError(err?.message || 'Ошибка загрузки данных');
        setPrinterCounters([]);
        setCashContributions([]);
        setCashTotal(0);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedDate, users]);

  const hasCashContributions = cashContributions.length > 0;
  const sortedCounters = useMemo(
    () => [...printerCounters].sort((a, b) => a.name.localeCompare(b.name)),
    [printerCounters]
  );

  return (
    <AdminPageLayout
      title="Счётчики касс и принтеров"
      icon="🧾"
      onBack={() => window.history.back()}
      className="admin-counters-page"
    >
      <div className="admin-counters-controls">
        <label>
          Дата:
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </label>
      </div>

      {error && <div className="admin-counters-error">{error}</div>}

      <div className="admin-counters-grid">
        <section className="admin-counters-card">
          <h3>🖨️ Принтеры</h3>
          {loading ? (
            <div className="admin-counters-loading">Загрузка...</div>
          ) : (
            <table className="admin-counters-table">
              <thead>
                <tr>
                  <th>Принтер</th>
                  <th>Пред. день</th>
                  <th>След. день</th>
                  <th>Разница</th>
                </tr>
              </thead>
              <tbody>
                {sortedCounters.map((counter) => (
                  <tr key={counter.id}>
                    <td>{counter.name}</td>
                    <td>{counter.prev_value ?? '—'}</td>
                    <td>{counter.value ?? '—'}</td>
                    <td>{counter.difference ?? '—'}</td>
                  </tr>
                ))}
                {sortedCounters.length === 0 && (
                  <tr>
                    <td colSpan={4} className="admin-counters-empty">
                      Нет данных по принтерам
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </section>

        <section className="admin-counters-card">
          <h3>💳 Касса</h3>
          {loading ? (
            <div className="admin-counters-loading">Загрузка...</div>
          ) : (
            <>
              <div className="admin-counters-cash-total">
                Итого за день: <strong>{cashTotal.toFixed(2)} BYN</strong>
              </div>
              <div className="admin-counters-cash-list">
                {hasCashContributions ? (
                  cashContributions.map((entry) => (
                    <div key={entry.user_id} className="admin-counters-cash-item">
                      <span>{entry.user_name}</span>
                      <span>{entry.amount.toFixed(2)} BYN</span>
                    </div>
                  ))
                ) : (
                  <div className="admin-counters-empty">Нет участников кассы за день</div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </AdminPageLayout>
  );
};

export default CountersServicePage;