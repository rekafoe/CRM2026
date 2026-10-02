import React from 'react';

// Скелетон для заказа
export const OrderSkeleton: React.FC = () => (
  <div className="order-skeleton">
    <div className="skeleton-header">
      <div className="skeleton-line short" />
      <div className="skeleton-line very-short" />
    </div>
    <div className="skeleton-status">
      <div className="skeleton-pill" />
      <div className="skeleton-bar" />
    </div>
  </div>
);

// Скелетон для списка заказов
export const OrderListSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => (
  <div className="order-list-skeleton">
    {Array.from({ length: count }).map((_, index) => (
      <OrderSkeleton key={index} />
    ))}
  </div>
);

// Скелетон для деталей заказа
export const OrderDetailSkeleton: React.FC = () => (
  <div className="order-detail-skeleton">
    <div className="skeleton-header-large">
      <div className="skeleton-line" />
      <div className="skeleton-line short" />
    </div>
    <div className="skeleton-actions">
      <div className="skeleton-button" />
      <div className="skeleton-button" />
      <div className="skeleton-button" />
    </div>
    <div className="skeleton-progress">
      <div className="skeleton-bar" />
    </div>
    <div className="skeleton-items">
      <div className="skeleton-item" />
      <div className="skeleton-item" />
    </div>
    <div className="skeleton-total">
      <div className="skeleton-line" />
    </div>
  </div>
);

// Скелетон для материалов
export const MaterialSkeleton: React.FC = () => (
  <div className="material-skeleton">
    <div className="skeleton-checkbox" />
    <div className="skeleton-content">
      <div className="skeleton-line" />
      <div className="skeleton-line short" />
    </div>
    <div className="skeleton-actions">
      <div className="skeleton-button small" />
      <div className="skeleton-button small" />
    </div>
  </div>
);

// Скелетон для списка материалов
export const MaterialListSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => (
  <div className="material-list-skeleton">
    {Array.from({ length: count }).map((_, index) => (
      <MaterialSkeleton key={index} />
    ))}
  </div>
);

// Общий компонент загрузки
export const LoadingSpinner: React.FC<{ 
  size?: 'small' | 'medium' | 'large';
  message?: string;
}> = ({ size = 'medium', message = 'Загрузка...' }) => (
  <div className={`loading-spinner loading-spinner--${size}`}>
    <div className="spinner" />
    {message && <div className="loading-message">{message}</div>}
  </div>
);

// Компонент для пустого состояния
export const EmptyState: React.FC<{
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}> = ({ icon = '', title, description, action }) => (
  <div className="empty-state">
    <div className="empty-state-icon">{icon}</div>
    <h3 className="empty-state-title">{title}</h3>
    {description && <p className="empty-state-description">{description}</p>}
    {action && <div className="empty-state-action">{action}</div>}
  </div>
);

// Компонент для состояния ошибки
export const ErrorState: React.FC<{
  title?: string;
  message?: string;
  onRetry?: () => void;
}> = ({ 
  title = 'Произошла ошибка', 
  message = 'Не удалось загрузить данные. Попробуйте обновить страницу.',
  onRetry 
}) => (
  <div className="error-state">
    <div className="error-state-icon"></div>
    <h3 className="error-state-title">{title}</h3>
    <p className="error-state-message">{message}</p>
    {onRetry && (
      <button className="error-state-retry" onClick={onRetry}>
        Попробовать снова
      </button>
    )}
  </div>
);

