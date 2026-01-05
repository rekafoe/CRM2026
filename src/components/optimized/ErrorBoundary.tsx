import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Вызываем callback если передан
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Можно отправить ошибку в сервис мониторинга
    // например, Sentry, LogRocket и т.д.
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h2>Что-то пошло не так</h2>
            <p>Произошла неожиданная ошибка. Пожалуйста, обновите страницу.</p>
            <button 
              onClick={() => window.location.reload()}
              className="error-boundary-button"
            >
              Обновить страницу
            </button>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="error-boundary-details">
                <summary>Детали ошибки (только для разработки)</summary>
                <pre>{this.state.error.stack}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Хук для обработки ошибок в функциональных компонентах
export function useErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const handleError = React.useCallback((error: Error) => {
    setError(error);
  }, []);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return { handleError, resetError };
}

// Компонент для отображения ошибок API
export const ApiErrorBoundary: React.FC<{
  children: ReactNode;
  onRetry?: () => void;
}> = ({ children, onRetry }) => {
  return (
    <ErrorBoundary
      fallback={
        <div className="api-error-boundary">
          <div className="api-error-content">
            <h3>Ошибка загрузки данных</h3>
            <p>Не удалось загрузить данные с сервера. Проверьте подключение к интернету.</p>
            {onRetry && (
              <button onClick={onRetry} className="api-error-retry">
                Попробовать снова
              </button>
            )}
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
};

