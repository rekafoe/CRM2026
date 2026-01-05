import React from 'react';
import '../../styles/utilities.css';

interface AlertProps {
  type: 'success' | 'warning' | 'error' | 'info';
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
}

export const Alert: React.FC<AlertProps> = ({ 
  type, 
  children, 
  className = '', 
  onClose 
}) => {
  const baseClasses = 'alert';
  const typeClasses = `alert-${type}`;
  const closeButton = onClose ? (
    <button 
      onClick={onClose}
      className="btn btn-sm btn-secondary ml-auto"
      aria-label="Закрыть"
    >
      ×
    </button>
  ) : null;

  return (
    <div className={`${baseClasses} ${typeClasses} ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">{children}</div>
        {closeButton}
      </div>
    </div>
  );
};
