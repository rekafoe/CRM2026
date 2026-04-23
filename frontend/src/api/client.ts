import axios, { type InternalAxiosRequestConfig } from 'axios';
import { API_BASE_URL } from '../config/constants';

/**
 * Полный https://…/api для multipart: обходит Vercel rewrite на тот же origin (/api),
 * из‑за которого POST upload часто отдаёт 400 (multer не видит файл).
 * Только из env — у каждого деплоя (Vercel/Railway) свой URL, без хардкода в репозитории.
 */
function resolveDirectApiBaseForMultipart(): string | null {
  const uploadOnly = import.meta.env.VITE_UPLOAD_API_URL?.trim();
  if (uploadOnly && /^https?:\/\//i.test(uploadOnly)) return uploadOnly.replace(/\/$/, '');
  const api = import.meta.env.VITE_API_URL?.trim();
  if (api && /^https?:\/\//i.test(api)) return api.replace(/\/$/, '');
  return null;
}

/**
 * POST multipart: при наличии VITE_UPLOAD_API_URL или абсолютного VITE_API_URL — fetch на Railway;
 * иначе axios (локально или когда весь фронт уже на полном API URL).
 */
export async function postMultipartUpload<T>(relativePath: string, formData: FormData): Promise<T> {
  const path = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  const base = resolveDirectApiBaseForMultipart();
  if (base) {
    const url = `${base}${path}`;
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
  const response = await apiClient.post<T>(path, formData);
  return ((response.data as any)?.data ?? response.data) as T;
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

// Интерцептор: 429 Too Many Requests — пауза и повтор (сервер / прокси часто режут всплески)
const MAX_429_RETRIES = 5;
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const cfg = error.config as (InternalAxiosRequestConfig & { __retry429?: number }) | undefined;

    if (status === 429 && cfg) {
      const n = (cfg.__retry429 ?? 0) + 1;
      if (n <= MAX_429_RETRIES) {
        cfg.__retry429 = n;
        const h = (error.response?.headers || {}) as Record<string, string>;
        const ra = h['retry-after'] ?? h['Retry-After'];
        const waitMs = ra
          ? Math.min(30000, Math.max(300, parseInt(String(ra), 10) * 1000))
          : Math.min(12000, 500 * 2 ** (n - 1));
        await new Promise<void>((r) => setTimeout(r, waitMs));
        return apiClient.request(cfg);
      }
    }

    if (status === 401) {
      localStorage.removeItem('crmToken');
      localStorage.removeItem('crmRole');
      localStorage.removeItem('crmSessionDate');
      localStorage.removeItem('crmUserId');
      window.location.href = '/login';
    }

    if (status === 404 && error.config?.url?.includes('/ranges/')) {
      // ожидаемо для fallback
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
