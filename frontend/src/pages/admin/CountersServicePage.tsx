import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/common';
import { AppIcon, MoneyAmount, BynSymbol } from '../../components/ui';
import { getPrinterCountersByDate, getPrinterCountersByMonth, getDailyCashByMonth, getCashRegisterDay, getDepartmentCashActual, getDepartments, type Department } from '../../api';
import { addCalendarDaysLocal, todayCalendarLocal } from '../../utils/numberInput';
import {
  GAP_DIRECTION_LABEL,
  cashExpectedCounter,
  cashFactGap,
  expectedPrinterClicks,
  gapDirection,
  parseCashActual,
  printerFactGap,
  splitSignedGaps,
  sumExpectedPrinterClicks,
  type GapSplit,
} from '../../utils/cashCounterReconcile';
import './CountersServicePage.css';

type Mode = 'day' | 'month';

interface PrinterCounter {
  id: number;
  code: string;
  name: string;
  value: number | null;
  prev_value: number | null;
  difference?: number | null;
  expected_clicks?: number | null;
}

const CASH_GAP_EPSILON = 0.009;

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

function formatClickCount(value: number, signed = false): string {
  const body = Math.abs(value).toLocaleString('ru-RU');
  if (value < 0) return `-${body}`;
  if (signed && value > 0) return `+${body}`;
  return body;
}

function GapChip({
  delta,
  epsilon,
  children,
}: {
  delta: number;
  children: React.ReactNode;
  epsilon: number;
}) {
  const direction = gapDirection(delta, epsilon);
  return (
    <span className={`cnt-gap cnt-gap--${direction}`}>
      {children}
      <span className="cnt-gap__word">{GAP_DIRECTION_LABEL[direction]}</span>
    </span>
  );
}

function GapSides({
  split,
  epsilon,
  render,
}: {
  split: GapSplit;
  epsilon: number;
  render: (value: number) => React.ReactNode;
}) {
  if (split.net == null) return null;
  return (
    <div className="cnt-reconcile__sides">
      <span className={`cnt-gap ${split.more > epsilon ? 'cnt-gap--more' : 'cnt-gap--even'}`}>
        <span className="cnt-gap__word">в большую</span>
        {render(split.more)}
      </span>
      <span className={`cnt-gap ${split.less > epsilon ? 'cnt-gap--less' : 'cnt-gap--even'}`}>
        <span className="cnt-gap__word">в меньшую</span>
        {render(split.less)}
      </span>
    </div>
  );
}

