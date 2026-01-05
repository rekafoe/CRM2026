import React from 'react';

interface Props {
  specs: { priceType: string; customerType: string; pages?: number } & Record<string, any>;
  updateSpecs: (updates: Record<string, any>, instant?: boolean) => void; // 🆕 Добавили instant
  backendProductSchema: any | null;
}

export const AdvancedSettingsSection: React.FC<Props> = ({ specs, updateSpecs, backendProductSchema }) => {
  return (
    <div className="form-section advanced-settings compact">
      <h3>🔧 Настройки</h3>
      <div className="advanced-grid compact">
        <div className="param-group">
          <label>Тип цены:</label>
          <select
            value={specs.priceType}
            onChange={(e) => updateSpecs({ priceType: e.target.value }, true)} // 🆕 instant
            className="form-control"
          >
            <option value="online">Онлайн (стандарт)</option>
            <option value="rush">Срочно (+50%)</option>
            <option value="promo">Промо (-30%)</option>
          </select>
        </div>

        <div className="param-group">
          <label>Тип клиента:</label>
          <select
            value={specs.customerType}
            onChange={(e) => updateSpecs({ customerType: e.target.value }, true)} // 🆕 instant
            className="form-control"
          >
            <option value="regular">Обычный</option>
            <option value="vip">VIP (-10%)</option>
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


