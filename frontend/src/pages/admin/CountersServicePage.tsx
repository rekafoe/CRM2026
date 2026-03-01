import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/common';
import { AppIcon } from '../../components/ui/AppIcon';
import { api, getUsers, getPrinterCountersByMonth, getDailyCashByMonth } from '../../api';
import { parseNumberFlexible } from '../../utils/numberInput';
import './CountersServicePage.css';

type Mode = 'day' | 'month';

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

interface DayCardData {
  date: string;
  printerDiff: number;
  cash: number;
}

export const CountersServicePage: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('day');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printerCounters, setPrinterCounters] = useState<PrinterCounter[]>([]);
  const [cashContributions, setCashContributions] = useState<CashContribution[]>([]);
  const [cashTotal, setCashTotal] = useState(0);
  const [users, setUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [monthData, setMonthData] = useState<DayCardData[]>([]);

  const previousDateLabel = useMemo(() => {
    const base = new Date(selectedDate);
    if (Number.isNaN(base.getTime())) return 'вчера';
    base.setDate(base.getDate() - 1);
    return base.toISOString().split('T')[0];
  }, [selectedDate]);

  useEffect(() => {
    getUsers()
      .then((res) => setUsers(Array.isArray(res.data) ? res.data : []))
      .catch(() => setUsers([]));
  }, []);

  const loadDayData = useCallback(async () => {
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
      const idNameById = new Map<number, string>(
        users.map((u) => [Number(u.id), `ID ${u.id}`])
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
        user_name: userNameById.get(user_id) || idNameById.get(user_id),
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
  }, [selectedDate, users]);

  const loadMonthData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [countersRes, cashRes] = await Promise.all([
        getPrinterCountersByMonth(selectedMonth),
        getDailyCashByMonth(selectedMonth),
      ]);

      const countersData = countersRes.data as { month?: string; dates?: string[]; byDate?: Record<string, any[]> };
      const cashData = cashRes.data as { month?: string; byDate?: Record<string, { total: number }> };

      const dates = countersData?.dates ?? [];
      const byDate = countersData?.byDate ?? {};
      const cashByDate = cashData?.byDate ?? {};

      const cards: DayCardData[] = dates.map((date) => {
        const printers = byDate[date] ?? [];
        const printerDiff = printers.reduce((s: number, p: any) => s + (p.difference ?? 0), 0);
        const cash = cashByDate[date]?.total ?? 0;
        return { date, printerDiff, cash };
      });

      setMonthData(cards);
    } catch (err: any) {
      setError(err?.message || 'Ошибка загрузки данных');
      setMonthData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (mode === 'day') loadDayData();
    else loadMonthData();
  }, [mode, loadDayData, loadMonthData]);

  const sortedCounters = useMemo(
    () => [...printerCounters].sort((a, b) => a.name.localeCompare(b.name)),
    [printerCounters]
  );

  const totalDifference = useMemo(
    () => sortedCounters.reduce((s, c) => s + (c.difference ?? 0), 0),
    [sortedCounters]
  );

  return (
    <div className="cnt-page">
      {/* Header */}
      <div className="cnt-page__header">
        <div className="cnt-page__header-left">
          <Button variant="secondary" size="sm" onClick={() => navigate('/adminpanel')}>
            ← Назад
          </Button>
          <div className="cnt-page__title-row">
            <AppIcon name="receipt" size="lg" circle />
            <div>
              <h1 className="cnt-page__title">Счётчики касс и принтеров</h1>
              <p className="cnt-page__subtitle">Дневная статистика печати и кассовых операций</p>
            </div>
          </div>
        </div>
        <div className="cnt-page__header-actions">
          <div className="cnt-mode-tabs">
            <button
              type="button"
              className={`cnt-mode-tab ${mode === 'day' ? 'cnt-mode-tab--active' : ''}`}
              onClick={() => setMode('day')}
            >
              День
            </button>
            <button
              type="button"
              className={`cnt-mode-tab ${mode === 'month' ? 'cnt-mode-tab--active' : ''}`}
              onClick={() => setMode('month')}
            >
              Месяц
            </button>
          </div>
          {mode === 'day' ? (
            <input
              type="date"
              className="cnt-date-input"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          ) : (
            <input
              type="month"
              className="cnt-date-input"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          )}
        </div>
      </div>

      {error && <div className="cnt-page__error">{error}</div>}

      {/* Month grid — только в режиме Месяц */}
      {mode === 'month' && (
        <div className="cnt-month-section">
          <h3 className="cnt-month-section__title">Счётчики по дням месяца</h3>
          {loading ? (
            <div className="cnt-month-loading">Загрузка...</div>
          ) : (
            <div className="cnt-month-grid">
              {monthData.map((card) => (
                <div key={card.date} className="cnt-day-card">
                  <div className="cnt-day-card__date">{card.date}</div>
                  <div className="cnt-day-card__row">
                    <span className="cnt-day-card__label">Принтеры</span>
                    <span className="cnt-day-card__value cnt-day-card__value--print">
                      {card.printerDiff > 0 ? `+${card.printerDiff}` : card.printerDiff}
                    </span>
                  </div>
                  <div className="cnt-day-card__row">
                    <span className="cnt-day-card__label">Касса</span>
                    <span className="cnt-day-card__value cnt-day-card__value--cash">
                      {card.cash.toFixed(0)} BYN
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats и таблицы — только в режиме День */}
      {mode === 'day' && (
      <>
      <div className="cnt-page__stats">
        <div className="cnt-stat-card">
          <div className="cnt-stat-card__header">
            <span className="cnt-stat-card__label">Принтеров</span>
            <span className="cnt-stat-card__icon-box"><AppIcon name="printer" size="sm" /></span>
          </div>
          <div className="cnt-stat-card__value">{sortedCounters.length}</div>
          <div className="cnt-stat-card__trend cnt-stat-card__trend--neutral">С данными за день</div>
        </div>
        <div className="cnt-stat-card">
          <div className="cnt-stat-card__header">
            <span className="cnt-stat-card__label">Общая разница</span>
            <span className="cnt-stat-card__icon-box"><AppIcon name="chart" size="sm" /></span>
          </div>
          <div className="cnt-stat-card__value">{totalDifference}</div>
          <div className="cnt-stat-card__trend">Отпечатков за день</div>
        </div>
        <div className="cnt-stat-card">
          <div className="cnt-stat-card__header">
            <span className="cnt-stat-card__label">Касса за день</span>
            <span className="cnt-stat-card__icon-box"><AppIcon name="card" size="sm" /></span>
          </div>
          <div className="cnt-stat-card__value">{cashTotal.toFixed(0)}</div>
          <div className="cnt-stat-card__trend">BYN</div>
        </div>
        <div className="cnt-stat-card">
          <div className="cnt-stat-card__header">
            <span className="cnt-stat-card__label">Участников кассы</span>
            <span className="cnt-stat-card__icon-box"><AppIcon name="users" size="sm" /></span>
          </div>
          <div className="cnt-stat-card__value">{cashContributions.length}</div>
          <div className="cnt-stat-card__trend cnt-stat-card__trend--neutral">За {selectedDate}</div>
        </div>
      </div>

      {/* Content */}
      <div className="cnt-page__grid">
        {/* Printers */}
        <div className="cnt-card">
          <div className="cnt-card__header">
            <h3><AppIcon name="printer" size="xs" /> Принтеры</h3>
            <span className="cnt-card__badge">{sortedCounters.length}</span>
          </div>
          {loading ? (
            <div className="cnt-card__loading">Загрузка...</div>
          ) : (
            <div className="cnt-table-wrapper">
              <table className="cnt-table">
                <thead>
                  <tr>
                    <th>Принтер</th>
                    <th>Вчера ({previousDateLabel})</th>
                    <th>Сегодня ({selectedDate})</th>
                    <th>Разница</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCounters.map((counter) => (
                    <tr key={counter.id}>
                      <td className="cnt-cell-name">{counter.name}</td>
                      <td>{counter.prev_value ?? '—'}</td>
                      <td>{counter.value ?? '—'}</td>
                      <td>
                        {counter.difference != null ? (
                          <span className={`cnt-diff ${counter.difference > 0 ? 'cnt-diff--positive' : ''}`}>
                            {counter.difference > 0 ? '+' : ''}{counter.difference}
                          </span>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                  {sortedCounters.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', padding: '48px 24px', color: '#94a3b8' }}>
                        Нет данных по принтерам
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Cash */}
        <div className="cnt-card">
          <div className="cnt-card__header">
            <h3><AppIcon name="card" size="xs" /> Касса</h3>
            <span className="cnt-card__badge cnt-card__badge--green">{cashTotal.toFixed(2)} BYN</span>
          </div>
          {loading ? (
            <div className="cnt-card__loading">Загрузка...</div>
          ) : cashContributions.length > 0 ? (
            <div className="cnt-cash-list">
              {cashContributions.map((entry) => (
                <div key={entry.user_id} className="cnt-cash-item">
                  <div className="cnt-cash-item__user">
                    <span className="cnt-cash-item__avatar"><AppIcon name="user" size="xs" /></span>
                    <span className="cnt-cash-item__name">{entry.user_name}</span>
                  </div>
                  <span className="cnt-cash-item__amount">{entry.amount.toFixed(2)} BYN</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="cnt-card__empty">Нет участников кассы за день</div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
};

export default CountersServicePage;
