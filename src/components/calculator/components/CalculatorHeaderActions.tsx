import React from 'react';

interface CalculatorHeaderActionsProps {
  onShowQuickTemplates: () => void;
  onShowComparison: () => void;
  onShowAI: () => void;
  onShowDynamicPricing: () => void;
  onClose: () => void;
}

export const CalculatorHeaderActions: React.FC<CalculatorHeaderActionsProps> = ({
  onShowQuickTemplates,
  onShowComparison,
  onShowAI,
  onShowDynamicPricing,
  onClose
}) => {
  return (
    <div className="header-actions">
      <button
        className="btn btn-sm btn-outline"
        onClick={onShowQuickTemplates}
        title="Быстрые шаблоны"
      >
        ⚡ Шаблоны
      </button>
      <button
        className="btn btn-sm btn-outline"
        onClick={onShowComparison}
        title="Сравнение вариантов"
      >
        ⚖️ Сравнить
      </button>
      <button
        className="btn btn-sm btn-outline"
        onClick={onShowAI}
        title="ИИ Дашборд"
      >
        🤖 ИИ
      </button>
      <button
        className="btn btn-sm btn-outline"
        onClick={onShowDynamicPricing}
        title="Динамическое ценообразование"
      >
        ⚙️ Настройки
      </button>
      <button className="close-btn" onClick={onClose}>×</button>
    </div>
  );
};


