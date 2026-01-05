import React from 'react';

// Типы состояний загрузки
export type LoadingState = 'idle' | 'loading' | 'success' | 'error';

// Пропсы для компонентов состояний
interface StateComponentProps {
  state: LoadingState;
  loadingText?: string;
  errorText?: string;
  successText?: string;
  onRetry?: () => void;
  children?: React.ReactNode;
  className?: string;
}

// Скелетон для карточек
export const CardSkeleton: React.FC<{ count?: number; className?: string }> = ({ 
  count = 3, 
  className = '' 
}) => (
  <div className={`space-y-4 ${className}`}>
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="animate-pulse">
        <div className="bg-gray-200 rounded-lg p-4">
          <div className="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
          <div className="h-3 bg-gray-300 rounded w-1/2 mb-2"></div>
          <div className="h-3 bg-gray-300 rounded w-2/3"></div>
        </div>
      </div>
    ))}
  </div>
);

// Скелетон для списков
export const ListSkeleton: React.FC<{ 
  count?: number; 
  itemHeight?: string;
  className?: string;
}> = ({ 
  count = 5, 
  itemHeight = 'h-12',
  className = '' 
}) => (
  <div className={`space-y-2 ${className}`}>
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="animate-pulse">
        <div className={`bg-gray-200 rounded ${itemHeight} flex items-center px-4`}>
          <div className="h-4 bg-gray-300 rounded w-1/4 mr-4"></div>
          <div className="h-3 bg-gray-300 rounded w-1/2"></div>
        </div>
      </div>
    ))}
  </div>
);

// Скелетон для таблиц
export const TableSkeleton: React.FC<{ 
  rows?: number; 
  columns?: number;
  className?: string;
}> = ({ 
  rows = 5, 
  columns = 4,
  className = '' 
}) => (
  <div className={`overflow-hidden ${className}`}>
    <div className="animate-pulse">
      {/* Заголовок таблицы */}
      <div className="bg-gray-200 h-12 flex items-center px-4">
        {Array.from({ length: columns }).map((_, index) => (
          <div key={index} className="h-4 bg-gray-300 rounded w-1/4 mr-4"></div>
        ))}
      </div>
      
      {/* Строки таблицы */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="border-b border-gray-200 h-12 flex items-center px-4">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div key={colIndex} className="h-3 bg-gray-300 rounded w-1/4 mr-4"></div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

// Компонент состояния загрузки
export const LoadingState: React.FC<StateComponentProps> = ({
  state,
  loadingText = 'Загрузка...',
  errorText = 'Произошла ошибка',
  successText = 'Готово',
  onRetry,
  children,
  className = ''
}) => {
  if (state === 'loading') {
    return (
      <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-600">{loadingText}</p>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
        <div className="text-red-500 text-4xl mb-4">⚠️</div>
        <p className="text-red-600 mb-4">{errorText}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Попробовать снова
          </button>
        )}
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className={`flex flex-col items-center justify-center p-8 ${className}`}>
        <div className="text-green-500 text-4xl mb-4">✅</div>
        <p className="text-green-600">{successText}</p>
      </div>
    );
  }

  return <>{children}</>;
};

// Компонент для состояний с контентом
export const StateWrapper: React.FC<StateComponentProps> = ({
  state,
  loadingText,
  errorText,
  onRetry,
  children,
  className = ''
}) => {
  if (state === 'loading') {
    return (
      <div className={className}>
        <div className="flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
          <span className="text-gray-600">{loadingText}</span>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-4 ${className}`}>
        <div className="flex items-center">
          <div className="text-red-500 mr-3">⚠️</div>
          <div className="flex-1">
            <p className="text-red-800 font-medium">Ошибка</p>
            <p className="text-red-600 text-sm">{errorText}</p>
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="ml-3 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
            >
              Повторить
            </button>
          )}
        </div>
      </div>
    );
  }

  return <div className={className}>{children}</div>;
};

// Компонент для кнопок с состояниями
export const LoadingButton: React.FC<{
  state: LoadingState;
  loadingText?: string;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger';
}> = ({
  state,
  loadingText = 'Загрузка...',
  children,
  onClick,
  disabled = false,
  className = '',
  variant = 'primary'
}) => {
  const baseClasses = 'px-4 py-2 rounded font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500'
  };

  const isDisabled = disabled || state === 'loading';

  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`${baseClasses} ${variantClasses[variant]} ${
        isDisabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${className}`}
    >
      {state === 'loading' ? (
        <div className="flex items-center">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          {loadingText}
        </div>
      ) : (
        children
      )}
    </button>
  );
};

// Компонент для прогресс-бара
export const ProgressBar: React.FC<{
  progress: number; // 0-100
  label?: string;
  showPercentage?: boolean;
  className?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red';
}> = ({
  progress,
  label,
  showPercentage = true,
  className = '',
  color = 'blue'
}) => {
  const colorClasses = {
    blue: 'bg-blue-600',
    green: 'bg-green-600',
    yellow: 'bg-yellow-600',
    red: 'bg-red-600'
  };

  return (
    <div className={`w-full ${className}`}>
      {label && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          {showPercentage && (
            <span className="text-sm text-gray-500">{Math.round(progress)}%</span>
          )}
        </div>
      )}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${colorClasses[color]}`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        ></div>
      </div>
    </div>
  );
};

// Компонент для пустых состояний
export const EmptyState: React.FC<{
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}> = ({
  icon = '📋',
  title,
  description,
  action,
  className = ''
}) => (
  <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
    <div className="text-6xl mb-4">{icon}</div>
    <h3 className="text-lg font-medium text-gray-900 mb-2">{title}</h3>
    {description && (
      <p className="text-gray-500 mb-6 max-w-sm">{description}</p>
    )}
    {action && (
      <button
        onClick={action.onClick}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
      >
        {action.label}
      </button>
    )}
  </div>
);

// Хук для управления состояниями
export const useLoadingState = (initialState: LoadingState = 'idle') => {
  const [state, setState] = React.useState<LoadingState>(initialState);

  const setLoading = () => setState('loading');
  const setSuccess = () => setState('success');
  const setError = () => setState('error');
  const setIdle = () => setState('idle');

  const execute = async <T,>(
    asyncFn: () => Promise<T>,
    options?: {
      onSuccess?: (result: T) => void;
      onError?: (error: any) => void;
      resetOnSuccess?: boolean;
      resetOnError?: boolean;
    }
  ): Promise<T | null> => {
    try {
      setLoading();
      const result = await asyncFn();
      setSuccess();
      options?.onSuccess?.(result);
      
      if (options?.resetOnSuccess !== false) {
        setTimeout(() => setIdle(), 1000);
      }
      
      return result;
    } catch (error) {
      setError();
      options?.onError?.(error);
      
      if (options?.resetOnError !== false) {
        setTimeout(() => setIdle(), 3000);
      }
      
      return null;
    }
  };

  return {
    state,
    isLoading: state === 'loading',
    isSuccess: state === 'success',
    isError: state === 'error',
    isIdle: state === 'idle',
    setLoading,
    setSuccess,
    setError,
    setIdle,
    execute
  };
};


