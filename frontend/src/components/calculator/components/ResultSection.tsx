import React from 'react';
import { AppIcon } from '../../ui/AppIcon';

interface ResultSectionProps {
  result: {
    totalCost: number;
    pricePerItem: number;
    specifications: { quantity: number; sides?: number };
    productionTime: string;
    parameterSummary?: Array<{ label: string; value: string }>;
    layout?: { sheetsNeeded?: number; itemsPerSheet?: number; sheetSize?: string; fitsOnSheet?: boolean };
    warnings?: string[];
    tier_prices?: Array<{ min_qty: number; max_qty?: number; unit_price: number; total_price?: number }>;
  } | null;
  isValid: boolean;
  onAddToOrder: () => void;
  mode?: 'create' | 'edit';
}

export const ResultSection: React.FC<ResultSectionProps> = ({
  result,
  isValid,
  onAddToOrder,
  mode = 'create',
}) => {
  const formatNumber = (value?: number, suffix?: string) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '—';
    }
    const formatted = value.toLocaleString();
    return suffix ? `${formatted} ${suffix}` : formatted;
  };

  // Всегда показываем секцию, даже если result null (показываем заглушку)
  if (!result) {
    return (
      <div className="form-section result-section compact">
        <h3><AppIcon name="money" size="xs" /> Стоимость: —</h3>
        <div className="result-details">
          <div className="result-item">
            <span>Заполните параметры для расчёта</span>
          </div>
        </div>
        <div className="result-actions">
          <button 
            className="btn btn-primary"
            onClick={onAddToOrder}
            disabled={true}
          >
            {mode === 'edit' ? <><AppIcon name="save" size="xs" /> Обновить позицию</> : <>Добавить в заказ</>}
          </button>
        </div>
      </div>
    );
  }

  const sheetsNeeded = result.layout?.sheetsNeeded;
  const itemsPerSheet = result.layout?.itemsPerSheet;
  const sheetSize = result.layout?.sheetSize;
  const fitsOnSheet = result.layout?.fitsOnSheet;
  const warnings = result.warnings || [];
  const parameterSummary = result.parameterSummary || [];
  const addButtonLabel = mode === 'edit' ? <><AppIcon name="save" size="xs" /> Обновить позицию</> : <>Добавить в заказ</>;
  const showFormatWarning = fitsOnSheet === false || warnings.length > 0;

  return (
    <div className="form-section result-section compact">
      {showFormatWarning && (
        <div className="result-section__warning" role="alert">
          {fitsOnSheet === false && (
            <p><AppIcon name="warning" size="xs" /> Выбранный формат не помещается на стандартные печатные листы (SRA3, A3, A4). Проверьте размер.</p>
          )}
          {warnings.map((msg, i) => (
            <p key={i}><AppIcon name="warning" size="xs" /> {msg}</p>
          ))}
        </div>
      )}
      <h3><AppIcon name="money" size="xs" /> Стоимость: {formatNumber(result.totalCost, 'BYN')}</h3>
      <div className="result-details">
        <div className="result-item">
          <span>За штуку:</span>
          <span>{formatNumber(result.pricePerItem, 'BYN')}</span>
        </div>
        <div className="result-item">
          <span>Количество:</span>
          <span>{formatNumber(result.specifications?.quantity, 'шт.')}</span>
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
          {parameterSummary
            .filter((param) => {
              // 🆕 Исключаем "Тип материала" полностью, если есть "Материал" и они совпадают
              // Это предотвращает дублирование, так как "Материал" уже показывает тип бумаги
              // Но если "Тип материала" отличается от "Материал" (например, разные display_name), показываем оба
              if (param.label === 'Тип материала') {
                const materialParam = parameterSummary.find((p) => p.label === 'Материал');
                // Если есть "Материал" и значения совпадают - не показываем "Тип материала"
                if (materialParam && materialParam.value === param.value) {
                  return false;
                }
              }
              return true;
            })
            .map((param) => (
              <div className="parameter-chip" key={`${param.label}-${param.value}`}>
                <span className="parameter-label">{param.label}</span>
                <span className="parameter-value">{param.value}</span>
              </div>
            ))}
        </div>
      )}
      {(sheetsNeeded || itemsPerSheet || sheetSize) && (
        <div className="result-sheet-info">
          {sheetsNeeded != null && <span><AppIcon name="document" size="xs" /> Листов: {sheetsNeeded}</span>}
          {itemsPerSheet != null && <span>• На листе: {itemsPerSheet} шт.</span>}
          {sheetSize && <span>• Формат листа: {sheetSize}</span>}
        </div>
      )}
      {result.tier_prices && result.tier_prices.length > 0 && (
        <details className="result-tier-prices">
          <summary>Тиражные скидки</summary>
          <table className="tier-prices-table">
            <thead>
              <tr>
                <th>Количество</th>
                <th>За 1 ед.</th>
                <th>Цена</th>
              </tr>
            </thead>
            <tbody>
              {result.tier_prices.map((t, i) => {
                const qty = result.specifications?.quantity ?? 0;
                const isCurrent = qty >= t.min_qty && (t.max_qty == null || qty <= t.max_qty);
                return (
                  <tr key={i} className={isCurrent ? 'tier-prices-row--current' : ''}>
                    <td>{t.max_qty != null ? `${t.min_qty}–${t.max_qty}` : t.min_qty}</td>
                    <td>{typeof t.unit_price === 'number' ? t.unit_price.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : '—'} BYN</td>
                    <td>{t.total_price != null ? `${Number(t.total_price).toFixed(2)} BYN` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}
      <div className="result-actions">
        <button 
          className="btn btn-primary"
          onClick={onAddToOrder}
          disabled={!isValid}
        >
          {addButtonLabel}
        </button>
      </div>
    </div>
  );
};


