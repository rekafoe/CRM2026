import React from 'react';

interface LoadingSpinnerProps {
  size?: 'small' | 'medium' | 'large';
  color?: string;
  text?: string;
  overlay?: boolean;
  fullScreen?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  color = '#1976d2',
  text,
  overlay = false,
  fullScreen = false,
}) => {
  const sizeMap = {
    small: 20,
    medium: 40,
    large: 60,
  };

  const spinnerSize = sizeMap[size];

  const spinner = (
    <div
      style={{
        display: 'inline-block',
        width: `${spinnerSize}px`,
        height: `${spinnerSize}px`,
        border: `3px solid ${color}20`,
        borderTop: `3px solid ${color}`,
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }}
    />
  );

  const content = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        ...(fullScreen && {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          zIndex: 9999,
        }),
      }}
    >
      {spinner}
      {text && (
        <div
          style={{
            color: color,
            fontSize: '14px',
            fontWeight: '500',
            textAlign: 'center',
          }}
        >
          {text}
        </div>
      )}
    </div>
  );

  if (overlay) {
    return (
      <div
        style={{
          position: 'relative',
          display: 'inline-block',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
          }}
        >
          {content}
        </div>
      </div>
    );
  }

  return content;
};

// Компонент для отображения состояния загрузки
interface LoadingStateProps {
  loading: boolean;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  overlay?: boolean;
  text?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  loading,
  children,
  fallback,
  overlay = false,
  text = 'Загрузка...',
}) => {
  if (loading) {
    if (fallback) {
      return <>{fallback}</>;
    }

    if (overlay) {
      return (
        <div style={{ position: 'relative' }}>
          {children}
          <LoadingSpinner overlay text={text} />
        </div>
      );
    }

    return <LoadingSpinner text={text} />;
  }

  return <>{children}</>;
};

// Компонент для кнопки с состоянием загрузки
interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading: boolean;
  loadingText?: string;
  children: React.ReactNode;
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  loading,
  loadingText = 'Загрузка...',
  children,
  disabled,
  style,
  ...props
}) => {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        ...style,
      }}
    >
      {loading && (
        <LoadingSpinner
          size="small"
          color="currentColor"
        />
      )}
      {loading ? loadingText : children}
    </button>
  );
};

// Компонент для скелетона загрузки
interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  animation?: 'pulse' | 'wave';
  lines?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '20px',
  borderRadius = '4px',
  animation = 'pulse',
  lines = 1,
}) => {
  const skeletonStyle: React.CSSProperties = {
    width,
    height,
    borderRadius,
    backgroundColor: '#f0f0f0',
    animation: animation === 'pulse' ? 'pulse 1.5s ease-in-out infinite' : 'wave 1.5s ease-in-out infinite',
  };

  if (lines === 1) {
    return <div style={skeletonStyle} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          style={{
            ...skeletonStyle,
            width: index === lines - 1 ? '60%' : width,
          }}
        />
      ))}
    </div>
  );
};

// Компонент для скелетона карточки
export const CardSkeleton: React.FC = () => {
  return (
    <div
      style={{
        padding: '16px',
        border: '1px solid #e0e0e0',
        borderRadius: '8px',
        backgroundColor: 'white',
      }}
    >
      <Skeleton height="24px" width="60%" style={{ marginBottom: '12px' }} />
      <Skeleton lines={3} style={{ marginBottom: '12px' }} />
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        <Skeleton height="32px" width="80px" />
        <Skeleton height="32px" width="80px" />
      </div>
    </div>
  );
};

// Компонент для скелетона таблицы
export const TableSkeleton: React.FC<{ rows?: number; columns?: number }> = ({
  rows = 5,
  columns = 4,
}) => {
  return (
    <div style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={index} height="20px" width="120px" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} style={{ display: 'flex', gap: '16px', marginBottom: '8px' }}>
          {Array.from({ length: columns }, (_, colIndex) => (
            <Skeleton key={colIndex} height="16px" width="100px" />
          ))}
        </div>
      ))}
    </div>
  );
};

// CSS анимации
const styles = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @keyframes wave {
    0% { transform: translateX(-100%); }
    50% { transform: translateX(100%); }
    100% { transform: translateX(100%); }
  }
`;

// Добавляем стили в head
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}

// Экспортируем новые улучшенные компоненты
export { 
  CardSkeleton as NewCardSkeleton, 
  ListSkeleton as NewListSkeleton, 
  TableSkeleton as NewTableSkeleton,
  LoadingState as NewLoadingState,
  LoadingButton as NewLoadingButton,
  useLoadingState
} from './LoadingStates';

export { 
  ErrorDisplay, 
  CompactError, 
  CriticalError,
  ValidationErrors,
  useErrorHandler
} from './ErrorStates';

export { 
  DataStates, 
  ListWithStates, 
  CardsWithStates, 
  TableWithStates, 
  useDataStates 
} from './DataStates';

