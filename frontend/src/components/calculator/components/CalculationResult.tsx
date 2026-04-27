import React from 'react';
import { MoneyAmount } from '../../ui';

interface CalculatorSpecs {
  productType: string;
  format: string;
  quantity: number;
  sides: 1 | 2;
  paperType: string;
  paperDensity: number;
  lamination: 'none' | 'matte' | 'glossy';
  priceType: 'standard' | 'urgent' | 'online' | 'promo' | 'special';
  customerType: 'regular' | 'vip';
}

interface CalculationResult {
  productName: string;
  totalCost: number;
  pricePerItem: number;
  materials: Array<{
    material: string;
    quantity: number;
    unit: string;
    price: number;
    total: number;
  }>;
  productionTime: string;
}

interface CalculationResultProps {
  result: CalculationResult | null;
  specs: CalculatorSpecs;
  onAddToOrder: () => void;
}

export const CalculationResultComponent: React.FC<CalculationResultProps> = ({
  result,
  specs,
  onAddToOrder
}) => {
  if (!result) return null;
  const materials = Array.isArray(result.materials) ? result.materials : [];

  return (
    <div className="calculation-result">
      <h3>Результат расчета</h3>
      <div className="result-summary">
        <div className="result-item">
          <span>Продукт:</span>
          <span>{result.productName}</span>
        </div>
        <div className="result-item">
          <span>Количество:</span>
          <span>{specs.quantity} шт</span>
        </div>
        <div className="result-item">
          <span>Цена за штуку:</span>
          <span><MoneyAmount value={result.pricePerItem} /></span>
        </div>
        <div className="result-item total">
          <span>Итого:</span>
          <span><MoneyAmount value={result.totalCost} /></span>
        </div>
        <div className="result-item">
          <span>Срок производства:</span>
          <span>{result.productionTime}</span>
        </div>
      </div>

      {/* Материалы */}
      {materials.length > 0 && (
        <div className="materials-list">
          <h4>Материалы:</h4>
          {materials.map((material, index) => (
            <div key={index} className="material-item">
              <span>{material.material}</span>
              <span>{material.quantity} {material.unit}</span>
              <span><MoneyAmount value={material.total} /></span>
            </div>
          ))}
        </div>
      )}

      {/* Кнопка добавления в заказ */}
      <button
        className="add-to-order-btn"
        onClick={onAddToOrder}
      >
        Добавить в заказ
      </button>
    </div>
  );
};