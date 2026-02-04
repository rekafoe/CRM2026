// Основной компонент страницы аналитики отчетов

import React, { useEffect, useState } from 'react';
import { useAnalytics } from './hooks/useAnalytics';
import { ProductAnalytics } from './components/ProductAnalytics';
import { FinancialAnalytics } from './components/FinancialAnalytics';
import { OrderStatusAnalytics } from './components/OrderStatusAnalytics';
import { ManagerAnalytics } from './components/ManagerAnalytics';
import { MaterialsAnalytics } from './components/MaterialsAnalytics';
import { TimeAnalytics } from './components/TimeAnalytics';
import { AnalyticsTab } from './types';
import { getDepartments, type Department } from '../../api';

import './AdminReportsPage.css';

interface AdminReportsPageProps {
  onBack?: () => void;
}

export const AdminReportsPage: React.FC<AdminReportsPageProps> = ({ onBack }) => {
  const {
    productData,
    financialData,
    orderStatusData,
    managerData,
    materialsData,
    timeData,
    isLoading,
    period,
    dateFrom,
    dateTo,
    periodParams,
    activeTab,
    departmentId,
    loadAnalytics,
    setActiveTab,
    setPeriod,
    setDateRange,
    setDepartmentId,
    refreshAnalytics,
    hasData,
    totalStats
  } = useAnalytics();

  const [departments, setDepartments] = useState<Department[]>([]);

  useEffect(() => {
    getDepartments().then(r => setDepartments(r.data ?? [])).catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const handleTabChange = (tab: AnalyticsTab) => {
    setActiveTab(tab);
    loadAnalytics(tab, periodParams, departmentId);
  };

  const handlePeriodChange = (newPeriod: number) => {
    setPeriod(newPeriod);
    setDateRange(undefined, undefined);
    loadAnalytics(activeTab, { period: newPeriod }, departmentId);
  };

  const handleDepartmentChange = (newDeptId: number | '') => {
    const id = newDeptId === '' ? undefined : newDeptId;
    setDepartmentId(id);
    loadAnalytics(activeTab, periodParams, id);
  };

  const handleDateRangeChange = (from: string, to: string) => {
    setDateRange(from || undefined, to || undefined);
    if (from && to) {
      loadAnalytics(activeTab, { period, dateFrom: from, dateTo: to }, departmentId);
    }
  };

  const clearDateRange = () => {
    setDateRange(undefined, undefined);
    loadAnalytics(activeTab, { period }, departmentId);
  };

  return (
    <>
      {/* Основной контент страницы */}
      <div className="reports-page">
        <div className="reports-header">
          <div className="reports-header-left">
            {onBack && (
              <button
                onClick={onBack}
                className="reports-back-btn"
              >
                ← Назад к заказам
              </button>
            )}
            <div>
              <h1 className="reports-header-title">
                🛡️ Админ-панель: Расширенная аналитика
              </h1>
              <p className="reports-header-description">
                Комплексная аналитика бизнеса: продукты, финансы, менеджеры, материалы, время
              </p>
            </div>
          </div>
          <div className="reports-header-actions">
            <div className="reports-user-info">
              Аналитика за период
            </div>
            <button
              onClick={() => window.print()}
              className="reports-action-btn"
              title="Распечатать аналитику"
            >
              🖨️ Печать
            </button>
            <button
              onClick={() => {
                const data = { productData, financialData, orderStatusData, managerData, materialsData, timeData };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `analytics-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="reports-action-btn reports-export-btn"
              title="Экспортировать данные аналитики"
            >
              💾 Экспорт JSON
            </button>
          </div>
        </div>

        {/* Статистика */}
        <div className="reports-stats">
          <div className="reports-stat-card">
            <div className="reports-stat-value">
              {totalStats.totalOrders}
            </div>
            <div className="reports-stat-label">Всего заказов</div>
          </div>
          <div className="reports-stat-card">
            <div className="reports-stat-value">
              {totalStats.totalRevenue.toLocaleString('ru-RU')} BYN
            </div>
            <div className="reports-stat-label">Общая выручка</div>
          </div>
          <div className="reports-stat-card">
            <div className="reports-stat-value">
              {totalStats.uniqueUsers}
            </div>
            <div className="reports-stat-label">Активных менеджеров</div>
          </div>
          <div className="reports-stat-card">
            <div className="reports-stat-value">
              {totalStats.reportsCount}
            </div>
            <div className="reports-stat-label">Продуктов в анализе</div>
          </div>
        </div>

        {/* Вкладки аналитики */}
        <div style={{ marginBottom: '20px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              { key: 'overview', label: '📊 Обзор', icon: '📊' },
              { key: 'managers', label: '👥 Менеджеры', icon: '👥' },
              { key: 'materials', label: '📦 Материалы', icon: '📦' },
              { key: 'time', label: '🕐 Время', icon: '🕐' }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key as AnalyticsTab)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: activeTab === tab.key ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                  color: activeTab === tab.key ? 'var(--bg-primary)' : 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Выбор периода и департамента для аналитики */}
        <div className="reports-filters" style={{ marginBottom: '20px' }}>
          <div>
            <label className="reports-filter-label">
              Период (дни):
            </label>
            <select
              value={period}
              onChange={(e) => handlePeriodChange(Number(e.target.value))}
              className="reports-filter-input"
            >
              <option value={7}>7 дней</option>
              <option value={14}>14 дней</option>
              <option value={30}>30 дней</option>
              <option value={60}>60 дней</option>
              <option value={90}>90 дней</option>
            </select>
          </div>
          <div>
            <label className="reports-filter-label">
              Диапазон дат:
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="date"
                value={dateFrom ?? ''}
                onChange={(e) => handleDateRangeChange(e.target.value, dateTo ?? '')}
                className="reports-filter-input"
                style={{ minWidth: '140px' }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>—</span>
              <input
                type="date"
                value={dateTo ?? ''}
                onChange={(e) => handleDateRangeChange(dateFrom ?? '', e.target.value)}
                className="reports-filter-input"
                style={{ minWidth: '140px' }}
              />
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={clearDateRange}
                  className="reports-filter-input"
                  style={{ padding: '8px 12px', cursor: 'pointer' }}
                  title="Сбросить диапазон"
                >
                  Сбросить
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="reports-filter-label">
              Департамент (менеджеры):
            </label>
            <select
              value={departmentId ?? ''}
              onChange={(e) => handleDepartmentChange(e.target.value === '' ? '' : Number(e.target.value))}
              className="reports-filter-input"
            >
              <option value="">Все департаменты</option>
              {departments.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <button
              onClick={refreshAnalytics}
              disabled={isLoading}
              style={{
                padding: '8px 16px',
                backgroundColor: 'var(--accent-primary)',
                color: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer',
                opacity: isLoading ? 0.6 : 1
              }}
            >
              {isLoading ? '⏳ Загрузка...' : '🔄 Обновить'}
            </button>
          </div>
        </div>

        {/* Контент аналитики */}
        {hasData ? (
          <>
            {/* Обзор - показываем все основные метрики */}
            {activeTab === 'overview' && (
              <>
                {productData && <ProductAnalytics data={productData} />}
                {financialData && <FinancialAnalytics data={financialData} />}
                {orderStatusData && <OrderStatusAnalytics data={orderStatusData} />}
              </>
            )}

            {/* Специфические вкладки */}
            {activeTab === 'managers' && managerData && (
              <ManagerAnalytics data={managerData} />
            )}

            {activeTab === 'materials' && materialsData && (
              <MaterialsAnalytics data={materialsData} />
            )}

            {activeTab === 'time' && timeData && (
              <TimeAnalytics data={timeData} />
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            {isLoading ? 'Загрузка данных аналитики...' : 'Нет данных для отображения'}
          </div>
        )}
      </div>
    </>
  );
};
