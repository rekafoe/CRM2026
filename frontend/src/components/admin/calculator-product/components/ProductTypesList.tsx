import React from 'react';
import { Button, LoadingState, EmptyState, StatusBadge } from '../../../common';
import { ProductType } from '../../hooks/useCalculatorProductManagerState';

interface ProductTypesListProps {
  loading: boolean;
  productTypes: ProductType[];
  selectedType: string | null;
  onSelectType: (key: string) => void;
  onDeleteType: (key: string) => void;
  onAddType: () => void;
}

export const ProductTypesList: React.FC<ProductTypesListProps> = React.memo(({
  loading,
  productTypes,
  selectedType,
  onSelectType,
  onDeleteType,
  onAddType,
}) => {
  return (
    <div className="product-types-panel">
      <div className="panel-header">
        <h2>Типы продуктов</h2>
        <Button 
          variant="primary" 
          size="sm"
          onClick={onAddType}
          icon={<span>+</span>}
        >
          Добавить тип
        </Button>
      </div>
      
      <div className="panel-content">
        {loading ? (
          <LoadingState message="Загрузка типов продуктов..." />
        ) : productTypes.length === 0 ? (
          <EmptyState
            icon=""
            title="Нет типов продуктов"
            description="Создайте первый тип продукта для настройки калькулятора"
            action={{
              label: "Создать тип продукта",
              onClick: onAddType
            }}
          />
        ) : (
          <div>
            {productTypes.map((type) => (
              <div
                key={type.key}
                className={`product-type-card ${selectedType === type.key ? 'selected' : ''}`}
                onClick={() =>onSelectType(type.key)}
              >
                <div className="product-type-header">
                  <div className="product-type-info">
                    <h3>{type.name}</h3>
                    <div className="product-key">{type.key}</div>
                  </div>
                  <div className="product-type-actions" onClick={(e) =>e.stopPropagation()}>
                    <StatusBadge status={type.status === 'active' ? 'active' : 'inactive'} />
                    <Button
                      variant="error"
                      size="sm"
                      onClick={() => onDeleteType(type.key)}
                    >
                      Удалить
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});


