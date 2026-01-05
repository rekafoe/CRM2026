import React from 'react';

interface TransactionsFiltersProps {
  from?: string;
  to?: string;
  order?: string;
  user?: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onOrderChange: (value: string) => void;
  onUserChange: (value: string) => void;
  onRefresh: () => void;
}

export const TransactionsFilters: React.FC<TransactionsFiltersProps> = React.memo(({
  from,
  to,
  order,
  user,
  onFromChange,
  onToChange,
  onOrderChange,
  onUserChange,
  onRefresh,
}) => {
  return (
    <div className="inv-filters">
      <input type="date" value={from || ''} onChange={e => onFromChange(e.target.value)} />
      <input type="date" value={to || ''} onChange={e => onToChange(e.target.value)} />
      <input placeholder="ID заказа" value={order || ''} onChange={e => onOrderChange(e.target.value)} />
      <input placeholder="ID пользователя" value={user || ''} onChange={e => onUserChange(e.target.value)} />
      <button className="action-btn" onClick={onRefresh}>Обновить</button>
    </div>
  );
});

