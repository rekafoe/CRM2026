import React from 'react';

interface ResultSectionProps {
  result: {
    totalCost: number;
    pricePerItem: number;
    specifications: { quantity: number; sides?: number };
    productionTime: string;
    parameterSummary?: Array<{ label: string; value: string }>;
    layout?: { sheetsNeeded?: number; itemsPerSheet?: number; sheetSize?: string };
  } | null;
  isValid: boolean;
  onAddToOrder: () => void;
  onAddToComparison: () => void;
  mode?: 'create' | 'edit';
}

export const ResultSection: React.FC<ResultSectionProps> = ({
  result,
  isValid,
  onAddToOrder,
  onAddToComparison,
  mode = 'create',
}) => {
  if (!result) return null;

  const sheetsNeeded = result.layout?.sheetsNeeded;
  const itemsPerSheet = result.layout?.itemsPerSheet;
  const sheetSize = result.layout?.sheetSize;
  const parameterSummary = result.parameterSummary || [];
  const addButtonLabel = mode === 'edit' ? '💾 Обновить позицию' : '➕ Добавить в заказ';

  return (
    <div className="form-section result-section compact">
      <h3>💰 Стоимость: {result.totalCost.toLocaleString()} BYN</h3>
      <div className="result-details">
        <div className="result-item">
          <span>За штуку:</span>
          <span>{result.pricePerItem.toLocaleString()} BYN</span>
        </div>
        <div className="result-item">
          <span>Количество:</span>
          <span>{result.specifications.quantity.toLocaleString()} шт.</span>
        </div>
        {typeof result.specifications.sides !== 'undefined' && (
          <div className="result-item">
            <span>Стороны:</span>
            <span>{result.specifications.sides === 2 ? 'двусторонняя' : 'односторонняя'}</span>
          </div>
        )}
        <div className="result-item">
          <span>Срок:</span>
          <span>{result.productionTime}</span>
        </div>
      </div>
      {parameterSummary.length > 0 && (
        <div className="result-parameter-summary">
          {parameterSummary.map((param) => (
            <div className="parameter-chip" key={`${param.label}-${param.value}`}>
              <span className="parameter-label">{param.label}</span>
              <span className="parameter-value">{param.value}</span>
            </div>
          ))}
        </div>
      )}
      {(sheetsNeeded || itemsPerSheet || sheetSize) && (
        <div className="result-sheet-info">
          {sheetsNeeded != null && <span>📄 Листов: {sheetsNeeded}</span>}
          {itemsPerSheet != null && <span>• На листе: {itemsPerSheet} шт.</span>}
          {sheetSize && <span>• Формат листа: {sheetSize}</span>}
        </div>
      )}
      <div className="result-actions">
        <button 
          className="btn btn-primary"
          onClick={onAddToOrder}
          disabled={!isValid}
        >
          {addButtonLabel}
        </button>
        <button 
          className="btn btn-outline"
          onClick={onAddToComparison}
          disabled={!isValid}
        >
          ⚖️ Сравнить
        </button>
      </div>
    </div>
  );
};


