import React from 'react';
import { FilterAction, FilterState, OrderPoolFilterCounts } from './orderPoolUtils';

interface OrderPoolFiltersProps {
  filters: FilterState;
  dispatchFilters: React.Dispatch<FilterAction>;
  searchLoading: boolean;
  counts?: OrderPoolFilterCounts;
}

function Chip({
  active,
  onClick,
  title,
  children,
  count,
  reset,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
  count?: number;
  reset?: boolean;
}) {
  return (
    <button
      type="button"
      className={`quick-btn ${active ? 'active' : ''} ${reset ? 'quick-btn--reset' : ''}`}
      onClick={onClick}
      title={title}
    >
      <span>{children}</span>
      {typeof count === 'number' ? <span className="quick-btn__count">{count}</span> : null}
    </button>
  );
}

export const OrderPoolFilters: React.FC<OrderPoolFiltersProps> = ({
  filters,
  dispatchFilters,
  searchLoading,
  counts,
}) => {
  return (
    <div className="filters">
      <div className="filters-quick">
        <Chip
          active={filters.assigned === 'not_assigned'}
          onClick={() => dispatchFilters({ type: 'setAssigned', value: 'not_assigned' })}
          title="Без ответственного"
          count={counts?.notAssigned}
        >
          Неназначенные
        </Chip>
        <Chip
          active={filters.assigned === 'assigned'}
          onClick={() => dispatchFilters({ type: 'setAssigned', value: 'assigned' })}
          count={counts?.assigned}
        >
          Назначенные
        </Chip>
        <Chip
          active={filters.cancelled === 'cancelled'}
          onClick={() => dispatchFilters({ type: 'setCancelled', value: 'cancelled' })}
          count={counts?.cancelled}
        >
          Отменённые
        </Chip>
        <Chip
          active={filters.quickFilter === 'debt'}
          onClick={() =>
            dispatchFilters({
              type: 'setQuickFilter',
              value: filters.quickFilter === 'debt' ? null : 'debt',
            })
          }
          title="Только с долгом"
          count={counts?.debt}
        >
          С долгом
        </Chip>
        <Chip
          active={filters.quickFilter === 'prepay'}
          onClick={() =>
            dispatchFilters({
              type: 'setQuickFilter',
              value: filters.quickFilter === 'prepay' ? null : 'prepay',
            })
          }
          count={counts?.prepay}
        >
          С предоплатой
        </Chip>
        <Chip
          active={filters.quickFilter === 'awaiting_payment'}
          onClick={() =>
            dispatchFilters({
              type: 'setQuickFilter',
              value: filters.quickFilter === 'awaiting_payment' ? null : 'awaiting_payment',
            })
          }
          title="BePaid ожидает оплату"
          count={counts?.awaitingPayment}
        >
          Ожидает оплату
        </Chip>
        <Chip active={false} reset onClick={() => dispatchFilters({ type: 'resetFilters' })}>
          Сбросить
        </Chip>
      </div>

      <div className={`order-pool-search ${searchLoading ? 'order-pool-search--loading' : ''}`}>
        <span className="order-pool-search__icon" aria-hidden="true">
          ⌕
        </span>
        <input
          type="text"
          placeholder="Номер, клиент, телефон…"
          value={filters.searchInput}
          onChange={(e) => dispatchFilters({ type: 'setSearchInput', value: e.target.value })}
        />
        {searchLoading && (
          <span className="order-pool-search__loader" aria-label="Идёт поиск">
            <span />
            <span />
            <span />
          </span>
        )}
      </div>

      <div className="filters-secondary">
        <label className="filters-secondary__label">
          Источник
          <select
            value={filters.source}
            onChange={(e) =>
              dispatchFilters({ type: 'setSource', value: e.target.value as FilterState['source'] })
            }
            aria-label="Источник заказа"
          >
            <option value="website">Онлайн (сайт)</option>
            <option value="all">Все источники</option>
            <option value="crm">CRM</option>
            <option value="telegram">Telegram</option>
            <option value="mini_app">Mini App</option>
          </select>
        </label>
        <label className="filters-secondary__label">
          Сортировка
          <select
            value={filters.sortBy}
            onChange={(e) =>
              dispatchFilters({ type: 'setSortBy', value: e.target.value as FilterState['sortBy'] })
            }
          >
            <option value="created_at">По дате</option>
            <option value="number">По номеру</option>
            <option value="totalAmount">По сумме</option>
          </select>
        </label>
        <button
          type="button"
          className="filters-secondary__sort-dir"
          onClick={() => dispatchFilters({ type: 'toggleSortDirection' })}
          title="Направление сортировки"
          aria-label="Направление сортировки"
        >
          {filters.sortDirection === 'asc' ? '↑' : '↓'}
        </button>
      </div>
    </div>
  );
};
