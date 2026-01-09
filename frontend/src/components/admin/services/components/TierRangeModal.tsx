import React from 'react';
import { Button, FormField } from '../../../common';
import { TierRangeModalState } from './ServiceVariantsTable.types';
import './ServiceVariantsTable.css';

interface TierRangeModalProps {
  modal: TierRangeModalState;
  onClose: () => void;
  onSave: () => void;
  onBoundaryChange: (value: string) => void;
}

export const TierRangeModal: React.FC<TierRangeModalProps> = ({
  modal,
  onClose,
  onSave,
  onBoundaryChange,
}) => {
  if (!modal.isOpen) return null;

  return (
    <div
      className="simplified-tier-modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        zIndex: 2002,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        className="simplified-tier-modal"
        style={
          modal.anchorElement
            ? {
                position: 'absolute',
                top: `${modal.anchorElement.getBoundingClientRect().bottom + 5}px`,
                left: `${modal.anchorElement.getBoundingClientRect().left}px`,
                zIndex: 2003,
              }
            : {
                position: 'relative',
                zIndex: 2003,
              }
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="simplified-tier-modal__content">
          <h3 className="simplified-tier-modal__title">
            {modal.type === 'add' ? 'Добавить границу диапазона' : 'Редактировать границу диапазона'}
          </h3>
          <FormField label="Граница (от)">
            <input
              type="number"
              value={modal.boundary}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onBoundaryChange(e.target.value)}
              min={1}
              onMouseDown={(e: React.MouseEvent<HTMLInputElement>) => e.stopPropagation()}
              onClick={(e: React.MouseEvent<HTMLInputElement>) => e.stopPropagation()}
              onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.stopPropagation()}
              autoFocus
              className="px-2 py-1 border rounded w-full"
            />
          </FormField>
          <div className="simplified-tier-modal__actions" onClick={(e) => e.stopPropagation()}>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Отменить
            </Button>
            <Button variant="primary" size="sm" onClick={onSave}>
              {modal.type === 'add' ? 'Добавить' : 'Сохранить'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
