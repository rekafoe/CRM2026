import axios from 'axios';

// Создаем базовый HTTP клиент
export const apiClient = axios.create({
  baseURL: '/api',
  timeout: 10000,
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
    // Если передан объект с params (конфиг axios), используем его
    if (paramsOrConfig && typeof paramsOrConfig === 'object' && 'params' in paramsOrConfig) {
      return apiClient.get<T>(url, paramsOrConfig);
    }
    // Если передан простой объект - это query параметры
    if (paramsOrConfig && typeof paramsOrConfig === 'object') {
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
