import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Order } from '../types';
import { getOrders, updateOrderStatus, reassignOrderByNumber, cancelOnlineOrder, getUsers } from '../api';
import { StatusBadge } from '../components/common/StatusBadge';
import { OrderHeader } from '../components/optimized/OrderHeader';
import { OrderContent } from '../components/optimized/OrderContent';
import { OrderTotal } from '../components/order/OrderTotal';
import { FilesModal } from '../components/FilesModal';
import { PrepaymentModal } from '../components/PrepaymentModal';
import { PrepaymentDetailsModal } from '../components/PrepaymentDetailsModal';
import { useToastNotifications } from '../components/Toast';
import { useLogger } from '../utils/logger';
import '../styles/order-pool.css';

interface OrderPoolPageProps {
  currentUserId: number;
  currentUserName: string;
}

export const OrderPoolPage: React.FC<OrderPoolPageProps> = ({ currentUserId, currentUserName }) => {
  const navigate = useNavigate();
  const toast = useToastNotifications();
  const logger = useLogger('OrderPoolPage');

  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [showPrepaymentModal, setShowPrepaymentModal] = useState(false);
  const [showPrepaymentDetailsModal, setShowPrepaymentDetailsModal] = useState(false);
  const [allUsers, setAllUsers] = useState<Array<{ id: number; name: string }>>([]);
  const [filterSource, setFilterSource] = useState<'all' | 'crm' | 'website' | 'telegram'>('all');
  const [filterCancelled, setFilterCancelled] = useState<'all' | 'cancelled' | 'not_cancelled'>('all');
  const [filterAssigned, setFilterAssigned] = useState<'all' | 'assigned' | 'not_assigned'>('not_assigned');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'createdAt' | 'number' | 'totalAmount'>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await getOrders();
      setOrders(res.data);
    } catch (err) {
      logger.error('Failed to load orders for pool', err);
      setError('Не удалось загрузить заказы.');
    } finally {
      setLoading(false);
    }
  }, [logger]);

  useEffect(() => {
    if (isInitialized) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const res = await getOrders();
        setOrders(res.data);
        setIsInitialized(true);
      } catch (err) {
        logger.error('Failed to load orders for pool', err);
        setError('Не удалось загрузить заказы.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
    getUsers().then(res => setAllUsers(res.data)).catch(err => logger.error('Failed to load users', err));
  }, [isInitialized, logger]);

  const filteredOrders = useMemo(() => {
    let filtered = orders.filter(o => Number(o.status) === 0);

    if (filterSource !== 'all') {
      filtered = filtered.filter(o => o.source === filterSource);
    }

    if (filterCancelled !== 'all') {
      filtered = filtered.filter(o => (o.is_cancelled === 1) === (filterCancelled === 'cancelled'));
    }

    if (filterAssigned !== 'all') {
      filtered = filtered.filter(o => (o.userId !== null) === (filterAssigned === 'assigned'));
    }

    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      filtered = filtered.filter(o =>
        o.number?.toLowerCase().includes(lowerSearchTerm) ||
        o.customerName?.toLowerCase().includes(lowerSearchTerm) ||
        o.customerPhone?.toLowerCase().includes(lowerSearchTerm) ||
        o.customerEmail?.toLowerCase().includes(lowerSearchTerm) ||
        o.items.some(item => item.type.toLowerCase().includes(lowerSearchTerm) || item.params.description?.toLowerCase().includes(lowerSearchTerm))
      );
    }

    filtered.sort((a, b) => {
      let valA: any;
      let valB: any;

      if (sortBy === 'createdAt') {
        valA = new Date(a.created_at).getTime();
        valB = new Date(b.created_at).getTime();
      } else if (sortBy === 'number') {
        valA = a.number || '';
        valB = b.number || '';
      } else if (sortBy === 'totalAmount') {
        valA = a.totalAmount || 0;
        valB = b.totalAmount || 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [orders, filterSource, filterCancelled, searchTerm, sortBy, sortDirection]);

  const handleAssignToMe = useCallback(async (orderNumber: string) => {
    try {
      await reassignOrderByNumber(orderNumber, currentUserId);
      toast.success('Заказ назначен вам!', `Заказ ${orderNumber} успешно назначен.`);
      loadOrders();
      navigate('/'); // Переходим на основную страницу после назначения
    } catch (err) {
      logger.error('Failed to assign order', err);
      toast.error('Ошибка назначения', (err as Error).message);
    }
  }, [currentUserId, loadOrders, navigate, toast, logger]);

  const handleProcessOrder = useCallback(async (orderId: number) => {
    try {
      await updateOrderStatus(orderId, 1); // Переводим в статус "Оформлен"
      toast.success('Заказ оформлен!', `Заказ ${orderId} переведен в статус "Оформлен".`);
      loadOrders();
      navigate('/'); // Переходим на основную страницу после оформления
    } catch (err) {
      logger.error('Failed to process order', err);
      toast.error('Ошибка оформления', (err as Error).message);
    }
  }, [loadOrders, navigate, toast, logger]);

  const handleCancelOnline = useCallback(async (orderId: number) => {
    try {
      await cancelOnlineOrder(orderId);
      toast.success('Заказ отменен!', `Онлайн-заказ ${orderId} отменен и перемещен в пул.`);
      loadOrders();
    } catch (err) {
      logger.error('Failed to cancel online order', err);
      toast.error('Ошибка отмены', (err as Error).message);
    }
  }, [loadOrders, toast, logger]);

  const getSourceLabel = (source?: string) => {
    switch (source) {
      case 'website': return 'Онлайн';
      case 'telegram': return 'Telegram';
      case 'crm': return 'CRM';
      default: return 'Неизвестно';
    }
  };

  if (loading) return <div className="loading-overlay">Загрузка...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="order-pool-page">
      <div className="order-pool-sidebar">
        <button onClick={() => navigate('/')} className="back-button">← Назад</button>
        <h2>Пул заказов ({filteredOrders.length})</h2>

        <div className="filters">
          <input
            type="text"
            placeholder="Поиск по заказам..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <select value={filterSource} onChange={(e) => setFilterSource(e.target.value as any)}>
            <option value="all">Все источники</option>
            <option value="crm">CRM</option>
            <option value="website">Онлайн</option>
            <option value="telegram">Telegram</option>
          </select>
          <select value={filterCancelled} onChange={(e) => setFilterCancelled(e.target.value as any)}>
            <option value="all">Все</option>
            <option value="cancelled">Отменённые</option>
            <option value="not_cancelled">Не отменённые</option>
          </select>
          <select value={filterAssigned} onChange={(e) => setFilterAssigned(e.target.value as any)}>
            <option value="all">Все</option>
            <option value="assigned">Назначенные</option>
            <option value="not_assigned">Неназначенные</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
            <option value="createdAt">По дате</option>
            <option value="number">По номеру</option>
            <option value="totalAmount">По сумме</option>
          </select>
          <button onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}>
            {sortDirection === 'asc' ? '↑' : '↓'}
          </button>
        </div>

        <div className="order-list">
          {filteredOrders.length === 0 ? (
            <p>Нет заказов в пуле, соответствующих фильтрам.</p>
          ) : (
            <table className="order-list-table">
              <thead>
                <tr>
                  <th>Номер</th>
                  <th>Дата</th>
                  <th>Клиент</th>
                  <th>Телефон</th>
                  <th>Email</th>
                  <th>Источник</th>
                  <th>Статус</th>
                  <th>Предоплата</th>
                  <th>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => (
                  <tr
                    key={order.id}
                    className={`${selectedOrder?.id === order.id ? 'selected' : ''} ${order.userId ? 'assigned' : ''}`}
                    onClick={() => setSelectedOrder(order)}
                  >
                    <td>
                      <div className="order-number">{order.number}</div>
                    </td>
                    <td>
                      <div className="order-date">{new Date(order.created_at).toLocaleDateString()}</div>
                    </td>
                    <td>
                      <div className="order-customer" title={order.customerName || 'Не указан'}>
                        {order.customerName || 'Не указан'}
                      </div>
                    </td>
                    <td>
                      <div className="order-phone" title={order.customerPhone || 'Не указан'}>
                        {order.customerPhone || '—'}
                      </div>
                    </td>
                    <td>
                      <div className="order-email" title={order.customerEmail || 'Не указан'}>
                        {order.customerEmail || '—'}
                      </div>
                    </td>
                    <td>
                      <div className="order-badges">
                        {order.source && <StatusBadge status={getSourceLabel(order.source)} color="info" size="sm" />}
                      </div>
                    </td>
                    <td className="order-status">
                      {order.userId ? (
                        <span className="assigned-badge">✓ Назначен</span>
                      ) : order.is_cancelled === 1 ? (
                        <StatusBadge status="Отменён" color="error" size="sm" />
                      ) : (
                        <span style={{ color: '#666' }}>В пуле</span>
                      )}
                    </td>
                    <td>
                      <div className="order-prepayment">
                        {order.prepaymentAmount ? (
                          <span className={`prepayment-amount ${order.prepaymentStatus === 'paid' ? 'paid' : 'pending'}`}>
                            {order.prepaymentAmount.toFixed(2)} BYN
                            <br />
                            <small className={`prepayment-status ${order.prepaymentStatus === 'paid' ? 'paid' : 'pending'}`}>
                              {order.prepaymentStatus === 'paid' ? 'Оплачено' : 'Ожидает'}
                            </small>
                          </span>
                        ) : (
                          <span style={{ color: '#999' }}>—</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="order-total">{order.totalAmount?.toFixed(2) || '0.00'} BYN</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="order-pool-detail">
        {selectedOrder ? (
          <>
            <OrderHeader
              order={selectedOrder}
              onShowFilesModal={() => setShowFilesModal(true)}
              onShowPrepaymentModal={() => setShowPrepaymentModal(true)}
            />
            <div className="order-detail-actions">
              {!selectedOrder.userId && (
                <button onClick={() => handleAssignToMe(selectedOrder.number!)}>Назначить мне</button>
              )}
              {selectedOrder.userId && (
                <button disabled style={{ background: '#6c757d', cursor: 'not-allowed' }}>
                  Назначен пользователю
                </button>
              )}
              <button onClick={() => handleProcessOrder(selectedOrder.id)}>Оформить</button>
              {selectedOrder.source && (selectedOrder.source === 'website' || selectedOrder.source === 'telegram') && (
                <button onClick={() => handleCancelOnline(selectedOrder.id)}>Отменить онлайн</button>
              )}
            </div>
            <OrderContent order={selectedOrder} onLoadOrders={loadOrders} />
            <OrderTotal
              items={selectedOrder.items.map(item => ({
                id: item.id,
                type: item.type,
                price: item.price,
                quantity: item.quantity ?? 1,
              }))}
              discount={0}
              taxRate={0}
              prepaymentAmount={selectedOrder.prepaymentAmount}
              prepaymentStatus={selectedOrder.prepaymentStatus}
              paymentMethod={selectedOrder.paymentMethod}
            />
          </>
        ) : (
          <p className="text-center text-gray-500">Выберите заказ из списка для просмотра деталей.</p>
        )}
      </div>

      {showFilesModal && selectedOrder && (
        <FilesModal
          isOpen={showFilesModal}
          onClose={() => setShowFilesModal(false)}
          orderId={selectedOrder.id}
          orderNumber={selectedOrder.number || ''}
        />
      )}
      {showPrepaymentModal && selectedOrder && (
        <PrepaymentModal
          isOpen={showPrepaymentModal}
          onClose={() => setShowPrepaymentModal(false)}
          orderId={selectedOrder.id}
          orderNumber={selectedOrder.number || ''}
          currentAmount={selectedOrder.prepaymentAmount}
          currentPaymentMethod={selectedOrder.paymentMethod}
          currentEmail={selectedOrder.customerEmail || ''}
          onPrepaymentCreated={loadOrders}
        />
      )}
      {showPrepaymentDetailsModal && selectedOrder && (
        <PrepaymentDetailsModal
          isOpen={showPrepaymentDetailsModal}
          onClose={() => setShowPrepaymentDetailsModal(false)}
          order={selectedOrder}
          onPrepaymentUpdate={loadOrders}
          onOpenPrepaymentModal={() => setShowPrepaymentModal(true)}
        />
      )}
    </div>
  );
};


