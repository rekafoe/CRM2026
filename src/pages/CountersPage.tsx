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
      // Получаем фактическую сумму из daily_reports
      const reportResponse = await api.get(`/daily-reports/${selectedDate}?user_id=${user.id}`);
      const actualCash = reportResponse.data?.cash_actual || null;
      setCashActualValue(actualCash ? actualCash.toString() : '');

      // Рассчитываем сумму из заказов за день
      const ordersResponse = await api.get('/orders');
      const ordersForDate = ordersResponse.data.filter((order: any) => {
        const orderDate = new Date(order.created_at).toISOString().split('T')[0];
        return orderDate === selectedDate && (order.userId === user.id || order.userId === null);
      });
      const calculatedCash = ordersForDate.reduce((sum: number, order: any) => {
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
      setCashData({
        actual: null,
        calculated: 0,
        difference: 0
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
        await api.patch(`/daily-reports/${selectedDate}?user_id=${user.id}`, {
          cash_actual: value
        });
        console.log('Cash updated successfully');
      } catch (patchError: any) {
        // Если отчет не найден (404), создаем новый
        if (patchError.response?.status === 404) {
          console.log('Daily report not found, creating new one...');
          await api.post('/daily-reports/full', {
            report_date: selectedDate,
            user_id: user.id,
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
              <div className="cash-label">Расчетная сумма (из CRM):</div>
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
            <p>Общий счетчик A4 листов по принтерам</p>
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
                    <span className={`value-difference ${printer.difference !== null ? (printer.difference >= 0 ? 'positive' : 'negative') : 'neutral'}`}>
                      {printer.difference !== null ? (printer.difference >= 0 ? '+' : '') + printer.difference : '—'}
                    </span>
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
