import axios from 'axios';
import { API_BASE_URL } from '../config/constants';

// Создаем базовый HTTP клиент
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // Увеличиваем таймаут до 30 секунд для операций с БД
  headers: {
    'Content-Type': 'application/json',
  },
});

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
