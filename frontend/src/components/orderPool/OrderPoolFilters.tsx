import React from 'react';
import { AppIcon } from '../ui/AppIcon';
import { FilterAction, FilterState, OrderPoolFilterCounts } from './orderPoolUtils';

interface OrderPoolFiltersProps {
  filters: FilterState;
  dispatchFilters: React.Dispatch<FilterAction>;
  searchLoading: boolean;
  counts?: OrderPoolFilterCounts;
}

function Check({
  checked,
  onChange,
  title,
  children,
  count,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title?: string;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <label className="pool-filter-check" title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{children}</span>
      {typeof count === 'number' ? <span className="pool-filter-check__count">{count}</span> : null}
    </label>
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
      <div className={`order-pool-search ${searchLoading ? 'order-pool-search--loading' : ''}`}>
        <span className="order-pool-search__icon" aria-hidden="true">
          <AppIcon name="search" size="xs" />
        </span>
        <input
          type="text"
          placeholder="Номер, клиент, телефон, УНП"
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

      <div className="filters-quick">
        <Check
          checked={filters.assigned === 'not_assigned'}
          onChange={(checked) =>
            dispatchFilters({ type: 'setAssigned', value: checked ? 'not_assigned' : 'all' })
          }
          title="Без ответственного"
          count={counts?.notAssigned}
        >
          Без ответственного
        </Check>
        <Check
          checked={filters.quickFilter === 'debt'}
          onChange={(checked) =>
            dispatchFilters({ type: 'setQuickFilter', value: checked ? 'debt' : null })
          }
          title="Только с долгом"
          count={counts?.debt}
        >
          Только с долгом
        </Check>
        <Check
          checked={filters.quickFilter === 'awaiting_payment'}
          onChange={(checked) =>
            dispatchFilters({
              type: 'setQuickFilter',
              value: checked ? 'awaiting_payment' : null,
            })
          }
          title="BePaid ожидает оплату"
          count={counts?.awaitingPayment}
        >
          BePaid ждёт оплату
        </Check>
        <Check
          checked={filters.assigned === 'assigned'}
          onChange={(checked) =>
            dispatchFilters({ type: 'setAssigned', value: checked ? 'assigned' : 'all' })
          }
          count={counts?.assigned}
        >
          Назначенные
        </Check>
        <Check
          checked={filters.cancelled === 'cancelled'}
          onChange={(checked) =>
            dispatchFilters({
              type: 'setCancelled',
              value: checked ? 'cancelled' : 'not_cancelled',
            })
          }
          count={counts?.cancelled}
        >
          Отменённые
        </Check>
        <Check
          checked={filters.quickFilter === 'prepay'}
          onChange={(checked) =>
            dispatchFilters({ type: 'setQuickFilter', value: checked ? 'prepay' : null })
          }
          count={counts?.prepay}
        >
          С предоплатой
        </Check>
        <button
          type="button"
          className="pool-filter-reset"
          onClick={() => dispatchFilters({ type: 'resetFilters' })}
        >
          Сбросить
        </button>
      </div>

      <div className="filters-secondary">
        <label className="filters-secondary__label">
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
          <select
            value={filters.sortBy}
            onChange={(e) =>
              dispatchFilters({ type: 'setSortBy', value: e.target.value as FilterState['sortBy'] })
            }
            aria-label="Сортировка"
          >
            <option value="created_at">По дате</option>
            <option value="number">По номеру</option>
            <option value="totalAmount">По сумме</option>
          </select>
        </label>
        <button
          type="button"
          className="lg-btn filters-secondary__sort-dir"
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
