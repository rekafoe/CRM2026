import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnalytics } from './hooks/useAnalytics';
import { ProductAnalytics } from './components/ProductAnalytics';
import { FinancialAnalytics } from './components/FinancialAnalytics';
import { OrderStatusAnalytics } from './components/OrderStatusAnalytics';
import { ManagerAnalytics } from './components/ManagerAnalytics';
import { MaterialsAnalytics } from './components/MaterialsAnalytics';
import { TimeAnalytics } from './components/TimeAnalytics';
import { AnalyticsTab } from './types';
import { getDepartments, type Department } from '../../api';
import { Button } from '../../components/common';
import { AppIcon } from '../../components/ui/AppIcon';

import './AdminReportsPage.css';

interface AdminReportsPageProps {
  onBack?: () => void;
}

export const AdminReportsPage: React.FC<AdminReportsPageProps> = ({ onBack }) => {
  const navigate = useNavigate();
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

  const handleExportJSON = () => {
    const data = { productData, financialData, orderStatusData, managerData, materialsData, timeData };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="reports-page">
      {/* Header */}
      <div className="reports-header">
        <div className="reports-header-left">
          <Button variant="secondary" size="sm" onClick={onBack || (() => navigate('/adminpanel'))}>
            ← Назад
          </Button>
          <div className="reports-title-row">
            <AppIcon name="chart-bar" size="lg" circle />
            <div>
              <h1 className="reports-header-title">Расширенная аналитика</h1>
              <p className="reports-header-description">Продукты, финансы, менеджеры, материалы, время</p>
            </div>
          </div>
        </div>
        <div className="reports-header-actions">
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <AppIcon name="printer" size="xs" /> Печать
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportJSON}>
            <AppIcon name="download" size="xs" /> Экспорт
          </Button>
          <Button variant="primary" size="sm" onClick={refreshAnalytics} disabled={isLoading}>
            {isLoading ? 'Загрузка…' : <><AppIcon name="refresh" size="xs" /> Обновить</>}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="reports-stats">
        <div className="reports-stat-card">
          <div className="reports-stat-card__header">
            <span className="reports-stat-card__label">Всего заказов</span>
            <span className="reports-stat-card__icon-box"><AppIcon name="clipboard" size="sm" /></span>
          </div>
          <div className="reports-stat-card__value">{totalStats.totalOrders}</div>
          <div className="reports-stat-card__trend">За выбранный период</div>
        </div>
        <div className="reports-stat-card">
          <div className="reports-stat-card__header">
            <span className="reports-stat-card__label">Общая выручка</span>
            <span className="reports-stat-card__icon-box"><AppIcon name="money" size="sm" /></span>
          </div>
          <div className="reports-stat-card__value">{totalStats.totalRevenue.toLocaleString('ru-RU')}</div>
          <div className="reports-stat-card__trend">BYN</div>
        </div>
        <div className="reports-stat-card">
          <div className="reports-stat-card__header">
            <span className="reports-stat-card__label">Менеджеров</span>
            <span className="reports-stat-card__icon-box"><AppIcon name="users" size="sm" /></span>
          </div>
          <div className="reports-stat-card__value">{totalStats.uniqueUsers}</div>
          <div className="reports-stat-card__trend reports-stat-card__trend--neutral">Активных</div>
        </div>
        <div className="reports-stat-card">
          <div className="reports-stat-card__header">
            <span className="reports-stat-card__label">Продуктов</span>
            <span className="reports-stat-card__icon-box"><AppIcon name="package" size="sm" /></span>
          </div>
          <div className="reports-stat-card__value">{totalStats.reportsCount}</div>
          <div className="reports-stat-card__trend reports-stat-card__trend--neutral">В анализе</div>
        </div>
      </div>

      {/* Filters */}
      <div className="reports-filters">
        <div className="reports-filters__row">
          <div className="reports-filter-group">
            <label className="reports-filter-label">Период</label>
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
          <div className="reports-filter-group">
            <label className="reports-filter-label">Диапазон дат</label>
            <div className="reports-filter-dates">
              <input
                type="date"
                value={dateFrom ?? ''}
                onChange={(e) => handleDateRangeChange(e.target.value, dateTo ?? '')}
                className="reports-filter-input"
              />
              <span className="reports-filter-sep">—</span>
              <input
                type="date"
                value={dateTo ?? ''}
                onChange={(e) => handleDateRangeChange(dateFrom ?? '', e.target.value)}
                className="reports-filter-input"
              />
              {(dateFrom || dateTo) && (
                <button type="button" onClick={clearDateRange} className="reports-filter-reset">
                  Сбросить
                </button>
              )}
            </div>
          </div>
          <div className="reports-filter-group">
            <label className="reports-filter-label">Департамент</label>
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
        </div>
      </div>

      {/* Tabs */}
      <div className="reports-tabs">
        {[
          { key: 'overview', label: 'Обзор', iconName: 'chart' as const },
          { key: 'managers', label: 'Менеджеры', iconName: 'users' as const },
          { key: 'materials', label: 'Материалы', iconName: 'package' as const },
          { key: 'time', label: 'Время', iconName: 'clock' as const }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key as AnalyticsTab)}
            className={`reports-tab-btn ${activeTab === tab.key ? 'reports-tab-btn--active' : ''}`}
          >
            <AppIcon name={tab.iconName} size="xs" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {hasData ? (
        <div className="reports-content">
          {activeTab === 'overview' && (
            <>
              {productData && <ProductAnalytics data={productData} />}
              {financialData && <FinancialAnalytics data={financialData} />}
              {orderStatusData && <OrderStatusAnalytics data={orderStatusData} />}
            </>
          )}
          {activeTab === 'managers' && managerData && <ManagerAnalytics data={managerData} />}
          {activeTab === 'materials' && (
            materialsData ? (
              <MaterialsAnalytics data={materialsData} />
            ) : (
              <div className="reports-empty">
                {isLoading ? 'Загрузка данных по материалам...' : (
                  <>
                    Не удалось загрузить отчёт по материалам.
                    <br />
                    <button type="button" onClick={refreshAnalytics} className="reports-filter-reset" style={{ marginTop: 12 }}>
                      Повторить загрузку
                    </button>
                  </>
                )}
              </div>
            )
          )}
          {activeTab === 'time' && timeData && <TimeAnalytics data={timeData} />}
        </div>
      ) : (
        <div className="reports-empty">
          {isLoading ? 'Загрузка данных аналитики...' : 'Нет данных для отображения'}
        </div>
      )}
    </div>
  );
};
