import React from 'react';
import { AppIcon } from '../../ui/AppIcon';
import { SelectedProductCard } from './SelectedProductCard';

interface CustomProductFormProps {
  selectedProductName: string;
  customProductForm: {
    name: string;
    quantity: string;
    productionDays: string;
    pricePerItem: string;
    characteristics: string;
  };
  setCustomProductForm: React.Dispatch<React.SetStateAction<{
    name: string;
    quantity: string;
    productionDays: string;
    pricePerItem: string;
    characteristics: string;
  }>>;
  onOpenProductSelector: () => void;
}

export const CustomProductForm: React.FC<CustomProductFormProps> = ({
  selectedProductName,
  customProductForm,
  setCustomProductForm,
  onOpenProductSelector,
}) => (
  <div className="calculator-section-group calculator-section-unified">
    <div className="section-group-header">
      <h3><AppIcon name="edit" size="xs" /> Произвольный продукт</h3>
    </div>
    <div className="section-group-content">
      <SelectedProductCard
        productType="universal"
        displayName={selectedProductName || 'Произвольный продукт'}
        onOpenSelector={onOpenProductSelector}
      />
      <div className="form-section custom-product-form">
        <div className="custom-product-grid">
          <label className="custom-product-field">
            <span className="custom-product-label">Наименование</span>
            <input
              type="text"
              className="custom-product-input"
              value={customProductForm.name}
              onChange={(e) => setCustomProductForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Например: Табличка 30×20"
            />
          </label>
          <label className="custom-product-field">
            <span className="custom-product-label">Тираж</span>
            <input
              type="number"
              className="custom-product-input"
              value={customProductForm.quantity}
              min={1}
              onChange={(e) => setCustomProductForm(prev => ({ ...prev, quantity: e.target.value }))}
            />
          </label>
          <label className="custom-product-field">
            <span className="custom-product-label">Срок изготовления (дн.)</span>
            <input
              type="number"
              className="custom-product-input"
              value={customProductForm.productionDays}
              min={1}
              onChange={(e) => setCustomProductForm(prev => ({ ...prev, productionDays: e.target.value }))}
            />
            <span className="custom-product-hint">Можно оставить 1 день по умолчанию</span>
          </label>
          <label className="custom-product-field">
            <span className="custom-product-label">Цена за штуку (BYN)</span>
            <input
              type="number"
              className="custom-product-input"
              value={customProductForm.pricePerItem}
              min={0}
              step="0.01"
              onChange={(e) => setCustomProductForm(prev => ({ ...prev, pricePerItem: e.target.value }))}
              placeholder="Например: 12.50"
            />
          </label>
          <label className="custom-product-field custom-product-field--full">
            <span className="custom-product-label">Характеристики</span>
            <textarea
              className="custom-product-textarea"
              value={customProductForm.characteristics}
              onChange={(e) => setCustomProductForm(prev => ({ ...prev, characteristics: e.target.value }))}
              placeholder="Материал, цвет, комментарии..."
            />
          </label>
        </div>
      </div>
    </div>
  </div>
);
