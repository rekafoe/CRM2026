import React, { useEffect } from 'react';
import './ImprovedToast.css';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ImprovedToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const ImprovedToast: React.FC<ImprovedToastProps> = ({ 
  message, 
  type = 'info',
  duration = 5000,
  onClose,
  action
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const getIcon = () => {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return 'ℹ️';
    }
  };

  return (
    <div className={`improved-toast toast-${type}`}>
      <div className="toast-icon">{getIcon()}</div>
      <div className="toast-content">
        <p className="toast-message">{message}</p>
        {action && (
          <button className="toast-action" onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
      <button className="toast-close" onClick={onClose}>
        ×
      </button>
    </div>
  );
};

// Toast Container для управления множеством уведомлений
interface ToastContainerProps {
  toasts: Array<{
    id: string;
    message: string;
    type?: ToastType;
    duration?: number;
    action?: {
      label: string;
      onClick: () => void;
    };
  }>;
  onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ImprovedToast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          action={toast.action}
          onClose={() => onClose(toast.id)}
        />
      ))}
    </div>
  );
};

export default ImprovedToast;