export const CountersServicePage: React.FC = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('day');
  const [selectedDate, setSelectedDate] = useState<string>(todayCalendarLocal);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printerCounters, setPrinterCounters] = useState<PrinterCounter[]>([]);
  const [cashContributions, setCashContributions] = useState<CashContribution[]>([]);
  const [cashTotal, setCashTotal] = useState(0);
  const [cashActual, setCashActual] = useState<number | null>(null);
  const [previousCashActual, setPreviousCashActual] = useState<number | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<number | undefined>(undefined);
  const [monthData, setMonthData] = useState<DayCardData[]>([]);

  const previousDateLabel = useMemo(
    () => addCalendarDaysLocal(selectedDate, -1),
    [selectedDate],
  );

  useEffect(() => {
    getDepartments()
      .then((res) => setDepartments(Array.isArray(res.data) ? res.data : []))
      .catch(() => setDepartments([]));
  }, []);

  const loadDayData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const previousDate = addCalendarDaysLocal(selectedDate, -1);
      const deptParam =
        selectedDepartmentId != null ? { department_id: selectedDepartmentId } : undefined;
      const [countersResponse, cashRegisterRes, actualRes, previousActualRes] = await Promise.all([
        getPrinterCountersByDate(selectedDate, deptParam),
        getCashRegisterDay(selectedDate, deptParam),
        selectedDepartmentId != null
          ? getDepartmentCashActual(selectedDate, { department_id: selectedDepartmentId })
          : Promise.resolve(null),
        selectedDepartmentId != null
          ? getDepartmentCashActual(previousDate, { department_id: selectedDepartmentId })
          : Promise.resolve(null),
      ]);
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

      const reg = cashRegisterRes.data;
      const contributions = (reg.contributions_by_user ?? []).map((c) => ({
        user_id: c.user_id,
        user_name: c.user_name || `ID ${c.user_id}`,
        amount: c.amount,
      }));
      setCashContributions(contributions);
      setCashTotal(Number(reg.cash_in_today ?? 0));
      setCashActual(parseCashActual(actualRes?.data?.cash_actual));
      setPreviousCashActual(parseCashActual(previousActualRes?.data?.cash_actual));
    } catch (err: any) {
      setError(err?.message || 'Ошибка загрузки данных');
      setPrinterCounters([]);
      setCashContributions([]);
      setCashTotal(0);
      setCashActual(null);
      setPreviousCashActual(null);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedDepartmentId]);

  const loadMonthData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [countersRes, cashRes] = await Promise.all([
        getPrinterCountersByMonth(selectedMonth, { department_id: selectedDepartmentId }),
        getDailyCashByMonth(selectedMonth, { department_id: selectedDepartmentId }),
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
  }, [selectedMonth, selectedDepartmentId]);

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

  const expectedPrinterClicksTotal = useMemo(
    () => sumExpectedPrinterClicks(sortedCounters),
    [sortedCounters],
  );

  const printerGap = useMemo(
    () => splitSignedGaps(sortedCounters.map((counter) => printerFactGap(counter))),
    [sortedCounters],
  );

  const expectedCash = useMemo(() => {
    const previous = selectedDepartmentId == null ? null : previousCashActual;
    return cashExpectedCounter(previous, cashTotal);
  }, [selectedDepartmentId, previousCashActual, cashTotal]);

  const cashGap = useMemo(() => {
    if (selectedDepartmentId == null) {
      return splitSignedGaps([null], CASH_GAP_EPSILON);
    }
    return splitSignedGaps([cashFactGap(cashActual, expectedCash)], CASH_GAP_EPSILON);
  }, [selectedDepartmentId, cashActual, expectedCash]);

  const printerGapHint = printerGap.net == null
    ? 'Факт счётчика не снят'
    : printerGap.missing > 0
      ? `По ${printerGap.known} из ${sortedCounters.length}: у остальных факт не снят`
      : 'Факт сегодня минус (вчера или 0 + клики CRM)';

  const cashGapHint = selectedDepartmentId == null
    ? 'Выберите точку: факт терминала хранится по точке'
    : cashActual == null
      ? 'Факт терминала не введён'
      : 'Факт терминала минус ожидаемое по кассе';

  const expectedCashHint = selectedDepartmentId == null
    ? 'В кассу за день из CRM по всем точкам. Факт вчера считается только у выбранной точки.'
    : previousCashActual == null
      ? 'Факт вчера не введён, в расчёте 0. Плюс в кассу за день из CRM.'
      : 'Факт терминала за вчера плюс в кассу за день из CRM.';

  return (
    <div className="cnt-page cnt-page--cash">
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
              onClick={() =>setMode('day')}
            >
              День
            </button>
            <button
              type="button"
              className={`cnt-mode-tab ${mode === 'month' ? 'cnt-mode-tab--active' : ''}`}
              onClick={() =>setMode('month')}
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
          <select
            className="cnt-date-input"
            value={selectedDepartmentId ?? ''}
            onChange={(e) => setSelectedDepartmentId(e.target.value === '' ? undefined : Number(e.target.value))}
            title="Точка исполнения"
          >
            <option value="">Все точки</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="cnt-page__error">{error}</div>}

      {/* Month grid — только в режиме Месяц */}
      {mode === 'month' && (
        <div className="cnt-month-section">
          <h3 className="cnt-month-section__title">Счётчики по дням месяца</h3>
          <p className="cnt-month-section__note">
            Ожидаемое из CRM и разница с фактом — в режиме «День». За месяц здесь только факт принтеров и сумма в кассу.
          </p>
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
                      <MoneyAmount value={card.cash} decimals={0} />
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
          <div className="cnt-stat-card__trend"><BynSymbol /></div>
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

      <section className="cnt-reconcile" aria-label="Сверка факта с ожидаемым из CRM">
        <article className="cnt-reconcile__card">
          <div className="cnt-reconcile__label">Ожидаемое по принтерам</div>
          <div className="cnt-reconcile__value">
            {loading ? '—' : (
              <>
                {formatClickCount(expectedPrinterClicksTotal)}
                <span className="cnt-reconcile__unit"> клик.</span>
              </>
            )}
          </div>
          <p className="cnt-reconcile__hint">Клики заказов CRM за день, без статуса «Ожидает»</p>
        </article>
        <article className="cnt-reconcile__card">
          <div className="cnt-reconcile__label">Ожидаемое по кассе</div>
          <div className="cnt-reconcile__value">
            {loading ? '—' : <MoneyAmount value={expectedCash} />}
          </div>
          <p className="cnt-reconcile__hint">{expectedCashHint}</p>
          {!loading && (
            <p className="cnt-reconcile__meta">
              В кассу из CRM: <MoneyAmount value={cashTotal} />
              {selectedDepartmentId != null && (
                <>
                  {' '}· факт вчера:{' '}
                  {previousCashActual == null ? 'не введён' : <MoneyAmount value={previousCashActual} />}
                </>
              )}
            </p>
          )}
        </article>
        <article className="cnt-reconcile__card">
          <div className="cnt-reconcile__label">Разница, факт − ожидаемое</div>
          {loading ? (
            <div className="cnt-reconcile__value">—</div>
          ) : (
            <>
              <div className="cnt-reconcile__block">
                <div className="cnt-reconcile__line">
                  <span className="cnt-reconcile__line-name">Принтеры</span>
                  {printerGap.net == null ? (
                    <span className="cnt-reconcile__missing">{printerGapHint}</span>
                  ) : (
                    <GapChip delta={printerGap.net} epsilon={0}>
                      {formatClickCount(printerGap.net, true)}
                    </GapChip>
                  )}
                </div>
                <GapSides split={printerGap} epsilon={0} render={(value) => formatClickCount(value)} />
                {printerGap.net != null && (
                  <p className="cnt-reconcile__hint">{printerGapHint}</p>
                )}
              </div>
              <div className="cnt-reconcile__block">
                <div className="cnt-reconcile__line">
                  <span className="cnt-reconcile__line-name">Касса</span>
                  {cashGap.net == null ? (
                    <span className="cnt-reconcile__missing">{cashGapHint}</span>
                  ) : (
                    <GapChip delta={cashGap.net} epsilon={CASH_GAP_EPSILON}>
                      <MoneyAmount value={cashGap.net} signed />
                    </GapChip>
                  )}
                </div>
                <GapSides
                  split={cashGap}
                  epsilon={CASH_GAP_EPSILON}
                  render={(value) => <MoneyAmount value={value} />}
                />
                {cashGap.net != null && (
                  <p className="cnt-reconcile__hint">{cashGapHint}</p>
                )}
              </div>
            </>
          )}
        </article>
      </section>

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
                    <th title="Клики заказов CRM за день">Ожидаемое CRM</th>
                    <th title="Факт сегодня минус (вчера или 0 + клики CRM)">Отклонение</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCounters.map((counter) => {
                    const crmClicks = expectedPrinterClicks(counter);
                    const gap = printerFactGap(counter);
                    return (
                    <tr key={counter.id}>
                      <td className="cnt-cell-name">{counter.name}</td>
                      <td>{counter.prev_value ?? '—'}</td>
                      <td>{counter.value ?? '—'}</td>
                      <td>
                        {counter.difference != null ? (
                          <span className={`cnt-diff ${counter.difference > 0 ? 'cnt-diff--positive' : counter.difference < 0 ? 'cnt-diff--negative' : ''}`}>
                            {counter.difference > 0 ? '+' : ''}{counter.difference}
                          </span>
                        ) : '—'}
                      </td>
                      <td>{formatClickCount(crmClicks)}</td>
                      <td>
                        {gap == null ? '—' : (
                          <GapChip delta={gap} epsilon={0}>
                            {formatClickCount(gap, true)}
                          </GapChip>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                  {sortedCounters.length === 0 && (
                    <tr>
                      <td colSpan={6} className="cnt-table__empty">
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
            <span className="cnt-card__badge cnt-card__badge--green" title="В кассу за день из CRM"><MoneyAmount value={cashTotal} /></span>
          </div>
          {loading ? (
            <div className="cnt-card__loading">Загрузка...</div>
          ) : (
            <>
              <div className="cnt-cash-expect">
                <div className="cnt-cash-expect__row">
                  <span className="cnt-cash-expect__label">Ожидаемое из CRM</span>
                  <span className="cnt-cash-expect__value"><MoneyAmount value={expectedCash} /></span>
                </div>
                <div className="cnt-cash-expect__row">
                  <span className="cnt-cash-expect__label">Факт терминала</span>
                  <span className="cnt-cash-expect__value">
                    {selectedDepartmentId == null || cashActual == null ? '—' : <MoneyAmount value={cashActual} />}
                  </span>
                </div>
                <div className="cnt-cash-expect__row">
                  <span className="cnt-cash-expect__label">Разница</span>
                  {cashGap.net == null ? (
                    <span className="cnt-reconcile__missing">{cashGapHint}</span>
                  ) : (
                    <GapChip delta={cashGap.net} epsilon={CASH_GAP_EPSILON}>
                      <MoneyAmount value={cashGap.net} signed />
                    </GapChip>
                  )}
                </div>
              </div>
              {cashContributions.length > 0 ? (
                <div className="cnt-cash-list">
                  {cashContributions.map((entry) => (
                    <div key={entry.user_id} className="cnt-cash-item">
                      <div className="cnt-cash-item__user">
                        <span className="cnt-cash-item__avatar"><AppIcon name="user" size="xs" /></span>
                        <span className="cnt-cash-item__name">{entry.user_name}</span>
                      </div>
                      <span className="cnt-cash-item__amount"><MoneyAmount value={entry.amount} /></span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="cnt-card__empty">Нет участников кассы за день</div>
              )}
            </>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
};

export default CountersServicePage;
