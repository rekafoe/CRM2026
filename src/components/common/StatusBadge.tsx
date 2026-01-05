import React from 'react';
import '../../styles/utilities.css';

interface StatusBadgeProps {
  status: string;
  color?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ 
  status, 
  color = 'neutral',
  size = 'md',
  className = '' 
}) => {
  const getColorClasses = (color: string) => {
    switch (color) {
      case 'success': return 'bg-success text-white';
      case 'warning': return 'bg-warning text-white';
      case 'error': return 'bg-error text-white';
      case 'info': return 'bg-info text-white';
      default: return 'bg-secondary text-primary';
    }
  };

  const getSizeClasses = (size: string) => {
    switch (size) {
      case 'sm': return 'text-xs px-2 py-1';
      case 'lg': return 'text-base px-4 py-2';
      default: return 'text-sm px-3 py-1';
    }
  };

  const baseClasses = 'inline-flex items-center rounded-full font-medium';
  const colorClasses = getColorClasses(color);
  const sizeClasses = getSizeClasses(size);

  return (
    <span className={`${baseClasses} ${colorClasses} ${sizeClasses} ${className}`}>
      {status}
    </span>
  );
};
