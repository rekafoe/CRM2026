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

export class AnalyticsService {
  // === ПРОДУКТЫ ===
  static async getProductAnalytics(period: number): Promise<ProductAnalyticsData> {
    const response = await getProductPopularityAnalytics({ period: period.toString() });
    return response.data;
  }

  // === ФИНАНСЫ ===
  static async getFinancialAnalytics(period: number): Promise<FinancialAnalyticsData> {
    const response = await getFinancialProfitabilityAnalytics({ period: period.toString() });
    return response.data;
  }

  // === СТАТУСЫ ЗАКАЗОВ ===
  static async getOrderStatusAnalytics(period: number): Promise<OrderStatusAnalyticsData> {
    const response = await getOrderStatusFunnelAnalytics({ period: period.toString() });
    return response.data;
  }

  // === МЕНЕДЖЕРЫ ===
  static async getManagerAnalytics(period: number): Promise<ManagerAnalyticsData> {
    const response = await getManagerEfficiencyAnalytics({ period: period.toString() });
    return response.data;
  }

  // === МАТЕРИАЛЫ ===
  static async getMaterialsAnalytics(period: number): Promise<MaterialsAnalyticsData> {
    // Для материалов используем больший период (3x)
    const response = await getMaterialsABCAnalytics({ period: (period * 3).toString() });
    return response.data;
  }

  // === ВРЕМЯ ===
  static async getTimeAnalytics(period: number): Promise<TimeAnalyticsData> {
    const response = await getTimePeakHoursAnalytics({ period: period.toString() });
    return response.data;
  }

  // === КОМПЛЕКСНАЯ ЗАГРУЗКА ===
  static async loadAnalyticsForTab(
    tab: AnalyticsTab,
    period: number
  ): Promise<{
    productData?: ProductAnalyticsData;
    financialData?: FinancialAnalyticsData;
    orderStatusData?: OrderStatusAnalyticsData;
    managerData?: ManagerAnalyticsData;
    materialsData?: MaterialsAnalyticsData;
    timeData?: TimeAnalyticsData;
  }> {
    const results: any = {};

    // Всегда загружаем базовую аналитику
    const [productData, financialData, orderStatusData] = await Promise.all([
      this.getProductAnalytics(period),
      this.getFinancialAnalytics(period),
      this.getOrderStatusAnalytics(period)
    ]);

    results.productData = productData;
    results.financialData = financialData;
    results.orderStatusData = orderStatusData;

    // Загружаем дополнительные данные в зависимости от вкладки
    if (tab === 'managers' || tab === 'overview') {
      results.managerData = await this.getManagerAnalytics(period);
    }

    if (tab === 'materials' || tab === 'overview') {
      results.materialsData = await this.getMaterialsAnalytics(period);
    }

    if (tab === 'time' || tab === 'overview') {
      results.timeData = await this.getTimeAnalytics(period);
    }

    return results;
  }
}
