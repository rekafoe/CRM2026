import React from 'react';
import { AppIcon } from '../../ui/AppIcon';
import { getProductIconName } from '../utils/productIcons';

interface Props {
  productType: string;
  displayName: string;
  onOpenSelector: () => void;
}

export const SelectedProductCard: React.FC<Props> = ({ productType, displayName, onOpenSelector }) => {
  return (
    <div className="form-section compact">
      <h3><AppIcon name="package" size="xs" /> {displayName}</h3>
      <div className="selected-product-info">
        <button
          type="button"
          className="selected-product-card"
          onClick={onOpenSelector}
          title="Изменить тип продукта"
          aria-label={`Изменить тип продукта: ${displayName}`}
        >
          <div className="product-icon"><AppIcon name={getProductIconName(productType)} size="lg" /></div>
          <div className="product-details">
            <div className="product-type">{productType}</div>
          </div>
          <span className="selected-product-change" aria-hidden="true">
            <AppIcon name="refresh" size="sm" />
          </span>
        </button>
      </div>
    </div>
  );
};

// иконки теперь импортируются из utils


