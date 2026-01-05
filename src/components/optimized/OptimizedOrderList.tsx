import React, { useMemo, useCallback, useState } from 'react';
import { Order } from '../../types/shared';
import { VirtualizedOrderList } from '../virtualized/VirtualizedOrderList';
import { useOptimizedData } from '../../hooks/useOptimizedData';
import { getOrders } from '../../api';

interface OptimizedOrderListProps {
  selectedId: number | null;
  onSelect: (id: number) => void;
  filters?: {
    status?: string;
    customerName?: string;
    dateFrom?: string;
    dateTo?: string;
  };
  height?: number;
}

// Мемоизированный компонент для фильтров
const OrderFilters = React.memo<{
  filters: any;
  onFiltersChange: (filters: any) => void;
  orderCount: number;
}>(({ filters, onFiltersChange, orderCount }) => {
  const handleFilterChange = useCallback((key: string, value: string) => {
    onFiltersChange({
      ...filters,
      [key]: value || undefined
    });
  }, [filters, onFiltersChange]);

  return (
    <div className="order-filters">
      <div className="filters-row">
        <div className="filter-group">
          <label>Статус:</label>
          <select
            value={filters.status || ''}
            onChange={(e) => handleFilterChange('status', e.target.value)}
          >
            <option value="">Все статусы</option>
            <option value="pending">В ожидании</option>
            <option value="in_progress">В работе</option>
            <option value="completed">Завершен</option>
            <option value="cancelled">Отменен</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Клиент:</label>
          <input
            type="text"
            placeholder="Поиск по имени..."
            value={filters.customerName || ''}
            onChange={(e) => handleFilterChange('customerName', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>От:</label>
          <input
            type="date"
            value={filters.dateFrom || ''}
            onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
          />
        </div>

        <div className="filter-group">
          <label>До:</label>
          <input
            type="date"
            value={filters.dateTo || ''}
            onChange={(e) => handleFilterChange('dateTo', e.target.value)}
          />
        </div>
      </div>

      <div className="filters-info">
        <span>Найдено заказов: {orderCount}</span>
        {(filters.status || filters.customerName || filters.dateFrom || filters.dateTo) && (
          <button
            className="btn btn-sm btn-outline"
            onClick={() => onFiltersChange({})}
          >
            Очистить фильтры
          </button>
        )}
      </div>
    </div>
  );
});

OrderFilters.displayName = 'OrderFilters';

// Мемоизированный компонент для статистики
const OrderStats = React.memo<{
  orders: Order[];
  filteredOrders: Order[];
}>(({ orders, filteredOrders }) => {
  const stats = useMemo(() => {
    const total = orders.length;
    const filtered = filteredOrders.length;
    const pending = orders.filter(o => o.status === 'pending').length;
    const inProgress = orders.filter(o => o.status === 'in_progress').length;
    const completed = orders.filter(o => o.status === 'completed').length;
    const totalRevenue = orders
      .filter(o => o.total_amount)
      .reduce((sum, o) => sum + (o.total_amount || 0), 0);

    return {
      total,
      filtered,
      pending,
      inProgress,
      completed,
      totalRevenue
    };
  }, [orders, filteredOrders]);

  return (
    <div className="order-stats">
      <div className="stat-item">
        <span className="stat-label">Всего:</span>
        <span className="stat-value">{stats.total}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">Показано:</span>
        <span className="stat-value">{stats.filtered}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">В ожидании:</span>
        <span className="stat-value pending">{stats.pending}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">В работе:</span>
        <span className="stat-value in-progress">{stats.inProgress}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">Завершено:</span>
        <span className="stat-value completed">{stats.completed}</span>
      </div>
      <div className="stat-item">
        <span className="stat-label">Выручка:</span>
        <span className="stat-value revenue">{stats.totalRevenue.toFixed(2)} BYN</span>
      </div>
    </div>
  );
});

OrderStats.displayName = 'OrderStats';

export const OptimizedOrderList: React.FC<OptimizedOrderListProps> = ({
  selectedId,
  onSelect,
  filters = {},
  height = 400
}) => {
  const [localFilters, setLocalFilters] = useState(filters);
  const [sortBy, setSortBy] = useState<'date' | 'customer' | 'status' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Оптимизированная загрузка данных
  const { data: orders, loading, error, refetch, isStale } = useOptimizedData({
    fetchFn: () => getOrders(),
    cacheKey: 'orders',
    cacheTTL: 2 * 60 * 1000, // 2 минуты
    dependencies: [localFilters]
  });

  // Мемоизированная фильтрация и сортировка
  const filteredAndSortedOrders = useMemo(() => {
    if (!orders) return [];

    let filtered = orders.filter(order => {
      if (localFilters.status && order.status !== localFilters.status) return false;
      if (localFilters.customerName && 
          !order.customer_name.toLowerCase().includes(localFilters.customerName.toLowerCase())) {
        return false;
      }
      if (localFilters.dateFrom && order.created_at < localFilters.dateFrom) return false;
      if (localFilters.dateTo && order.created_at > localFilters.dateTo) return false;
      return true;
    });

    // Сортировка
    filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'date':
          aValue = new Date(a.created_at).getTime();
          bValue = new Date(b.created_at).getTime();
          break;
        case 'customer':
          aValue = a.customer_name.toLowerCase();
          bValue = b.customer_name.toLowerCase();
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'amount':
          aValue = a.total_amount || 0;
          bValue = b.total_amount || 0;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [orders, localFilters, sortBy, sortOrder]);

  // Обработчики
  const handleFiltersChange = useCallback((newFilters: any) => {
    setLocalFilters(newFilters);
  }, []);

  const handleSortChange = useCallback((newSortBy: typeof sortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(newSortBy);
      setSortOrder('asc');
    }
  }, [sortBy]);

  if (loading) {
    return (
      <div className="optimized-order-list loading">
        <div className="loading-skeleton">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="skeleton-order-item" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="optimized-order-list error">
        <div className="error-message">
          <h3>Ошибка загрузки заказов</h3>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={refetch}>
            Попробовать снова
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="optimized-order-list">
      {/* Фильтры */}
      <OrderFilters
        filters={localFilters}
        onFiltersChange={handleFiltersChange}
        orderCount={filteredAndSortedOrders.length}
      />

      {/* Статистика */}
      <OrderStats
        orders={orders || []}
        filteredOrders={filteredAndSortedOrders}
      />

      {/* Сортировка */}
      <div className="order-sorting">
        <span>Сортировка:</span>
        <button
          className={`sort-btn ${sortBy === 'date' ? 'active' : ''}`}
          onClick={() => handleSortChange('date')}
        >
          Дата {sortBy === 'date' && (sortOrder === 'asc' ? '↑' : '↓')}
        </button>
        <button
          className={`sort-btn ${sortBy === 'customer' ? 'active' : ''}`}
          onClick={() => handleSortChange('customer')}
        >
          Клиент {sortBy === 'customer' && (sortOrder === 'asc' ? '↑' : '↓')}
        </button>
        <button
          className={`sort-btn ${sortBy === 'status' ? 'active' : ''}`}
          onClick={() => handleSortChange('status')}
        >
          Статус {sortBy === 'status' && (sortOrder === 'asc' ? '↑' : '↓')}
        </button>
        <button
          className={`sort-btn ${sortBy === 'amount' ? 'active' : ''}`}
          onClick={() => handleSortChange('amount')}
        >
          Сумма {sortBy === 'amount' && (sortOrder === 'asc' ? '↑' : '↓')}
        </button>
      </div>

      {/* Виртуализированный список */}
      <VirtualizedOrderList
        orders={filteredAndSortedOrders}
        selectedId={selectedId}
        onSelect={onSelect}
        height={height}
      />

      {/* Индикатор устаревших данных */}
      {isStale && (
        <div className="stale-indicator">
          <span>⚠️ Данные могут быть устаревшими</span>
          <button className="btn btn-sm btn-outline" onClick={refetch}>
            Обновить
          </button>
        </div>
      )}
    </div>
  );
};
