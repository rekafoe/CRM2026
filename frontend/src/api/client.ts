import axios from 'axios';
import { API_BASE_URL } from '../config/constants';

/** Полный URL для пути API (как у axios baseURL + path). */
function joinApiPath(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  if (base.startsWith('http')) return `${base}${p}`;
  return `${base}${p}`;
}

/**
 * POST multipart без axios: для FormData браузер сам ставит boundary (и через Vercel rewrite не ломается).
 * Axios с дефолтным JSON Content-Type иногда даёт 400 на multer.
 */
export async function postFormData<T>(path: string, formData: FormData): Promise<T> {
  const url = joinApiPath(path);
  const token = localStorage.getItem('crmToken');
  const res = await fetch(url, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const text = await res.text();
  if (res.status === 401) {
    localStorage.removeItem('crmToken');
    localStorage.removeItem('crmRole');
    localStorage.removeItem('crmSessionDate');
    localStorage.removeItem('crmUserId');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    let errMsg = res.statusText;
    try {
      const j = JSON.parse(text) as { error?: string; message?: string };
      errMsg = j.error || j.message || errMsg;
    } catch {
      if (text) errMsg = text.slice(0, 300);
    }
    throw new Error(`${res.status}: ${errMsg}`);
  }
  const json = text ? JSON.parse(text) : {};
  return ((json as { data?: T }).data ?? json) as T;
}

// Создаем базовый HTTP клиент (без дефолтного Content-Type — для JSON axios выставит сам)
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Увеличиваем таймаут до 30 секунд для операций с БД
});

// FormData + axios (если где-то ещё используется): снять JSON-заголовок
apiClient.interceptors.request.use(
  (config) => {
    if (config.data instanceof FormData) {
      const h = config.headers;
      if (h && typeof (h as any).delete === 'function') {
        (h as any).delete('Content-Type');
      } else if (h) {
        delete (h as Record<string, unknown>)['Content-Type'];
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Интерцептор для добавления токена авторизации
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('crmToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Интерцептор для обработки ошибок
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Токен истек, перенаправляем на страницу входа
      localStorage.removeItem('crmToken');
      localStorage.removeItem('crmRole');
      localStorage.removeItem('crmSessionDate');
      localStorage.removeItem('crmUserId');
      window.location.href = '/login';
    }
    
    // Подавляем логирование 404 для новых оптимизированных endpoints (они обрабатываются через fallback)
    if (error.response?.status === 404 && error.config?.url?.includes('/ranges/')) {
      // Это ожидаемо - новый API еще не развернут, используется fallback
      // Не логируем как критическую ошибку
    }
    
    return Promise.reject(error);
  }
);

// Типизированные методы для HTTP запросов
export const api = {
  get: <T>(url: string, paramsOrConfig?: any) => {
    // Если передан объект с axios конфигом (timeout, headers и т.д.), используем его напрямую
    if (paramsOrConfig && typeof paramsOrConfig === 'object') {
      // Проверяем, это конфиг axios (есть timeout, headers, params) или просто query params
      if ('timeout' in paramsOrConfig || 'headers' in paramsOrConfig || 'params' in paramsOrConfig) {
        return apiClient.get<T>(url, paramsOrConfig);
      }
      // Иначе это query параметры
      return apiClient.get<T>(url, { params: paramsOrConfig });
    }
    // Иначе обычный запрос
    return apiClient.get<T>(url);
  },
  
  post: <T>(url: string, data?: any) => 
    apiClient.post<T>(url, data),
  
  put: <T>(url: string, data?: any) => 
    apiClient.put<T>(url, data),
  
  patch: <T>(url: string, data?: any) => 
    apiClient.patch<T>(url, data),
  
  delete: <T>(url: string) => 
    apiClient.delete<T>(url),
};
