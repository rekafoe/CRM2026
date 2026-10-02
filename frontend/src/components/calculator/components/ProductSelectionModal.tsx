import React from 'react';

interface ProductSelectionModalProps {
  productConfigs: Record<string, any>;
  onSelectProduct: (productType: string) => void;
  onClose: () => void;
}

export const ProductSelectionModal: React.FC<ProductSelectionModalProps> = ({
  productConfigs,
  onSelectProduct,
  onClose
}) => {
  const getProductIcon = (productType: string): string => {
    const iconMap: Record<string, string> = {
      'flyers': '',
      'business_cards': '',
      'booklets': '',
      'posters': '',
      'brochures': '',
      'stickers': '',
      'envelopes': '',
      'labels': '',
      'blanks': '',
      'calendars': '',
      'badges': '',
      'business_forms': ''
    };
    
    return iconMap[productType] || '';
  };

  return (
    <div className="calculator-section">
      <h3>Выбор продукта</h3>
      <div className="product-selection-grid">
        {Object.entries(productConfigs).map(([key, config]) => (
          <div 
            key={key}
            className="product-type-card"
            onClick={() =>onSelectProduct(key)}
          >
            <div className="product-icon">
              {getProductIcon(key)}
            </div>
            <div className="product-details">
              <h4>{config.name}</h4>
              <p>Форматы: {config.formats.join(', ')}</p>
              <p>Плотность: {config.paperDensities.join(', ')}г/м²</p>
            </div>
          </div>
        ))}
      </div>
      <button 
        className="calculator-btn calculator-btn-outline" 
        onClick={onClose}
      >
        Закрыть
      </button>
    </div>
  );
};
