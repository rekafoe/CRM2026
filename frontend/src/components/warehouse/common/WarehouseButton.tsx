import React from 'react';
import { Button } from '../../common/Button';

interface WarehouseButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export const WarehouseButton: React.FC<WarehouseButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  onClick,
  disabled = false,
  loading = false,
  className = '',
}) => {
  const buttonVariant = variant === 'success' ? 'primary' : 
                       variant === 'warning' ? 'secondary' : 
                       variant === 'danger' ? 'secondary' : variant;

  return (
    <Button
      variant={buttonVariant}
      size={size}
      icon={loading ? '⏳' : icon}
      onClick={onClick}
      disabled={disabled || loading}
      className={`warehouse-button warehouse-button--${variant} ${className}`.trim()}
    >
      {loading ? 'Загрузка...' : children}
    </Button>
  );
};
