// Простая валидация без внешних зависимостей
import React from 'react';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Валидация заказа
export function validateOrder(data: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (!data.customer_name || typeof data.customer_name !== 'string' || data.customer_name.trim().length === 0) {
    errors.push({
      field: 'customer_name',
      message: 'Имя клиента обязательно'
    });
  }

  if (!data.customer_phone || typeof data.customer_phone !== 'string' || data.customer_phone.trim().length === 0) {
    errors.push({
      field: 'customer_phone',
      message: 'Телефон клиента обязателен'
    });
  }

  if (data.customer_email && typeof data.customer_email === 'string') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.customer_email)) {
      errors.push({
        field: 'customer_email',
        message: 'Некорректный формат email'
      });
    }
  }

  if (data.status && (typeof data.status !== 'number' || data.status < 1)) {
    errors.push({
      field: 'status',
      message: 'Статус должен быть положительным числом'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Валидация позиции заказа
export function validateOrderItem(data: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (!data.type || typeof data.type !== 'string' || data.type.trim().length === 0) {
    errors.push({
      field: 'type',
      message: 'Тип товара обязателен'
    });
  }

  if (typeof data.price !== 'number' || data.price < 0) {
    errors.push({
      field: 'price',
      message: 'Цена должна быть неотрицательным числом'
    });
  }

  if (typeof data.quantity !== 'number' || data.quantity <= 0) {
    errors.push({
      field: 'quantity',
      message: 'Количество должно быть положительным числом'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Валидация материала
export function validateMaterial(data: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push({
      field: 'name',
      message: 'Название материала обязательно'
    });
  }

  if (!data.unit || typeof data.unit !== 'string' || data.unit.trim().length === 0) {
    errors.push({
      field: 'unit',
      message: 'Единица измерения обязательна'
    });
  }

  if (typeof data.quantity !== 'number' || data.quantity < 0) {
    errors.push({
      field: 'quantity',
      message: 'Количество должно быть неотрицательным числом'
    });
  }

  if (typeof data.price !== 'number' || data.price < 0) {
    errors.push({
      field: 'price',
      message: 'Цена должна быть неотрицательным числом'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Валидация пользователя
export function validateUser(data: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push({
      field: 'name',
      message: 'Имя пользователя обязательно'
    });
  }

  if (!data.email || typeof data.email !== 'string' || data.email.trim().length === 0) {
    errors.push({
      field: 'email',
      message: 'Email обязателен'
    });
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      errors.push({
        field: 'email',
        message: 'Некорректный формат email'
      });
    }
  }

  if (data.password && (typeof data.password !== 'string' || data.password.length < 6)) {
    errors.push({
      field: 'password',
      message: 'Пароль должен содержать минимум 6 символов'
    });
  }

  if (data.role && !['admin', 'user', 'manager'].includes(data.role)) {
    errors.push({
      field: 'role',
      message: 'Роль должна быть: admin, user или manager'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Валидация файла
export function validateFile(file: File): ValidationResult {
  const errors: ValidationError[] = [];

  if (!file) {
    errors.push({
      field: 'file',
      message: 'Файл обязателен'
    });
    return { isValid: false, errors };
  }

  // Максимальный размер файла (10MB)
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    errors.push({
      field: 'file',
      message: 'Размер файла не должен превышать 10MB'
    });
  }

  // Разрешенные типы файлов
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];

  if (!allowedTypes.includes(file.type)) {
    errors.push({
      field: 'file',
      message: 'Неподдерживаемый тип файла'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Универсальная валидация
export function validate(data: any, rules: Record<string, (value: any) => boolean | string>): ValidationResult {
  const errors: ValidationError[] = [];

  for (const [field, rule] of Object.entries(rules)) {
    const result = rule(data[field]);
    if (result !== true) {
      errors.push({
        field,
        message: typeof result === 'string' ? result : `Поле ${field} невалидно`
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

// Хук для валидации форм
export function useValidation<T>(initialData: T, validationRules: (data: T) => ValidationResult) {
  const [data, setData] = React.useState<T>(initialData);
  const [errors, setErrors] = React.useState<ValidationError[]>([]);

  const validate = React.useCallback(() => {
    const result = validationRules(data);
    setErrors(result.errors);
    return result.isValid;
  }, [data, validationRules]);

  const setField = React.useCallback((field: keyof T, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
    // Очищаем ошибку для этого поля
    setErrors(prev => prev.filter(error => error.field !== field));
  }, []);

  const clearErrors = React.useCallback(() => {
    setErrors([]);
  }, []);

  return {
    data,
    errors,
    setField,
    validate,
    clearErrors,
    isValid: errors.length === 0
  };
}