import React, { useState, useEffect } from 'react';
import { api } from '../../api';

interface UnifiedOrder {
  id: number;
  type: 'website' | 'telegram' | 'manual';
  status: string;
  customerName?: string;
  customerContact?: string;
  totalAmount: number;
  createdAt: string;
  assignedTo?: number;
  assignedToName?: string;
  notes?: string;
  orderNumber?: string; // tg-ord-123 или site-ord-123
}

interface OrderPool {
  unassigned: UnifiedOrder[];
  assigned: UnifiedOrder[];
  completed: UnifiedOrder[];
}

interface OrderPoolProps {
  currentUserId: number;
  currentUserName: string;
  onOrderAssigned?: () => void;
}

export const OrderPool: React.FC<OrderPoolProps> = ({ 
  currentUserId, 
  currentUserName, 
  onOrderAssigned 
}) => {
  const [orderPool, setOrderPool] = useState<OrderPool>({
    unassigned: [],
    assigned: [],
    completed: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigningOrder, setAssigningOrder] = useState<number | null>(null);

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    loadOrderPool();
  }, []);

  const loadOrderPool = async () => {
    try {
      setLoading(true);
      const response = await api.get('/order-management/pool');
      if (response.data.success) {
        setOrderPool(response.data.data);
      } else {
        setError('Ошибка при загрузке пула заказов');
      }
    } catch (error) {
      console.error('Error loading order pool:', error);
      setError('Ошибка при загрузке пула заказов');
    } finally {
      setLoading(false);
    }
  };

  const assignOrder = async (orderId: number, orderType: string) => {
    try {
      setAssigningOrder(orderId);
      const response = await api.post('/order-management/assign', {
        orderId,
        orderType,
        userId: currentUserId,
        userName: currentUserName,
        date: today
      });

      if (response.data.success) {
        await loadOrderPool();
        onOrderAssigned?.();
      } else {
        setError(response.data.message || 'Ошибка при назначении заказа');
      }
    } catch (error: any) {
      console.error('Error assigning order:', error);
      setError(error.response?.data?.message || 'Ошибка при назначении заказа');
    } finally {
      setAssigningOrder(null);
    }
  };

  const getOrderTypeLabel = (type: string) => {
    switch (type) {
      case 'telegram': return '📱 Telegram';
      case 'website': return '🌐 Сайт';
      case 'manual': return '✋ Ручной';
      default: return type;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return '⏳ Ожидает';
      case 'in_progress': return '🔄 В работе';
      case 'completed': return '✅ Завершен';
      case 'cancelled': return '❌ Отменен';
      default: return status;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU');
  };

  const formatAmount = (amount: number) => {
    return `${(amount / 100).toFixed(0)} Br`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка пула заказов...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <div className="flex items-center">
          <div className="text-red-600 mr-3">❌</div>
          <div>
            <h3 className="text-red-800 font-medium">Ошибка</h3>
            <p className="text-red-600 text-sm">{error}</p>
            <button 
              onClick={loadOrderPool}
              className="mt-2 text-red-600 hover:text-red-800 text-sm underline"
            >
              Попробовать снова
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Пул заказов</h2>
        <button 
          onClick={loadOrderPool}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          🔄 Обновить
        </button>
      </div>

      {/* Не назначенные заказы */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Не назначенные заказы ({orderPool.unassigned.length})
          </h3>
        </div>
        <div className="p-6">
          {orderPool.unassigned.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Нет не назначенных заказов</p>
          ) : (
            <div className="space-y-4">
              {orderPool.unassigned.map((order) => (
                <div key={`${order.id}_${order.type}`} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="text-sm font-medium text-gray-900">
                          {order.orderNumber || `#${order.id}`}
                        </span>
                        <span className="text-sm text-gray-600">
                          {getOrderTypeLabel(order.type)}
                        </span>
                        <span className="text-sm text-gray-600">
                          {getStatusLabel(order.status)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 mb-1">
                        <strong>Клиент:</strong> {order.customerName || 'Не указан'}
                      </div>
                      <div className="text-sm text-gray-600 mb-1">
                        <strong>Контакты:</strong> {order.customerContact || 'Не указаны'}
                      </div>
                      <div className="text-sm text-gray-600 mb-1">
                        <strong>Сумма:</strong> {formatAmount(order.totalAmount)}
                      </div>
                      <div className="text-sm text-gray-600">
                        <strong>Создан:</strong> {formatDate(order.created_at)}
                      </div>
                    </div>
                    <div className="ml-4">
                      <button
                        onClick={() => assignOrder(order.id, order.type)}
                        disabled={assigningOrder === order.id}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {assigningOrder === order.id ? '⏳' : '📋'} Взять в работу
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Назначенные заказы */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Назначенные заказы ({orderPool.assigned.length})
          </h3>
        </div>
        <div className="p-6">
          {orderPool.assigned.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Нет назначенных заказов</p>
          ) : (
            <div className="space-y-4">
              {orderPool.assigned.map((order) => (
                <div key={`${order.id}_${order.type}`} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="text-sm font-medium text-gray-900">
                          {order.orderNumber || `#${order.id}`}
                        </span>
                        <span className="text-sm text-gray-600">
                          {getOrderTypeLabel(order.type)}
                        </span>
                        <span className="text-sm text-gray-600">
                          {getStatusLabel(order.status)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 mb-1">
                        <strong>Клиент:</strong> {order.customerName || 'Не указан'}
                      </div>
                      <div className="text-sm text-gray-600 mb-1">
                        <strong>Ответственный:</strong> {order.assignedToName || 'Не назначен'}
                      </div>
                      <div className="text-sm text-gray-600 mb-1">
                        <strong>Сумма:</strong> {formatAmount(order.totalAmount)}
                      </div>
                      <div className="text-sm text-gray-600">
                        <strong>Создан:</strong> {formatDate(order.created_at)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
