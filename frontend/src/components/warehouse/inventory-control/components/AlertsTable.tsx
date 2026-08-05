import React from 'react';
import { Material } from '../../../../types/shared';
import { formatRollStockLabel, isRollMaterial } from '../../../../utils/materialRollLabels';
import { getSuggestedReplenishQty } from '../../../../utils/materialStockOps';

interface Alert {
  id: number;
  material_id: number;
  alert_type: 'out_of_stock' | 'low_stock';
  threshold_value: number;
  material?: Material;
}

interface AlertsTableProps {
  alerts: Alert[];
  onReceive: (material: Material) => void;
  onViewHistory: (material: Material) => void;
  onOpenAutoOrder?: () => void;
}

export const AlertsTable: React.FC<AlertsTableProps> = React.memo(({
  alerts,
  onReceive,
  onViewHistory,
  onOpenAutoOrder,
}) => {
  if (!alerts.length) {
    return (
      <div className="materials-table-wrapper">
        <p className="inv-empty-hint">Сейчас всё в норме — материалов с низким остатком нет</p>
      </div>
    );
  }

  return (
    <div className="materials-table-wrapper">
      <div className="inv-section-hint">
        Сначала оформите приход. Автозаказ — если нужно правило на будущее.
        {onOpenAutoOrder ? (
          <button type="button" className="action-btn action-btn--text" onClick={onOpenAutoOrder}>
            К автозаказу
          </button>
        ) : null}
      </div>
      <table className="inv-table inv-table--ops">
        <thead>
          <tr>
            <th className="col-name">Материал</th>
            <th>Остаток</th>
            <th>Мин.</th>
            <th>Статус</th>
            <th className="col-actions">Что сделать</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert) => {
            const m = alert.material;
            if (!m) return null;
            const qty = m.quantity || 0;
            const minQ = m.min_stock_level || alert.threshold_value || 0;
            const isOut = alert.alert_type === 'out_of_stock' || qty <= 0;
            const stockLabel = isRollMaterial(m as any)
              ? formatRollStockLabel(m as any)
              : `${qty} ${m.unit || ''}`.trim();
            const suggestQty = getSuggestedReplenishQty(m);
            const suggestLabel = isRollMaterial(m as any)
              ? formatRollStockLabel({
                  sheet_width: (m as any).sheet_width,
                  quantity: suggestQty,
                })
              : String(suggestQty);

            return (
              <tr key={alert.id} className={isOut ? 'row-danger' : 'row-warning'}>
                <td className="col-name">
                  <div className="inv-material-name">{m.name}</div>
                  <div className="inv-material-meta">{(m as any)?.category_name || '—'}</div>
                </td>
                <td>{stockLabel}</td>
                <td>{minQ}</td>
                <td>
                  <span className={`inv-badge ${isOut ? 'status-out_of_stock' : 'status-low'}`}>
                    {isOut ? 'Закончился' : 'Мало'}
                  </span>
                </td>
                <td className="col-actions">
                  <div className="inv-actions inv-actions--labeled">
                    <button
                      type="button"
                      className="action-btn action-btn--text primary"
                      title={`Приход до минимума: +${suggestLabel}`}
                      onClick={() => onReceive(m)}
                    >
                      Приход +{suggestLabel}
                    </button>
                    <button
                      type="button"
                      className="action-btn action-btn--text"
                      onClick={() => onViewHistory(m)}
                    >
                      История
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
