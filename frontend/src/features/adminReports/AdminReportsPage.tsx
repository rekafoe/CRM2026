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
import { api, getAnalyticsOrderReasons, getAnalyticsOrdersList, getDepartments, updateReasonPresetsSettings, type Department } from '../../api';
import { Button } from '../../components/common';
import { AppIcon } from '../../components/ui/AppIcon';
import { useReasonPresets } from '../../components/common/useReasonPresets';

import './AdminReportsPage.css';

interface AdminReportsPageProps {
  onBack?: () => void;
}

type MarkupSetting = {
  id: number;
  setting_name: string;
  setting_value: number;
  description?: string;
  is_active?: number;
};

const DASHBOARD_SETTING_META = {
  report_alert_cancellation_warn: { description: 'Dashboard: порог warn по отменам, %' },
  report_alert_cancellation_critical: { description: 'Dashboard: порог critical по отменам, %' },
  report_alert_pending_warn: { description: 'Dashboard: порог warn по pending предоплатам, %' },
  report_alert_pending_critical: { description: 'Dashboard: порог critical по pending предоплатам, %' },
  report_alert_sla_warn_hours: { description: 'Dashboard: порог warn по SLA, часы' },
  report_alert_sla_critical_hours: { description: 'Dashboard: порог critical по SLA, часы' },
  report_plan_orders: { description: 'Dashboard: план по заказам (за выбранный период)' },
  report_plan_revenue: { description: 'Dashboard: план по выручке (за выбранный период)' },
} as const;

