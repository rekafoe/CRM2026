import React from 'react';
import { Material } from '../../../../types/shared';

interface MaterialsTableProps {
  materials: Material[];
  onMaterialAction: (material: Material, action: 'in' | 'out' | 'adjustment' | 'history') => void;
  onViewTransactions: (materialId: number) => void;
}

export const MaterialsTable: React.FC<MaterialsTableProps> = React.memo(({
  materials,
  onMaterialAction,
  onViewTransactions,
}) => {
  return (
    <div className="materials-table-wrapper">
      <table className="inv-table">
        <thead>
          <tr>
            <th>Название</th>
            <th>Категория</th>
            <th>Поставщик</th>
            <th>Кол-во</th>
            <th>Зарезерв.</th>
            <th>Доступно</th>
            <th>Мин. остаток</th>
            <th>Ед.</th>
            <th>Цена/лист</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {materials.map(m => {
            const reserved = (m as any).reserved_quantity ?? 0;
            const available = (m as any).available_quantity ?? m.quantity ?? 0;
            const status = (m as any).status ?? '';
            const supplierName = (m as any).supplier_name || (m as any).supplier?.name || '';
            return (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td>{(m as any).category_name || '—'}</td>
                <td>{supplierName || '—'}</td>
                <td>{m.quantity ?? 0}</td>
                <td>{reserved}</td>
                <td>{available}</td>
                <td>{(m as any).min_quantity ?? (m as any).min_stock_level ?? '—'}</td>
                <td>{m.unit}</td>
                <td>{(m as any).sheet_price_single ? Number((m as any).sheet_price_single).toFixed(2) : '—'}</td>
                <td>
                  {status ? <span className={`inv-badge status-${status}`}>{status}</span> : '—'}
                </td>
                <td>
                  <div className="inv-actions">
                    <button className="action-btn small" onClick={() => onMaterialAction(m, 'in')}>📥</button>
                    <button className="action-btn small" onClick={() => onMaterialAction(m, 'out')}>📤</button>
                    <button className="action-btn small" onClick={() => onMaterialAction(m, 'adjustment')}>🔧</button>
                    <button className="action-btn small" onClick={() => onViewTransactions(m.id!)}>🕘 История</button>
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

