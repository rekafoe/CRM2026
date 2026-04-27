import React, { useState, useEffect } from 'react';
import { api, getPageChanges } from '../../api';
import { MoneyAmount } from '../ui';

interface UserOrderPage {
  id: number;
  userId: number;
  userName: string;
  date: string;
  status: 'active' | 'completed' | 'archived';
  totalOrders: number;
  completedOrders: number;
  totalRevenue: number;
  created_at: string;
  updated_at: string;
}

interface UserOrderPageOrder {
  id: number;
  pageId: number;
  orderId: number;
  orderType: 'website' | 'telegram' | 'manual';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  assignedAt: string;
  completedAt?: string;
  notes?: string;
}

interface UserOrderPageProps {
  userId: number;
  date?: string;
  isAdmin?: boolean;
  onDateChange?: (newDate: string) => void;
}

export const UserOrderPage: React.FC<UserOrderPageProps> = ({ 
  userId, 
  date, 
  isAdmin = false,
  onDateChange
}) => {
  const [page, setPage] = useState<UserOrderPage | null>(null);
  const [orders, setOrders] = useState<UserOrderPageOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completingOrder, setCompletingOrder] = useState<number | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<UserOrderPageOrder | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [movingOrder, setMovingOrder] = useState<number | null>(null);
  const [showDateSelector, setShowDateSelector] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [changes, setChanges] = useState<{
    newOrders: UserOrderPageOrder[];
    updatedOrders: UserOrderPageOrder[];
    completedOrders: UserOrderPageOrder[];
    stats: { totalOrders: number; completedOrders: number; totalRevenue: number };
  } | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const currentDate = date || new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(currentDate);

  useEffect(() => {
    loadUserOrderPage();
  }, [userId, currentDate]);

  // Горячие клавиши для навигации
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // Alt + стрелки для навигации по датам
      if (event.altKey) {
        switch (event.key) {
          case 'ArrowLeft':
            event.preventDefault();
            const yesterday = new Date(currentDate);
            yesterday.setDate(yesterday.getDate() - 1);
            onDateChange?.(yesterday.toISOString().split('T')[0]);
            break;
          case 'ArrowRight':
            event.preventDefault();
            const tomorrow = new Date(currentDate);
            tomorrow.setDate(tomorrow.getDate() + 1);
            onDateChange?.(tomorrow.toISOString().split('T')[0]);
            break;
          case 'Home':
            event.preventDefault();
            const today = new Date().toISOString().split('T')[0];
            onDateChange?.(today);
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [currentDate, onDateChange]);

  const loadUserOrderPage = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/order-management/pages/user/${userId}?date=${currentDate}`);
      if (response.data.success) {
        setPage(response.data.data.page);
        setOrders(response.data.data.orders);
        // Сохраняем время последнего обновления страницы
        const p = response.data.data.page as any;
        setLastUpdate(p.updated_at ?? p.updatedAt ?? null);
      } else {
        setError('Ошибка при загрузке страницы заказов');
      }
    } catch (error: any) {
      console.error('Error loading user order page:', error);
      // 404 = страница не найдена для этой даты — показываем жёлтый блок, а не красную ошибку
      if (error?.response?.status === 404) {
        setPage(null);
        setOrders([]);
        setError(null);
      } else {
        setError('Ошибка при загрузке страницы заказов');
      }
    } finally {
      setLoading(false);
    }
  };

  const completeOrder = async (orderId: number, orderType: string, notes?: string) => {
    try {
      setCompletingOrder(orderId);
      const response = await api.post('/order-management/complete', {
        orderId,
        orderType,
        notes
      });

      if (response.data.success) {
        await loadUserOrderPage();
      } else {
        setError(response.data.message || 'Ошибка при завершении заказа');
      }
    } catch (error: any) {
      console.error('Error completing order:', error);
      setError(error.response?.data?.message || 'Ошибка при завершении заказа');
    } finally {
      setCompletingOrder(null);
    }
  };

  const moveOrderToDate = async (orderId: number, orderType: string, newDate: string) => {
    try {
      setMovingOrder(orderId);
      const response = await api.post('/order-management/move-order', {
        orderId,
        orderType,
        newDate,
        userId
      });

      if (response.data.success) {
        await loadUserOrderPage();
        setMovingOrder(null);
        setShowDateSelector(false);
      } else {
        setError(response.data.message || 'Ошибка при перемещении заказа');
      }
    } catch (error: any) {
      console.error('Error moving order:', error);
      setError(error.response?.data?.message || 'Ошибка при перемещении заказа');
    } finally {
      setMovingOrder(null);
    }
  };

  const loadChangesSinceLastUpdate = async () => {
    if (!page || !lastUpdate) return;
    
    try {
      const response = await getPageChanges(page.id, lastUpdate);
      if (response.data.success) {
        setChanges(response.data.data);
        setShowChanges(true);
      }
    } catch (error: any) {
      console.error('Error loading changes:', error);
      setError('Ошибка при загрузке изменений');
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('ru-RU');
  };

  const handleOrderClick = (order: UserOrderPageOrder) => {
    setSelectedOrder(order);
    setShowOrderDetails(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка страницы заказов...</p>
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
              onClick={loadUserOrderPage}
              className="mt-2 text-red-600 hover:text-red-800 text-sm underline"
            >
              Попробовать снова
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <div className="flex items-center">
          <div className="text-yellow-600 mr-3">⚠️</div>
          <div>
            <h3 className="text-yellow-800 font-medium">Страница заказов не найдена</h3>
            <p className="text-yellow-600 text-sm">
              Страница заказов для выбранной даты не найдена. Создайте новую страницу или выберите другую дату.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Заголовок страницы */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              Страница заказов: {page.userName}
            </h2>
            <div className="flex items-center gap-4 mt-2">
              <p className="text-gray-600">
                Дата: {new Date(page.date).toLocaleDateString('ru-RU')}
              </p>
              
              {/* Быстрая навигация по датам */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const yesterday = new Date(page.date);
                    yesterday.setDate(yesterday.getDate() - 1);
                    onDateChange?.(yesterday.toISOString().split('T')[0]);
                  }}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
                  title="Вчера"
                >
                  ← Вчера
                </button>
                
                <button
                  onClick={() => {
                    const today = new Date().toISOString().split('T')[0];
                    onDateChange?.(today);
                  }}
                  className="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 rounded text-blue-600"
                  title="Сегодня"
                >
                  🏠 Сегодня
                </button>
                
                <button
                  onClick={() => {
                    const tomorrow = new Date(page.date);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    onDateChange?.(tomorrow.toISOString().split('T')[0]);
                  }}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
                  title="Завтра"
                >
                  Завтра →
                </button>
              </div>
              
              <button
                onClick={() => setShowDateSelector(!showDateSelector)}
                className="text-blue-600 hover:text-blue-800 text-sm underline"
              >
                📅 Выбрать дату
              </button>
              
              {lastUpdate && (
                <button
                  onClick={loadChangesSinceLastUpdate}
                  className="text-green-600 hover:text-green-800 text-sm underline"
                  title={`Показать изменения с ${new Date(lastUpdate).toLocaleString('ru-RU')}`}
                >
                  🔄 Изменения с последнего обновления
                </button>
              )}
              
              <div className="text-xs text-gray-400 ml-2">
                Alt+← Alt+→ Alt+Home
              </div>
            </div>
            {showDateSelector && (
              <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Выберите дату:
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  <button
                    onClick={() => {
                      onDateChange?.(selectedDate);
                      setShowDateSelector(false);
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700"
                  >
                    Перейти
                  </button>
                  <button
                    onClick={() => setShowDateSelector(false)}
                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-400"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">Статус</div>
            <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
              page.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
            }`}>
              {page.status === 'active' ? 'Активная' : 'Завершена'}
            </span>
          </div>
        </div>

        {/* Статистика */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-3xl font-bold text-blue-600">{page.totalOrders}</div>
            <div className="text-sm text-blue-600">Всего заказов</div>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="text-3xl font-bold text-green-600">{page.completedOrders}</div>
            <div className="text-sm text-green-600">Завершено</div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="text-3xl font-bold text-purple-600">
              <MoneyAmount value={(page.totalRevenue || 0) / 100} decimals={0} />
            </div>
            <div className="text-sm text-purple-600">Общая сумма</div>
          </div>
          <div className="bg-orange-50 rounded-lg p-4">
            <div className="text-3xl font-bold text-orange-600">
              {page.totalOrders > 0 ? Math.round((page.completedOrders / page.totalOrders) * 100) : 0}%
            </div>
            <div className="text-sm text-orange-600">Выполнено</div>
          </div>
        </div>
      </div>

      {/* Изменения с последнего обновления */}
      {showChanges && changes && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-blue-900">
              🔄 Изменения с последнего обновления
            </h3>
            <button
              onClick={() => setShowChanges(false)}
              className="text-blue-600 hover:text-blue-800 text-sm"
            >
              ✕ Скрыть
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-white rounded-lg p-3 border border-blue-100">
              <h4 className="font-medium text-green-700 mb-2">🆕 Новые заказы ({changes.newOrders.length})</h4>
              {changes.newOrders.length > 0 ? (
                <div className="space-y-1">
                  {changes.newOrders.map(order => (
                    <div key={order.id} className="text-sm text-gray-600">
                      {getOrderTypeLabel(order.orderType)} #{order.orderId}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Нет новых заказов</p>
              )}
            </div>
            
            <div className="bg-white rounded-lg p-3 border border-blue-100">
              <h4 className="font-medium text-blue-700 mb-2">🔄 Обновленные заказы ({changes.updatedOrders.length})</h4>
              {changes.updatedOrders.length > 0 ? (
                <div className="space-y-1">
                  {changes.updatedOrders.map(order => (
                    <div key={order.id} className="text-sm text-gray-600">
                      {getOrderTypeLabel(order.orderType)} #{order.orderId} - {order.status}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Нет обновленных заказов</p>
              )}
            </div>
            
            <div className="bg-white rounded-lg p-3 border border-blue-100">
              <h4 className="font-medium text-purple-700 mb-2">✅ Завершенные заказы ({changes.completedOrders.length})</h4>
              {changes.completedOrders.length > 0 ? (
                <div className="space-y-1">
                  {changes.completedOrders.map(order => (
                    <div key={order.id} className="text-sm text-gray-600">
                      {getOrderTypeLabel(order.orderType)} #{order.orderId}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Нет завершенных заказов</p>
              )}
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-3 border border-blue-100">
            <h4 className="font-medium text-gray-700 mb-2">📊 Обновленная статистика</h4>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Всего заказов:</span>
                <span className="ml-2 font-medium">{changes.stats.totalOrders}</span>
              </div>
              <div>
                <span className="text-gray-500">Завершено:</span>
                <span className="ml-2 font-medium">{changes.stats.completedOrders}</span>
              </div>
              <div>
                <span className="text-gray-500">Выручка:</span>
                <span className="ml-2 font-medium"><MoneyAmount value={changes.stats.totalRevenue} /></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Список заказов */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Заказы ({orders.length})
          </h3>
        </div>
        <div className="p-6">
          {orders.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">📋</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">Нет заказов</h3>
              <p className="text-gray-500">На этой странице пока нет заказов</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {orders.map((order) => (
                <div 
                  key={order.id} 
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleOrderClick(order)}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-lg font-semibold text-gray-900">
                      #{order.orderId}
                    </span>
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(order.status)}`}>
                      {getStatusLabel(order.status)}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center text-sm text-gray-600">
                      <span className="mr-2">{getOrderTypeLabel(order.orderType)}</span>
                    </div>
                    
                    <div className="text-sm text-gray-600">
                      <strong>Назначен:</strong> {formatDate(order.assignedAt)}
                    </div>
                    
                    {order.completedAt && (
                      <div className="text-sm text-gray-600">
                        <strong>Завершен:</strong> {formatDate(order.completedAt)}
                      </div>
                    )}
                    
                    {order.notes && (
                      <div className="text-sm text-gray-600">
                        <strong>Заметки:</strong> {order.notes}
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-4 pt-3 border-t border-gray-200 flex gap-2">
                    {order.status === 'in_progress' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          completeOrder(order.orderId, order.orderType);
                        }}
                        disabled={completingOrder === order.orderId}
                        className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {completingOrder === order.orderId ? '⏳' : '✅'} Завершить заказ
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMovingOrder(order.orderId);
                        setShowDateSelector(true);
                      }}
                      disabled={movingOrder === order.orderId}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                    >
                      📅 Переместить
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Модальное окно с деталями заказа */}
      {showOrderDetails && selectedOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Детали заказа #{selectedOrder.orderId}
              </h3>
              <button
                onClick={() => setShowOrderDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Тип заказа</label>
                  <p className="mt-1 text-sm text-gray-900">{getOrderTypeLabel(selectedOrder.orderType)}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Статус</label>
                  <p className="mt-1 text-sm text-gray-900">{getStatusLabel(selectedOrder.status)}</p>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Назначен</label>
                <p className="mt-1 text-sm text-gray-900">{formatDate(selectedOrder.assignedAt)}</p>
              </div>
              
              {selectedOrder.completedAt && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Завершен</label>
                  <p className="mt-1 text-sm text-gray-900">{formatDate(selectedOrder.completedAt)}</p>
                </div>
              )}
              
              {selectedOrder.notes && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Заметки</label>
                  <p className="mt-1 text-sm text-gray-900">{selectedOrder.notes}</p>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowOrderDetails(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Закрыть
              </button>
              {selectedOrder.status === 'in_progress' && (
                <button
                  onClick={() => {
                    completeOrder(selectedOrder.orderId, selectedOrder.orderType);
                    setShowOrderDetails(false);
                  }}
                  disabled={completingOrder === selectedOrder.orderId}
                  className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {completingOrder === selectedOrder.orderId ? '⏳' : '✅'} Завершить
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
