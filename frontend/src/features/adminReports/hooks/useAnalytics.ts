// Кастомный хук для управления аналитикой

import { useState, useCallback, useRef, useEffect } from 'react';
import { AnalyticsService, type PeriodParams } from '../services/analyticsService';
import {
  AnalyticsState,
  AnalyticsTab,
} from '../types';

/** Первый и последний день текущего календарного месяца в формате YYYY-MM-DD */
function getCurrentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { from, to };
}

const defaultMonth = getCurrentMonthRange();

const initialState: AnalyticsState = {
  productData: null,
  financialData: null,
  orderStatusData: null,
  managerData: null,
  materialsData: null,
  timeData: null,
  locationRevenueData: null,
  pnlData: null,
  isLoading: false,
  period: 30,
  dateFrom: defaultMonth.from,
  dateTo: defaultMonth.to,
  activeTab: 'overview',
  departmentId: undefined,
  includePayroll: false,
  includeCogs: false,
};

export const useAnalytics = () => {
  const [state, setState] = useState<AnalyticsState>(initialState);
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  const periodParams: PeriodParams = {
    period: state.period,
    dateFrom: state.dateFrom || undefined,
    dateTo: state.dateTo || undefined
  };

  const loadAnalytics = useCallback(async (
    tab?: AnalyticsTab,
    params?: PeriodParams,
    departmentId?: number,
    pnlOptions?: { includePayroll?: boolean; includeCogs?: boolean },
  ) => {
    const s = stateRef.current;
    const t = tab ?? s.activeTab;
    const p = params ?? { period: s.period, dateFrom: s.dateFrom, dateTo: s.dateTo };
    const d = departmentId ?? s.departmentId;
    const payroll = pnlOptions?.includePayroll ?? s.includePayroll;
    const cogs = pnlOptions?.includeCogs ?? s.includeCogs;
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const data = await AnalyticsService.loadAnalyticsForTab(t, p, d, { includePayroll: payroll, includeCogs: cogs });
      setState(prev => ({
        ...prev,
        productData: data.productData ?? prev.productData,
        financialData: data.financialData ?? prev.financialData,
        orderStatusData: data.orderStatusData ?? prev.orderStatusData,
        managerData: data.managerData ?? prev.managerData,
        materialsData: data.materialsData ?? prev.materialsData,
        timeData: data.timeData ?? prev.timeData,
        locationRevenueData: data.locationRevenueData ?? prev.locationRevenueData,
        pnlData: data.pnlData ?? prev.pnlData,
        isLoading: false,
        activeTab: t,
        period: p.period,
        dateFrom: p.dateFrom,
        dateTo: p.dateTo,
        departmentId: d,
        includePayroll: payroll,
        includeCogs: cogs,
      }));
    } catch (error) {
      console.error('Error loading analytics:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const setActiveTab = useCallback((tab: AnalyticsTab) => {
    setState(prev => ({ ...prev, activeTab: tab }));
  }, []);

  const setPeriod = useCallback((period: number) => {
    setState(prev => ({ ...prev, period }));
  }, []);

  const setDateRange = useCallback((dateFrom: string | undefined, dateTo: string | undefined) => {
    setState(prev => ({ ...prev, dateFrom, dateTo }));
  }, []);

  const setDepartmentId = useCallback((departmentId: number | undefined) => {
    setState(prev => ({ ...prev, departmentId }));
  }, []);

  const setIncludePayroll = useCallback((includePayroll: boolean) => {
    setState(prev => ({ ...prev, includePayroll }));
  }, []);

  const setIncludeCogs = useCallback((includeCogs: boolean) => {
    setState(prev => ({ ...prev, includeCogs }));
  }, []);

  const refreshAnalytics = useCallback(() => {
    const s = stateRef.current;
    return loadAnalytics(
      s.activeTab,
      { period: s.period, dateFrom: s.dateFrom, dateTo: s.dateTo },
      s.departmentId,
      { includePayroll: s.includePayroll, includeCogs: s.includeCogs },
    );
  }, [loadAnalytics]);

  return {
    ...state,
    periodParams,
    loadAnalytics,
    setActiveTab,
    setPeriod,
    setDateRange,
    setDepartmentId,
    setIncludePayroll,
    setIncludeCogs,
    refreshAnalytics,

    hasData: !!(
      state.productData ||
      state.financialData ||
      state.orderStatusData ||
      state.managerData ||
      state.materialsData ||
      state.timeData ||
      state.locationRevenueData ||
      state.pnlData
    ),

    totalStats: {
      totalOrders: state.productData?.productPopularity.reduce((sum, p) => sum + p.order_count, 0) || 0,
      totalRevenue: state.productData?.total_revenue ?? state.productData?.productPopularity.reduce((sum, p) => sum + p.total_revenue, 0) ?? 0,
      uniqueUsers: state.managerData?.managerEfficiency.length || 0,
      reportsCount: state.productData?.productPopularity.length || 0
    }
  };
};
