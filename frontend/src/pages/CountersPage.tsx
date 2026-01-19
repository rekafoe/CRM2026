import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { getCurrentUser } from '../api';
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

interface User {
  id: number;
  name: string;
  role: string;
}

export const CountersPage: React.FC = () => {
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

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadCounters();
    }
  }, [user, selectedDate]);

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
      const getCashActualForDate = async (date: string) => {
        try {
          const reportResponse = await api.get(`/daily-reports/${date}?scope=global`);
          return reportResponse.data?.cash_actual ?? null;
        } catch (error: any) {
          const message = error instanceof Error ? error.message : String(error);
          const isNotFound =
            error?.response?.status === 404 ||
            message.startsWith('404:') ||
            message.includes('Отчёт не найден');
          if (!isNotFound) {
            throw error;
          }
          return null;
        }
      };

      const actualCash = await getCashActualForDate(selectedDate);
      setCashActualValue(actualCash ? actualCash.toString() : '');

      const previousDate = new Date(selectedDate);
      previousDate.setDate(previousDate.getDate() - 1);
      const previousDateKey = previousDate.toISOString().split('T')[0];
      const previousActualCash = await getCashActualForDate(previousDateKey);

      // Рассчитываем сумму из заказов за день
      const ordersResponse = await api.get('/orders');
      const ordersForDate = ordersResponse.data.filter((order: any) => {
        const rawDate = order.created_at ?? order.createdAt;
        if (!rawDate) return false;
        const orderDate = new Date(rawDate).toISOString().split('T')[0];
        return orderDate === selectedDate;
      });
      const dailyRevenue = ordersForDate.reduce((sum: number, order: any) => {
        const prepayment = Number(order.prepaymentAmount ?? order.prepayment_amount ?? 0);
        const items = Array.isArray(order.items) ? order.items : [];
        const itemsTotal = items.reduce((acc: number, item: any) => {
          const price = Number(item.price ?? 0);
          const qty = Number(item.quantity ?? 1);
          return acc + price * qty;
        }, 0);
        return sum + (prepayment > 0 ? prepayment : itemsTotal);
      }, 0);
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
    <div className="counters-page">
      <div className="counters-header">
        <div className="header-content">
          <button 
            onClick={() => navigate('/')} 
            className="back-btn"
            title="Вернуться на главную"
          >
            ← Назад
          </button>
          <div className="header-text">
            <h1>📊 Счётчики принтеров и кассы</h1>
            <p>Контроль счетчиков принтеров и сверка кассы</p>
          </div>
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
                  {user.role === 'admin' && (
                    <button
                      className="edit-btn"
                      onClick={() => handlePrinterEdit(printer.id)}
                      disabled={saving}
                    >
                      ✏️
                    </button>
                  )}
                </div>
                
                <div className="printer-values">
                  <div className="value-row">
                    <span className="value-label">Предыдущий:</span>
                    <span className="value-previous">
                      {printer.prev_value !== null ? printer.prev_value.toLocaleString() : '—'}
                    </span>
                  </div>
                  
                  <div className="value-row">
                    <span className="value-label">Текущий:</span>
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
