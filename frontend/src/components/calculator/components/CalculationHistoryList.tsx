import React from 'react';
import { MoneyAmount } from '../../ui';

interface HistoryItem {
  productName: string;
  specifications: Record<string, any>;
  totalCost: number;
  pricePerItem: number;
}

interface Props {
  items: HistoryItem[];
  onApply: (specs: Record<string, any>) => void;
}

export const CalculationHistoryList: React.FC<Props> = ({ items, onApply }) => {
  if (!items || items.length === 0) return null;

  return (
    <div className="form-section compact">
      <h3>🕘 Недавние расчёты</h3>
      <div className="history-list">
        {items.slice(0, 5).map((item, idx) => (
          <div key={idx} className="history-row">
            <div className="history-info">
              <div className="history-name">{item.productName}</div>
              <div className="history-meta">
                {item.specifications?.format} • {item.specifications?.quantity?.toLocaleString?.() || item.specifications?.quantity} шт • <MoneyAmount value={item.pricePerItem} />/шт
              </div>
            </div>
            <div className="history-actions">
              <button className="btn btn-sm btn-outline" onClick={() => onApply(item.specifications)}>Применить</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};


