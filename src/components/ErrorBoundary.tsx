import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ApiError } from '../types';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo,
    });

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          padding: '20px',
          border: '1px solid #f44336',
          borderRadius: '4px',
          backgroundColor: '#ffebee',
          color: '#c62828',
          margin: '20px 0',
        }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#c62828' }}>
            ⚠️ Произошла ошибка
          </h3>
          <p style={{ margin: '0 0 10px 0' }}>
            Что-то пошло не так. Пожалуйста, попробуйте обновить страницу.
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details style={{ marginTop: '10px' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                Детали ошибки (только для разработки)
              </summary>
              <pre style={{
                marginTop: '10px',
                padding: '10px',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px',
                overflow: 'auto',
                fontSize: '12px',
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Обновить страницу
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Компонент для отображения API ошибок
interface ApiErrorDisplayProps {
  error: ApiError | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  title?: string;
}

export const ApiErrorDisplay: React.FC<ApiErrorDisplayProps> = ({
  error,
  onRetry,
  onDismiss,
  title = 'Ошибка',
}) => {
  if (!error) return null;

  const getErrorMessage = (error: ApiError): string => {
    if (error.code === '401') {
      return 'Необходима авторизация. Пожалуйста, войдите в систему.';
    }
    if (error.code === '403') {
      return 'У вас нет прав для выполнения этого действия.';
    }
    if (error.code === '404') {
      return 'Запрашиваемый ресурс не найден.';
    }
    if (error.code === '422') {
      return 'Ошибка валидации данных. Проверьте введенные данные.';
    }
    if (error.code === '500') {
      return 'Внутренняя ошибка сервера. Попробуйте позже.';
    }
    if (error.code === 'ECONNABORTED') {
      return 'Превышено время ожидания запроса. Проверьте подключение к интернету.';
    }
    return error.message || 'Произошла неизвестная ошибка.';
  };

  return (
    <div style={{
      padding: '16px',
      border: '1px solid #f44336',
      borderRadius: '4px',
      backgroundColor: '#ffebee',
      color: '#c62828',
      margin: '10px 0',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '12px',
    }}>
      <div style={{ fontSize: '20px', flexShrink: 0 }}>⚠️</div>
      <div style={{ flex: 1 }}>
        <h4 style={{ margin: '0 0 8px 0', color: '#c62828' }}>
          {title}
        </h4>
        <p style={{ margin: '0 0 8px 0' }}>
          {getErrorMessage(error)}
        </p>
        {error.details && (
          <details style={{ marginTop: '8px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '14px' }}>
              Детали ошибки
            </summary>
            <pre style={{
              marginTop: '8px',
              padding: '8px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              overflow: 'auto',
              fontSize: '12px',
            }}>
              {JSON.stringify(error.details, null, 2)}
            </pre>
          </details>
        )}
        <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
          {onRetry && (
            <button
              onClick={onRetry}
              style={{
                padding: '6px 12px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Повторить
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              style={{
                padding: '6px 12px',
                backgroundColor: 'transparent',
                color: '#c62828',
                border: '1px solid #c62828',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Закрыть
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Компонент для отображения ошибок валидации
interface ValidationErrorDisplayProps {
  errors: { field: string; message: string }[];
  onDismiss?: () => void;
}

export const ValidationErrorDisplay: React.FC<ValidationErrorDisplayProps> = ({
  errors,
  onDismiss,
}) => {
  if (errors.length === 0) return null;

  return (
    <div style={{
      padding: '16px',
      border: '1px solid #ff9800',
      borderRadius: '4px',
      backgroundColor: '#fff3e0',
      color: '#e65100',
      margin: '10px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '20px', marginRight: '8px' }}>⚠️</span>
        <h4 style={{ margin: 0, color: '#e65100' }}>
          Ошибки валидации
        </h4>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: '#e65100',
            }}
          >
            ×
          </button>
        )}
      </div>
      <ul style={{ margin: 0, paddingLeft: '20px' }}>
        {errors.map((error, index) => (
          <li key={index} style={{ marginBottom: '4px' }}>
            {error.message}
          </li>
        ))}
      </ul>
    </div>
  );
};

// Хук для работы с ошибками
export const useErrorHandler = () => {
  const [error, setError] = React.useState<ApiError | null>(null);

  const handleError = React.useCallback((err: any) => {
    const apiError: ApiError = {
      message: err.message || 'Произошла ошибка',
      code: err.code || 'UNKNOWN',
      details: err.details,
      timestamp: new Date().toISOString(),
    };
    setError(apiError);
  }, []);

  const clearError = React.useCallback(() => {
    setError(null);
  }, []);

  const ErrorDisplay = React.useCallback((props: Omit<ApiErrorDisplayProps, 'error'>) => (
    <ApiErrorDisplay {...props} error={error} onDismiss={clearError} />
  ), [error, clearError]);

  return {
    error,
    handleError,
    clearError,
    ErrorDisplay,
  };
};


