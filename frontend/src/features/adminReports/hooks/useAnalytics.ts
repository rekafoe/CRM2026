// Кастомный хук для управления аналитикой

import { useState, useCallback } from 'react';
import { AnalyticsService } from '../services/analyticsService';
import {
  AnalyticsState,
  AnalyticsTab,
  ProductAnalyticsData,
  FinancialAnalyticsData,
  OrderStatusAnalyticsData,
  ManagerAnalyticsData,
  MaterialsAnalyticsData,
  TimeAnalyticsData
} from '../types';

const initialState: AnalyticsState = {
  productData: null,
  financialData: null,
  orderStatusData: null,
  managerData: null,
  materialsData: null,
  timeData: null,
  isLoading: false,
  period: 30,
  activeTab: 'overview'
};

export const useAnalytics = () => {
  const [state, setState] = useState<AnalyticsState>(initialState);

  const loadAnalytics = useCallback(async (tab: AnalyticsTab = state.activeTab, period: number = state.period) => {
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const data = await AnalyticsService.loadAnalyticsForTab(tab, period);

      setState(prev => ({
        ...prev,
        productData: data.productData || prev.productData,
        financialData: data.financialData || prev.financialData,
        orderStatusData: data.orderStatusData || prev.orderStatusData,
        managerData: data.managerData || prev.managerData,
        materialsData: data.materialsData || prev.materialsData,
        timeData: data.timeData || prev.timeData,
        isLoading: false,
        activeTab: tab,
        period
      }));
    } catch (error) {
      console.error('Error loading analytics:', error);
      setState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, [state.activeTab, state.period]);

  const setActiveTab = useCallback((tab: AnalyticsTab) => {
    setState(prev => ({ ...prev, activeTab: tab }));
  }, []);

  const setPeriod = useCallback((period: number) => {
    setState(prev => ({ ...prev, period }));
  }, []);

  const refreshAnalytics = useCallback(() => {
    return loadAnalytics(state.activeTab, state.period);
  }, [loadAnalytics, state.activeTab, state.period]);

  return {
    // Состояние
    ...state,

    // Действия
    loadAnalytics,
    setActiveTab,
    setPeriod,
    refreshAnalytics,

    // Геттеры для удобства
    hasData: !!(
      state.productData ||
      state.financialData ||
      state.orderStatusData ||
      state.managerData ||
      state.materialsData ||
      state.timeData
    ),

    // Вычисляемые свойства
    totalStats: {
      totalOrders: state.productData?.productPopularity.reduce((sum, p) => sum + p.order_count, 0) || 0,
      totalRevenue: state.productData?.productPopularity.reduce((sum, p) => sum + p.total_revenue, 0) || 0,
      uniqueUsers: state.managerData?.managerEfficiency.length || 0,
      reportsCount: state.productData?.productPopularity.length || 0
    }
  };
};
