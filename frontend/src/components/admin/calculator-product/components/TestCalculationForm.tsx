import React from 'react';
import { FormField, Button } from '../../../common';
import { ProductType, CalculationTest } from '../../hooks/useCalculatorProductManagerState';

interface TestCalculationFormProps {
  productTypes: ProductType[];
  testCalculation: CalculationTest;
  onUpdateTestCalculation: (updates: Partial<CalculationTest>) => void;
  onRunCalculation: () => void;
  calcLoading: boolean;
}

export const TestCalculationForm: React.FC<TestCalculationFormProps> = React.memo(({
  productTypes,
  testCalculation,
  onUpdateTestCalculation,
  onRunCalculation,
  calcLoading,
}) => {
  return (
    <div className="test-form-section">
      <h3 className="test-section-title">Параметры расчета</h3>
      
      <div className="test-form-fields">
        <FormField
          label="Тип продукта"
          required
        >
          <select
            value={testCalculation.productType}
            onChange={(e) => onUpdateTestCalculation({ productType: e.target.value })}
            className="form-control"
          >
            {productTypes.map((type) => (
              <option key={type.key} value={type.key}>{type.name}</option>
            ))}
          </select>
        </FormField>
        
        <FormField
          label="Количество"
          required
          help="Количество изделий для расчета"
        >
          <input
            type="number"
            min="1"
            value={testCalculation.quantity}
            onChange={(e) => onUpdateTestCalculation({ quantity: parseInt(e.target.value) || 0 })}
            className="form-control"
          />
        </FormField>
        
        <FormField
          label="Формат"
        >
          <select
            value={testCalculation.specifications.format}
            onChange={(e) => onUpdateTestCalculation({ 
              specifications: { ...testCalculation.specifications, format: e.target.value }
            })}
            className="form-control"
          >
            <option value="A6">A6 (105×148 мм)</option>
            <option value="A5">A5 (148×210 мм)</option>
            <option value="A4">A4 (210×297 мм)</option>
            <option value="A3">A3 (297×420 мм)</option>
            <option value="SRA3">SRA3 (320×450 мм)</option>
          </select>
        </FormField>
        
        <FormField
          label="Стороны печати"
        >
          <select
            value={testCalculation.specifications.sides}
            onChange={(e) => onUpdateTestCalculation({ 
              specifications: { ...testCalculation.specifications, sides: parseInt(e.target.value) }
            })}
            className="form-control"
          >
            <option value={1}>1 сторона</option>
            <option value={2}>2 стороны</option>
          </select>
        </FormField>
        
        <FormField
          label="Тип ценообразования"
        >
          <select
            value={testCalculation.priceType || 'online'}
            onChange={(e) => onUpdateTestCalculation({ priceType: e.target.value })}
            className="form-control"
          >
            <option value="rush">Срочно</option>
            <option value="online">Онлайн</option>
            <option value="promo">Акция</option>
          </select>
        </FormField>
        
        <Button
          variant="primary"
          onClick={onRunCalculation}
          loading={calcLoading}
          disabled={calcLoading}
          className="w-full"
        >
          Рассчитать цену
        </Button>
      </div>
    </div>
  );
});


