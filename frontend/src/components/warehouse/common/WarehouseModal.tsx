import React from 'react';
import { Modal } from '../../common/Modal';

interface WarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  modalClassName?: string;
}

export const WarehouseModal: React.FC<WarehouseModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  className = '',
  modalClassName = '',
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size={size}
      className={modalClassName}
    >
      <div className={`warehouse-modal-content ${className}`}>
        {children}
        {footer && (
          <div className="modal-footer">
            {footer}
          </div>
        )}
      </div>
    </Modal>
  );
};
