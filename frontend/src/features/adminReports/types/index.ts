// Типы данных для аналитики отчетов

export interface AnalyticsPeriod {
  days: number;
  startDate: string;
}

// === ТИПЫ ПРОДУКТОВ ===
export interface ProductPopularityItem {
  product_type: string;
  order_count: number;
  total_quantity: number;
  total_revenue: number;
  avg_price: number;
  last_order_date: string;
}

export interface ProductCategoryStats {
  category: string;
  order_count: number;
  total_quantity: number;
  total_revenue: number;
}

export interface ProductTrend {
  date: string;
  product_type: string;
  daily_orders: number;
  daily_revenue: number;
}

export interface ProductAverageOrderValue {
  product_type: string;
  avg_order_value: number;
  orders_with_product: number;
}

export interface ProductAnalyticsData {
  period: AnalyticsPeriod;
  productPopularity: ProductPopularityItem[];
  categoryStats: ProductCategoryStats[];
  productTrends: ProductTrend[];
  averageOrderValue: ProductAverageOrderValue[];
}

// === ТИПЫ ФИНАНСОВ ===
export interface ProductProfitability {
  product_type: string;
  total_revenue: number;
  order_count: number;
  avg_order_value: number;
  total_items: number;
}

export interface PaymentAnalysis {
  online_orders: number;
  offline_orders: number;
  telegram_orders: number;
  online_revenue: number;
  offline_revenue: number;
  telegram_revenue: number;
  avg_payment_amount: number;
}

export interface PrepaymentAnalysis {
  paid_prepayments: number;
  pending_prepayments: number;
  total_paid_prepayment: number;
  total_pending_prepayment: number;
  avg_paid_prepayment: number;
}

export interface FinancialAnalyticsData {
  period: AnalyticsPeriod;
  productProfitability: ProductProfitability[];
  paymentAnalysis: PaymentAnalysis;
  prepaymentAnalysis: PrepaymentAnalysis;
}

// === ТИПЫ СТАТУСОВ ЗАКАЗОВ ===
export interface StatusFunnelItem {
  status_name: string;
  status: number;
  count: number;
  total_amount: number;
  avg_amount: number;
}

export interface StatusConversion {
  date: string;
  confirmed_orders: number;
  in_progress_orders: number;
  ready_orders: number;
  completed_orders: number;
  total_created: number;
}

export interface ProcessingTimeStats {
  avg_hours_to_complete: number;
  completed_orders: number;
}

export interface CancellationStats {
  cancelled_count: number;
  cancelled_amount: number;
}

export interface OrderStatusAnalyticsData {
  period: AnalyticsPeriod;
  statusFunnel: StatusFunnelItem[];
  statusConversion: StatusConversion[];
  avgProcessingTime: ProcessingTimeStats;
  cancellationReasons: CancellationStats;
}

// === ТИПЫ МЕНЕДЖЕРОВ ===
export interface ManagerEfficiency {
  user_id: number;
  user_name: string;
  total_orders: number;
  completed_orders: number;
  cancelled_orders: number;
  total_revenue: number;
  avg_order_value: number;
  avg_processing_hours: number;
  active_days: number;
  last_order_date: string;
}

export interface ManagerDailyStats {
  user_id: number;
  date: string;
  daily_orders: number;
  daily_revenue: number;
  daily_completed: number;
}

export interface ManagerConversion {
  user_id: number;
  user_name: string;
  confirmed_orders: number;
  completed_orders: number;
  total_orders: number;
  conversion_rate: number;
}

export interface ManagerAnalyticsData {
  period: AnalyticsPeriod;
  managerEfficiency: ManagerEfficiency[];
  managerDailyStats: ManagerDailyStats[];
  managerConversion: ManagerConversion[];
}

// === ТИПЫ МАТЕРИАЛОВ ===
export interface MaterialAnalysis {
  material_id: number;
  material_name: string;
  category_name: string;
  total_consumed: number;
  total_cost: number;
  usage_days: number;
  last_usage: string;
  avg_daily_consumption: number;
  cumulative_cost: number;
  cumulative_percentage: number;
  abc_class: string;
  abc_description: string;
}

export interface ABCSummary {
  A: { count: number; total_cost: number; percentage: number };
  B: { count: number; total_cost: number; percentage: number };
  C: { count: number; total_cost: number; percentage: number };
}

export interface CategoryAnalysis {
  category_name: string;
  materials_count: number;
  total_consumed: number;
  total_cost: number;
  avg_consumption: number;
}

export interface MaterialsAnalyticsData {
  period: AnalyticsPeriod;
  abcAnalysis: MaterialAnalysis[];
  abcSummary: ABCSummary;
  categoryAnalysis: CategoryAnalysis[];
  totalMaterials: number;
  totalCost: number;
}

// === ТИПЫ ВРЕМЕНИ ===
export interface HourlyAnalysis {
  hour: string;
  orders_count: number;
  total_revenue: number;
  avg_order_value: number;
  active_days: number;
}

export interface WeekdayHourlyAnalysis {
  weekday: string;
  hour: string;
  orders_count: number;
  total_revenue: number;
}

export interface PeakPeriods {
  peakHour: { hour: string; orders_count: number };
  peakWeekday: { weekday: string; orders_count: number; total_revenue: number };
  busiestTimeSlot: { hour: string; orders_count: number };
}

export interface TimeOfDayTrends {
  morning: number;
  afternoon: number;
  evening: number;
  night: number;
}

export interface TimeAnalyticsData {
  period: AnalyticsPeriod;
  hourlyAnalysis: HourlyAnalysis[];
  weekdayHourlyAnalysis: WeekdayHourlyAnalysis[];
  peakPeriods: PeakPeriods;
  timeOfDayTrends: TimeOfDayTrends;
}

// === ОБЩИЕ ТИПЫ ===
export type AnalyticsTab = 'overview' | 'managers' | 'materials' | 'time';

export interface AnalyticsState {
  productData: ProductAnalyticsData | null;
  financialData: FinancialAnalyticsData | null;
  orderStatusData: OrderStatusAnalyticsData | null;
  managerData: ManagerAnalyticsData | null;
  materialsData: MaterialsAnalyticsData | null;
  timeData: TimeAnalyticsData | null;
  isLoading: boolean;
  period: number;
  activeTab: AnalyticsTab;
}
