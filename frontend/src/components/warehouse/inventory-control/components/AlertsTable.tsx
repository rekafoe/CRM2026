import React from 'react';
import { Material } from '../../../../types/shared';

interface Alert {
  id: number;
  material_id: number;
  alert_type: 'out_of_stock' | 'low_stock';
  threshold_value: number;
  material?: Material;
}

interface AlertsTableProps {
  alerts: Alert[];
  onAdjustStock: (material: Material, newQuantity: number) => void;
  onMaterialAction: (material: Material, action: 'out') => void;
}

export const AlertsTable: React.FC<AlertsTableProps> = React.memo(({
  alerts,
  onAdjustStock,
  onMaterialAction,
}) => {
  return (
    <div className="materials-table-wrapper">
      <table className="inv-table">
        <thead>
          <tr>
            <th>Материал</th>
            <th>Категория</th>
            <th>Остаток</th>
            <th>Мин. остаток</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {alerts.map(alert => {
            const m = alert.material;
            if (!m) return null;
            const qty = m.quantity || 0;
            const minQ = m.min_stock_level || alert.threshold_value || 0;
            const isOut = alert.alert_type === 'out_of_stock' || qty <= 0;
            const rowClass = isOut ? 'row-danger' : 'row-warning';
            return (
              <tr key={alert.id} className={rowClass}>
                <td>{m.name}</td>
                <td>{(m as any)?.category_name || '—'}</td>
                <td>{qty}</td>
                <td>{minQ}</td>
                <td>
                  <span className={`inv-badge ${isOut ? 'status-out_of_stock' : 'status-low'}`}>
                    {isOut ? 'Закончился' : 'Низкий остаток'}
                  </span>
                </td>
                <td>
                  <div className="inv-actions">
                    <button 
                      className="action-btn small"
                      onClick={() => onAdjustStock(m, minQ + 50)}
                    >
                      📥 Пополнить
                    </button>
                    <button 
                      className="action-btn small"
                      onClick={() => onMaterialAction(m, 'out')}
                    >
                      📤 Списание
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

