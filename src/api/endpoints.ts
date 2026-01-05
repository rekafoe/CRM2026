// Константы для API endpoints
export const ENDPOINTS = {
  // Аутентификация
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    PROFILE: '/auth/profile',
  },
  
  // Заказы
  ORDERS: {
    LIST: '/orders',
    CREATE: '/orders',
    GET: (id: number) => `/orders/${id}`,
    UPDATE: (id: number) => `/orders/${id}`,
    DELETE: (id: number) => `/orders/${id}`,
    ITEMS: (id: number) => `/orders/${id}/items`,
    FILES: (id: number) => `/orders/${id}/files`,
  },
  
  // Материалы
  MATERIALS: {
    LIST: '/materials',
    CREATE: '/materials',
    GET: (id: number) => `/materials/${id}`,
    UPDATE: (id: number) => `/materials/${id}`,
    DELETE: (id: number) => `/materials/${id}`,
    CATEGORIES: '/materials/categories',
    LOW_STOCK: '/materials/low-stock',
  },
  
  // Поставщики
  SUPPLIERS: {
    LIST: '/suppliers',
    CREATE: '/suppliers',
    GET: (id: number) => `/suppliers/${id}`,
    UPDATE: (id: number) => `/suppliers/${id}`,
    DELETE: (id: number) => `/suppliers/${id}`,
    ACTIVE: '/suppliers/active',
    STATS: '/suppliers/stats',
  },
  
  // Уведомления
  NOTIFICATIONS: {
    // Telegram
    TELEGRAM_TEST: '/notifications/telegram/test',
    TELEGRAM_CONFIGURE: '/notifications/telegram/configure',
    TELEGRAM_CONFIG: '/notifications/telegram/config',
    TELEGRAM_SETTINGS: '/notifications/telegram/settings',
    
    // Мониторинг запасов
    STOCK_ALERTS: '/notifications/stock-alerts',
    CHECK_STOCK: '/notifications/stock/check',
    STOCK_MONITORING_CONFIG: '/notifications/stock-monitoring/config',
    
    // Автоматические заказы
    AUTO_ORDERS: '/notifications/auto-orders',
    AUTO_ORDER_CONFIG: '/notifications/auto-orders/config',
    
    // Пользователи
    USERS: '/notifications/users',
    SEND_TO_USER: (userId: number) => `/notifications/users/${userId}/send`,
    SEND_TO_ROLE: (role: string) => `/notifications/users/role/${role}/send`,
    SEND_TO_ALL: '/notifications/users/send-all',
    
    // Бот
    BOT_USERS: '/notifications/bot/users',
    BOT_TEST_MESSAGE: '/notifications/bot/test-message',
    BOT_LOW_STOCK: '/notifications/bot/low-stock',
  },

  // Калькулятор
  CALCULATOR: {
    PRICING: '/calculator/pricing',
    BASE_PRICES: '/calculator/base-prices',
    MULTIPLIERS: '/calculator/multipliers',
    VOLUME_DISCOUNTS: '/calculator/volume-discounts',
    LOYALTY_DISCOUNTS: '/calculator/loyalty-discounts',
    CALCULATE: '/calculator/calculate',
  },
  
  // Отчеты
  REPORTS: {
    DAILY: '/reports/daily',
    MATERIALS: '/reports/materials',
    ORDERS: '/reports/orders',
    EXPORT: '/reports/export',
  },
  
  // Пользователи
  USERS: {
    LIST: '/users',
    CREATE: '/users',
    GET: (id: number) => `/users/${id}`,
    UPDATE: (id: number) => `/users/${id}`,
    DELETE: (id: number) => `/users/${id}`,
  },
  
  // Принтеры
  PRINTERS: {
    LIST: '/printers',
    CREATE: '/printers',
    GET: (id: number) => `/printers/${id}`,
    UPDATE: (id: number) => `/printers/${id}`,
    DELETE: (id: number) => `/printers/${id}`,
    COUNTERS: (id: number) => `/printers/${id}/counters`,
  },
  
  // Пресеты
  PRESETS: {
    LIST: '/presets',
    CREATE: '/presets',
    GET: (id: number) => `/presets/${id}`,
    UPDATE: (id: number) => `/presets/${id}`,
    DELETE: (id: number) => `/presets/${id}`,
  },
} as const;
