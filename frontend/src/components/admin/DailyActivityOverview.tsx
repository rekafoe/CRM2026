import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../api';
import { MoneyAmount } from '../ui';
import './DailyActivityOverview.css';

interface DailyByUser {
  date: string;
  user_id: number | null;
  user_name: string;
  orders_count: number;
  total_amount: number;
}

interface DailyTotal {
  date: string;
  orders_count: number;
  total_amount: number;
  operators_count: number;
}

interface DailyActivityData {
  period: { startDate: string; endDate: string; days: number };
  dailyByUser: DailyByUser[];
  dailyTotals: DailyTotal[];
  overallTotal: { orders_count: number; total_amount: number };
}

interface DailyActivityOverviewProps {
  onDateSelect?: (date: string) => void;
}

const PERIODS = [7, 14, 30] as const;

function formatIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function recentDates(days: number) {
  const dates: string[] = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    dates.push(formatIso(date));
  }
  return dates;
}

function plural(count: number, one: string, few: string, many: string) {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export const DailyActivityOverview: React.FC<DailyActivityOverviewProps> = ({
  onDateSelect,
}) => {
  const [data, setData] = useState<DailyActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [period, setPeriod] = useState<number>(14);
  const [chartMode, setChartMode] = useState<'orders' | 'revenue'>('revenue');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<DailyActivityData>(
        `/reports/analytics/daily-activity?period=${period}`
      );
      setData(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString + 'T12:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateString === formatIso(today)) return 'Сегодня';
    if (dateString === formatIso(yesterday)) return 'Вчера';
    return date.toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  const formatAmountText = (n: number) =>
    Number.isFinite(n)
      ? `${Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} бел. руб.`
      : '—';

  const timeline = useMemo(() => {
    const totals = data?.dailyTotals ?? [];
    const byDate = new Map(totals.map((day) => [day.date, day]));
    const dates = new Set(recentDates(period));
    totals.forEach((day) => dates.add(day.date));
    return [...dates].sort().map((date) => byDate.get(date) ?? {
      date,
      orders_count: 0,
      total_amount: 0,
      operators_count: 0,
    });
  }, [data, period]);

  const activeDays = useMemo(
    () => timeline.filter((day) => day.orders_count > 0).slice().reverse(),
    [timeline],
  );

  const handleDateClick = (date: string) => {
    setSelectedDate(selectedDate === date ? null : date);
    onDateSelect?.(date);
  };

  if (loading && !data) {
    return (
      <div className="daily-activity-overview" aria-busy="true">
        <div className="daily-activity-overview__skeleton">
          <div className="daily-activity-overview__skeleton-row" />
          <div className="daily-activity-overview__skeleton-cards" />
          <div className="daily-activity-overview__skeleton-chart" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="daily-activity-overview">
        <div className="daily-activity-overview__error">
          <p>{error}</p>
          <button type="button" className="daily-activity-overview__retry" onClick={loadData}>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { dailyByUser, overallTotal } = data;
  const periodDays = Math.max(timeline.length, 1);
  const average = overallTotal.total_amount / periodDays;
  const hasActivity = overallTotal.orders_count > 0;
  const maxChartValue = Math.max(
    ...timeline.map((day) => (chartMode === 'orders' ? day.orders_count : day.total_amount)),
    1,
  );
  const labelStep = timeline.length > 20 ? 5 : timeline.length > 10 ? 2 : 1;

  return (
    <div className="daily-activity-overview">
      <div className="daily-activity-overview__toolbar">
        <div className="daily-activity-overview__pills" role="group" aria-label="Период">
          {PERIODS.map((days) => (
            <button
              key={days}
              type="button"
              className={`daily-activity-overview__pill${period === days ? ' daily-activity-overview__pill--active' : ''}`}
              onClick={() => setPeriod(days)}
              aria-pressed={period === days}
            >
              {days} дней
            </button>
          ))}
        </div>
        <div className="daily-activity-overview__pills" role="group" aria-label="Что показать на графике">
          <button
            type="button"
            className={`daily-activity-overview__pill${chartMode === 'revenue' ? ' daily-activity-overview__pill--active' : ''}`}
            onClick={() => setChartMode('revenue')}
            aria-pressed={chartMode === 'revenue'}
          >
            Выручка
          </button>
          <button
            type="button"
            className={`daily-activity-overview__pill${chartMode === 'orders' ? ' daily-activity-overview__pill--active' : ''}`}
            onClick={() => setChartMode('orders')}
            aria-pressed={chartMode === 'orders'}
          >
            Заказы
          </button>
        </div>
      </div>

      <div className="daily-activity-overview__summary">
        <div className="daily-activity-overview__card">
          <div className="daily-activity-overview__card-label">Заказы</div>
          <div className="daily-activity-overview__card-value">{overallTotal.orders_count}</div>
        </div>
        <div className="daily-activity-overview__card daily-activity-overview__card--accent">
          <div className="daily-activity-overview__card-label">Сумма</div>
          <div className="daily-activity-overview__card-value">
            <MoneyAmount value={overallTotal.total_amount} />
          </div>
        </div>
        <div className="daily-activity-overview__card">
          <div className="daily-activity-overview__card-label">В среднем за день</div>
          <div className="daily-activity-overview__card-value">
            <MoneyAmount value={average} />
          </div>
        </div>
      </div>

      {hasActivity ? (
        <>
          <div className="daily-activity-overview__chart-section">
            <h3 className="daily-activity-overview__chart-title">
              {chartMode === 'revenue' ? 'Выручка по дням' : 'Заказы по дням'}
            </h3>
            <div className="daily-activity-overview__chart">
              {timeline.map((day, index) => {
                const value = chartMode === 'orders' ? day.orders_count : day.total_amount;
                const height = value > 0 && maxChartValue > 0 ? (value / maxChartValue) * 100 : 0;
                const showLabel = index % labelStep === 0 || index === timeline.length - 1;
                const tip = chartMode === 'revenue'
                  ? `${formatDate(day.date)}: ${formatAmountText(value)}`
                  : `${formatDate(day.date)}: ${value} ${plural(value, 'заказ', 'заказа', 'заказов')}`;
                return (
                  <div key={day.date} className="daily-activity-overview__chart-bar-wrap" title={tip}>
                    <div className="daily-activity-overview__chart-track">
                      <div
                        className={`daily-activity-overview__chart-bar${value <= 0 ? ' daily-activity-overview__chart-bar--zero' : ''}`}
                        style={value > 0 ? { height: `${Math.max(height, 8)}%` } : undefined}
                      />
                    </div>
                    <div className="daily-activity-overview__chart-label">
                      {showLabel
                        ? new Date(day.date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric' })
                        : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="daily-activity-overview__table-section">
            <h3 className="daily-activity-overview__table-title">Дни с заказами</h3>
            <div className="daily-activity-overview__list">
              {activeDays.map((dayTotal) => {
                const dayUsers = dailyByUser.filter((user) => user.date === dayTotal.date);
                const isExpanded = selectedDate === dayTotal.date;
                return (
                  <div key={dayTotal.date} className="daily-activity-overview__day">
                    <button
                      type="button"
                      onClick={() => handleDateClick(dayTotal.date)}
                      className={`daily-activity-overview__day-btn${isExpanded ? ' daily-activity-overview__day-btn--expanded' : ''}`}
                      aria-expanded={isExpanded}
                    >
                      <span className="daily-activity-overview__day-date">
                        {formatDate(dayTotal.date)}
                        <span className="daily-activity-overview__day-num">{dayTotal.date}</span>
                      </span>
                      <span className="daily-activity-overview__day-stats">
                        <span>
                          {dayTotal.operators_count} {plural(dayTotal.operators_count, 'оператор', 'оператора', 'операторов')}
                        </span>
                        <span>
                          {dayTotal.orders_count} {plural(dayTotal.orders_count, 'заказ', 'заказа', 'заказов')}
                        </span>
                        <span className="daily-activity-overview__day-amount">
                          <MoneyAmount value={dayTotal.total_amount} />
                        </span>
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="daily-activity-overview__day-detail">
                        {dayUsers.length > 0 ? (
                          dayUsers.map((user) => (
                            <div
                              key={`${dayTotal.date}-${user.user_id ?? 'null'}`}
                              className="daily-activity-overview__operator"
                            >
                              <span className="daily-activity-overview__operator-name">{user.user_name}</span>
                              <span className="daily-activity-overview__operator-orders">
                                {user.orders_count} {plural(user.orders_count, 'заказ', 'заказа', 'заказов')}
                              </span>
                              <span className="daily-activity-overview__operator-amount">
                                <MoneyAmount value={user.total_amount} />
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="daily-activity-overview__operator daily-activity-overview__operator--empty">
                            Заказов за этот день нет
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <p className="daily-activity-overview__empty">
          За {period} {plural(period, 'день', 'дня', 'дней')} заказов не было.
        </p>
      )}
    </div>
  );
};
