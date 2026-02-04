// Сервис для работы с API аналитики

import {
  getProductPopularityAnalytics,
  getFinancialProfitabilityAnalytics,
  getOrderStatusFunnelAnalytics,
  getManagerEfficiencyAnalytics,
  getMaterialsABCAnalytics,
  getTimePeakHoursAnalytics
} from '../../../api';

import {
  ProductAnalyticsData,
  FinancialAnalyticsData,
  OrderStatusAnalyticsData,
  ManagerAnalyticsData,
  MaterialsAnalyticsData,
  TimeAnalyticsData,
  AnalyticsTab
} from '../types';

export type PeriodParams = { period: number; dateFrom?: string; dateTo?: string };

function buildParams({ period, dateFrom, dateTo }: PeriodParams): { period?: string; date_from?: string; date_to?: string } {
  if (dateFrom && dateTo) return { date_from: dateFrom, date_to: dateTo };
  return { period: period.toString() };
}

export class AnalyticsService {
  static async getProductAnalytics(params: PeriodParams): Promise<ProductAnalyticsData> {
    const response = await getProductPopularityAnalytics(buildParams(params));
    return response.data;
  }

  static async getFinancialAnalytics(params: PeriodParams): Promise<FinancialAnalyticsData> {
    const response = await getFinancialProfitabilityAnalytics(buildParams(params));
    return response.data;
  }

  static async getOrderStatusAnalytics(params: PeriodParams): Promise<OrderStatusAnalyticsData> {
    const response = await getOrderStatusFunnelAnalytics(buildParams(params));
    return response.data;
  }

  static async getManagerAnalytics(params: PeriodParams, departmentId?: number): Promise<ManagerAnalyticsData> {
    const apiParams = { ...buildParams(params), department_id: departmentId };
    const response = await getManagerEfficiencyAnalytics(apiParams);
    return response.data;
  }

  static async getMaterialsAnalytics(params: PeriodParams): Promise<MaterialsAnalyticsData> {
    const p = params.dateFrom && params.dateTo
      ? params
      : { period: params.period * 3, dateFrom: params.dateFrom, dateTo: params.dateTo };
    const response = await getMaterialsABCAnalytics(buildParams(p));
    return response.data;
  }

  static async getTimeAnalytics(params: PeriodParams): Promise<TimeAnalyticsData> {
    const response = await getTimePeakHoursAnalytics(buildParams(params));
    return response.data;
  }

  static async loadAnalyticsForTab(
    tab: AnalyticsTab,
    params: PeriodParams,
    departmentId?: number
  ): Promise<{
    productData?: ProductAnalyticsData;
    financialData?: FinancialAnalyticsData;
    orderStatusData?: OrderStatusAnalyticsData;
    managerData?: ManagerAnalyticsData;
    materialsData?: MaterialsAnalyticsData;
    timeData?: TimeAnalyticsData;
  }> {
    const results: any = {};
    const [productData, financialData, orderStatusData] = await Promise.all([
      this.getProductAnalytics(params),
      this.getFinancialAnalytics(params),
      this.getOrderStatusAnalytics(params)
    ]);
    results.productData = productData;
    results.financialData = financialData;
    results.orderStatusData = orderStatusData;

    if (tab === 'managers' || tab === 'overview') {
      try {
        results.managerData = await this.getManagerAnalytics(params, departmentId);
      } catch (e) {
        console.error('Manager analytics load failed:', e);
      }
    }
    if (tab === 'materials' || tab === 'overview') {
      try {
        results.materialsData = await this.getMaterialsAnalytics(params);
      } catch (e) {
        console.error('Materials analytics load failed:', e);
      }
    }
    if (tab === 'time' || tab === 'overview') {
      try {
        results.timeData = await this.getTimeAnalytics(params);
      } catch (e) {
        console.error('Time analytics load failed:', e);
      }
    }
    return results;
  }
}
