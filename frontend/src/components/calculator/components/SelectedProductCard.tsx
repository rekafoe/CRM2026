import React from 'react';
import { getProductIcon } from '../utils/productIcons';

interface Props {
  productType: string;
  displayName: string;
  onOpenSelector: () => void;
}

export const SelectedProductCard: React.FC<Props> = ({ productType, displayName, onOpenSelector }) => {
  return (
    <div className="form-section compact">
      <h3>📦 {displayName}</h3>
      <div className="selected-product-info">
        <div className="selected-product-card">
          <div className="product-icon">{getProductIcon(productType)}</div>
          <div className="product-details">
            <div className="product-type">{productType}</div>
          </div>
          <button 
            className="btn btn-sm btn-outline"
            onClick={onOpenSelector}
            title="Изменить тип продукта"
          >
            🔄
          </button>
        </div>
      </div>
    </div>
  );
};

// иконки теперь импортируются из utils


