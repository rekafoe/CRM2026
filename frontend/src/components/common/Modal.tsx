import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import '../../styles/utilities.css';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  /** Кнопки или действия справа от заголовка (до крестика) */
  headerExtra?: React.ReactNode;
  /** Классы тела модалки (по умолчанию p-6). Для форм с собственными отступами — например p-0 */
  bodyClassName?: string;
  /** Классы шапки (по умолчанию p-6). Компактная модалка — свой класс без крупного p-6 */
  headerClassName?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  overlayClassName?: string;
}

export const Modal: React.FC<ModalProps> = ({ 
  isOpen, 
  onClose, 
  title, 
  headerExtra,
  bodyClassName,
  headerClassName,
  children, 
  size = 'md',
  className = '',
  overlayClassName = '',
}) => {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getSizeClasses = (size: string) => {
    switch (size) {
      case 'sm': return 'max-w-md';
      case 'lg': return 'max-w-4xl';
      case 'xl': return 'max-w-6xl';
      default: return 'max-w-2xl';
    }
  };

  const sizeClasses = getSizeClasses(size);

  const overlayClasses = overlayClassName
    ? `modal-overlay app-modal-portal ${overlayClassName}`
    : 'modal-overlay app-modal-portal';
  const modalContent = (
    <div className={overlayClasses} onClick={onClose}>
      <div 
        className={`modal-content ${sizeClasses} ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className={`modal-header flex items-center gap-3 border-b border-color ${headerClassName ?? 'p-6'}`}>
            <h2 className="text-xl font-semibold text-primary flex-1 min-w-0">{title}</h2>
            {headerExtra != null && headerExtra !== false && (
              <div className="modal-header__extra flex shrink-0 items-center gap-2">{headerExtra}</div>
            )}
            <button 
              onClick={onClose}
              className="modal-close-btn btn btn-sm btn-secondary shrink-0"
              aria-label="Закрыть"
            >
              ×
            </button>
          </div>
        )}
        <div className={`modal-body ${bodyClassName ?? 'p-6'}`}>
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
