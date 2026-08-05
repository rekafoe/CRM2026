import React from 'react';
import { Material } from '../../../../types/shared';
import { formatRollStockLabel, isRollMaterial } from '../../../../utils/materialRollLabels';

interface MaterialsTableProps {
  materials: Material[];
  onMaterialAction: (material: Material, action: 'in' | 'out' | 'adjustment' | 'history') => void;
  onViewTransactions: (materialId: number) => void;
}

function getStockStatus(material: Material): { key: string; label: string } {
  const qty = material.quantity || 0;
  const minStock = material.min_stock_level || (material as any).min_quantity || 10;
  if (qty <= 0) return { key: 'out_of_stock', label: 'Нет' };
  if (qty <= minStock) return { key: 'low', label: 'Мало' };
  return { key: 'ok', label: 'Норма' };
}

export const MaterialsTable: React.FC<MaterialsTableProps> = React.memo(({
  materials,
  onMaterialAction,
  onViewTransactions,
}) => {
  if (!materials.length) {
    return (
      <div className="materials-table-wrapper">
        <p className="inv-empty-hint">Нет материалов по текущим фильтрам</p>
      </div>
    );
  }

  return (
    <div className="materials-table-wrapper">
      <table className="inv-table inv-table--ops">
        <thead>
          <tr>
            <th className="col-name">Материал</th>
            <th>Категория</th>
            <th>Остаток</th>
            <th>Доступно</th>
            <th>Статус</th>
            <th className="col-actions">Действия</th>
          </tr>
        </thead>
        <tbody>
          {materials.map((m) => {
            const reserved = (m as any).reserved_quantity ?? 0;
            const available = (m as any).available_quantity ?? Math.max(0, (m.quantity || 0) - reserved);
            const isRoll = isRollMaterial(m as any);
            const quantityLabel = isRoll
              ? formatRollStockLabel(m as any)
              : `${m.quantity ?? 0} ${m.unit || ''}`.trim();
            const availableLabel = isRoll
              ? formatRollStockLabel({
                  sheet_width: (m as any).sheet_width,
                  quantity: available,
                })
              : String(available);
            const status = getStockStatus(m);

            return (
              <tr key={m.id}>
                <td className="col-name">
                  <div className="inv-material-name">{m.name}</div>
                  {(m as any).material_type_name ? (
                    <div className="inv-material-meta">{(m as any).material_type_name}</div>
                  ) : null}
                </td>
                <td>{(m as any).category_name || '—'}</td>
                <td>{quantityLabel}</td>
                <td>{availableLabel}</td>
                <td>
                  <span className={`inv-badge status-${status.key}`}>{status.label}</span>
                </td>
                <td className="col-actions">
                  <div className="inv-actions inv-actions--labeled">
                    <button
                      type="button"
                      className="action-btn action-btn--text primary"
                      title="Приход"
                      onClick={() => onMaterialAction(m, 'in')}
                    >
                      Приход
                    </button>
                    <button
                      type="button"
                      className="action-btn action-btn--text"
                      title="Списание"
                      onClick={() => onMaterialAction(m, 'out')}
                    >
                      Списание
                    </button>
                    <button
                      type="button"
                      className="action-btn action-btn--text"
                      title="История движений"
                      onClick={() => onViewTransactions(m.id!)}
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
