import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { logger } from './logger';
import { ApiResponse, ApiError } from '../types';

// Конфигурация retry
interface RetryConfig {
  maxRetries: number;
  retryDelay: number;
  retryDelayMultiplier: number;
  maxRetryDelay: number;
  retryCondition: (error: AxiosError) => boolean;
}

// Конфигурация кэширования
interface CacheConfig {
  enabled: boolean;
  ttl: number; // время жизни в миллисекундах
  maxSize: number; // максимальное количество записей
}

// Конфигурация API клиента
interface ApiClientConfig {
  baseURL: string;
  timeout: number;
  retry: RetryConfig;
  cache: CacheConfig;
  enableLogging: boolean;
}

// Кэш для запросов
class RequestCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  set(key: string, data: any, ttl: number): void {
    // Очищаем старые записи если достигли лимита
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Улучшенный API клиент
export class EnhancedApiClient {
  private client: AxiosInstance;
  private config: ApiClientConfig;
  private cache: RequestCache;
  private requestQueue = new Map<string, Promise<any>>();

  constructor(config: Partial<ApiClientConfig> = {}) {
    this.config = {
      baseURL: '/api',
      timeout: 10000,
      retry: {
        maxRetries: 3,
        retryDelay: 1000,
        retryDelayMultiplier: 2,
        maxRetryDelay: 10000,
        retryCondition: (error) => {
          // Retry для сетевых ошибок и 5xx ошибок
          return !error.response || (error.response.status >= 500 && error.response.status < 600);
        },
      },
      cache: {
        enabled: true,
        ttl: 300000, // 5 минут
        maxSize: 100,
      },
      enableLogging: true,
      ...config,
    };

    this.cache = new RequestCache(this.config.cache.maxSize);
    this.client = this.createClient();
    this.setupInterceptors();
  }

  private createClient(): AxiosInstance {
    return axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Добавляем токен авторизации
        const token = localStorage.getItem('crmToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Логируем запрос
        if (this.config.enableLogging) {
          logger.debug('API_REQUEST', `Making request to ${config.method?.toUpperCase()} ${config.url}`, {
            url: config.url,
            method: config.method,
            data: config.data,
          });
        }

        return config;
      },
      (error) => {
        logger.error('API_REQUEST', 'Request interceptor error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        if (this.config.enableLogging) {
          logger.apiSuccess(`${response.config.method?.toUpperCase()} ${response.config.url}`, response.data);
        }
        return response;
      },
      (error) => {
        if (this.config.enableLogging) {
          logger.apiError(`${error.config?.method?.toUpperCase()} ${error.config?.url}`, error);
        }
        return Promise.reject(error);
      }
    );
  }

  private generateCacheKey(config: AxiosRequestConfig): string {
    const { method, url, params, data } = config;
    return `${method}:${url}:${JSON.stringify(params)}:${JSON.stringify(data)}`;
  }

  private async executeWithRetry<T>(
    requestFn: () => Promise<AxiosResponse<T>>,
    config: AxiosRequestConfig,
    retryCount = 0
  ): Promise<AxiosResponse<T>> {
    try {
      const response = await requestFn();
      return response;
    } catch (error) {
      const axiosError = error as AxiosError;
      
      // Проверяем, нужно ли повторить запрос
      if (retryCount < this.config.retry.maxRetries && this.config.retry.retryCondition(axiosError)) {
        const delay = Math.min(
          this.config.retry.retryDelay * Math.pow(this.config.retry.retryDelayMultiplier, retryCount),
          this.config.retry.maxRetryDelay
        );

        logger.warn('API_RETRY', `Retrying request (${retryCount + 1}/${this.config.retry.maxRetries}) after ${delay}ms`, {
          url: config.url,
          error: axiosError.message,
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.executeWithRetry(requestFn, config, retryCount + 1);
      }

      // Преобразуем ошибку в стандартный формат
      const apiError: ApiError = {
        message: axiosError.response?.data?.message || axiosError.message || 'Произошла ошибка',
        code: axiosError.response?.status?.toString() || 'UNKNOWN',
        details: axiosError.response?.data?.details,
        timestamp: new Date().toISOString(),
      };

      throw apiError;
    }
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<ApiResponse<T>> {
    const requestConfig: AxiosRequestConfig = {
      method,
      url,
      data,
      ...config,
    };

    // Проверяем кэш для GET запросов
    if (method === 'GET' && this.config.cache.enabled) {
      const cacheKey = this.generateCacheKey(requestConfig);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        logger.debug('API_CACHE', `Cache hit for ${url}`);
        return cached;
      }
    }

    // Проверяем очередь запросов
    const queueKey = this.generateCacheKey(requestConfig);
    if (this.requestQueue.has(queueKey)) {
      logger.debug('API_QUEUE', `Waiting for existing request to ${url}`);
      return this.requestQueue.get(queueKey)!;
    }

    // Создаем новый запрос
    const requestPromise = this.executeWithRetry(
      () => this.client.request<T>(requestConfig),
      requestConfig
    ).then(response => {
      const result: ApiResponse<T> = {
        success: true,
        data: response.data,
        message: 'Success',
      };

      // Кэшируем GET запросы
      if (method === 'GET' && this.config.cache.enabled) {
        this.cache.set(queueKey, result, this.config.cache.ttl);
      }

      return result;
    }).catch(error => {
      const result: ApiResponse<T> = {
        success: false,
        data: null,
        error: error as ApiError,
      };
      return result;
    }).finally(() => {
      // Удаляем из очереди
      this.requestQueue.delete(queueKey);
    });

    // Добавляем в очередь
    this.requestQueue.set(queueKey, requestPromise);
    return requestPromise;
  }

  // Публичные методы
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.makeRequest<T>('GET', url, undefined, config);
  }

  async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.makeRequest<T>('POST', url, data, config);
  }

  async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.makeRequest<T>('PUT', url, data, config);
  }

  async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.makeRequest<T>('PATCH', url, data, config);
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
    return this.makeRequest<T>('DELETE', url, undefined, config);
  }

  // Утилиты
  clearCache(): void {
    this.cache.clear();
    logger.info('API_CACHE', 'Cache cleared');
  }

  getCacheSize(): number {
    return this.cache.size();
  }

  updateConfig(newConfig: Partial<ApiClientConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('API_CONFIG', 'Configuration updated', newConfig);
  }
}

// Создаем экземпляр клиента
export const enhancedApiClient = new EnhancedApiClient({
  baseURL: '/api',
  timeout: 15000,
  retry: {
    maxRetries: 3,
    retryDelay: 1000,
    retryDelayMultiplier: 2,
    maxRetryDelay: 10000,
    retryCondition: (error) => {
      // Retry для сетевых ошибок, таймаутов и 5xx ошибок
      return !error.response || 
             error.code === 'ECONNABORTED' ||
             (error.response.status >= 500 && error.response.status < 600);
    },
  },
  cache: {
    enabled: true,
    ttl: 300000, // 5 минут
    maxSize: 200,
  },
  enableLogging: process.env.NODE_ENV === 'development',
});

// Экспорт для обратной совместимости
export const api = enhancedApiClient;


