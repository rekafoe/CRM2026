import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { getCurrentUser, getUsers } from '../api';
import { parseNumberFlexible } from '../utils/numberInput';
import './CountersPage.css';

interface Printer {
  id: number;
  code: string;
  name: string;
}

interface PrinterCounter {
  id: number;
  code: string;
  name: string;
  value: number | null;
  prev_value: number | null;
  difference?: number;
}

interface CashData {
  actual: number | null;
  calculated: number;
  difference: number;
  dailyRevenue?: number;
  previousActual?: number | null;
}

interface CashContribution {
  user_id: number;
  user_name?: string;
  cash_actual?: number | null;
}

interface User {
  id: number;
  name: string;
  role: string;
}

interface CountersPageProps {
  isModal?: boolean;
}

export const CountersPage: React.FC<CountersPageProps> = ({ isModal = false }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Данные счетчиков
  const [printerCounters, setPrinterCounters] = useState<PrinterCounter[]>([]);
  const [cashData, setCashData] = useState<CashData>({ actual: null, calculated: 0, difference: 0 });
  const [printers, setPrinters] = useState<Printer[]>([]);
  
  // Состояние формы
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [editingPrinter, setEditingPrinter] = useState<number | null>(null);
  const [newCounterValue, setNewCounterValue] = useState<string>('');
  const [cashActualValue, setCashActualValue] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [printerExpectedClicks, setPrinterExpectedClicks] = useState<Record<number, number>>({});
  const [cashContributions, setCashContributions] = useState<CashContribution[]>([]);
  const [cashContributionsTotal, setCashContributionsTotal] = useState<number>(0);
  const [allUsers, setAllUsers] = useState<Array<{ id: number; name: string }>>([]);
  const previousDateLabel = React.useMemo(() => {
    const base = new Date(selectedDate);
    if (Number.isNaN(base.getTime())) return 'вчера';
    base.setDate(base.getDate() - 1);
    return base.toISOString().split('T')[0];
  }, [selectedDate]);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadCounters();
    }
  }, [user, selectedDate]);

  useEffect(() => {
    getUsers()
      .then((res) => setAllUsers(Array.isArray(res.data) ? res.data : []))
      .catch(() => setAllUsers([]));
  }, []);

  const loadUser = async () => {
    try {
      const response = await getCurrentUser();
      setUser(response.data);
    } catch (error) {
      console.error('Failed to load user:', error);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const loadCounters = async () => {
    if (!user) return;
    
    try {
      setError(null);

      // Загружаем список принтеров
      const printersResponse = await api.get('/printers');
      setPrinters(printersResponse.data);

      // Загружаем счетчики принтеров
      const countersResponse = await api.get(`/printers/counters?date=${selectedDate}`);
      const counters = countersResponse.data.map((counter: any) => ({
        ...counter,
        difference: counter.value && counter.prev_value 
          ? counter.value - counter.prev_value 
          : null
      }));
      setPrinterCounters(counters);

      // Загружаем данные кассы
      await loadCashData();

    } catch (error: any) {
      console.error('Error loading counters:', error);
      setError('Ошибка загрузки счетчиков');
    }
  };

  const loadCashData = async () => {
    if (!user) return;
    
    try {
      // Чтобы имена пользователей всегда были доступны (в т.ч. при первом открытии модалки)
      let usersForNames = allUsers;
      if (usersForNames.length === 0) {
        try {
          const res = await getUsers();
          usersForNames = Array.isArray(res.data) ? res.data : [];
          if (usersForNames.length > 0) setAllUsers(usersForNames);
        } catch (_) { /* ignore */ }
      }
      const userNameById = new Map<number, string>(
        usersForNames.map((u: { id: number; name: string }) => [Number(u.id), u.name])
      );

      const getCashActualForDate = async (date: string) => {
        // Используем список, чтобы не ловить 404, если отчёта нет
        const reportListResponse = await api.get('/daily-reports', {
          params: {
            from: date,
            to: date,
            show_all: true,
            scope: 'global'
          }
        });
        const report = Array.isArray(reportListResponse.data) ? reportListResponse.data[0] : null;
        return report?.cash_actual ?? null;
      };

      const actualCash = await getCashActualForDate(selectedDate);
      setCashActualValue(actualCash ? actualCash.toString() : '');

      const previousDate = new Date(selectedDate);
      previousDate.setDate(previousDate.getDate() - 1);
      const previousDateKey = previousDate.toISOString().split('T')[0];
      const previousActualCash = await getCashActualForDate(previousDateKey);

      // Заказы за дату (для расчётов и вкладов)
      const ordersResponse = await api.get(`/reports/daily/${selectedDate}/orders`);
      const ordersForDate = Array.isArray(ordersResponse.data?.orders)
        ? ordersResponse.data.orders
        : [];
      const contributionsByUser = new Map<number, number>();
      const dailyRevenue = ordersForDate.reduce((sum: number, order: any) => {
        const prepayment = parseNumberFlexible(order.prepaymentAmount ?? order.prepayment_amount ?? 0);
        const orderAmount = prepayment > 0 ? prepayment : 0;
        const rawUserId = order.userId ?? order.user_id ?? null;
        const userId = rawUserId != null ? Number(rawUserId) : null;
        if (userId && !Number.isNaN(userId)) {
          contributionsByUser.set(userId, (contributionsByUser.get(userId) || 0) + orderAmount);
        }
        return sum + orderAmount;
      }, 0);
      const computedContributions: CashContribution[] = Array.from(contributionsByUser.entries())
        .map(([user_id, amount]) => ({
          user_id,
          user_name: userNameById.get(user_id) || `ID ${user_id}`,
          cash_actual: amount
        }));

      // Вклады по пользователям за дату (если доступны)
      let contributionsToShow = computedContributions;
      try {
        const userReportsResponse = await api.get('/daily-reports', {
          params: {
            from: selectedDate,
            to: selectedDate,
            show_all: true
          }
        });
        const reports = Array.isArray(userReportsResponse.data) ? userReportsResponse.data : [];
        const userReports = reports.filter((report: any) => report.user_id);
        const normalized: CashContribution[] = userReports.map((report: any) => {
          const uid = Number(report.user_id);
          const name = report.user_name || userNameById.get(uid) || `Пользователь #${uid}`;
          return {
            user_id: uid,
            user_name: name,
            cash_actual: report.cash_actual ?? null
          };
        });
        const hasActuals = normalized.some((r) => Number(r.cash_actual || 0) > 0);
        if (hasActuals || computedContributions.length === 0) {
          contributionsToShow = normalized;
        }
      } catch (userReportsError: any) {
        if (userReportsError?.response?.status !== 403) {
          throw userReportsError;
        }
      }

      const total = contributionsToShow.reduce((sum, report) => {
        return sum + Number(report.cash_actual || 0);
      }, 0);
      setCashContributions(contributionsToShow);
      setCashContributionsTotal(total);

      const calculatedCash = Number(previousActualCash || 0) + dailyRevenue;

      const expectedClicks: Record<number, number> = {};
      ordersForDate.forEach((order: any) => {
        const items = Array.isArray(order.items) ? order.items : [];
        items.forEach((item: any) => {
          const printerId = Number(item.printerId || item.printer_id);
          if (!printerId) return;
          const sheets = Number(item.sheets ?? 0);
          const sides = Number(item.sides ?? 1);
          const clicks = Number(item.clicks ?? 0) || (Math.max(0, sheets) * (Math.max(1, sides) * 2));
          if (!expectedClicks[printerId]) expectedClicks[printerId] = 0;
          expectedClicks[printerId] += clicks;
        });
      });
      setPrinterExpectedClicks(expectedClicks);

      const difference = actualCash !== null ? actualCash - calculatedCash : 0;

      setCashData({
        actual: actualCash,
        calculated: calculatedCash,
        difference,
        dailyRevenue,
        previousActual: previousActualCash
      });

    } catch (error: any) {
      console.error('Error loading cash data:', error);
      setCashData({
        actual: null,
        calculated: 0,
        difference: 0,
        dailyRevenue: 0,
        previousActual: null
      });
      setCashContributions([]);
      setCashContributionsTotal(0);
    }
  };

  const updatePrinterCounter = async (printerId: number, value: number) => {
    try {
      setSaving(true);
      await api.post(`/printers/${printerId}/counters`, {
        counter_date: selectedDate,
        value: value
      });
      await loadCounters();
      setEditingPrinter(null);
      setNewCounterValue('');
    } catch (error: any) {
      console.error('Error updating printer counter:', error);
      setError('Ошибка обновления счетчика');
    } finally {
      setSaving(false);
    }
  };

  const updateCashActual = async (value: number) => {
    if (!user) return;
    
    try {
      setSaving(true);
      
      // Сначала пытаемся обновить существующий отчет
      try {
        console.log('Updating cash_actual:', { date: selectedDate, userId: user.id, value });
        await api.patch(`/daily-reports/${selectedDate}?scope=global`, {
          cash_actual: value
        });
        console.log('Cash updated successfully');
      } catch (patchError: any) {
        // Если отчет не найден (404), создаем новый
        if (patchError.response?.status === 404) {
          console.log('Daily report not found, creating new one...');
          await api.post('/daily-reports/full?scope=global', {
            report_date: selectedDate,
            orders_count: 0,
            total_revenue: 0,
            cash_actual: value
          });
        } else {
          throw patchError;
        }
      }
      
      await loadCashData();
    } catch (error: any) {
      console.error('Error updating cash actual:', error);
      setError(`Ошибка обновления кассы: ${error.response?.data?.message || error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const getTotalPrinterDifference = () => {
    return printerCounters.reduce((sum, printer) => {
      return sum + (printer.difference || 0);
    }, 0);
  };

  const getExpectedClicksForPrinter = (printerId: number) => {
    return printerExpectedClicks[printerId] ?? 0;
  };

  const getExpectedPrinterCounter = (printerId: number, prevValue: number | null | undefined) => {
    const base = Number(prevValue ?? 0);
    return base + getExpectedClicksForPrinter(printerId);
  };

  const getPrinterDelta = (printerId: number, currentValue: number | null | undefined, prevValue: number | null | undefined) => {
    if (currentValue === null || currentValue === undefined) return null;
    const expectedCounter = getExpectedPrinterCounter(printerId, prevValue);
    return currentValue - expectedCounter;
  };

  const getCashStatus = () => {
    if (cashData.actual === null) return 'warning';
    if (Math.abs(cashData.difference) < 0.01) return 'success';
    return 'error';
  };

  const getCashStatusIcon = () => {
    const status = getCashStatus();
    switch (status) {
      case 'success': return '✅';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      default: return '💰';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  const handleDateChange = (newDate: string) => {
    setSelectedDate(newDate);
    setEditingPrinter(null);
    setNewCounterValue('');
  };

  const handlePrinterEdit = (printerId: number) => {
    setEditingPrinter(printerId);
    setNewCounterValue('');
  };

  const handlePrinterSave = () => {
    if (!editingPrinter || !newCounterValue) return;
    const value = parseInt(newCounterValue);
    if (!isNaN(value)) {
      updatePrinterCounter(editingPrinter, value);
    }
  };

  const handleCashSave = () => {
    const value = parseFloat(cashActualValue);
    if (!isNaN(value) && cashActualValue.trim() !== '') {
      updateCashActual(value);
    } else {
      setError('Введите корректную сумму');
    }
  };

  const handleCashInputChange = (value: string) => {
    setCashActualValue(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      // Обновляем разницу в реальном времени
      const difference = numValue - cashData.calculated;
      setCashData(prev => ({
        ...prev,
        actual: numValue,
        difference
      }));
    }
  };

  if (loading) {
    return (
      <div className="counters-page">
        <div className="counters-loading">
          <div className="loading-spinner"></div>
          <p>Загрузка...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="counters-page">
        <div className="counters-error">
          <p>Ошибка загрузки пользователя</p>
          <button onClick={() => navigate('/')}>Вернуться на главную</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`counters-page ${isModal ? 'counters-page--modal' : ''}`}>
      <div className="counters-header">
        <div className="header-content">
          {!isModal && (
            <button 
              onClick={() => navigate('/')} 
              className="back-btn"
              title="Вернуться на главную"
            >
              ← Назад
            </button>
          )}
          {!isModal && (
            <div className="header-text">
              <h1>📊 Счётчики принтеров и кассы</h1>
              <p>Контроль счетчиков принтеров и сверка кассы</p>
            </div>
          )}
        </div>
        
        <div className="date-selector">
          <label htmlFor="date-input">📅 Дата:</label>
          <input
            id="date-input"
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="date-input"
          />
        </div>
      </div>

      {error && (
        <div className="counters-error-banner">
          ⚠️ {error}
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className="counters-content">
        {/* Касса - перемещена вверх */}
        <div className="counters-section">
          <div className="section-header">
            <h2>💰 Касса</h2>
            <p>Сверка фактической и расчетной суммы</p>
          </div>
          
          <div className="cash-card">
            <div className="cash-row">
              <div className="cash-label">Фактическая сумма (из терминала):</div>
              <div className="cash-input-group">
                <input
                  type="number"
                  step="0.01"
                  className="cash-input"
                  value={cashActualValue}
                  onChange={(e) => handleCashInputChange(e.target.value)}
                  placeholder="Введите сумму"
                />
                <span className="currency">BYN</span>
                <button
                  className="save-btn"
                  onClick={handleCashSave}
                  disabled={saving || !cashActualValue.trim()}
                >
                  {saving ? '⏳' : '💾'} Сохранить
                </button>
              </div>
            </div>
            
            <div className="cash-row">
              <div className="cash-label">Счётчик за вчера (факт):</div>
              <div className="cash-value">
                {cashData.previousActual != null ? cashData.previousActual.toFixed(2) : '—'} BYN
              </div>
            </div>

            <div className="cash-row">
              <div className="cash-label">Выручка за день (CRM):</div>
              <div className="cash-value">{(cashData.dailyRevenue ?? 0).toFixed(2)} BYN</div>
            </div>

            <div className="cash-row">
              <div className="cash-label">Расчётный счётчик (CRM):</div>
              <div className="cash-value">{cashData.calculated.toFixed(2)} BYN</div>
            </div>
            
            <div className="cash-row">
              <div className="cash-label">Разница:</div>
              <div className={`cash-difference ${getCashStatus()}`}>
                {cashData.difference >= 0 ? '+' : ''}{cashData.difference.toFixed(2)} BYN
              </div>
            </div>

            <div className="cash-contributions">
              <div className="cash-contributions-header">Вклады в кассу (по пользователям):</div>
              {cashContributions.length === 0 ? (
                <div className="cash-contributions-empty">Нет данных за выбранную дату</div>
              ) : (
                <>
                  <div className="cash-contributions-list">
                    {cashContributions.map((report) => (
                      <div key={report.user_id} className="cash-contribution-row">
                        <span className="cash-contribution-user">
                          {report.user_name || `Пользователь #${report.user_id}`}
                        </span>
                        <span className="cash-contribution-amount">
                          {Number(report.cash_actual || 0).toFixed(2)} BYN
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="cash-contribution-total">
                    <span>Итого за день:</span>
                    <span>{cashContributionsTotal.toFixed(2)} BYN</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Счетчики принтеров */}
        <div className="counters-section">
          <div className="section-header">
            <h2>🖨️ Счётчики принтеров</h2>
            <p>Сверка кликов SRA3: расчетные vs фактические</p>
          </div>
          
          <div className="printers-grid">
            {printerCounters.map(printer => (
              <div key={printer.id} className="printer-card">
                <div className="printer-header">
                  <div className="printer-info">
                    <h3>{printer.name}</h3>
                    <span className="printer-code">({printer.code})</span>
                  </div>
                  <button
                    className="edit-btn"
                    onClick={() => handlePrinterEdit(printer.id)}
                    disabled={saving}
                  >
                    ✏️
                  </button>
                </div>
                
                <div className="printer-values">
                  <div className="value-row">
                    <span className="value-label">Вчера ({previousDateLabel}):</span>
                    <span className="value-previous">
                      {printer.prev_value !== null ? printer.prev_value.toLocaleString() : '—'}
                    </span>
                  </div>
                  
                  <div className="value-row">
                    <span className="value-label">Сегодня ({selectedDate}):</span>
                    <span className="value-current">
                      {printer.value !== null ? printer.value.toLocaleString() : '—'}
                    </span>
                  </div>
                  
                  <div className="value-row">
                    <span className="value-label">Разница:</span>
                    <span className={`value-difference ${printer.difference != null ? (printer.difference >= 0 ? 'positive' : 'negative') : 'neutral'}`}>
                      {printer.difference != null ? (printer.difference >= 0 ? '+' : '') + printer.difference : '—'}
                    </span>
                  </div>
                  <div className="value-row">
                    <span className="value-label">Клики за день (CRM):</span>
                    <span className="value-calculated">
                      {getExpectedClicksForPrinter(printer.id).toLocaleString()}
                    </span>
                  </div>
                  <div className="value-row">
                    <span className="value-label">Расчётный счётчик:</span>
                    <span className="value-calculated">
                      {getExpectedPrinterCounter(printer.id, printer.prev_value).toLocaleString()}
                    </span>
                  </div>
                  <div className="value-row">
                    <span className="value-label">Отклонение:</span>
                    {getPrinterDelta(printer.id, printer.value, printer.prev_value) === null ? (
                      <span className="value-difference neutral">—</span>
                    ) : (
                      <span className={`value-difference ${getPrinterDelta(printer.id, printer.value, printer.prev_value)! >= 0 ? 'positive' : 'negative'}`}>
                        {getPrinterDelta(printer.id, printer.value, printer.prev_value)! >= 0 ? '+' : ''}
                        {getPrinterDelta(printer.id, printer.value, printer.prev_value)}
                      </span>
                    )}
                  </div>
                </div>
                
                {editingPrinter === printer.id && (
                  <div className="printer-edit">
                    <input
                      type="number"
                      className="counter-input"
                      placeholder="Новый счетчик"
                      value={newCounterValue}
                      onChange={(e) => setNewCounterValue(e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handlePrinterSave();
                        }
                      }}
                    />
                    <div className="edit-actions">
                      <button
                        className="save-btn"
                        onClick={handlePrinterSave}
                        disabled={saving || !newCounterValue}
                      >
                        {saving ? '⏳' : '💾'} Сохранить
                      </button>
                      <button
                        className="cancel-btn"
                        onClick={() => {
                          setEditingPrinter(null);
                          setNewCounterValue('');
                        }}
                      >
                        ✕ Отмена
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
