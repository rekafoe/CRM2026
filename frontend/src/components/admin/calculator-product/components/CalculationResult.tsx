import React from 'react';
import { LoadingState, EmptyState } from '../../../common';
import { MoneyAmount } from '../../../ui';

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
              <MoneyAmount value={calcResult.totalPrice ?? calcResult.final ?? 0} />
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
                      <span className="breakdown-item-cost"><MoneyAmount value={item.totalCost ?? 0} /></span>
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
                      <span className="breakdown-item-cost"><MoneyAmount value={item.totalCost ?? 0} /></span>
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
                      <span className="breakdown-item-cost"><MoneyAmount value={item.total ?? 0} /></span>
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
                      <span className="breakdown-item-cost"><MoneyAmount value={item.total ?? 0} /></span>
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


