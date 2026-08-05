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
  supplier_name?: string;
  delivery_number?: string | null;
  invoice_number?: string | null;
  delivery_date?: string | null;
  delivery_notes?: string | null;
}

interface TransactionsTableProps {
  moves: Move[];
  materials: Material[];
  loading: boolean;
}

function formatDeliveryDocs(move: Move): string {
  const parts: string[] = [];
  if (move.supplier_name) parts.push(move.supplier_name);
  if (move.delivery_number) parts.push(`пост. ${move.delivery_number}`);
  if (move.invoice_number) parts.push(`нак. ${move.invoice_number}`);
  if (move.delivery_date) {
    const d = new Date(move.delivery_date);
    parts.push(Number.isNaN(d.getTime()) ? move.delivery_date : d.toLocaleDateString('ru-RU'));
  }
  return parts.join(' · ');
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
            <th>Документы</th>
            <th>Оператор</th>
            <th>Заказ</th>
            <th>Причина</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7}>Загрузка...</td></tr>
          ) : !(moves || []).length ? (
            <tr><td colSpan={7} className="inv-empty-cell">Движений по выбранным фильтрам нет</td></tr>
          ) : (
            (moves || []).map((mm: Move) => {
              const mat = materials.find(m => m.id === mm.materialId);
              const docs = mm.delta > 0 ? formatDeliveryDocs(mm) : '';
              return (
                <tr key={mm.id}>
                  <td>{mm.created_at ? new Date(mm.created_at).toLocaleString() : '—'}</td>
                  <td className="col-name">{mat?.name || mm.materialId}</td>
                  <td>
                    <span className={`delta ${mm.delta > 0 ? 'delta-in' : 'delta-out'}`}>
                      {mm.delta > 0 ? `+${mm.delta}` : mm.delta}
                    </span>
                  </td>
                  <td className="col-name">
                    {docs || '—'}
                    {mm.delta > 0 && mm.delivery_notes ? (
                      <div className="inv-material-meta">{mm.delivery_notes}</div>
                    ) : null}
                  </td>
                  <td>{mm.user_name || (mm.user_id ? `Пользователь #${mm.user_id}` : '—')}</td>
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
