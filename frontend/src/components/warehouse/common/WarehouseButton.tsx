import React from 'react';
import { Button } from '../../common/Button';
import { AppIcon } from '../../ui/AppIcon';

interface WarehouseButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  title?: string;
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
  title,
}) => {
  const buttonVariant = variant === 'success' ? 'primary' : 
                       variant === 'warning' ? 'secondary' : 
                       variant === 'danger' ? 'secondary' : variant;
  const hasText = children !== undefined && children !== null && children !== false;

  return (
    <Button
      variant={buttonVariant}
      size={size}
      icon={
        loading ? (
          <span className="inline-flex animate-spin" aria-hidden>
            <AppIcon name="refresh" size="sm" />
          </span>
        ) : (
          icon
        )
      }
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={`warehouse-button warehouse-button--${variant} ${className}`.trim()}
    >
      {loading ? (hasText ? 'Загрузка...' : null) : children}
    </Button>
  );
};
