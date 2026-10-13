import React from 'react';
import { AppIcon } from '../../ui/AppIcon';
import { BynSymbol } from '../../ui/BynSymbol';

interface ResultSectionProps {
  result: {
    totalCost: number;
    pricePerItem: number;
    specifications: { quantity: number; sides?: number };
    productionTime: string;
    parameterSummary?: Array<{ label: string; value: string }>;
    layout?: {
      sheetsNeeded?: number;
      metersNeeded?: number;
      totalM2Needed?: number;
      itemsPerSheet?: number;
      sheetSize?: string;
      fitsOnSheet?: boolean;
      bleedMm?: number;
      cutsPerSheet?: number;
      knifePathM?: number;
    };
    warnings?: string[];
    tier_prices?: Array<{ min_qty: number; max_qty?: number; unit_price: number; total_price?: number }>;
    materials?: Array<{
      material?: string;
      total?: number;
      unitPrice?: number;
      price?: number;
      isConsumableOnly?: boolean;
    }>;
    services?: Array<{
      service?: string;
      operationName?: string;
      total?: number;
      totalCost?: number;
      quantity?: number;
      unitPrice?: number;
      price?: number;
      priceUnit?: string;
    }>;
  } | null;
  isValid: boolean;
  onAddToOrder: () => void;
  mode?: 'create' | 'edit';
  /** Ошибка последнего расчёта: старая сумма уже сброшена, добавлять её нельзя */
  calcError?: string | null;
  /** Первая ошибка заполнения, если расчёта ещё нет */
  blockingMessage?: string | null;
  /** Идёт запрос цены: кнопку добавления держим выключенной, чтобы не записать прошлую сумму */
  pricePending?: boolean;
}

function positiveCostLines(result: NonNullable<ResultSectionProps['result']>) {
  const lines: Array<{ key: string; name: string; total: number }> = [];
  (result.materials ?? []).forEach((material, index) => {
    const total = Number(material.total);
    const name = String(material.material ?? '').trim();
    const unitPrice = Number(material.unitPrice ?? material.price ?? 0);
    if (!Number.isFinite(total) || total <= 0) return;
    if (!name || name === 'Материал') return;
    if (material.isConsumableOnly && unitPrice <= 0) return;
    lines.push({ key: `material-${index}-${name}`, name, total });
  });
  (result.services ?? []).forEach((service, index) => {
    const total = Number(service.total ?? service.totalCost);
    const name = String(service.service || service.operationName || '').trim();
    if (!Number.isFinite(total) || total <= 0 || !name) return;
    const qty = Number(service.quantity);
    const rate = Number(service.unitPrice ?? service.price);
    const perMeter = String(service.priceUnit || '').toLowerCase() === 'per_meter';
    const labeled =
      perMeter && Number.isFinite(qty) && qty > 0 && Number.isFinite(rate) && rate > 0
        ? `${name} · ${qty.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} м × ${rate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`
        : name;
    lines.push({ key: `service-${index}-${name}`, name: labeled, total });
  });
  return lines;
}

function sheetWord(count: number): string {
  const abs = Math.abs(Math.trunc(count)) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'листов';
  if (last === 1) return 'лист';
  if (last >= 2 && last <= 4) return 'листа';
  return 'листов';
}

function hasProductionTime(value: string | undefined): boolean {
  const text = String(value || '').trim();
  return text.length > 0 && text !== '—' && text !== '-';
}

