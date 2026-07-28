// Сервис для работы с API аналитики

import {
  getProductPopularityAnalytics,
  getFinancialProfitabilityAnalytics,
  getOrderStatusFunnelAnalytics,
  getManagerEfficiencyAnalytics,
  getMaterialsABCAnalytics,
  getTimePeakHoursAnalytics,
  getRevenueByLocation,
  getPnL,
} from '../../../api';

import {
  ProductAnalyticsData,
  FinancialAnalyticsData,
  OrderStatusAnalyticsData,
  ManagerAnalyticsData,
  MaterialsAnalyticsData,
  TimeAnalyticsData,
  LocationRevenueData,
  PnLData,
  AnalyticsTab
} from '../types';

export type PeriodParams = { period: number; dateFrom?: string; dateTo?: string };

function buildParams(
  { period, dateFrom, dateTo }: PeriodParams,
  departmentId?: number,
): { period?: string; date_from?: string; date_to?: string; department_id?: number } {
  const base = dateFrom && dateTo
    ? { date_from: dateFrom, date_to: dateTo }
    : { period: period.toString() };
  if (departmentId != null) return { ...base, department_id: departmentId };
  return base;
}

export class AnalyticsService {
  static async getProductAnalytics(params: PeriodParams, departmentId?: number): Promise<ProductAnalyticsData> {
    const response = await getProductPopularityAnalytics(buildParams(params, departmentId));
    return response.data;
  }

  static async getFinancialAnalytics(params: PeriodParams, departmentId?: number): Promise<FinancialAnalyticsData> {
    const response = await getFinancialProfitabilityAnalytics(buildParams(params, departmentId));
    return response.data;
  }

  static async getOrderStatusAnalytics(params: PeriodParams, departmentId?: number): Promise<OrderStatusAnalyticsData> {
    const response = await getOrderStatusFunnelAnalytics(buildParams(params, departmentId));
    return response.data;
  }

  static async getManagerAnalytics(params: PeriodParams, departmentId?: number): Promise<ManagerAnalyticsData> {
    const response = await getManagerEfficiencyAnalytics(buildParams(params, departmentId));
    return response.data;
  }

  static async getMaterialsAnalytics(params: PeriodParams, departmentId?: number): Promise<MaterialsAnalyticsData> {
    const p = params.dateFrom && params.dateTo
      ? params
      : { period: params.period * 3, dateFrom: params.dateFrom, dateTo: params.dateTo };
    const response = await getMaterialsABCAnalytics(buildParams(p, departmentId));
    return response.data;
  }

  static async getTimeAnalytics(params: PeriodParams, departmentId?: number): Promise<TimeAnalyticsData> {
    const response = await getTimePeakHoursAnalytics(buildParams(params, departmentId));
    return response.data;
  }

  static async getLocationRevenueAnalytics(
    params: PeriodParams,
    departmentId?: number,
    withByMonth = true,
  ): Promise<LocationRevenueData> {
    const response = await getRevenueByLocation({
      ...buildParams(params, departmentId),
      by_month: withByMonth,
    });
    return response.data;
  }

  static async getPnLAnalytics(
    params: PeriodParams,
    options?: { departmentId?: number; includePayroll?: boolean; includeCogs?: boolean },
  ): Promise<PnLData> {
    const response = await getPnL({
      ...buildParams(params, options?.departmentId),
      include_payroll: options?.includePayroll,
      include_cogs: options?.includeCogs,
    });
    return response.data;
  }

  static async loadAnalyticsForTab(
    tab: AnalyticsTab,
    params: PeriodParams,
    departmentId?: number,
    pnlOptions?: { includePayroll?: boolean; includeCogs?: boolean },
  ): Promise<{
    productData?: ProductAnalyticsData;
    financialData?: FinancialAnalyticsData;
    orderStatusData?: OrderStatusAnalyticsData;
    managerData?: ManagerAnalyticsData;
    materialsData?: MaterialsAnalyticsData;
    timeData?: TimeAnalyticsData;
    locationRevenueData?: LocationRevenueData;
    pnlData?: PnLData;
  }> {
    const results: Record<string, unknown> = {};

    if (tab === 'locations') {
      results.locationRevenueData = await this.getLocationRevenueAnalytics(params, departmentId);
      return results;
    }

    if (tab === 'pnl') {
      results.pnlData = await this.getPnLAnalytics(params, {
        departmentId,
        includePayroll: pnlOptions?.includePayroll,
        includeCogs: pnlOptions?.includeCogs,
      });
      return results;
    }

    const [productResult, financialResult, orderStatusResult] = await Promise.allSettled([
      this.getProductAnalytics(params, departmentId),
      this.getFinancialAnalytics(params, departmentId),
      this.getOrderStatusAnalytics(params, departmentId),
    ]);
    if (productResult.status === 'fulfilled') results.productData = productResult.value;
    else console.error('Product analytics failed:', productResult.reason);
    if (financialResult.status === 'fulfilled') results.financialData = financialResult.value;
    else console.error('Financial analytics failed:', financialResult.reason);
    if (orderStatusResult.status === 'fulfilled') results.orderStatusData = orderStatusResult.value;
    else console.error('Order status analytics failed:', orderStatusResult.reason);

    if (tab === 'managers' || tab === 'overview') {
      try {
        results.managerData = await this.getManagerAnalytics(params, departmentId);
      } catch (e) {
        console.error('Manager analytics load failed:', e);
      }
    }
    if (tab === 'materials' || tab === 'overview') {
      try {
        results.materialsData = await this.getMaterialsAnalytics(params, departmentId);
      } catch (e) {
        console.error('Materials analytics load failed:', e);
      }
    }
    if (tab === 'time' || tab === 'overview') {
      try {
        results.timeData = await this.getTimeAnalytics(params, departmentId);
      } catch (e) {
        console.error('Time analytics load failed:', e);
      }
    }
    return results;
  }
}
