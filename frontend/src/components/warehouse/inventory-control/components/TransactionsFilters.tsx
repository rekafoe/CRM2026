import React from 'react';
import { Material } from '../../../../types/shared';

interface TransactionsFiltersProps {
  from?: string;
  to?: string;
  order?: string;
  materialId?: number | null;
  materials: Material[];
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onOrderChange: (value: string) => void;
  onMaterialChange: (value: number | null) => void;
  onRefresh: () => void;
}

export const TransactionsFilters: React.FC<TransactionsFiltersProps> = React.memo(({
  from,
  to,
  order,
  materialId,
  materials,
  onFromChange,
  onToChange,
  onOrderChange,
  onMaterialChange,
  onRefresh,
}) => {
  return (
    <div className="inv-filters">
      <label className="inv-filter-field">
        <span>С</span>
        <input type="date" value={from || ''} onChange={e => onFromChange(e.target.value)} />
      </label>
      <label className="inv-filter-field">
        <span>По</span>
        <input type="date" value={to || ''} onChange={e => onToChange(e.target.value)} />
      </label>
      <select
        value={materialId ?? ''}
        onChange={(e) => onMaterialChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">Все материалы</option>
        {materials.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
      <input
        placeholder="Номер заказа (необяз.)"
        value={order || ''}
        onChange={e => onOrderChange(e.target.value)}
      />
      <button type="button" className="action-btn" onClick={onRefresh}>Обновить</button>
    </div>
  );
});
