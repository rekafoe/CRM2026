import React from 'react';
import { productConfigs } from '../../../config/calculatorConfig';

interface ProductSelectorProps {
  onSelectProduct: (productKey: string) => void;
  supportedProducts: string[];
}

export const ProductSelector: React.FC<ProductSelectorProps> = ({
  onSelectProduct,
  supportedProducts
}) => {
  return (
    <div className="product-selection">
      <h3>Выберите тип продукта</h3>
      <div className="product-grid">
        {Object.entries(productConfigs)
          .filter(([key]) => supportedProducts.includes(key))
          .map(([key, config]) => (
          <div
            key={key}
            className="product-card"
            onClick={() => onSelectProduct(key)}
          >
            <h4>{config.name}</h4>
            <p>{config.description || 'Описание отсутствует'}</p>
            <div className="product-badge">Поддерживается</div>
          </div>
        ))}
      </div>
    </div>
  );
};
