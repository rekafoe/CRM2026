import React from 'react';
import { Material } from '../../../../types/shared';

interface Move {
  id: number;
  materialId: number;
  delta: number;
  reason?: string;
  user_id?: number;
  user_name?: string;
  order_number?: string;
  orderId?: number;
  created_at?: string;
}

interface TransactionsTableProps {
  moves: Move[];
  materials: Material[];
  loading: boolean;
}

export const TransactionsTable: React.FC<TransactionsTableProps> = React.memo(({
  moves,
  materials,
  loading,
}) => {
  return (
    <div className="materials-table-wrapper">
      <table className="inv-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Материал</th>
            <th>Δ Кол-во</th>
            <th>Оператор</th>
            <th>Заказ</th>
            <th>Причина</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6}>Загрузка...</td></tr>
          ) : (
            (moves || []).map((mm: Move) => {
              const mat = materials.find(m => m.id === mm.materialId);
              return (
                <tr key={mm.id}>
                  <td>{mm.created_at ? new Date(mm.created_at).toLocaleString() : '—'}</td>
                  <td>{mat?.name || mm.materialId}</td>
                  <td>
                    <span className={`delta ${mm.delta > 0 ? 'delta-in' : 'delta-out'}`}>
                      {mm.delta > 0 ? `+${mm.delta}` : mm.delta}
                    </span>
                  </td>
                  <td>{mm.user_name || mm.user_id || '—'}</td>
                  <td>{mm.order_number || mm.orderId || '—'}</td>
                  <td>{mm.reason || '—'}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
});

