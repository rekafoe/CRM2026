import React from 'react';
import { ProductType, CalculationTest } from '../../hooks/useCalculatorProductManagerState';
import { TestCalculationForm } from '../components/TestCalculationForm';
import { CalculationResult } from '../components/CalculationResult';

interface TestTabProps {
  productTypes: ProductType[];
  testCalculation: CalculationTest;
  onUpdateTestCalculation: (updates: Partial<CalculationTest>) => void;
  onRunCalculation: () => void;
  calcLoading: boolean;
  calcResult: any;
}

export const TestTab: React.FC<TestTabProps> = React.memo(({
  productTypes,
  testCalculation,
  onUpdateTestCalculation,
  onRunCalculation,
  calcLoading,
  calcResult,
}) => {
  return (
    <div className="test-form-section">
      <div className="instruction-box">
        <div className="instruction-box-title">
          <span>🧪</span>
          <span>Тестирование расчетов</span>
        </div>
        <div className="instruction-box-content">
          Используйте эту вкладку для проверки корректности расчетов цен. Укажите параметры продукта и нажмите "Рассчитать цену" для получения детального расчета.
        </div>
      </div>

      <div className="test-section">
        <TestCalculationForm
          productTypes={productTypes}
          testCalculation={testCalculation}
          onUpdateTestCalculation={onUpdateTestCalculation}
          onRunCalculation={onRunCalculation}
          calcLoading={calcLoading}
        />
        
        <CalculationResult
          calcLoading={calcLoading}
          calcResult={calcResult}
        />
      </div>
    </div>
  );
});


