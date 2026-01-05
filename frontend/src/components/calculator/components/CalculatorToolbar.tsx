import React from 'react';

interface CalculatorToolbarProps {
  onCalculate: () => void;
  onShowPresets: () => void;
  onShowQuickTemplates: () => void;
  onShowComparison: () => void;
  onShowAIDashboard: () => void;
  onShowDynamicPricingManager: () => void;
  onUpdatePrices: () => void;
  onReloadData: () => void;
  onShowProductSelection: () => void;
  isCalculating: boolean;
  lastPriceUpdate: string;
  comparisonItemsCount: number;
}

export const CalculatorToolbar: React.FC<CalculatorToolbarProps> = ({
  onCalculate,
  onShowPresets,
  onShowQuickTemplates,
  onShowComparison,
  onShowAIDashboard,
  onShowDynamicPricingManager,
  onUpdatePrices,
  onReloadData,
  onShowProductSelection,
  isCalculating,
  lastPriceUpdate,
  comparisonItemsCount
}) => {
  return (
    <div className="calculator-toolbar">
      <div className="toolbar-section">
        <button 
          className="calculator-btn calculator-btn-primary"
          onClick={onCalculate}
          disabled={isCalculating}
        >
          {isCalculating ? 'Расчет...' : 'Рассчитать'}
        </button>
        
        <button 
          className="calculator-btn calculator-btn-secondary"
          onClick={onShowPresets}
        >
          Шаблоны
        </button>
        
        <button 
          className="calculator-btn calculator-btn-secondary"
          onClick={onShowQuickTemplates}
        >
          Быстрые шаблоны
        </button>
        
        <button 
          className="calculator-btn calculator-btn-secondary"
          onClick={onShowProductSelection}
        >
          Выбор продукта
        </button>
      </div>

      <div className="toolbar-section">
        <button 
          className="calculator-btn calculator-btn-outline"
          onClick={onShowComparison}
        >
          Сравнение {comparisonItemsCount > 0 && `(${comparisonItemsCount})`}
        </button>
        
        <button 
          className="calculator-btn calculator-btn-outline"
          onClick={onShowAIDashboard}
        >
          ИИ Аналитика
        </button>
        
        <button 
          className="calculator-btn calculator-btn-outline"
          onClick={onShowDynamicPricingManager}
        >
          Динамическое ценообразование
        </button>
      </div>

      <div className="toolbar-section">
        <button 
          className="calculator-btn calculator-btn-outline"
          onClick={onUpdatePrices}
        >
          Обновить цены
        </button>
        
        <button 
          className="calculator-btn calculator-btn-outline"
          onClick={onReloadData}
        >
          Перезагрузить данные
        </button>
        
        {lastPriceUpdate && (
          <span className="last-update">
            Обновлено: {lastPriceUpdate}
          </span>
        )}
      </div>
    </div>
  );
};
