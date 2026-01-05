import axios from 'axios';
import { calculatePrice as unifiedCalculatePrice } from './services/pricing';
import { Order, Item, PresetCategory, MaterialRow, Material, DailyReport, UserRef, OrderFile, Printer, APP_CONFIG } from './types';
const api = axios.create({ baseURL: '/api' });

// 🆕 Экспортируем api для использования в других компонентах
export { api };

// Attach auth token from localStorage for protected endpoints
api.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem(APP_CONFIG?.storage?.token || '') || localStorage.getItem('crmToken');
    if (token) {
      config.headers = {
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`
      } as any;
    }
  } catch {}
  return config;
});

// Handle API errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Ошибки логируются через систему логирования, не через console
    if (error.response) {
      // Server responded with error status
      const message = error.response.data?.message || error.response.statusText || 'Ошибка сервера';
      throw new Error(`${error.response.status}: ${message}`);
    } else if (error.request) {
      // Request was made but no response received
      throw new Error('Нет ответа от сервера');
    } else {
      // Something else happened
      throw new Error(error.message || 'Неизвестная ошибка');
    }
  }
);

export function setAuthToken(token?: string) {
  if (token) {
    try { if (APP_CONFIG?.storage?.token) localStorage.setItem(APP_CONFIG.storage.token, token); } catch {}
    localStorage.setItem('crmToken', token);
  } else {
    try { if (APP_CONFIG?.storage?.token) localStorage.removeItem(APP_CONFIG.storage.token); } catch {}
    localStorage.removeItem('crmToken');
  }
}

export const getOrders = () => api.get<Order[]>('/orders');
export const createOrder = (date?: string) => api.post<Order>('/orders', { date });
export const updateOrderStatus = (id: number, status: number) =>
  api.put<Order>(`/orders/${id}/status`, { status });

// Order Pool helpers
export const reassignOrderByNumber = (number: string, userId: number) =>
  api.post(`/orders/reassign/${encodeURIComponent(number)}`, { userId });

export const cancelOnlineOrder = (id: number) =>
  api.post(`/orders/${id}/cancel-online`, {});

export const addOrderItem = (id: number, item: Omit<Item, 'id'>) =>
  api.post<Item>(`/orders/${id}/items`, item);

export const deleteOrder = (id: number) => api.delete(`/orders/${id}`);
export const deleteOrderItem = (orderId: number, itemId: number) =>
  api.delete(`/orders/${orderId}/items/${itemId}`);
export const updateOrderItem = (orderId: number, itemId: number, data: Partial<Item>) =>
  api.patch(`/orders/${orderId}/items/${itemId}`, data);

export const getMaterials = () => api.get<Material[]>('/materials');
export const saveMaterial = (mat: Partial<Material>) =>
  api.post<Material[]>('/materials', mat);

// Paper Types API
export const getPaperTypes = () => {
  // Используем кэширование для типов бумаги
  const cacheKey = 'paper-types';
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    // Кэш на 10 минут
    if (Date.now() - timestamp < 600000) {
      return Promise.resolve({ data });
    }
  }
  
  return api.get('/paper-types').then(response => {
    // Сохраняем в кэш
    localStorage.setItem(cacheKey, JSON.stringify({
      data: response.data,
      timestamp: Date.now()
    }));
    return response;
  });
};
export const createPaperType = (paperType: any) => api.post('/paper-types', paperType);
export const updatePaperType = (id: number, paperType: any) => api.put(`/paper-types/${id}`, paperType);
export const deletePaperType = (id: number) => api.delete(`/paper-types/${id}`);
export const addPrintingPrice = (priceData: any) => api.post('/paper-types/prices', priceData);
export const deletePrintingPrice = (id: number) => api.delete(`/paper-types/prices/${id}`);
export const findPaperTypeByMaterial = (materialName: string) => 
  api.get(`/paper-types/find/by-material?materialName=${encodeURIComponent(materialName)}`);
export const getPrintingPrice = (paperTypeId: number, density: number) => 
  api.get(`/paper-types/prices/lookup?paper_type_id=${paperTypeId}&density=${density}`);
export const deleteMaterial = (id: number) => api.delete(`/materials/${id}`);
export const spendMaterial = (payload: { materialId: number; delta: number; reason?: string; orderId?: number }) => api.post<Material>('/materials/spend', payload);
export const getMaterialMoves = (params?: { materialId?: number; orderId?: number; user_id?: number; from?: string; to?: string }) =>
  api.get('/materials/moves', { params });
export const getLowStock = () => api.get<Material[]>('/materials/low-stock');
export const getMaterialTop = (params?: { from?: string; to?: string; limit?: number }) => api.get('/materials/report/top', { params });
export const getMaterialForecast = () => api.get('/materials/report/forecast');

export const getProductMaterials = (cat: string, desc: string) =>
  api.get<MaterialRow[]>(`/product-materials/${encodeURIComponent(cat)}/${encodeURIComponent(desc)}`);
export const saveProductMaterials = (cfg: {
  presetCategory: string;
  presetDescription: string;
  materials: { materialId: number; qtyPerItem: number }[];
}) => api.post('/product-materials', cfg);
export const getDailyReports = (params?: { user_id?: number | ''; from?: string; to?: string; current_user_id?: number }) =>
  api.get<DailyReport[]>('/daily-reports', { params });

export const getCurrentUser = () => api.get<{ id: number; name: string; role: string }>('/auth/me');

// === УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ===
export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at: string;
  has_api_token?: boolean;
}

export const getAllUsers = () => api.get<User[]>('/users/all');
export const createUser = (user: { name: string; email: string; password: string; role: string }) =>
  api.post<User>('/users', user);
export const updateUser = (id: number, user: { name: string; email: string; role: string }) =>
  api.put(`/users/${id}`, user);
export const deleteUser = (id: number) => api.delete(`/users/${id}`);
export const resetUserToken = (id: number) => api.post<{ api_token: string }>(`/users/${id}/reset-token`);

export const deleteDailyReport = (reportId: number) => api.delete(`/daily-reports/${reportId}`);

// Получение полного отчёта с заказами
export const getFullDailyReport = (reportDate: string, userId?: number) => 
  api.get<DailyReport>(`/daily-reports/full/${reportDate}${userId ? `?user_id=${userId}` : ''}`);

// Сохранение полного отчёта
export const saveFullDailyReport = (report: DailyReport) =>
  api.post<DailyReport>('/daily-reports/full', report);

// === АНАЛИТИКА ПРОДУКТОВ ===
export const getProductPopularityAnalytics = (params?: { period?: string; limit?: string }) =>
  api.get<{
    period: { days: number; startDate: string };
    productPopularity: Array<{
      product_type: string;
      order_count: number;
      total_quantity: number;
      total_revenue: number;
      avg_price: number;
      last_order_date: string;
    }>;
    categoryStats: Array<{
      category: string;
      order_count: number;
      total_quantity: number;
      total_revenue: number;
    }>;
    productTrends: Array<{
      date: string;
      product_type: string;
      daily_orders: number;
      daily_revenue: number;
    }>;
    averageOrderValue: Array<{
      product_type: string;
      avg_order_value: number;
      orders_with_product: number;
    }>;
  }>('/reports/analytics/products/popularity', { params });

// === ФИНАНСОВАЯ АНАЛИТИКА ===
export const getFinancialProfitabilityAnalytics = (params?: { period?: string }) =>
  api.get<{
    period: { days: number; startDate: string };
    productProfitability: Array<{
      product_type: string;
      total_revenue: number;
      order_count: number;
      avg_order_value: number;
      total_items: number;
    }>;
    paymentAnalysis: {
      online_orders: number;
      offline_orders: number;
      telegram_orders: number;
      online_revenue: number;
      offline_revenue: number;
      telegram_revenue: number;
      avg_payment_amount: number;
    };
    prepaymentAnalysis: {
      paid_prepayments: number;
      pending_prepayments: number;
      total_paid_prepayment: number;
      total_pending_prepayment: number;
      avg_paid_prepayment: number;
    };
  }>('/reports/analytics/financial/profitability', { params });

// === АНАЛИТИКА СТАТУСОВ ЗАКАЗОВ ===
export const getOrderStatusFunnelAnalytics = (params?: { period?: string }) =>
  api.get<{
    period: { days: number; startDate: string };
    statusFunnel: Array<{
      status_name: string;
      status: number;
      count: number;
      total_amount: number;
      avg_amount: number;
    }>;
    statusConversion: Array<{
      date: string;
      confirmed_orders: number;
      in_progress_orders: number;
      ready_orders: number;
      completed_orders: number;
      total_created: number;
    }>;
    avgProcessingTime: {
      avg_hours_to_complete: number;
      completed_orders: number;
    };
    cancellationReasons: {
      cancelled_count: number;
      cancelled_amount: number;
    };
  }>('/reports/analytics/orders/status-funnel', { params });

// === АНАЛИТИКА ЭФФЕКТИВНОСТИ МЕНЕДЖЕРОВ ===
export const getManagerEfficiencyAnalytics = (params?: { period?: string }) =>
  api.get<{
    period: { days: number; startDate: string };
    managerEfficiency: Array<{
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
    }>;
    managerDailyStats: Array<{
      user_id: number;
      date: string;
      daily_orders: number;
      daily_revenue: number;
      daily_completed: number;
    }>;
    managerConversion: Array<{
      user_id: number;
      user_name: string;
      confirmed_orders: number;
      completed_orders: number;
      total_orders: number;
      conversion_rate: number;
    }>;
  }>('/reports/analytics/managers/efficiency', { params });

// === ABC-АНАЛИЗ МАТЕРИАЛОВ ===
export const getMaterialsABCAnalytics = (params?: { period?: string }) =>
  api.get<{
    period: { days: number; startDate: string };
    abcAnalysis: Array<{
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
    }>;
    abcSummary: {
      A: { count: number; total_cost: number; percentage: number };
      B: { count: number; total_cost: number; percentage: number };
      C: { count: number; total_cost: number; percentage: number };
    };
    categoryAnalysis: Array<{
      category_name: string;
      materials_count: number;
      total_consumed: number;
      total_cost: number;
      avg_consumption: number;
    }>;
    totalMaterials: number;
    totalCost: number;
  }>('/reports/analytics/materials/abc-analysis', { params });

// === ВРЕМЕННАЯ АНАЛИТИКА ===
export const getTimePeakHoursAnalytics = (params?: { period?: string }) =>
  api.get<{
    period: { days: number; startDate: string };
    hourlyAnalysis: Array<{
      hour: string;
      orders_count: number;
      total_revenue: number;
      avg_order_value: number;
      active_days: number;
    }>;
    weekdayHourlyAnalysis: Array<{
      weekday: string;
      hour: string;
      orders_count: number;
      total_revenue: number;
    }>;
    peakPeriods: {
      peakHour: { hour: string; orders_count: number };
      peakWeekday: { weekday: string; orders_count: number; total_revenue: number };
      busiestTimeSlot: { hour: string; orders_count: number };
    };
    timeOfDayTrends: {
      morning: number;
      afternoon: number;
      evening: number;
      night: number;
    };
  }>('/reports/analytics/time/peak-hours', { params });

// Дублирование заказа
export const duplicateOrder = (orderId: number) => 
  api.post<Order>(`/orders/${orderId}/duplicate`);

export const getDailyReportByDate = (date: string) =>
  api.get<DailyReport>(`/daily-reports/${date}`);
export const updateDailyReport = (date: string, data: {
  orders_count?: number;
  total_revenue?: number;
}) =>
  api.patch<DailyReport>(`/daily-reports/${date}`, data);

export const getPresets = () => api.get<PresetCategory[]>('/presets');
export const getUsers = () => api.get<UserRef[]>('/users');
export const createDailyReport = (data: { report_date: string; user_id?: number; orders_count?: number; total_revenue?: number }) =>
  api.post<DailyReport>('/daily-reports', data);

export const getOrderStatuses = () => api.get<Array<{ id: number; name: string; color?: string; sort_order: number }>>('/order-statuses');

// Files API
export const listOrderFiles = (orderId: number) => api.get<OrderFile[]>(`/orders/${orderId}/files`);
export const uploadOrderFile = (orderId: number, file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  return api.post<OrderFile>(`/orders/${orderId}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const deleteOrderFile = (orderId: number, fileId: number) => api.delete(`/orders/${orderId}/files/${fileId}`);
export const approveOrderFile = (orderId: number, fileId: number) => api.post<OrderFile>(`/orders/${orderId}/files/${fileId}/approve`, {});

// Payments / Prepayment
export const createPrepaymentLink = (orderId: number, amount?: number, paymentMethod: 'online' | 'offline' = 'online') => 
  api.post<Order>(`/orders/${orderId}/prepay`, { amount, paymentMethod });

// Генерация PDF бланка заказа
export const generateOrderBlankPdf = (orderId: number, companyPhones?: string[]) => {
  const params = companyPhones && companyPhones.length > 0 
    ? { phones: companyPhones } 
    : {};
  return api.get(`/orders/${orderId}/blank-pdf`, { 
    params,
    responseType: 'blob' // Важно для получения бинарных данных
  });
};

// Pricing API
// Back-compat wrapper: route to unified pricing service
export const calculateProductPrice = (params: any) => unifiedCalculatePrice({
  product_id: params?.productId || params?.product_id || 0,
  quantity: params?.quantity || params?.qty || 1,
  channel: params?.pricingType || params?.channel || 'online',
  params: params?.specifications || params || {}
});

// Printers
export const getPrinters = (params?: { technology_code?: string }) =>
  api.get<Printer[]>('/printers', { params });
export const getPrintTechnologies = () => api.get('/printing-technologies');
export const submitPrinterCounter = (printerId: number, data: { counter_date: string; value: number }) => api.post(`/printers/${printerId}/counters`, data);
export const getPrinterCountersByDate = (date: string) => api.get(`/printers/counters`, { params: { date } });
export const getDailySummary = (date: string) => api.get(`/reports/daily/${date}/summary`);

// Calculators (MVP)
export const getFlyersSchema = () => api.get('/calculators/flyers-color');
export const calcFlyersPrice = (payload: { format: 'A6'|'A5'|'A4'; qty: number; sides: 1|2; paperDensity?: 130|150; lamination?: 'none'|'matte'|'glossy' }) =>
  api.post('/calculators/flyers-color/price', payload);

// Enhanced Calculator with Pricing Policy (migrated to pricing module)
export const getEnhancedProductTypes = () => api.get('/pricing/product-types');
export const getEnhancedProductSchema = (key: string) => api.get(`/pricing/product-types/${key}/schema`);
export const getProductSchemaById = (productId: number) => api.get(`/products/${productId}/schema`);
export const upsertEnhancedProduct = (product: any) => api.post('/pricing/product-types', product);
export const upsertEnhancedProductSchema = (key: string, schema: any) => api.put(`/pricing/product-types/${key}/schema`, schema);
export const deleteEnhancedProduct = (key: string) => api.delete(`/pricing/product-types/${key}`);
export const calcEnhancedFlyersPrice = (payload: { 
  format: 'A6'|'A5'|'A4'; 
  qty: number; 
  sides: 1|2; 
  paperDensity?: 130|150; 
  lamination?: 'none'|'matte'|'glossy';
  priceType?: 'rush'|'online'|'promo';
  customerType?: 'regular'|'vip';
}) => unifiedCalculatePrice({
  product_id: 0,
  quantity: payload.qty,
  channel: (payload.priceType as any) || 'online',
  params: { productType: 'flyers', ...payload }
});

export const calcEnhancedBusinessCardsPrice = (payload: {
  qty: number;
  lamination?: 'none'|'matte'|'glossy';
  magnetic?: boolean;
  priceType?: 'rush'|'online'|'promo';
  customerType?: 'regular'|'vip';
}) => unifiedCalculatePrice({
  product_id: 0,
  quantity: payload.qty,
  channel: (payload.priceType as any) || 'online',
  params: { productType: 'business_cards', ...payload }
});

export const calcEnhancedBookletsPrice = (payload: {
  format: 'A4'|'A5';
  pages: number;
  qty: number;
  priceType?: 'rush'|'online'|'promo';
  customerType?: 'regular'|'vip';
}) => unifiedCalculatePrice({
  product_id: 0,
  quantity: payload.qty,
  channel: (payload.priceType as any) || 'online',
  params: { productType: 'booklets', ...payload }
});

export const calcUniversalPrice = (payload: {
  productType: string;
  specifications: any;
  qty: number;
  priceType?: 'rush'|'online'|'promo';
  customerType?: 'regular'|'vip';
}) => unifiedCalculatePrice({
  product_id: 0,
  quantity: payload.qty,
  channel: (payload.priceType as any) || 'online',
  params: { productType: payload.productType, ...payload.specifications }
});


// Категории материалов
export const getMaterialCategories = () => api.get<any[]>('/material-categories');
export const getMaterialCategoryStats = () => api.get<any[]>('/material-categories/stats');
export const createMaterialCategory = (category: any) => api.post<any>('/material-categories', category);
export const updateMaterialCategory = (id: number, category: any) => api.put<any>(`/material-categories/${id}`, category);
export const deleteMaterialCategory = (id: number) => api.delete(`/material-categories/${id}`);

// Поставщики
export const getSuppliers = () => api.get<any[]>('/suppliers');
export const getActiveSuppliers = () => api.get<any[]>('/suppliers/active');
export const createSupplier = (supplier: any) => api.post<any>('/suppliers', supplier);

// Отчеты склада
export const getWarehouseSummary = (filters?: any) => api.get<any>('/warehouse-reports/summary', { params: filters });
export const getLowStockItems = (filters?: any) => api.get<any[]>('/warehouse-reports/low-stock', { params: filters });
export const getSupplierSummary = (filters?: any) => api.get<any[]>('/warehouse-reports/suppliers', { params: filters });
export const getMaterialMovements = (filters?: any) => api.get<any[]>('/warehouse-reports/movements', { params: filters });
export const getCategorySummary = (filters?: any) => api.get<any[]>('/warehouse-reports/categories', { params: filters });
export const generatePdfReport = (reportType: string) => {
  console.log('📄 API: Generating PDF report for type:', reportType);
  return api.get(`/warehouse-reports/pdf/${reportType}`, { responseType: 'blob' });
};

// Расширенная аналитика склада
export const getABCAnalysis = (filters?: any) => api.get<any[]>('/warehouse-reports/abc-analysis', { params: filters });
export const getTurnoverAnalysis = (filters?: any) => api.get<any[]>('/warehouse-reports/turnover-analysis', { params: filters });
export const getCostAnalysis = (filters?: any) => api.get<any[]>('/warehouse-reports/cost-analysis', { params: filters });
export const getSupplierAnalytics = (filters?: any) => api.get<any[]>('/warehouse-reports/supplier-analytics', { params: filters });
export const getForecastingData = (filters?: any) => api.get<any[]>('/warehouse-reports/forecasting', { params: filters });
export const updateSupplier = (id: number, supplier: any) => api.put<any>(`/suppliers/${id}`, supplier);
export const deleteSupplier = (id: number) => api.delete(`/suppliers/${id}`);
export const getSupplierStats = () => api.get<any[]>('/suppliers/stats');
export const getSupplierMaterials = (id: number) => api.get<any[]>(`/suppliers/${id}/materials`);

// Автозаказ
export const getAutoOrderRules = () => api.get<any[]>('/auto-order/rules');
export const createAutoOrderRule = (rule: any) => api.post<any>('/auto-order/rules', rule);
export const updateAutoOrderRule = (id: number, rule: any) => api.put<any>(`/auto-order/rules/${id}`, rule);
export const deleteAutoOrderRule = (id: number) => api.delete(`/auto-order/rules/${id}`);
export const checkMaterialsForAutoOrder = () => api.post<any[]>('/auto-order/check', {});
export const getAutoOrderRequests = () => api.get<any[]>('/auto-order/requests');
export const createAutoOrderRequest = (request: any) => api.post<any>('/auto-order/requests', request);
export const updateAutoOrderRequestStatus = (id: number, status: 'pending'|'sent'|'confirmed'|'delivered'|'cancelled') =>
  api.put(`/auto-order/requests/${id}/status`, { status });
export const getAutoOrderTemplates = () => api.get<any[]>('/auto-order/templates');
export const createAutoOrderTemplate = (template: any) => api.post<any>('/auto-order/templates', template);
export const generateAutoOrderMessage = (payload: { requestId: number; templateId?: number }) =>
  api.post<{ message: string }>('/auto-order/generate-message', payload);

// Уведомления
export const getMaterialAlerts = (params?: any) => api.get<any[]>('/material-alerts', { params });
export const getUnreadMaterialAlerts = () => api.get<any[]>('/material-alerts/unread');
export const markAlertAsRead = (id: number) => api.put(`/material-alerts/${id}/read`);
export const markAllAlertsAsRead = () => api.put('/material-alerts/read-all');
export const deleteAlert = (id: number) => api.delete(`/material-alerts/${id}`);
export const checkMaterialAlerts = () => api.post<any>('/material-alerts/check');
export const getAlertStats = () => api.get<any>('/material-alerts/stats');

// Массовые операции
export const bulkUpdateMaterials = (updates: any[]) => api.post<any>('/material-bulk/update', { updates });
export const bulkSpendMaterials = (spends: any[]) => api.post<any>('/material-bulk/spend', { spends });
export const bulkCreateMaterials = (materials: any[]) => api.post<any>('/material-bulk/create', { materials });
export const bulkDeleteMaterials = (materialIds: number[]) => api.post<any>('/material-bulk/delete', { materialIds });
export const bulkChangeCategory = (materialIds: number[], categoryId: number) => 
  api.post<any>('/material-bulk/change-category', { materialIds, categoryId });
export const bulkChangeSupplier = (materialIds: number[], supplierId: number) => 
  api.post<any>('/material-bulk/change-supplier', { materialIds, supplierId });

// Импорт/экспорт
export const exportMaterialsCSV = (params?: any) => api.get('/material-import-export/export/csv', { params, responseType: 'blob' });
export const exportMaterialsJSON = (params?: any) => api.get('/material-import-export/export/json', { params });
export const importMaterialsJSON = (data: any) => api.post<any>('/material-import-export/import', data);
export const getImportTemplate = () => api.get<any>('/material-import-export/template');
export const validateImportData = (data: any) => api.post<any>('/material-import-export/validate', data);

// Отчеты по материалам
export const getMaterialReports = {
  inventory: (params?: any) => api.get<any[]>('/material-reports/inventory', { params }),
  consumption: (params?: any) => api.get<any[]>('/material-reports/consumption', { params }),
  cost: (params?: any) => api.get<any[]>('/material-reports/cost', { params }),
  summary: () => api.get<any>('/material-reports/summary'),
  dailyMovement: (params?: any) => api.get<any[]>('/material-reports/daily-movement', { params })
};

// Отслеживание стоимости
export const getMaterialCostTracking = {
  history: (params?: any) => api.get<any[]>('/material-cost-tracking/history', { params }),
  materialHistory: (materialId: number, params?: any) => api.get<any[]>(`/material-cost-tracking/history/${materialId}`, { params }),
  stats: (params?: any) => api.get<any>('/material-cost-tracking/stats', { params }),
  priceChanges: (params?: any) => api.get<any[]>('/material-cost-tracking/price-changes', { params }),
  trends: (params?: any) => api.get<any[]>('/material-cost-tracking/trends', { params }),
  updatePrice: (materialId: number, newPrice: number, reason: string) => 
    api.put<any>(`/material-cost-tracking/price/${materialId}`, { new_price: newPrice, reason })
};


// Database Pricing API
export const getDatabaseBasePrices = () => api.get('/database-pricing/base-prices');
export const getDatabaseUrgencyMultipliers = () => api.get('/database-pricing/urgency-multipliers');
export const getDatabaseVolumeDiscounts = () => api.get('/database-pricing/volume-discounts');
export const getDatabaseLoyaltyDiscounts = () => api.get('/database-pricing/loyalty-discounts');
export const updateDatabaseBasePrice = (productType: string, productVariant: string, prices: any) => 
  api.put(`/database-pricing/base-prices/${productType}/${productVariant}`, prices);
export const updateDatabaseUrgencyMultiplier = (priceType: string, multiplier: number) => 
  api.put(`/database-pricing/urgency-multipliers/${priceType}`, { multiplier });
export const updateDatabaseVolumeDiscount = (id: number, minQuantity: number, discountPercent: number) => 
  api.put(`/database-pricing/volume-discounts/${id}`, { min_quantity: minQuantity, discount_percent: discountPercent });
export const updateDatabaseLoyaltyDiscount = (customerType: string, discountPercent: number) => 
  api.put(`/database-pricing/loyalty-discounts/${customerType}`, { discount_percent: discountPercent });
export const calculateDatabasePrice = (params: any) => 
  api.post('/database-pricing/calculate', params);

// Order Management API
export const getPageChanges = (pageId: number, lastUpdate: string) => 
  api.get(`/order-management/pages/${pageId}/changes?lastUpdate=${lastUpdate}`);