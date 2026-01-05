import React from 'react';
import '../../styles/utilities.css';

interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'info';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  onClick,
  type = 'button',
  className = '',
  icon,
  iconPosition = 'left'
}) => {
  const getVariantClasses = (variant: string) => {
    switch (variant) {
      case 'secondary': return 'btn-secondary';
      case 'success': return 'btn-success';
      case 'error': return 'btn-error';
      case 'warning': return 'btn-warning';
      case 'info': return 'btn-info';
      default: return 'btn-primary';
    }
  };

  const getSizeClasses = (size: string) => {
    switch (size) {
      case 'sm': return 'text-sm px-3 py-1';
      case 'lg': return 'text-lg px-6 py-3';
      default: return 'text-base px-4 py-2';
    }
  };

  const baseClasses = 'btn';
  const variantClasses = getVariantClasses(variant);
  const sizeClasses = getSizeClasses(size);
  const disabledClasses = disabled || loading ? 'opacity-50 cursor-not-allowed' : '';

  const handleClick = () => {
    if (!disabled && !loading && onClick) {
      onClick();
    }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <>
          <span className="animate-spin">⟳</span>
          Загрузка...
        </>
      );
    }

    if (icon) {
      return iconPosition === 'left' ? (
        <>
          {icon}
          {children}
        </>
      ) : (
        <>
          {children}
          {icon}
        </>
      );
    }

    return children;
  };

  return (
    <button
      type={type}
      className={`${baseClasses} ${variantClasses} ${sizeClasses} ${disabledClasses} ${className}`}
      onClick={handleClick}
      disabled={disabled || loading}
    >
      {renderContent()}
    </button>
  );
};
