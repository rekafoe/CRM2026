import React from 'react';
import { Alert } from '../../../components/common';
import { AppIcon } from '../../../components/ui/AppIcon';

interface MaterialsTabProps {
  materials: any[];
}

export const MaterialsTab: React.FC<MaterialsTabProps> = React.memo(({ materials }) => {
  return (
    <div className="product-tab-panel">
      <Alert type="info">
        Материалы управляются централизованно. Здесь отображаются материалы, связанные с продуктом.
      </Alert>
      {materials && materials.length > 0 ? (
        <div className="product-materials-grid">
          {materials.map((m: any, idx: number) => (
            <div key={idx} className="product-material-card">
              <div className="product-material-card__header">
                <div className="product-material-card__icon"><AppIcon name="package" size="sm" /></div>
                <div>
                  <div className="product-material-card__title">{m.material_name || m.name || 'Материал'}</div>
                  <div className="product-material-card__meta">{m.category_name || 'Категория не указана'}</div>
                </div>
              </div>
              <div className="product-material-card__details">
                {m.qty_per_sheet && <span className="product-material-card__badge">{m.qty_per_sheet} шт/лист</span>}
                {m.is_required !== undefined && (
                  <span className={`product-material-card__badge ${m.is_required ? 'badge-success' : 'badge-neutral'}`}>
                    {m.is_required ? 'Обязательный' : 'Опциональный'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="product-empty">
          <p>Материалы не привязаны. Настройте технологический процесс, чтобы определить базовые материалы.</p>
        </div>
      )}
    </div>
  );
});

MaterialsTab.displayName = 'MaterialsTab';

