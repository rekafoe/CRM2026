import React from 'react';
import { Modal, Button, FormField } from '../../../common';
import { ProductType } from '../../hooks/useCalculatorProductManagerState';

interface AddProductTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  newProductType: Partial<ProductType>;
  onUpdateNewProductType: (updates: Partial<ProductType>) => void;
  onResetNewProductType: () => void;
  onSave: () => void;
  saving: boolean;
  onSetError: (error: string | null) => void;
}

export const AddProductTypeModal: React.FC<AddProductTypeModalProps> = React.memo(({
  isOpen,
  onClose,
  newProductType,
  onUpdateNewProductType,
  onResetNewProductType,
  onSave,
  saving,
  onSetError,
}) => {
  const handleClose = () => {
    onClose();
    onResetNewProductType();
    onSetError(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Добавить тип продукта"
      size="md"
    >
      <div className="test-form-fields">
        <FormField
          label="Ключ (key)"
          required
          help="Используйте только строчные буквы и подчеркивания (например: flyers, business_cards)"
          error={newProductType.key && !/^[a-z_]+$/.test(newProductType.key) ? 'Используйте только строчные буквы и подчеркивания' : undefined}
        >
          <input
            type="text"
            value={newProductType.key || ''}
            onChange={(e) => onUpdateNewProductType({ key: e.target.value.toLowerCase() })}
            className="form-control"
            placeholder="flyers, business_cards, etc."
          />
        </FormField>
        
        <FormField
          label="Название"
          required
          help="Отображаемое название типа продукта"
        >
          <input
            type="text"
            value={newProductType.name || ''}
            onChange={(e) => onUpdateNewProductType({ name: e.target.value })}
            className="form-control"
            placeholder="Листовки, Визитки, etc."
          />
        </FormField>
      </div>
      
      <div className="flex justify-end gap-2 mt-6">
        <Button
          variant="secondary"
          onClick={handleClose}
        >
          Отмена
        </Button>
        <Button
          variant="primary"
          onClick={onSave}
          loading={saving}
          disabled={saving}
        >
          Создать
        </Button>
      </div>
    </Modal>
  );
});


