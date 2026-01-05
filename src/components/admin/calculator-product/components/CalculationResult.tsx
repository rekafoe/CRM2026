import React from 'react';
import { LoadingState, EmptyState } from '../../../common';

interface CalculationResultProps {
  calcLoading: boolean;
  calcResult: any;
}

export const CalculationResult: React.FC<CalculationResultProps> = React.memo(({
  calcLoading,
  calcResult,
}) => {
  return (
    <div className="test-result-section">
      <h3 className="test-section-title">Результат расчета</h3>
      
      {calcLoading ? (
        <LoadingState message="Выполняется расчет..." />
      ) : calcResult ? (
        <div className="calculation-result">
          <div className="result-total">
            <span className="result-total-label">Общая стоимость:</span>
            <span className="result-total-value">
              {calcResult.totalPrice?.toFixed(2) || calcResult.final?.toFixed(2) || '0.00'} BYN
            </span>
          </div>
          
          {calcResult.breakdown && (
            <div className="result-breakdown">
              {calcResult.breakdown.materials && calcResult.breakdown.materials.length > 0 && (
                <div className="breakdown-section">
                  <div className="breakdown-section-title">Материалы:</div>
                  {calcResult.breakdown.materials.map((item: any, index: number) => (
                    <div key={index} className="breakdown-item">
                      <span className="breakdown-item-name">{item.name}</span>
                      <span className="breakdown-item-cost">{item.totalCost?.toFixed(2)} BYN</span>
                    </div>
                  ))}
                </div>
              )}
              {calcResult.breakdown.services && calcResult.breakdown.services.length > 0 && (
                <div className="breakdown-section">
                  <div className="breakdown-section-title">Услуги:</div>
                  {calcResult.breakdown.services.map((item: any, index: number) => (
                    <div key={index} className="breakdown-item">
                      <span className="breakdown-item-name">{item.name}</span>
                      <span className="breakdown-item-cost">{item.totalCost?.toFixed(2)} BYN</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {(calcResult.materials || calcResult.services) && (
            <div className="result-breakdown">
              {calcResult.materials && calcResult.materials.length > 0 && (
                <div className="breakdown-section">
                  <div className="breakdown-section-title">Материалы:</div>
                  {calcResult.materials.map((item: any, index: number) => (
                    <div key={index} className="breakdown-item">
                      <span className="breakdown-item-name">{item.name}</span>
                      <span className="breakdown-item-cost">{item.total?.toFixed(2)} BYN</span>
                    </div>
                  ))}
                </div>
              )}
              {calcResult.services && calcResult.services.length > 0 && (
                <div className="breakdown-section">
                  <div className="breakdown-section-title">Услуги:</div>
                  {calcResult.services.map((item: any, index: number) => (
                    <div key={index} className="breakdown-item">
                      <span className="breakdown-item-name">{item.name}</span>
                      <span className="breakdown-item-cost">{item.total?.toFixed(2)} BYN</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon="📊"
          title="Нет результатов"
          description="Нажмите 'Рассчитать цену' для получения результата"
        />
      )}
    </div>
  );
});


