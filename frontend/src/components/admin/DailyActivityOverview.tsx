import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';
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
    const todayStr = today.toISOString().split('T')[0];
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (dateString === todayStr) return 'Сегодня';
    if (dateString === yesterdayStr) return 'Вчера';
    return date.toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  const handleDateClick = (date: string) => {
    setSelectedDate(selectedDate === date ? null : date);
    onDateSelect?.(date);
  };

  const formatAmount = (n: number) =>
    n != null && Number.isFinite(n)
      ? `${Number(n).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BYN`
      : '—';

  if (loading) {
    return (
      <div className="daily-activity-overview">
        <div className="daily-activity-overview__skeleton">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded mb-4 w-1/3" />
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-gray-200 rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="daily-activity-overview">
        <div className="daily-activity-overview__error">
          <p>❌ {error}</p>
          <button
            type="button"
            onClick={loadData}
            className="mt-2 px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors"
          >
            Повторить
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { dailyTotals, dailyByUser, overallTotal } = data;
  const maxChartValue = Math.max(
    ...dailyTotals.map((d) => (chartMode === 'orders' ? d.orders_count : d.total_amount)),
    1
  );

  return (
    <div className="daily-activity-overview">
      <div className="daily-activity-overview__header">
        <h3 className="daily-activity-overview__title">
          📊 Активность операторов по дням
        </h3>
        <div className="daily-activity-overview__controls">
          <select
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
            className="daily-activity-overview__select"
          >
            <option value={7}>7 дней</option>
            <option value={14}>14 дней</option>
            <option value={30}>30 дней</option>
          </select>
          <select
            value={chartMode}
            onChange={(e) => setChartMode(e.target.value as 'orders' | 'revenue')}
            className="daily-activity-overview__select"
          >
            <option value="revenue">График: выручка</option>
            <option value="orders">График: заказы</option>
          </select>
        </div>
      </div>

      {/* Сводные карточки */}
      <div className="daily-activity-overview__summary">
        <div className="daily-activity-overview__card">
          <div className="daily-activity-overview__card-value">
            {overallTotal.orders_count}
          </div>
          <div className="daily-activity-overview__card-label">Всего заказов</div>
        </div>
        <div className="daily-activity-overview__card daily-activity-overview__card--accent">
          <div className="daily-activity-overview__card-value">
            {formatAmount(overallTotal.total_amount)}
          </div>
          <div className="daily-activity-overview__card-label">Общая сумма</div>
        </div>
        <div className="daily-activity-overview__card">
          <div className="daily-activity-overview__card-value">
            {dailyTotals.length > 0
              ? formatAmount(overallTotal.total_amount / dailyTotals.length)
              : '—'}
          </div>
          <div className="daily-activity-overview__card-label">Среднее за день</div>
        </div>
      </div>

      {/* График по дням */}
      <div className="daily-activity-overview__chart-section">
        <h4 className="daily-activity-overview__chart-title">
          {chartMode === 'revenue' ? 'Выручка по дням' : 'Заказы по дням'}
        </h4>
        <div className="daily-activity-overview__chart">
          {[...dailyTotals].reverse().map((d) => {
            const val = chartMode === 'orders' ? d.orders_count : d.total_amount;
            const height = maxChartValue > 0 ? (val / maxChartValue) * 100 : 0;
            return (
              <div key={d.date} className="daily-activity-overview__chart-bar-wrap">
                <div
                  className="daily-activity-overview__chart-bar"
                  style={{ height: `${Math.max(height, 2)}%` }}
                  title={`${formatDate(d.date)}: ${chartMode === 'revenue' ? formatAmount(val) : val} зак.`}
                />
                <div className="daily-activity-overview__chart-label">
                  {new Date(d.date + 'T12:00:00').toLocaleDateString('ru-RU', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Таблица по дням с раскрытием операторов */}
      <div className="daily-activity-overview__table-section">
        <h4 className="daily-activity-overview__table-title">Детали по дням</h4>
        <div className="daily-activity-overview__list">
          {dailyTotals.map((dayTotal) => {
            const dayUsers = dailyByUser.filter((u) => u.date === dayTotal.date);
            const isExpanded = selectedDate === dayTotal.date;

            return (
              <div key={dayTotal.date} className="daily-activity-overview__day">
                <button
                  type="button"
                  onClick={() => handleDateClick(dayTotal.date)}
                  className={`daily-activity-overview__day-btn ${isExpanded ? 'daily-activity-overview__day-btn--expanded' : ''}`}
                >
                  <div className="daily-activity-overview__day-main">
                    <div>
                      <span className="daily-activity-overview__day-date">
                        {formatDate(dayTotal.date)}
                      </span>
                      <span className="daily-activity-overview__day-num">
                        {dayTotal.date}
                      </span>
                    </div>
                    <div className="daily-activity-overview__day-stats">
                      <span>👥 {dayTotal.operators_count} опер.</span>
                      <span>📦 {dayTotal.orders_count} зак.</span>
                      <span className="daily-activity-overview__day-amount">
                        💰 {formatAmount(dayTotal.total_amount)}
                      </span>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="daily-activity-overview__day-detail">
                    <div className="daily-activity-overview__operators">
                      {dayUsers.length > 0 ? (
                        dayUsers.map((u) => (
                          <div
                            key={`${dayTotal.date}-${u.user_id ?? 'null'}`}
                            className="daily-activity-overview__operator"
                          >
                            <span className="daily-activity-overview__operator-name">
                              {u.user_name}
                            </span>
                            <span className="daily-activity-overview__operator-orders">
                              {u.orders_count} зак.
                            </span>
                            <span className="daily-activity-overview__operator-amount">
                              {formatAmount(u.total_amount)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="daily-activity-overview__operator daily-activity-overview__operator--empty">
                          Нет заказов за этот день
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
