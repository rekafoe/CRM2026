import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Order } from '../../types';
import { getDepartments, type Department } from '../../api';
import { useLogger } from '../../utils/logger';
import { useToastNotifications } from '../Toast';
import { LoadingSpinner } from '../LoadingSpinner';
import { ErrorDisplay } from '../ErrorStates';
import { useOrderStatuses } from '../../hooks/useOrderStatuses';
import './OrdersManagement.css';

interface OrdersManagementProps {
  onOrderSelect: (order: Order) => void;
  selectedOrderId?: number;
  currentUser?: { id: number; role: string };
}

interface SearchFilters {
  query: string;
  status: number | '';
  dateFrom: string;
  dateTo: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  minAmount: string;
  maxAmount: string;
  hasPrepayment: boolean | '';
  paymentMethod: string;
  department_id: number | '';
}

interface OrdersStats {
  totalOrders: number;
  newOrders: number;
  inProgressOrders: number;
  readyOrders: number;
  shippedOrders: number;
  completedOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  ordersWithPrepayment: number;
  totalPrepayment: number;
}

export const OrdersManagement: React.FC<OrdersManagementProps> = ({
  onOrderSelect,
  selectedOrderId,
  currentUser
}) => {
  const logger = useLogger('OrdersManagement');
  const toast = useToastNotifications();
  
  // Состояния
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<OrdersStats | null>(null);
  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [itemsPerPage] = useState(20);
  const [departments, setDepartments] = useState<Department[]>([]);
  
  // Фильтры поиска
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    status: '',
    dateFrom: '',
    dateTo: '',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    minAmount: '',
    maxAmount: '',
    hasPrepayment: '',
    paymentMethod: '',
    department_id: ''
  });
  
  const { statuses: orderStatuses } = useOrderStatuses();

  // Загрузка заказов
  const loadOrders = useCallback(async (page = 1) => {
    if (!currentUser?.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const searchParams = new URLSearchParams();
      
      // Добавляем фильтры в параметры поиска
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      
      // Добавляем пагинацию
      searchParams.append('limit', String(itemsPerPage));
      searchParams.append('offset', String((page - 1) * itemsPerPage));
      
      const response = await fetch(`/api/orders/search?${searchParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Ошибка загрузки заказов');
      }
      
      const data = await response.json();
      setOrders(data);
      setCurrentPage(page);
      
      // Рассчитываем общее количество страниц (примерно)
      setTotalPages(Math.ceil(data.length / itemsPerPage));
      
      logger.info('Заказы загружены', { count: data.length, page });
    } catch (err) {
      logger.error('Ошибка загрузки заказов', err);
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      toast.error('Ошибка загрузки заказов');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, filters, itemsPerPage, logger, toast]);

  // Загрузка статистики
  const loadStats = useCallback(async () => {
    if (!currentUser?.id) return;
    
    try {
      const response = await fetch('/api/orders/stats', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken')}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      logger.error('Ошибка загрузки статистики', err);
    }
  }, [currentUser?.id, logger]);

  // Поиск заказов
  const handleSearch = useCallback(() => {
    setCurrentPage(1);
    loadOrders(1);
  }, [loadOrders]);

  // Сброс фильтров
  const handleResetFilters = useCallback(() => {
    setFilters({
      query: '',
      status: '',
      dateFrom: '',
      dateTo: '',
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      minAmount: '',
      maxAmount: '',
      hasPrepayment: '',
      paymentMethod: '',
      department_id: ''
    });
    setCurrentPage(1);
  }, []);

  // Выбор заказа
  const handleOrderSelect = useCallback((order: Order) => {
    onOrderSelect(order);
  }, [onOrderSelect]);

  // Выбор заказов для массовых операций
  const handleOrderToggle = useCallback((orderId: number) => {
    setSelectedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  }, []);

  // Выбрать все заказы на странице
  const handleSelectAll = useCallback(() => {
    if (selectedOrders.length === orders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(orders.map(order => order.id));
    }
  }, [orders, selectedOrders.length]);

  // Массовое изменение статуса
  const handleBulkStatusUpdate = useCallback(async (newStatus: number) => {
    if (selectedOrders.length === 0) {
      toast.warning('Выберите заказы для изменения статуса');
      return;
    }
    
    try {
      const response = await fetch('/api/orders/bulk/update-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('crmToken')}`
        },
        body: JSON.stringify({
          orderIds: selectedOrders,
          newStatus
        })
      });
      
      if (!response.ok) {
        throw new Error('Ошибка обновления статусов');
      }
      
      const result = await response.json();
      toast.success(`Статус обновлен для ${result.updatedCount} заказов`);
      setSelectedOrders([]);
      loadOrders(currentPage);
    } catch (err) {
      logger.error('Ошибка массового обновления статуса', err);
      toast.error('Ошибка обновления статусов');
    }
  }, [selectedOrders, currentPage, loadOrders, logger, toast]);

  // Массовое удаление заказов
  const handleBulkDelete = useCallback(async () => {
    if (selectedOrders.length === 0) {
      toast.warning('Выберите заказы для удаления');
      return;
    }
    
    if (!confirm(`Удалить ${selectedOrders.length} заказов? Это действие нельзя отменить.`)) {
      return;
    }
    
    try {
      const response = await fetch('/api/orders/bulk/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('crmToken')}`
        },
        body: JSON.stringify({
          orderIds: selectedOrders
        })
      });
      
      if (!response.ok) {
        throw new Error('Ошибка удаления заказов');
      }
      
      const result = await response.json();
      toast.success(`Удалено ${result.deletedCount} заказов`);
      setSelectedOrders([]);
      loadOrders(currentPage);
    } catch (err) {
      logger.error('Ошибка массового удаления', err);
      toast.error('Ошибка удаления заказов');
    }
  }, [selectedOrders, currentPage, loadOrders, logger, toast]);

  // Экспорт заказов
  const handleExport = useCallback(async (format: 'csv' | 'json') => {
    try {
      const searchParams = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      searchParams.append('format', format);
      
      const response = await fetch(`/api/orders/export?${searchParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('crmToken')}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Ошибка экспорта');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders_export_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast.success('Экспорт завершен');
    } catch (err) {
      logger.error('Ошибка экспорта', err);
      toast.error('Ошибка экспорта заказов');
    }
  }, [filters, logger, toast]);

  // Загрузка департаментов
  useEffect(() => {
    getDepartments().then(r => setDepartments(r.data ?? [])).catch(() => setDepartments([]));
  }, []);

  // Загрузка данных при монтировании
  useEffect(() => {
    if (currentUser?.id) {
      loadOrders();
      loadStats();
    }
  }, [currentUser?.id, loadOrders, loadStats]);

  // Мемоизированные значения
  const selectedOrdersCount = selectedOrders.length;
  const hasSelectedOrders = selectedOrdersCount > 0;
  const totalAmount = useMemo(() => 
    orders.reduce((sum, order) => 
      sum + order.items.reduce((itemSum, item) => 
        itemSum + (item.price * item.quantity), 0
      ), 0
    ), [orders]
  );

  if (loading && orders.length === 0) {
    return <LoadingSpinner text="Загрузка заказов..." />;
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={() => loadOrders()} />;
  }

  return (
    <div className="orders-management">
      {/* Заголовок и статистика */}
      <div className="orders-header">
        <div className="orders-title">
          <h2>📋 Управление заказами</h2>
          <div className="orders-count">
            {orders.length} заказов • {totalAmount.toLocaleString()} BYN
          </div>
        </div>
        
        <div className="orders-actions">
          <button 
            className="btn btn-outline"
            onClick={() => setShowStats(!showStats)}
          >
            📊 Статистика
          </button>
          <button 
            className="btn btn-outline"
            onClick={() => setShowFilters(!showFilters)}
          >
            🔍 Фильтры
          </button>
          <div className="export-buttons">
            <button 
              className="btn btn-outline"
              onClick={() => handleExport('csv')}
            >
              📄 CSV
            </button>
            <button 
              className="btn btn-outline"
              onClick={() => handleExport('json')}
            >
              📋 JSON
            </button>
          </div>
        </div>
      </div>

      {/* Статистика */}
      {showStats && stats && (
        <div className="orders-stats">
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-value">{stats.totalOrders}</div>
              <div className="stat-label">Всего заказов</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{stats.newOrders}</div>
              <div className="stat-label">Новых</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{stats.inProgressOrders}</div>
              <div className="stat-label">В производстве</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{stats.completedOrders}</div>
              <div className="stat-label">Завершённых</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{stats.totalRevenue.toLocaleString()} BYN</div>
              <div className="stat-label">Общая выручка</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{stats.averageOrderValue.toFixed(0)} BYN</div>
              <div className="stat-label">Средний чек</div>
            </div>
          </div>
        </div>
      )}

      {/* Фильтры */}
      {showFilters && (
        <div className="orders-filters">
          <div className="filters-grid">
            <div className="filter-group">
              <label>Поиск:</label>
              <input
                type="text"
                value={filters.query}
                onChange={(e) => setFilters(prev => ({ ...prev, query: e.target.value }))}
                placeholder="Номер, клиент, товар..."
                className="form-control"
              />
            </div>
            
            <div className="filter-group">
              <label>Статус:</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: Number(e.target.value) || '' }))}
                className="form-control"
              >
                <option value="">Все статусы</option>
                {orderStatuses.map(status => (
                  <option key={status.id} value={status.id}>{status.name}</option>
                ))}
              </select>
            </div>
            
            <div className="filter-group">
              <label>Департамент:</label>
              <select
                value={filters.department_id === '' ? '' : filters.department_id}
                onChange={(e) => setFilters(prev => ({ ...prev, department_id: e.target.value === '' ? '' : Number(e.target.value) }))}
                className="form-control"
              >
                <option value="">Все департаменты</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            
            <div className="filter-group">
              <label>Дата от:</label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                className="form-control"
              />
            </div>
            
            <div className="filter-group">
              <label>Дата до:</label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                className="form-control"
              />
            </div>
            
            <div className="filter-group">
              <label>Клиент:</label>
              <input
                type="text"
                value={filters.customerName}
                onChange={(e) => setFilters(prev => ({ ...prev, customerName: e.target.value }))}
                placeholder="Имя клиента"
                className="form-control"
              />
            </div>
            
            <div className="filter-group">
              <label>Телефон:</label>
              <input
                type="text"
                value={filters.customerPhone}
                onChange={(e) => setFilters(prev => ({ ...prev, customerPhone: e.target.value }))}
                placeholder="+375..."
                className="form-control"
              />
            </div>
            
            <div className="filter-group">
              <label>Сумма от:</label>
              <input
                type="number"
                value={filters.minAmount}
                onChange={(e) => setFilters(prev => ({ ...prev, minAmount: e.target.value }))}
                placeholder="0"
                className="form-control"
              />
            </div>
            
            <div className="filter-group">
              <label>Сумма до:</label>
              <input
                type="number"
                value={filters.maxAmount}
                onChange={(e) => setFilters(prev => ({ ...prev, maxAmount: e.target.value }))}
                placeholder="1000000"
                className="form-control"
              />
            </div>
          </div>
          
          <div className="filters-actions">
            <button className="btn btn-primary" onClick={handleSearch}>
              🔍 Поиск
            </button>
            <button className="btn btn-outline" onClick={handleResetFilters}>
              🗑️ Сбросить
            </button>
          </div>
        </div>
      )}

      {/* Массовые операции */}
      {hasSelectedOrders && (
        <div className="bulk-actions">
          <div className="bulk-info">
            Выбрано: {selectedOrdersCount} заказов
          </div>
          <div className="bulk-buttons">
            <select 
              onChange={(e) => {
                if (e.target.value) {
                  handleBulkStatusUpdate(Number(e.target.value));
                  e.target.value = '';
                }
              }}
              className="form-control"
            >
              <option value="">Изменить статус</option>
              {orderStatuses.map(status => (
                <option key={status.id} value={status.id}>{status.name}</option>
              ))}
            </select>
            <button 
              className="btn btn-danger"
              onClick={handleBulkDelete}
            >
              🗑️ Удалить
            </button>
          </div>
        </div>
      )}

      {/* Список заказов */}
      <div className="orders-list">
        {orders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h3>Заказы не найдены</h3>
            <p>Попробуйте изменить фильтры поиска</p>
          </div>
        ) : (
          <>
            {/* Заголовок таблицы */}
            <div className="orders-list-header">
              <div className="order-checkbox">
                <input
                  type="checkbox"
                  checked={selectedOrders.length === orders.length && orders.length > 0}
                  onChange={handleSelectAll}
                />
              </div>
              <div className="order-number">Номер</div>
              <div className="order-status">Статус</div>
              <div className="order-customer">Клиент</div>
              <div className="order-date">Дата</div>
              <div className="order-amount">Сумма</div>
              <div className="order-items">Позиции</div>
            </div>

            {/* Строки заказов */}
            {orders.map(order => {
              const status = orderStatuses.find(s => s.id === order.status);
              const orderTotal = order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
              const isSelected = selectedOrders.includes(order.id);
              const isActive = selectedOrderId === order.id;
              
              return (
                <div 
                  key={order.id}
                  className={`order-row ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}`}
                  onClick={() => handleOrderSelect(order)}
                >
                  <div className="order-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleOrderToggle(order.id);
                      }}
                    />
                  </div>
                  
                  <div className="order-number">
                    <strong>{order.number}</strong>
                    <div className="order-id">ID: {order.id}</div>
                  </div>
                  
                  <div className="order-status">
                    <span 
                      className="status-badge"
                      style={{ backgroundColor: status?.color || '#9e9e9e' }}
                    >
                      {status?.name || `Статус ${order.status}`}
                    </span>
                  </div>
                  
                  <div className="order-customer">
                    <div className="customer-name">{order.customerName || 'Без имени'}</div>
                    {order.customerPhone && (
                      <div className="customer-phone">{order.customerPhone}</div>
                    )}
                  </div>
                  
                  <div className="order-date">
                    {new Date(order.created_at).toLocaleDateString('ru-RU')}
                  </div>
                  
                  <div className="order-amount">
                    <div className="amount-value">{orderTotal.toLocaleString()} BYN</div>
                    {order.prepaymentAmount && order.prepaymentAmount > 0 && (
                      <div className="prepayment-info">
                        💳 {order.prepaymentAmount} BYN
                      </div>
                    )}
                  </div>
                  
                  <div className="order-items">
                    {order.items?.length ?? 0} позиций
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="pagination">
          <button 
            className="btn btn-outline"
            disabled={currentPage === 1}
            onClick={() => loadOrders(currentPage - 1)}
          >
            ← Назад
          </button>
          
          <div className="pagination-info">
            Страница {currentPage} из {totalPages}
          </div>
          
          <button 
            className="btn btn-outline"
            disabled={currentPage === totalPages}
            onClick={() => loadOrders(currentPage + 1)}
          >
            Вперед →
          </button>
        </div>
      )}
    </div>
  );
};
