import React from 'react';
import { Material } from '../../../../types/shared';
import { TransactionsFilters } from '../components/TransactionsFilters';
import { TransactionsTable } from '../components/TransactionsTable';

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

interface TransactionsTabProps {
  moves: Move[];
  materials: Material[];
  loading: boolean;
  filters: { from?: string; to?: string; order?: string; user?: string; materialId?: number | null };
  onFilterChange: (filters: Partial<{ from?: string; to?: string; order?: string; user?: string; materialId?: number | null }>) => void;
  onRefresh: () => void;
}

export const TransactionsTab: React.FC<TransactionsTabProps> = React.memo(({
  moves,
  materials,
  loading,
  filters,
  onFilterChange,
  onRefresh,
}) => {
  return (
    <div className="transactions-view">
      <TransactionsFilters
        from={filters.from}
        to={filters.to}
        order={filters.order}
        user={filters.user}
        onFromChange={(value) => onFilterChange({ from: value })}
        onToChange={(value) => onFilterChange({ to: value })}
        onOrderChange={(value) => onFilterChange({ order: value })}
        onUserChange={(value) => onFilterChange({ user: value })}
        onRefresh={onRefresh}
      />
      <TransactionsTable
        moves={moves}
        materials={materials}
        loading={loading}
      />
    </div>
  );
});