export const ResultSection: React.FC<ResultSectionProps> = ({
  result,
  isValid,
  onAddToOrder,
  mode = 'create',
  calcError = null,
  blockingMessage = null,
  pricePending = false,
}) => {
  const formatNumber = (value?: number, suffix?: string, roundTo2 = false) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return '—';
    }
    const v = roundTo2 ? Math.round(value * 100) / 100 : value;
    const formatted = v.toLocaleString('ru-RU', roundTo2 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined);
    return suffix ? `${formatted} ${suffix}` : formatted;
  };
  const withByn = (value?: number, roundTo2 = false) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return <>—</>;
    }
    const v = roundTo2 ? Math.round(value * 100) / 100 : value;
    const formatted = v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (
      <>
        {formatted} <BynSymbol />
      </>
    );
  };
  const withBynPerUnit = (value?: number) => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return <>—</>;
    }
    const formatted = value.toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
    return (
      <>
        {formatted} <BynSymbol />
      </>
    );
  };

  const emptyMessage = calcError || blockingMessage || 'Заполните параметры для расчёта';

  // Всегда показываем секцию, даже если result null (показываем заглушку)
  if (!result) {
    return (
      <div className="form-section result-section compact">
        <h3><AppIcon name="money" size="xs" /> Стоимость: —</h3>
        <div className="result-details">
          <div className={`result-item result-status-message${calcError ? ' result-status-message--error' : ''}`} role={calcError ? 'alert' : undefined}>
            <span>{emptyMessage}</span>
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
  const metersNeeded = result.layout?.metersNeeded;
  const totalM2Needed = result.layout?.totalM2Needed;
  const itemsPerSheet = result.layout?.itemsPerSheet;
  const sheetSize = result.layout?.sheetSize;
  const fitsOnSheet = result.layout?.fitsOnSheet;
  const bleedMm = result.layout?.bleedMm;
  const cutsPerSheetUi = result.layout?.cutsPerSheet;
  const warnings = result.warnings || [];
  const addButtonLabel = mode === 'edit' ? <><AppIcon name="save" size="xs" /> Обновить позицию</> : <>Добавить в заказ</>;
  const showFormatWarning = fitsOnSheet === false || warnings.length > 0;
  const costLines = positiveCostLines(result);
  const layoutFacts = [
    sheetsNeeded != null && sheetsNeeded > 0 ? `${formatNumber(sheetsNeeded)} ${sheetWord(sheetsNeeded)}` : null,
    itemsPerSheet != null && itemsPerSheet > 0 ? `${formatNumber(itemsPerSheet)} шт. на листе` : null,
    metersNeeded != null && metersNeeded > 0 ? `подача ${formatNumber(metersNeeded, 'п.м.', true)}` : null,
    totalM2Needed != null && totalM2Needed > 0 ? `площадь ${formatNumber(totalM2Needed, 'м²', true)}` : null,
    sheetSize ? `лист ${sheetSize}` : null,
    bleedMm != null && bleedMm > 0 ? `дозаливка ${bleedMm} мм` : null,
    cutsPerSheetUi != null && cutsPerSheetUi > 0 ? `${formatNumber(cutsPerSheetUi)} резов на лист` : null,
    result.layout?.knifePathM != null && result.layout.knifePathM > 0
      ? `длина реза ${formatNumber(result.layout.knifePathM, 'м', true)}`
      : null,
  ].filter((fact): fact is string => Boolean(fact));

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
      {/* Округляем до 2 знаков — так же, как при добавлении в заказ (storedTotalCost), чтобы сумма в заказе совпадала с калькулятором */}
      <h3 className="result-total">
        <span><AppIcon name="money" size="xs" /> Стоимость</span>
        <span>
          {withByn(result.totalCost, true)}
          {pricePending ? <span className="result-price-pending"> Пересчёт…</span> : null}
        </span>
      </h3>
      <div className="result-meta">
        <span>{withBynPerUnit(result.pricePerItem)} за шт.</span>
        {hasProductionTime(result.productionTime) ? <span>{result.productionTime}</span> : null}
      </div>
      {costLines.length > 0 && (
        <div className="result-cost-lines">
          {costLines.map((line) => (
            <div className="result-cost-line" key={line.key}>
              <span className="result-cost-line__name">{line.name}</span>
              <span>{withByn(line.total, true)}</span>
            </div>
          ))}
        </div>
      )}
      {layoutFacts.length > 0 && (
        <div className="result-sheet-info">{layoutFacts.join(' · ')}</div>
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
                    <td>
                      {typeof t.unit_price === 'number' ? (
                        <>
                          {t.unit_price.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} <BynSymbol />
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {t.total_price != null ? (
                        <>
                          {Number(t.total_price).toFixed(2)} <BynSymbol />
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      )}
      {!isValid && blockingMessage && (
        <div className="result-status-message" role="status">
          <span>{blockingMessage}</span>
        </div>
      )}
      <div className="result-actions">
        <button 
          className="btn btn-primary"
          onClick={onAddToOrder}
          disabled={!isValid || Boolean(calcError) || pricePending}
        >
          {addButtonLabel}
        </button>
      </div>
    </div>
  );
};