const getScopedSettingName = (baseName: keyof typeof DASHBOARD_SETTING_META, deptId?: number) =>
  deptId ? `${baseName}__dept_${deptId}` : baseName;

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
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useState<number>(60);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [alertThresholds, setAlertThresholds] = useState({
    cancellationWarn: 10,
    cancellationCritical: 20,
    pendingWarn: 20,
    pendingCritical: 35,
    slaWarnHours: 24,
    slaCriticalHours: 48,
  });
  const [planTargets, setPlanTargets] = useState({
    ordersPlan: 0,
    revenuePlan: 0,
  });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [dashboardSettingsByName, setDashboardSettingsByName] = useState<Record<string, MarkupSetting>>({});
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownTitle, setDrilldownTitle] = useState('Детализация KPI');
  const [drilldownStatus, setDrilldownStatus] = useState<string>('all');
  const [drilldownOrders, setDrilldownOrders] = useState<Array<{
    id: number;
    number: string;
    status: number;
    created_at: string;
    prepayment_status?: string | null;
    payment_method?: string | null;
    prepayment_amount: number;
    discount_percent: number;
    user_id?: number | null;
    user_name?: string | null;
    order_total: number;
  }>>([]);
  const [drilldownSummary, setDrilldownSummary] = useState<{ total_orders: number; total_revenue: number }>({
    total_orders: 0,
    total_revenue: 0,
  });
  const [drilldownReasonFilter, setDrilldownReasonFilter] = useState<string>('');
  const [reasonStatsLoading, setReasonStatsLoading] = useState(false);
  const [orderReasonStats, setOrderReasonStats] = useState<{
    cancellation_total: number;
    delayed_total: number;
    cancellation_reasons: Array<{ reason: string; reason_code: string; count: number; percent: number }>;
    delay_reasons: Array<{ reason: string; reason_code: string; count: number; percent: number }>;
    notes?: string;
  }>({
    cancellation_total: 0,
    delayed_total: 0,
    cancellation_reasons: [],
    delay_reasons: [],
  });
  const [reasonPresetsSaving, setReasonPresetsSaving] = useState(false);
  const [reasonPresetsDraft, setReasonPresetsDraft] = useState({
    delete: '',
    status_cancel: '',
    online_cancel: '',
  });
  const { presets: reasonPresets, setLocalPresets } = useReasonPresets();

  useEffect(() => {
    getDepartments().then(r => setDepartments(r.data ?? [])).catch(() => setDepartments([]));
  }, []);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadDashboardSettings = async (selectedDepartmentId?: number) => {
    try {
      const res = await api.get<MarkupSetting[]>('/pricing/markup-settings');
      const rows = Array.isArray(res.data) ? res.data : [];
      const byName = rows.reduce<Record<string, MarkupSetting>>((acc, row) => {
        acc[row.setting_name] = row;
        return acc;
      }, {});
      setDashboardSettingsByName(byName);

      const pickValue = (baseName: keyof typeof DASHBOARD_SETTING_META, fallback: number) => {
        const scopedName = getScopedSettingName(baseName, selectedDepartmentId);
        const scopedValue = byName[scopedName]?.setting_value;
        if (scopedValue !== undefined && scopedValue !== null) {
          return Number(scopedValue);
        }
        const globalValue = byName[baseName]?.setting_value;
        if (globalValue !== undefined && globalValue !== null) {
          return Number(globalValue);
        }
        return fallback;
      };

      setAlertThresholds((prev) => ({
        cancellationWarn: pickValue('report_alert_cancellation_warn', prev.cancellationWarn),
        cancellationCritical: pickValue('report_alert_cancellation_critical', prev.cancellationCritical),
        pendingWarn: pickValue('report_alert_pending_warn', prev.pendingWarn),
        pendingCritical: pickValue('report_alert_pending_critical', prev.pendingCritical),
        slaWarnHours: pickValue('report_alert_sla_warn_hours', prev.slaWarnHours),
        slaCriticalHours: pickValue('report_alert_sla_critical_hours', prev.slaCriticalHours),
      }));
      setPlanTargets((prev) => ({
        ordersPlan: pickValue('report_plan_orders', prev.ordersPlan),
        revenuePlan: pickValue('report_plan_revenue', prev.revenuePlan),
      }));
      setSettingsDirty(false);
    } catch {
      // Для старых инсталляций, где endpoint временно недоступен, оставляем локальные дефолты.
    }
  };

  useEffect(() => {
    void loadDashboardSettings(departmentId);
  }, []);

  const upsertDashboardSetting = async (settingName: keyof typeof DASHBOARD_SETTING_META, value: number, selectedDepartmentId?: number) => {
    const scopedSettingName = getScopedSettingName(settingName, selectedDepartmentId);
    const existing = dashboardSettingsByName[scopedSettingName];
    const scopeLabel = selectedDepartmentId ? ` [department:${selectedDepartmentId}]` : ' [global]';
    const payload = {
      setting_name: scopedSettingName,
      setting_value: Number.isFinite(value) ? value : 0,
      description: `${DASHBOARD_SETTING_META[settingName].description}${scopeLabel}`,
      is_active: 1,
    };

    if (existing?.id) {
      try {
        await api.put(`/pricing/markup-settings/${existing.id}`, payload);
        return;
      } catch {
        // Если запись удалили параллельно, ниже сделаем create.
      }
    }
    await api.post('/pricing/markup-settings', payload);
  };

  const saveDashboardSettings = async () => {
    setSettingsSaving(true);
    try {
      await Promise.all([
        upsertDashboardSetting('report_alert_cancellation_warn', alertThresholds.cancellationWarn, departmentId),
        upsertDashboardSetting('report_alert_cancellation_critical', alertThresholds.cancellationCritical, departmentId),
        upsertDashboardSetting('report_alert_pending_warn', alertThresholds.pendingWarn, departmentId),
        upsertDashboardSetting('report_alert_pending_critical', alertThresholds.pendingCritical, departmentId),
        upsertDashboardSetting('report_alert_sla_warn_hours', alertThresholds.slaWarnHours, departmentId),
        upsertDashboardSetting('report_alert_sla_critical_hours', alertThresholds.slaCriticalHours, departmentId),
        upsertDashboardSetting('report_plan_orders', planTargets.ordersPlan, departmentId),
        upsertDashboardSetting('report_plan_revenue', planTargets.revenuePlan, departmentId),
      ]);
      await loadDashboardSettings(departmentId);
    } finally {
      setSettingsSaving(false);
    }
  };

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
    void loadDashboardSettings(id);
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

  const loadDrilldownOrders = async (status: string, title?: string, reasonFilter?: string) => {
    setDrilldownLoading(true);
    if (title) setDrilldownTitle(title);
    setDrilldownStatus(status);
    setDrilldownReasonFilter(reasonFilter || '');
    try {
      const res = await getAnalyticsOrdersList({
        ...(dateFrom && dateTo ? { date_from: dateFrom, date_to: dateTo } : { period: String(period) }),
        status,
        reason_filter: reasonFilter || undefined,
        department_id: departmentId,
        limit: 300,
      });
      setDrilldownOrders(res.data?.orders ?? []);
      setDrilldownSummary(res.data?.summary ?? { total_orders: 0, total_revenue: 0 });
      setDrilldownOpen(true);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const loadOrderReasonStats = async () => {
    setReasonStatsLoading(true);
    try {
      const res = await getAnalyticsOrderReasons({
        ...(dateFrom && dateTo ? { date_from: dateFrom, date_to: dateTo } : { period: String(period) }),
        department_id: departmentId,
      });
      setOrderReasonStats({
        cancellation_total: Number(res.data?.cancellation_total || 0),
        delayed_total: Number(res.data?.delayed_total || 0),
        cancellation_reasons: res.data?.cancellation_reasons ?? [],
        delay_reasons: res.data?.delay_reasons ?? [],
        notes: res.data?.notes,
      });
    } finally {
      setReasonStatsLoading(false);
    }
  };

  useEffect(() => {
    void loadOrderReasonStats();
  }, [period, dateFrom, dateTo, departmentId]);

  useEffect(() => {
    setReasonPresetsDraft({
      delete: (reasonPresets.delete || []).join('\n'),
      status_cancel: (reasonPresets.status_cancel || []).join('\n'),
      online_cancel: (reasonPresets.online_cancel || []).join('\n'),
    });
  }, [reasonPresets.delete, reasonPresets.status_cancel, reasonPresets.online_cancel]);

  const saveReasonPresets = async () => {
    const toList = (raw: string) =>
      Array.from(
        new Set(
          String(raw || '')
            .split('\n')
            .map((x) => x.trim())
            .filter(Boolean)
            .map((x) => x.slice(0, 120))
        )
      );
    const payload = {
      delete: toList(reasonPresetsDraft.delete),
      status_cancel: toList(reasonPresetsDraft.status_cancel),
      online_cancel: toList(reasonPresetsDraft.online_cancel),
    };
    setReasonPresetsSaving(true);
    try {
      await updateReasonPresetsSettings(payload);
      setLocalPresets(payload);
    } finally {
      setReasonPresetsSaving(false);
    }
  };

  const handleAlertNavigate = (tab?: AnalyticsTab) => {
    if (!tab) return;
    setActiveTab(tab);
    loadAnalytics(tab, periodParams, departmentId);
  };

  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const intervalMs = Math.max(10, autoRefreshSeconds) * 1000;
    const intervalId = setInterval(() => {
      void refreshAnalytics();
    }, intervalMs);
    return () => clearInterval(intervalId);
  }, [autoRefreshEnabled, autoRefreshSeconds, refreshAnalytics]);

  const alerts = (() => {
    const items: Array<{ level: 'ok' | 'warn' | 'critical'; title: string; description: string; tab?: AnalyticsTab }> = [];

    const totalOrdersFromFunnel = orderStatusData?.statusFunnel?.reduce((sum, row) => sum + Number(row.count || 0), 0) || 0;
    const cancelledOrders = Number(orderStatusData?.cancellationReasons?.cancelled_count || 0);
    const cancellationRate = totalOrdersFromFunnel > 0 ? (cancelledOrders / totalOrdersFromFunnel) * 100 : 0;
    if (cancellationRate >= alertThresholds.cancellationCritical) {
      items.push({
        level: 'critical',
        title: 'Высокий процент отмен',
        description: `Отмены ${cancellationRate.toFixed(1)}% (${cancelledOrders} из ${totalOrdersFromFunnel})`,
        tab: 'overview',
      });
    } else if (cancellationRate >= alertThresholds.cancellationWarn) {
      items.push({
        level: 'warn',
        title: 'Растут отмены заказов',
        description: `Отмены ${cancellationRate.toFixed(1)}% (${cancelledOrders} из ${totalOrdersFromFunnel})`,
        tab: 'overview',
      });
    }

    const pendingPrepayment = Number(financialData?.prepaymentAnalysis?.total_pending_prepayment || 0);
    const paidPrepayment = Number(financialData?.prepaymentAnalysis?.total_paid_prepayment || 0);
    const prepaymentTotal = pendingPrepayment + paidPrepayment;
    const pendingShare = prepaymentTotal > 0 ? (pendingPrepayment / prepaymentTotal) * 100 : 0;
    if (pendingShare >= alertThresholds.pendingCritical) {
      items.push({
        level: 'critical',
        title: 'Большой объём неоплаченных предоплат',
        description: `${pendingShare.toFixed(1)}% предоплат в статусе pending`,
        tab: 'overview',
      });
    } else if (pendingShare >= alertThresholds.pendingWarn) {
      items.push({
        level: 'warn',
        title: 'Неоплаченные предоплаты выше нормы',
        description: `${pendingShare.toFixed(1)}% предоплат в статусе pending`,
        tab: 'overview',
      });
    }

    const avgHoursToComplete = Number(orderStatusData?.avgProcessingTime?.avg_hours_to_complete || 0);
    if (avgHoursToComplete >= alertThresholds.slaCriticalHours) {
      items.push({
        level: 'critical',
        title: 'Просадка SLA по срокам',
        description: `Среднее время выполнения ${avgHoursToComplete.toFixed(1)} ч`,
        tab: 'time',
      });
    } else if (avgHoursToComplete >= alertThresholds.slaWarnHours) {
      items.push({
        level: 'warn',
        title: 'Увеличилось время выполнения',
        description: `Среднее время выполнения ${avgHoursToComplete.toFixed(1)} ч`,
        tab: 'time',
      });
    }

    if (items.length === 0) {
      items.push({
        level: 'ok',
        title: 'Критичных отклонений не обнаружено',
        description: 'Ключевые показатели находятся в рабочем диапазоне',
      });
    }

    return items;
  })();

  const ordersFact = totalStats.totalOrders;
  const ordersPlan = Math.max(0, Number(planTargets.ordersPlan) || 0);
  const ordersPlanPercent = ordersPlan > 0 ? (ordersFact / ordersPlan) * 100 : null;

  const revenueFact = totalStats.totalRevenue;
  const revenuePlan = Math.max(0, Number(planTargets.revenuePlan) || 0);
  const revenuePlanPercent = revenuePlan > 0 ? (revenueFact / revenuePlan) * 100 : null;
  const selectedDepartmentName = departmentId
    ? departments.find((d) => d.id === departmentId)?.name || `#${departmentId}`
    : null;
  const totalCreated = orderStatusData?.statusConversion?.reduce((sum, row) => sum + Number(row.total_created || 0), 0) || 0;
  const totalPaid = Number(financialData?.prepaymentAnalysis?.paid_prepayments || 0);
  const totalCompleted = orderStatusData?.statusConversion?.reduce((sum, row) => sum + Number(row.completed_orders || 0), 0) || 0;
  const avgCheckCurrent = Number(
    financialData?.avgCheckSummary?.current_avg_check ??
    (totalStats.totalOrders > 0 ? totalStats.totalRevenue / totalStats.totalOrders : 0)
  );
  const avgCheckTrendPercent = financialData?.avgCheckSummary?.trend_percent ?? null;

  const paidFromCreatedPercent = totalCreated > 0 ? (totalPaid / totalCreated) * 100 : null;
  const completedFromPaidPercent = totalPaid > 0 ? (totalCompleted / totalPaid) * 100 : null;
  const completedFromCreatedPercent = totalCreated > 0 ? (totalCompleted / totalCreated) * 100 : null;

  const buildXlsxSheets = () => {
    const summaryRows = [
      { Показатель: 'Всего заказов', Значение: totalStats.totalOrders },
      { Показатель: 'Общая выручка', Значение: totalStats.totalRevenue },
      { Показатель: 'План заказов', Значение: ordersPlan },
      { Показатель: 'Факт/План заказов, %', Значение: ordersPlan > 0 ? Number(ordersPlanPercent?.toFixed(2) || 0) : '-' },
      { Показатель: 'План выручки', Значение: revenuePlan },
      { Показатель: 'Факт/План выручки, %', Значение: revenuePlan > 0 ? Number(revenuePlanPercent?.toFixed(2) || 0) : '-' },
      { Показатель: 'Создано заказов', Значение: totalCreated },
      { Показатель: 'Оплачено предоплат', Значение: totalPaid },
      { Показатель: 'Выдано заказов', Значение: totalCompleted },
      { Показатель: 'Конверсия создано→оплачено, %', Значение: paidFromCreatedPercent != null ? Number(paidFromCreatedPercent.toFixed(2)) : '-' },
      { Показатель: 'Конверсия оплачено→выдано, %', Значение: completedFromPaidPercent != null ? Number(completedFromPaidPercent.toFixed(2)) : '-' },
      { Показатель: 'Конверсия создано→выдано, %', Значение: completedFromCreatedPercent != null ? Number(completedFromCreatedPercent.toFixed(2)) : '-' },
      { Показатель: 'Средний чек, BYN', Значение: Number(avgCheckCurrent.toFixed(2)) },
      { Показатель: 'Динамика среднего чека к прошлому периоду, %', Значение: avgCheckTrendPercent != null ? Number(avgCheckTrendPercent.toFixed(2)) : '-' },
      { Показатель: 'Активных менеджеров', Значение: totalStats.uniqueUsers },
      { Показатель: 'Продуктов в анализе', Значение: totalStats.reportsCount },
      { Показатель: 'Период (дней)', Значение: period },
      { Показатель: 'Дата от', Значение: dateFrom || '-' },
      { Показатель: 'Дата до', Значение: dateTo || '-' },
      { Показатель: 'Департамент', Значение: departmentId ?? 'Все' },
      { Показатель: 'Экспортированная вкладка', Значение: activeTab },
      { Показатель: 'Дата экспорта', Значение: new Date().toISOString() },
    ];

    const sheets: Array<{ name: string; rows: Array<Record<string, any>> }> = [
      { name: 'Сводка', rows: summaryRows },
    ];

    if (activeTab === 'overview') {
      if (productData?.productPopularity?.length) {
        sheets.push({
          name: 'Продукты',
          rows: productData.productPopularity.map((r) => ({
            Продукт: r.product_type,
            'Заказов': r.order_count,
            'Количество': r.total_quantity,
            'Выручка': r.total_revenue,
            'Средняя цена': r.avg_price,
          })),
        });
      }
      if (financialData?.productProfitability?.length) {
        sheets.push({
          name: 'Финансы',
          rows: financialData.productProfitability.map((r) => ({
            Продукт: r.product_type,
            'Выручка': r.total_revenue,
            'Заказов': r.order_count,
            'Средний чек': r.avg_order_value,
            'Единиц': r.total_items,
          })),
        });
      }
      if (orderStatusData?.statusFunnel?.length) {
        sheets.push({
          name: 'Статусы',
          rows: orderStatusData.statusFunnel.map((r) => ({
            Статус: r.status_name,
            'Количество': r.count,
            'Сумма': r.total_amount,
            'Средняя сумма': r.avg_amount,
          })),
        });
      }
    }

    if (activeTab === 'managers' && managerData?.managerEfficiency?.length) {
      sheets.push({
        name: 'Менеджеры',
        rows: managerData.managerEfficiency.map((r) => ({
          Менеджер: r.user_name,
          'Заказов': r.total_orders,
          'Выполнено': r.completed_orders,
          'Отменено': r.cancelled_orders,
          'Выручка': r.total_revenue,
          'Средний чек': r.avg_order_value,
          'Среднее время (ч)': r.avg_processing_hours,
        })),
      });
    }

    if (activeTab === 'materials' && materialsData?.abcAnalysis?.length) {
      sheets.push({
        name: 'Материалы',
        rows: materialsData.abcAnalysis.map((r) => ({
          Материал: r.material_name,
          Категория: r.category_name,
          'Потреблено': r.total_consumed,
          'Себестоимость': r.total_cost,
          'ABC класс': r.abc_class,
          'Доля накопительная %': Number(r.cumulative_percentage?.toFixed?.(2) ?? r.cumulative_percentage),
        })),
      });
    }

    if (activeTab === 'time' && timeData?.hourlyAnalysis?.length) {
      sheets.push({
        name: 'Часы',
        rows: timeData.hourlyAnalysis.map((r) => ({
          Час: r.hour,
          'Заказов': r.orders_count,
          'Выручка': r.total_revenue,
          'Средний чек': r.avg_order_value,
        })),
      });
    }

    return sheets.filter((s) => s.rows.length > 0);
  };

  const handleExportXlsx = async () => {
    setIsExportingXlsx(true);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const sheets = buildXlsxSheets();
      sheets.forEach((sheet) => {
        const ws = XLSX.utils.json_to_sheet(sheet.rows);
        XLSX.utils.book_append_sheet(workbook, ws, sheet.name.slice(0, 31));
      });
      const datePart = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `analytics-${activeTab}-${datePart}.xlsx`);
    } finally {
      setIsExportingXlsx(false);
    }
  };

  return (
    <div className="reports-page">
      {/* Header */}
      <div className="reports-header">
        <div className="reports-header-top">
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
          <div className="reports-user-info">
            Аналитика за период
          </div>
          <div className="reports-auto-refresh">
            <label className="reports-auto-refresh__toggle">
              <input
                type="checkbox"
                checked={autoRefreshEnabled}
                onChange={(e) => setAutoRefreshEnabled(e.target.checked)}
              />
              Auto-refresh
            </label>
            <select
              className="reports-filter-input"
              value={autoRefreshSeconds}
              onChange={(e) => setAutoRefreshSeconds(Number(e.target.value))}
              disabled={!autoRefreshEnabled}
              style={{ minWidth: 100 }}
            >
              <option value={30}>30 сек</option>
              <option value={60}>60 сек</option>
              <option value={120}>120 сек</option>
            </select>
          </div>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>
            <AppIcon name="printer" size="xs" /> Печать
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportJSON}>
            <AppIcon name="download" size="xs" /> Экспорт JSON
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleExportXlsx}
            disabled={isExportingXlsx}
          >
            {isExportingXlsx ? '⏳ Экспорт...' : <><AppIcon name="chart-bar" size="xs" /> Экспорт XLSX</>}
          </Button>
          <Button variant="primary" size="sm" onClick={refreshAnalytics} disabled={isLoading}>
            {isLoading ? 'Загрузка…' : <><AppIcon name="refresh" size="xs" /> Обновить</>}
          </Button>
        </div>
        </div>

        {/* Статистика */}
        <div className="reports-stats">
          <div
            className="reports-stat-card reports-stat-card--clickable"
            onClick={() => void loadDrilldownOrders('all', 'Все заказы за период')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void loadDrilldownOrders('all', 'Все заказы за период'); }}
          >
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
          <div className="reports-stat-card">
            <div className="reports-stat-value">
              {ordersPlan > 0 ? `${ordersFact}/${ordersPlan}` : `${ordersFact}`}
            </div>
            <div className="reports-stat-label">
              План/факт заказов {ordersPlanPercent != null ? `(${ordersPlanPercent.toFixed(1)}%)` : '(план не задан)'}
            </div>
          </div>
          <div className="reports-stat-card">
            <div className="reports-stat-value">
              {revenuePlan > 0
                ? `${revenueFact.toLocaleString('ru-RU')} / ${revenuePlan.toLocaleString('ru-RU')}`
                : `${revenueFact.toLocaleString('ru-RU')}`}
            </div>
            <div className="reports-stat-label">
              План/факт выручки {revenuePlanPercent != null ? `(${revenuePlanPercent.toFixed(1)}%)` : '(план не задан)'}
            </div>
          </div>
          <div
            className="reports-stat-card reports-stat-card--clickable"
            onClick={() => void loadDrilldownOrders('paid', 'Оплаченные заказы (по предоплате)')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void loadDrilldownOrders('paid', 'Оплаченные заказы (по предоплате)'); }}
          >
            <div className="reports-stat-value">
              {paidFromCreatedPercent != null ? `${paidFromCreatedPercent.toFixed(1)}%` : '—'}
            </div>
            <div className="reports-stat-label">
              Конверсия создано → оплачено ({totalPaid}/{totalCreated})
            </div>
          </div>
          <div
            className="reports-stat-card reports-stat-card--clickable"
            onClick={() => void loadDrilldownOrders('completed', 'Выданные заказы')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void loadDrilldownOrders('completed', 'Выданные заказы'); }}
          >
            <div className="reports-stat-value">
              {completedFromPaidPercent != null ? `${completedFromPaidPercent.toFixed(1)}%` : '—'}
            </div>
            <div className="reports-stat-label">
              Конверсия оплачено → выдано ({totalCompleted}/{totalPaid})
            </div>
          </div>
          <div
            className="reports-stat-card reports-stat-card--clickable"
            onClick={() => void loadDrilldownOrders('completed', 'Сквозная конверсия: выданные заказы')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void loadDrilldownOrders('completed', 'Сквозная конверсия: выданные заказы'); }}
          >
            <div className="reports-stat-value">
              {completedFromCreatedPercent != null ? `${completedFromCreatedPercent.toFixed(1)}%` : '—'}
            </div>
            <div className="reports-stat-label">
              Сквозная конверсия создано → выдано
            </div>
          </div>
          <div className="reports-stat-card">
            <div className="reports-stat-value">
              {avgCheckCurrent.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} BYN
            </div>
            <div className="reports-stat-label">
              Средний чек за период
            </div>
          </div>
          <div className="reports-stat-card">
            <div className="reports-stat-value">
              {avgCheckTrendPercent != null ? `${avgCheckTrendPercent.toFixed(1)}%` : '—'}
            </div>
            <div className="reports-stat-label">
              Динамика среднего чека к прошлому периоду
            </div>
          </div>
        </div>

        <div className="reports-alerts">
          {alerts.map((alert, idx) => (
            <button
              key={`${alert.title}-${idx}`}
              type="button"
              className={`reports-alert reports-alert--${alert.level} ${alert.tab ? 'reports-alert--clickable' : ''}`}
              onClick={() => handleAlertNavigate(alert.tab)}
              disabled={!alert.tab}
              title={alert.tab ? 'Открыть связанную аналитику' : undefined}
            >
              <div className="reports-alert__title">{alert.title}</div>
              <div className="reports-alert__description">{alert.description}</div>
            </button>
          ))}
        </div>

        <div className="reports-reasons">
          <div className="reports-thresholds__title">Причины отмен и задержек</div>
          {reasonStatsLoading ? (
            <div className="reports-user-info">Загрузка причин...</div>
          ) : (
            <div className="reports-reasons__grid">
              <div className="reports-reasons__col">
                <div className="reports-reasons__col-title">
                  Отмены (всего: {orderReasonStats.cancellation_total})
                </div>
                {orderReasonStats.cancellation_reasons.map((row) => (
                  <button
                    key={`cancel-${row.reason_code}`}
                    type="button"
                    className="reports-reason-item"
                    onClick={() => void loadDrilldownOrders('cancelled', `Отмены: ${row.reason}`, row.reason_code)}
                    title="Открыть список заказов по причине"
                  >
                    <span>{row.reason}</span>
                    <span>{row.count} ({row.percent.toFixed(1)}%)</span>
                  </button>
                ))}
                {orderReasonStats.cancellation_reasons.length === 0 && (
                  <div className="reports-user-info">Нет данных по отменам</div>
                )}
              </div>
              <div className="reports-reasons__col">
                <div className="reports-reasons__col-title">
                  Задержки (всего: {orderReasonStats.delayed_total})
                </div>
                {orderReasonStats.delay_reasons.map((row) => (
                  <button
                    key={`delay-${row.reason_code}`}
                    type="button"
                    className="reports-reason-item"
                    onClick={() => void loadDrilldownOrders('all', `Задержки: ${row.reason}`, row.reason_code)}
                    title="Открыть список заказов по причине"
                  >
                    <span>{row.reason}</span>
                    <span>{row.count} ({row.percent.toFixed(1)}%)</span>
                  </button>
                ))}
                {orderReasonStats.delay_reasons.length === 0 && (
                  <div className="reports-user-info">Нет данных по задержкам</div>
                )}
              </div>
            </div>
          )}
          {orderReasonStats.notes && (
            <div className="reports-user-info" style={{ marginTop: 8 }}>
              {orderReasonStats.notes}
            </div>
          )}
        </div>

        <div className="reports-reasons">
          <div className="reports-thresholds__title">Справочник причин (редактируемый)</div>
          <div className="reports-reasons__grid">
            <label className="reports-thresholds__item">
              Удаление/отмена заказа (по 1 на строку)
              <textarea
                className="reports-filter-input"
                rows={5}
                value={reasonPresetsDraft.delete}
                onChange={(e) => setReasonPresetsDraft((prev) => ({ ...prev, delete: e.target.value }))}
                style={{ minHeight: 120 }}
              />
            </label>
            <label className="reports-thresholds__item">
              Отмена через статус (по 1 на строку)
              <textarea
                className="reports-filter-input"
                rows={5}
                value={reasonPresetsDraft.status_cancel}
                onChange={(e) => setReasonPresetsDraft((prev) => ({ ...prev, status_cancel: e.target.value }))}
                style={{ minHeight: 120 }}
              />
            </label>
            <label className="reports-thresholds__item">
              Отмена онлайн-заказа (по 1 на строку)
              <textarea
                className="reports-filter-input"
                rows={5}
                value={reasonPresetsDraft.online_cancel}
                onChange={(e) => setReasonPresetsDraft((prev) => ({ ...prev, online_cancel: e.target.value }))}
                style={{ minHeight: 120 }}
              />
            </label>
          </div>
          <div className="reports-thresholds__actions">
            <button
              type="button"
              className="reports-action-btn reports-export-btn"
              onClick={saveReasonPresets}
              disabled={reasonPresetsSaving}
              title="Сохранить справочник причин в backend"
            >
              {reasonPresetsSaving ? '⏳ Сохранение...' : '💾 Сохранить справочник причин'}
            </button>
          </div>
        </div>

        <div className="reports-thresholds">
          <div className="reports-thresholds__title">
            Пороги тревог и планы {selectedDepartmentName ? `(департамент: ${selectedDepartmentName})` : '(общие для всех департаментов)'}
          </div>
          <div className="reports-thresholds__grid">
            <label className="reports-thresholds__item">
              Отмены warn (%)
              <input
                type="number"
                min={0}
                className="reports-filter-input"
                value={alertThresholds.cancellationWarn}
                onChange={(e) => {
                  setAlertThresholds((prev) => ({ ...prev, cancellationWarn: Number(e.target.value) || 0 }));
                  setSettingsDirty(true);
                }}
              />
            </label>
            <label className="reports-thresholds__item">
              Отмены critical (%)
              <input
                type="number"
                min={0}
                className="reports-filter-input"
                value={alertThresholds.cancellationCritical}
                onChange={(e) => {
                  setAlertThresholds((prev) => ({ ...prev, cancellationCritical: Number(e.target.value) || 0 }));
                  setSettingsDirty(true);
                }}
              />
            </label>
            <label className="reports-thresholds__item">
              Pending warn (%)
              <input
                type="number"
                min={0}
                className="reports-filter-input"
                value={alertThresholds.pendingWarn}
                onChange={(e) => {
                  setAlertThresholds((prev) => ({ ...prev, pendingWarn: Number(e.target.value) || 0 }));
                  setSettingsDirty(true);
                }}
              />
            </label>
            <label className="reports-thresholds__item">
              Pending critical (%)
              <input
                type="number"
                min={0}
                className="reports-filter-input"
                value={alertThresholds.pendingCritical}
                onChange={(e) => {
                  setAlertThresholds((prev) => ({ ...prev, pendingCritical: Number(e.target.value) || 0 }));
                  setSettingsDirty(true);
                }}
              />
            </label>
            <label className="reports-thresholds__item">
              SLA warn (часы)
              <input
                type="number"
                min={0}
                className="reports-filter-input"
                value={alertThresholds.slaWarnHours}
                onChange={(e) => {
                  setAlertThresholds((prev) => ({ ...prev, slaWarnHours: Number(e.target.value) || 0 }));
                  setSettingsDirty(true);
                }}
              />
            </label>
            <label className="reports-thresholds__item">
              SLA critical (часы)
              <input
                type="number"
                min={0}
                className="reports-filter-input"
                value={alertThresholds.slaCriticalHours}
                onChange={(e) => {
                  setAlertThresholds((prev) => ({ ...prev, slaCriticalHours: Number(e.target.value) || 0 }));
                  setSettingsDirty(true);
                }}
              />
            </label>
            <label className="reports-thresholds__item">
              План заказов
              <input
                type="number"
                min={0}
                className="reports-filter-input"
                value={planTargets.ordersPlan}
                onChange={(e) => {
                  setPlanTargets((prev) => ({ ...prev, ordersPlan: Number(e.target.value) || 0 }));
                  setSettingsDirty(true);
                }}
              />
            </label>
            <label className="reports-thresholds__item">
              План выручки (BYN)
              <input
                type="number"
                min={0}
                className="reports-filter-input"
                value={planTargets.revenuePlan}
                onChange={(e) => {
                  setPlanTargets((prev) => ({ ...prev, revenuePlan: Number(e.target.value) || 0 }));
                  setSettingsDirty(true);
                }}
              />
            </label>
          </div>
          <div className="reports-thresholds__actions">
            <button
              type="button"
              className="reports-action-btn reports-export-btn"
              onClick={saveDashboardSettings}
              disabled={!settingsDirty || settingsSaving}
              title="Сохранить пороги тревог и планы в backend"
            >
              {settingsSaving ? '⏳ Сохранение...' : '💾 Сохранить пороги и планы'}
            </button>
          </div>
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

      {drilldownOpen && (
        <div className="reports-drilldown-overlay" onClick={() => setDrilldownOpen(false)}>
          <div className="reports-drilldown-modal" onClick={(e) => e.stopPropagation()}>
            <div className="reports-drilldown-header">
              <h3>{drilldownTitle}</h3>
              <Button variant="secondary" size="sm" type="button" onClick={() => setDrilldownOpen(false)}>Закрыть</Button>
            </div>
            <div className="reports-drilldown-controls">
              <label className="reports-thresholds__item">
                Фильтр статуса
                <select
                  className="reports-filter-input"
                  value={drilldownStatus}
                  onChange={(e) => void loadDrilldownOrders(e.target.value, undefined, drilldownReasonFilter || undefined)}
                >
                  <option value="all">Все</option>
                  <option value="created">Создан</option>
                  <option value="completed">Выдан</option>
                  <option value="cancelled">Отменён</option>
                  <option value="paid">Оплаченные</option>
                  <option value="pending_payment">Ожидают оплату</option>
                </select>
              </label>
              <div className="reports-user-info">
                Заказов: <b>{drilldownSummary.total_orders}</b> • Сумма: <b>{drilldownSummary.total_revenue.toLocaleString('ru-RU')} BYN</b>
              </div>
            </div>
            <div className="reports-drilldown-table-wrap">
              {drilldownLoading ? (
                <div className="reports-user-info">Загрузка...</div>
              ) : (
                <table className="reports-drilldown-table">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>Дата</th>
                      <th>Статус</th>
                      <th>Оператор</th>
                      <th>Предоплата</th>
                      <th>Сумма заказа</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drilldownOrders.map((order) => (
                      <tr key={order.id}>
                        <td>{order.number || `#${order.id}`}</td>
                        <td>{String(order.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                        <td>{order.status}</td>
                        <td>{order.user_name || '—'}</td>
                        <td>{Number(order.prepayment_amount || 0).toLocaleString('ru-RU')} BYN</td>
                        <td>{Number(order.order_total || 0).toLocaleString('ru-RU')} BYN</td>
                      </tr>
                    ))}
                    {drilldownOrders.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: 16 }}>Нет заказов по текущему фильтру</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
