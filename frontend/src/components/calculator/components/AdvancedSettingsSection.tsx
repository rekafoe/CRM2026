import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getProductionDaysByPriceType, getProductionTimeLabelFromDays } from '../utils/time';
import { getPriceTypes } from '../../services/pricing';
import type { PriceType } from '../../types/pricing';

const formatMultiplier = (m: number) => {
  if (m >= 1) return `×${m} (+${((m - 1) * 100).toFixed(0)}%)`;
  return `×${m} (−${((1 - m) * 100).toFixed(1)}%)`;
};

interface Props {
  specs: { priceType: string; customerType: string; pages?: number; productionDays?: number } & Record<string, any>;
  updateSpecs: (updates: Record<string, any>, instant?: boolean) => void;
  backendProductSchema: any | null;
}

export const AdvancedSettingsSection: React.FC<Props> = ({ specs, updateSpecs, backendProductSchema }) => {
  const [priceTypes, setPriceTypes] = useState<PriceType[]>([]);

  const allowedKeys = useMemo(() => {
    const arr = backendProductSchema?.constraints?.allowed_price_types;
    return Array.isArray(arr) && arr.length > 0 ? arr : ['standard', 'online'];
  }, [backendProductSchema?.constraints?.allowed_price_types]);

  useEffect(() => {
    let cancelled = false;
    getPriceTypes(true)
      .then((list) => { if (!cancelled) setPriceTypes(list); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const priceTypeOptions = useMemo(() => {
    const byKey = new Map(priceTypes.map((pt) => [pt.key, pt]));
    return allowedKeys
      .map((key) => {
        const pt = byKey.get(key);
        return pt ? { key: pt.key, label: `${pt.name} (${formatMultiplier(pt.multiplier)})` } : { key, label: key };
      })
      .filter((o) => o);
  }, [priceTypes, allowedKeys]);

  const currentPriceType = specs.priceType || 'standard';
  const isValidPriceType = allowedKeys.includes(currentPriceType);
  const effectivePriceType = isValidPriceType ? currentPriceType : allowedKeys[0] ?? 'standard';
  const prevEffectiveRef = useRef(effectivePriceType);

  useEffect(() => {
    if (!isValidPriceType && currentPriceType !== effectivePriceType && prevEffectiveRef.current !== effectivePriceType) {
      prevEffectiveRef.current = effectivePriceType;
      updateSpecs({ priceType: effectivePriceType }, true);
    }
  }, [isValidPriceType, currentPriceType, effectivePriceType, updateSpecs]);

  return (
    <div className="form-section advanced-settings compact">
      <h3>🔧 Настройки</h3>
      <div className="advanced-grid compact">
        <div className="param-group param-group--narrow">
          <label>Тип цены</label>
          <select
            value={effectivePriceType}
            onChange={(e) => updateSpecs({ priceType: e.target.value }, true)}
            className="form-control"
          >
            {priceTypeOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="param-group param-group--narrow">
          <label>Срок изготовления</label>
          <select
            value={specs.productionDays ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              updateSpecs({ productionDays: v === '' ? undefined : Number(v) }, true);
            }}
            className="form-control"
          >
            <option value="">По типу цены ({getProductionTimeLabelFromDays(getProductionDaysByPriceType(specs.priceType as any))})</option>
            <option value={1}>1 день</option>
            <option value={2}>2 дня</option>
            <option value={3}>3 дня</option>
            <option value={5}>5 дней</option>
            <option value={7}>7 дней</option>
          </select>
        </div>

        {Array.isArray((backendProductSchema?.fields || []).find((f: any) => f.name === 'pages')?.enum) && (
          <div className="param-group">
            <label>Страниц:</label>
            <select
              value={specs.pages || 4}
              onChange={(e) => updateSpecs({ pages: parseInt(e.target.value) }, true)} // 🆕 instant
              className="form-control"
            >
              {((backendProductSchema?.fields || []).find((f: any) => f.name === 'pages')?.enum || []).map((pages: number) => (
                <option key={pages} value={pages}>{pages} стр.</option>
              ))}
            </select>
          </div>
        )}

        <div className="param-group checkbox-group">
          {(backendProductSchema?.fields || []).some((f: any) => f.name === 'magnetic') && (
            <label>
              <input
                type="checkbox"
                checked={!!specs.magnetic}
                onChange={(e) => updateSpecs({ magnetic: e.target.checked }, true)} // 🆕 instant для checkbox
              />
              Магнитные
            </label>
          )}
          {(backendProductSchema?.fields || []).some((f: any) => f.name === 'cutting') && (
            <label title={specs.cutting_required ? 'Резка обязательна для этого подтипа' : undefined}>
              <input
                type="checkbox"
                checked={!!specs.cutting}
                disabled={!!specs.cutting_required}
                onChange={(e) => !specs.cutting_required && updateSpecs({ cutting: e.target.checked }, true)}
              />
              Резка
            </label>
          )}
          {(backendProductSchema?.fields || []).some((f: any) => f.name === 'folding') && (
            <label>
              <input
                type="checkbox"
                checked={!!specs.folding}
                onChange={(e) => updateSpecs({ folding: e.target.checked }, true)} // 🆕 instant
              />
              Фальцовка
            </label>
          )}
          {(backendProductSchema?.fields || []).some((f: any) => f.name === 'roundCorners') && (
            <label>
              <input
                type="checkbox"
                checked={!!specs.roundCorners}
                onChange={(e) => updateSpecs({ roundCorners: e.target.checked }, true)} // 🆕 instant
              />
              Скругление углов
            </label>
          )}
        </div>
      </div>
    </div>
  );
};


