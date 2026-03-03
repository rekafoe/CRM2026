import React, { useState, useEffect } from 'react';
import { api } from '../../api';

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
}

interface CountersWidgetProps {
  date: string;
  userId: number;
  isAdmin?: boolean;
}

export const CountersWidget: React.FC<CountersWidgetProps> = ({ 
  date, 
  userId, 
  isAdmin = false 
}) => {
  const [printerCounters, setPrinterCounters] = useState<PrinterCounter[]>([]);
  const [cashData, setCashData] = useState<CashData>({ actual: null, calculated: 0, difference: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    loadCounters();
  }, [date, userId]);

  const loadCounters = async () => {
    try {
      setLoading(true);
      setError(null);

      // Загружаем счетчики принтеров
      const printersResponse = await api.get(`/printers/counters?date=${date}`);
      const printers = printersResponse.data.map((printer: any) => ({
        ...printer,
        difference: printer.value && printer.prev_value 
          ? printer.value - printer.prev_value 
          : null
      }));
      setPrinterCounters(printers);

      // Загружаем данные кассы
      await loadCashData();

    } catch (error: any) {
      console.error('Error loading counters:', error);
      setError('Ошибка загрузки счетчиков');
    } finally {
      setLoading(false);
    }
  };

  const loadCashData = async () => {
    try {
      // Получаем фактическую сумму из daily_reports
      const reportResponse = await api.get(`/daily-reports/${date}?user_id=${userId}`);
      const actualCash = reportResponse.data?.cash_actual || null;

      // Рассчитываем сумму из заказов за день
      const ordersResponse = await api.get(`/orders`);
      const ordersForDate = ordersResponse.data.filter((order: any) => {
        const orderDate = new Date(order.created_at).toISOString().split('T')[0];
        return orderDate === date && (order.userId === userId || order.userId === null);
      });
      const calculatedCash = ordersForDate.reduce((sum: number, order: any) => {
        if (Number(order.status) === 1) return sum; // Ожидающий — не в кассу
        return sum + (order.prepaymentAmount || 0);
      }, 0);

      const difference = actualCash !== null ? actualCash - calculatedCash : 0;

      setCashData({
        actual: actualCash,
        calculated: calculatedCash,
        difference
      });

    } catch (error: any) {
      console.error('Error loading cash data:', error);
      // Если отчет не найден, показываем только расчетную сумму
      setCashData({
        actual: null,
        calculated: 0,
        difference: 0
      });
    }
  };

  const updatePrinterCounter = async (printerId: number, value: number) => {
    try {
      await api.post(`/printers/${printerId}/counters`, {
        counter_date: date,
        value: value
      });
      await loadCounters();
    } catch (error: any) {
      console.error('Error updating printer counter:', error);
      setError('Ошибка обновления счетчика');
    }
  };

  const updateCashActual = async (value: number) => {
    try {
      await api.patch(`/daily-reports/${date}?user_id=${userId}`, {
        cash_actual: value
      });
      await loadCashData();
    } catch (error: any) {
      console.error('Error updating cash actual:', error);
      setError('Ошибка обновления кассы');
    }
  };

  const getTotalPrinterDifference = () => {
    return printerCounters.reduce((sum, printer) => {
      return sum + (printer.difference || 0);
    }, 0);
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

  if (loading) {
    return (
      <div className="counters-widget loading">
        <span>📊 Загрузка...</span>
      </div>
    );
  }

  return (
    <div className="counters-widget">
      <div className="counters-header">
        <button 
          className="counters-toggle"
          onClick={() => setShowDetails(!showDetails)}
          title="Счетчики принтеров и кассы"
        >
          <span className="counters-icon">📊</span>
          <span className="counters-summary">
            🖨️ {getTotalPrinterDifference()} | {getCashStatusIcon()} {cashData.actual !== null ? cashData.actual.toFixed(0) : '?'} BYN
          </span>
        </button>
      </div>

      {showDetails && (
        <div className="counters-details">
          {error && (
            <div className="counters-error">
              ⚠️ {error}
            </div>
          )}

          {/* Счетчики принтеров */}
          <div className="counters-section">
            <h4>🖨️ Принтеры (A4 листы)</h4>
            <div className="printers-list">
              {printerCounters.map(printer => (
                <div key={printer.id} className="printer-counter">
                  <div className="printer-info">
                    <span className="printer-name">{printer.name}</span>
                    <span className="printer-code">({printer.code})</span>
                  </div>
                  <div className="printer-values">
                    <span className="current-value">
                      {printer.value !== null ? printer.value.toLocaleString() : '—'}
                    </span>
                    {printer.difference != null && (
                      <span className={`difference ${printer.difference >= 0 ? 'positive' : 'negative'}`}>
                        {printer.difference >= 0 ? '+' : ''}{printer.difference}
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    className="counter-input"
                    placeholder="Новый счетчик"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const value = parseInt((e.target as HTMLInputElement).value);
                        if (!isNaN(value)) {
                          updatePrinterCounter(printer.id, value);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Касса */}
          <div className="counters-section">
            <h4>💰 Касса</h4>
            <div className="cash-data">
              <div className="cash-row">
                <span className="cash-label">Фактическая:</span>
                <div className="cash-input-group">
                  <input
                    type="number"
                    className="cash-input"
                    value={cashData.actual || ''}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      if (!isNaN(value)) {
                        updateCashActual(value);
                      }
                    }}
                    placeholder="Сумма из терминала"
                  />
                  <span className="currency">BYN</span>
                </div>
              </div>
              <div className="cash-row">
                <span className="cash-label">Расчетная:</span>
                <span className="cash-value">{cashData.calculated.toFixed(2)} BYN</span>
              </div>
              <div className="cash-row">
                <span className="cash-label">Разница:</span>
                <span className={`cash-difference ${getCashStatus()}`}>
                  {cashData.difference >= 0 ? '+' : ''}{cashData.difference.toFixed(2)} BYN
                </span>
              </div>
            </div>
          </div>

          {/* Сводка */}
          <div className="counters-summary-section">
            <div className="summary-row">
              <span>📊 Всего A4 листов:</span>
              <span className="summary-value">{getTotalPrinterDifference()}</span>
            </div>
            <div className="summary-row">
              <span>💰 Статус кассы:</span>
              <span className={`summary-status ${getCashStatus()}`}>
                {getCashStatusIcon()} {getCashStatus() === 'success' ? 'Совпадает' : 
                 getCashStatus() === 'warning' ? 'Не заполнено' : 'Расхождение'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
