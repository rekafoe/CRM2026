/**
 * Утилиты для безопасной обработки ошибок
 */

/**
 * Интерфейс для ошибок Axios
 */
interface AxiosErrorResponse {
  response?: {
    data?: {
      error?: string;
      message?: string;
    };
  };
  message?: string;
}

/**
 * Извлекает сообщение об ошибке из неизвестного значения
 * Поддерживает обычные ошибки, строки, объекты и ошибки Axios
 * @param error - неизвестное значение (может быть Error, строка, объект, AxiosError и т.д.)
 * @param fallback - сообщение по умолчанию, если не удалось извлечь
 * @returns строковое сообщение об ошибке
 */
export function getErrorMessage(error: unknown, fallback = 'Неизвестная ошибка'): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  
  // Обработка Axios ошибок
  if (error && typeof error === 'object') {
    const axiosError = error as AxiosErrorResponse;
    if (axiosError.response?.data?.error) {
      return axiosError.response.data.error;
    }
    if (axiosError.response?.data?.message) {
      return axiosError.response.data.message;
    }
    if (axiosError.message) {
      return axiosError.message;
    }
    
    // Обработка обычных объектов с message
    if ('message' in error) {
      const message = (error as { message: unknown }).message;
      if (typeof message === 'string') {
        return message;
      }
    }
  }
  
  return fallback;
}

/**
 * Извлекает сообщение об ошибке из Axios ответа
 * @param error - ошибка, которая может быть AxiosError
 * @param fallback - сообщение по умолчанию
 * @returns сообщение об ошибке из response.data.error или fallback
 */
export function getAxiosErrorMessage(error: unknown, fallback = 'Неизвестная ошибка'): string {
  if (error && typeof error === 'object') {
    const axiosError = error as AxiosErrorResponse;
    if (axiosError.response?.data?.error) {
      return axiosError.response.data.error;
    }
    if (axiosError.response?.data?.message) {
      return axiosError.response.data.message;
    }
  }
  return getErrorMessage(error, fallback);
}

/**
 * Проверяет, является ли значение объектом Error
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Безопасно извлекает свойство из объекта ошибки
 */
export function getErrorProperty<T>(error: unknown, property: string, fallback: T): T {
  if (error && typeof error === 'object' && property in error) {
    const value = (error as Record<string, unknown>)[property];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return fallback;
}

