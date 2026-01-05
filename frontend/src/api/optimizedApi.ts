import axios from 'axios'

const API_BASE_URL = '/api'

// Создаем оптимизированный экземпляр axios
const optimizedApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000, // 10 секунд
  headers: {
    'Content-Type': 'application/json',
  }
})

// Интерцептор для добавления токена авторизации
optimizedApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('api_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Интерцептор для обработки ошибок
optimizedApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Перенаправляем на страницу входа при ошибке авторизации
      localStorage.removeItem('api_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Оптимизированные API функции
export const optimizedApiClient = {
  // Заказы с пагинацией и кэшированием
  getOrders: async (params: {
    page?: number
    limit?: number
    userId?: number
    status?: number
    dateFrom?: string
    dateTo?: string
  } = {}) => {
    const response = await optimizedApi.get('/optimized/orders', { params })
    return response.data
  },

  // Поиск заказов
  searchOrders: async (query: string, limit: number = 20) => {
    const response = await optimizedApi.get('/optimized/orders/search', {
      params: { q: query, limit }
    })
    return response.data
  },

  // Статистика заказов
  getOrdersStats: async (dateFrom: string, dateTo: string) => {
    const response = await optimizedApi.get('/optimized/orders/stats', {
      params: { dateFrom, dateTo }
    })
    return response.data
  },

  // Материалы с фильтрацией
  getMaterials: async (params: {
    categoryId?: number
    supplierId?: number
    search?: string
  } = {}) => {
    const response = await optimizedApi.get('/optimized/materials', { params })
    return response.data
  },

  // Отчет по потреблению материалов
  getMaterialConsumptionReport: async (dateFrom: string, dateTo: string) => {
    const response = await optimizedApi.get('/optimized/materials/consumption-report', {
      params: { dateFrom, dateTo }
    })
    return response.data
  },

  // Инвалидация кэша
  invalidateOrdersCache: async () => {
    await optimizedApi.post('/optimized/orders/invalidate-cache')
  },

  invalidateMaterialsCache: async () => {
    await optimizedApi.post('/optimized/materials/invalidate-cache')
  }
}

// Утилиты для работы с кэшем
export const cacheUtils = {
  // Кэш в localStorage с TTL
  set: (key: string, data: any, ttl: number = 5 * 60 * 1000) => {
    const item = {
      data,
      timestamp: Date.now(),
      ttl
    }
    localStorage.setItem(key, JSON.stringify(item))
  },

  get: (key: string) => {
    try {
      const item = localStorage.getItem(key)
      if (!item) return null

      const parsed = JSON.parse(item)
      if (Date.now() - parsed.timestamp > parsed.ttl) {
        localStorage.removeItem(key)
        return null
      }

      return parsed.data
    } catch {
      return null
    }
  },

  remove: (key: string) => {
    localStorage.removeItem(key)
  },

  clear: () => {
    // Очищаем только кэш, не все данные localStorage
    const keys = Object.keys(localStorage)
    keys.forEach(key => {
      if (key.startsWith('cache_')) {
        localStorage.removeItem(key)
      }
    })
  }
}

// Функция для создания кэшированных запросов
export function createCachedRequest<T>(
  key: string,
  requestFn: () => Promise<T>,
  ttl: number = 5 * 60 * 1000
) {
  return async (): Promise<T> => {
    // Проверяем кэш
    const cached = cacheUtils.get(key)
    if (cached) {
      return cached
    }

    // Выполняем запрос
    const data = await requestFn()
    
    // Сохраняем в кэш
    cacheUtils.set(key, data, ttl)
    
    return data
  }
}

export default optimizedApi
