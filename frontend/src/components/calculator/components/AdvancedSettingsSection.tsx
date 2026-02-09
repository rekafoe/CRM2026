import React from 'react';
import { getProductionDaysByPriceType, getProductionTimeLabelFromDays } from '../utils/time';

interface Props {
  specs: { priceType: string; customerType: string; pages?: number; productionDays?: number } & Record<string, any>;
  updateSpecs: (updates: Record<string, any>, instant?: boolean) => void;
  backendProductSchema: any | null;
}

export const AdvancedSettingsSection: React.FC<Props> = ({ specs, updateSpecs, backendProductSchema }) => {
  return (
    <div className="form-section advanced-settings compact">
      <h3>🔧 Настройки</h3>
      <div className="advanced-grid compact">
        <div className="param-group">
          <label>Тип цены</label>
          <select
            value={specs.priceType || 'standard'}
            onChange={(e) => updateSpecs({ priceType: e.target.value }, true)}
            className="form-control"
          >
            <option value="standard">Стандартная (×1)</option>
            <option value="urgent">Срочно (+50%)</option>
            <option value="online">Онлайн (−15%)</option>
            <option value="promo">Промо (−30%)</option>
            <option value="special">Спец.предложение (−45%)</option>
          </select>
        </div>

        <div className="param-group">
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
            <label>
              <input
                type="checkbox"
                checked={!!specs.cutting}
                onChange={(e) => updateSpecs({ cutting: e.target.checked }, true)} // 🆕 instant
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


