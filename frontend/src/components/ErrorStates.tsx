import React from 'react';
import { ApiError } from '../types';

// Типы ошибок
export type ErrorType = 'network' | 'validation' | 'server' | 'auth' | 'unknown';

// Интерфейс для ошибок
interface ErrorInfo {
  type: ErrorType;
  title: string;
  message: string;
  details?: string;
  code?: string;
  suggestions?: string[];
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Определение типа ошибки по коду
const getErrorType = (error: any): ErrorType => {
  if (!error) return 'unknown';
  
  if (error.code === 'NETWORK_ERROR' || error.message?.includes('network')) {
    return 'network';
  }
  
  if (error.code === 'VALIDATION_ERROR' || error.status === 400) {
    return 'validation';
  }
  
  if (error.status >= 500) {
    return 'server';
  }
  
  if (error.status === 401 || error.status === 403) {
    return 'auth';
  }
  
  return 'unknown';
};

// Получение информации об ошибке
const getErrorInfo = (error: any): ErrorInfo => {
  const type = getErrorType(error);
  
  switch (type) {
    case 'network':
      return {
        type: 'network',
        title: 'Проблема с подключением',
        message: 'Не удалось подключиться к серверу',
        details: 'Проверьте подключение к интернету и попробуйте снова',
        suggestions: [
          'Проверьте подключение к интернету',
          'Попробуйте обновить страницу',
          'Проверьте, работает ли сервер'
        ]
      };
      
    case 'validation':
      return {
        type: 'validation',
        title: 'Ошибка валидации',
        message: error.message || 'Проверьте введенные данные',
        details: error.details,
        suggestions: [
          'Проверьте все обязательные поля',
          'Убедитесь в корректности формата данных',
          'Попробуйте ввести данные заново'
        ]
      };
      
    case 'server':
      return {
        type: 'server',
        title: 'Ошибка сервера',
        message: 'Внутренняя ошибка сервера',
        details: 'Наши разработчики уже работают над исправлением',
        suggestions: [
          'Попробуйте повторить операцию через несколько минут',
          'Обратитесь в поддержку, если проблема повторяется',
          'Проверьте статус сервиса'
        ]
      };
      
    case 'auth':
      return {
        type: 'auth',
        title: 'Ошибка авторизации',
        message: 'Недостаточно прав для выполнения операции',
        details: 'Возможно, сессия истекла или у вас нет доступа',
        suggestions: [
          'Попробуйте войти в систему заново',
          'Обратитесь к администратору для получения доступа',
          'Проверьте правильность учетных данных'
        ],
        action: {
          label: 'Войти в систему',
          onClick: () => {
            localStorage.removeItem('crmToken');
            window.location.href = '/login';
          }
        }
      };
      
    default:
      return {
        type: 'unknown',
        title: 'Неизвестная ошибка',
        message: error.message || 'Произошла непредвиденная ошибка',
        details: 'Попробуйте повторить операцию или обратитесь в поддержку',
        suggestions: [
          'Обновите страницу',
          'Попробуйте повторить операцию',
          'Обратитесь в поддержку'
        ]
      };
  }
};

// Иконки для разных типов ошибок
const getErrorIcon = (type: ErrorType): string => {
  switch (type) {
    case 'network': return '🌐';
    case 'validation': return '📝';
    case 'server': return '🔧';
    case 'auth': return '🔐';
    default: return '❌';
  }
};

// Цвета для разных типов ошибок
const getErrorColor = (type: ErrorType): string => {
  switch (type) {
    case 'network': return 'text-blue-600 bg-blue-50 border-blue-200';
    case 'validation': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    case 'server': return 'text-red-600 bg-red-50 border-red-200';
    case 'auth': return 'text-purple-600 bg-purple-50 border-purple-200';
    default: return 'text-gray-600 bg-gray-50 border-gray-200';
  }
};

// Основной компонент отображения ошибки
export const ErrorDisplay: React.FC<{
  error: any;
  onRetry?: () => void;
  onDismiss?: () => void;
  showDetails?: boolean;
  className?: string;
}> = ({
  error,
  onRetry,
  onDismiss,
  showDetails = false,
  className = ''
}) => {
  const errorInfo = getErrorInfo(error);
  const icon = getErrorIcon(errorInfo.type);
  const colorClasses = getErrorColor(errorInfo.type);

  return (
    <div className={`border rounded-lg p-4 ${colorClasses} ${className}`}>
      <div className="flex items-start">
        <div className="flex-shrink-0 mr-3">
          <span className="text-2xl">{icon}</span>
        </div>
        
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-medium mb-1">{errorInfo.title}</h3>
          <p className="text-sm mb-3">{errorInfo.message}</p>
          
          {showDetails && errorInfo.details && (
            <p className="text-xs opacity-75 mb-3">{errorInfo.details}</p>
          )}
          
          {errorInfo.suggestions && errorInfo.suggestions.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium mb-2">Рекомендации:</p>
              <ul className="text-xs space-y-1">
                {errorInfo.suggestions.map((suggestion, index) => (
                  <li key={index} className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="flex items-center space-x-3">
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-3 py-1 bg-white border border-current rounded text-sm hover:bg-opacity-10 transition-colors"
              >
                Попробовать снова
              </button>
            )}
            
            {errorInfo.action && (
              <button
                onClick={errorInfo.action.onClick}
                className="px-3 py-1 bg-current text-white rounded text-sm hover:opacity-80 transition-opacity"
              >
                {errorInfo.action.label}
              </button>
            )}
            
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="px-3 py-1 text-current opacity-75 hover:opacity-100 transition-opacity"
              >
                Закрыть
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Компактный компонент ошибки
export const CompactError: React.FC<{
  error: any;
  onRetry?: () => void;
  className?: string;
}> = ({ error, onRetry, className = '' }) => {
  const errorInfo = getErrorInfo(error);
  const icon = getErrorIcon(errorInfo.type);
  const colorClasses = getErrorColor(errorInfo.type);

  return (
    <div className={`flex items-center p-3 rounded ${colorClasses} ${className}`}>
      <span className="mr-2">{icon}</span>
      <span className="flex-1 text-sm">{errorInfo.message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="ml-2 px-2 py-1 bg-white border border-current rounded text-xs hover:bg-opacity-10 transition-colors"
        >
          Повторить
        </button>
      )}
    </div>
  );
};

// Компонент для списка ошибок валидации
export const ValidationErrors: React.FC<{
  errors: Record<string, string>;
  className?: string;
}> = ({ errors, className = '' }) => {
  const errorEntries = Object.entries(errors);
  
  if (errorEntries.length === 0) return null;

  return (
    <div className={`bg-yellow-50 border border-yellow-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-start">
        <span className="text-yellow-600 mr-2">📝</span>
        <div className="flex-1">
          <h4 className="text-sm font-medium text-yellow-800 mb-2">
            Ошибки валидации:
          </h4>
          <ul className="text-sm text-yellow-700 space-y-1">
            {errorEntries.map(([field, message]) => (
              <li key={field} className="flex items-start">
                <span className="mr-2">•</span>
                <span>
                  <strong>{field}:</strong> {message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

// Компонент для критических ошибок
export const CriticalError: React.FC<{
  error: any;
  onRetry?: () => void;
  className?: string;
}> = ({ error, onRetry, className = '' }) => {
  const errorInfo = getErrorInfo(error);

  return (
    <div className={`min-h-screen flex items-center justify-center bg-gray-50 ${className}`}>
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="text-6xl mb-4">🚨</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          {errorInfo.title}
        </h1>
        <p className="text-gray-600 mb-6">{errorInfo.message}</p>
        
        {errorInfo.suggestions && (
          <div className="text-left mb-6">
            <p className="text-sm font-medium text-gray-700 mb-2">Что можно сделать:</p>
            <ul className="text-sm text-gray-600 space-y-1">
              {errorInfo.suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>{suggestion}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <div className="space-y-3">
          {onRetry && (
            <button
              onClick={onRetry}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Попробовать снова
            </button>
          )}
          
          {errorInfo.action && (
            <button
              onClick={errorInfo.action.onClick}
              className="w-full px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
            >
              {errorInfo.action.label}
            </button>
          )}
          
          <button
            onClick={() => window.location.reload()}
            className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition-colors"
          >
            Обновить страницу
          </button>
        </div>
      </div>
    </div>
  );
};

// Хук для управления ошибками
export const useErrorHandler = () => {
  const [errors, setErrors] = React.useState<Record<string, any>>({});
  const [globalError, setGlobalError] = React.useState<any>(null);

  const addError = (key: string, error: any) => {
    setErrors(prev => ({ ...prev, [key]: error }));
  };

  const removeError = (key: string) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[key];
      return newErrors;
    });
  };

  const clearErrors = () => {
    setErrors({});
    setGlobalError(null);
  };

  const setGlobalErrorState = (error: any) => {
    setGlobalError(error);
  };

  const handleError = (error: any, key?: string) => {
    if (key) {
      addError(key, error);
    } else {
      setGlobalError(error);
    }
  };

  return {
    errors,
    globalError,
    addError,
    removeError,
    clearErrors,
    setGlobalError: setGlobalErrorState,
    handleError,
    hasErrors: Object.keys(errors).length > 0 || globalError !== null
  };
};
