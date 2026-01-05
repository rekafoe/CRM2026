import React, { useEffect, useState } from 'react';
import { getFullDailyReport, updateOrderStatus, deleteOrder, getOrderStatuses, duplicateOrder } from '../api';
import { Order, DailyReport } from '../types';
import { ProgressBar } from '../components/order/ProgressBar';
import { OrderItem } from '../components/OrderItem';

interface ReportDetailPageProps {
  reportDate: string;
  userId?: number;
  onBack: () => void;
}

export const ReportDetailPage: React.FC<ReportDetailPageProps> = ({ 
  reportDate, 
  userId, 
  onBack 
}) => {
  const [report, setReport] = useState<DailyReport | null>(null);
  const [statuses, setStatuses] = useState<Array<{ id: number; name: string; color?: string; sort_order: number }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);

  useEffect(() => {
    loadReportData();
  }, [reportDate, userId]);

  const loadReportData = async () => {
    setIsLoading(true);
    try {
      // Загружаем полный отчёт с заказами
      const reportRes = await getFullDailyReport(reportDate, userId);
      setReport(reportRes.data);

      // Загружаем статусы
      const statusesRes = await getOrderStatuses();
      setStatuses(statusesRes.data);
    } catch (error) {
      console.error('Error loading report data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (orderId: number, newStatusId: number) => {
    try {
      await updateOrderStatus(orderId, newStatusId);
      await loadReportData();
    } catch (error) {
      console.error('Error updating order status:', error);
      alert('Ошибка при обновлении статуса заказа');
    }
  };

  const handleDeleteOrder = async (orderId: number) => {
    if (!confirm('Вы уверены, что хотите удалить этот заказ?')) return;

    try {
      await deleteOrder(orderId);
      await loadReportData();
      alert('Заказ успешно удалён');
    } catch (error) {
      console.error('Error deleting order:', error);
      alert('Ошибка при удалении заказа');
    }
  };

  const handleDuplicateOrder = async (orderId: number) => {
    try {
      await duplicateOrder(orderId);
      await loadReportData();
      alert('Заказ успешно дублирован');
    } catch (error) {
      console.error('Error duplicating order:', error);
      alert('Ошибка при дублировании заказа');
    }
  };

  const getTotalRevenue = () => {
    if (!report?.orders) return 0;
    return report.orders.reduce((sum, order) => {
      const orderTotal = order.items.reduce((itemSum, item) => 
        itemSum + (item.price * (item.quantity || 1)), 0
      );
      return sum + orderTotal;
    }, 0);
  };

  const getOrdersByStatus = (statusId: number) => {
    if (!report?.orders) return [];
    return report.orders.filter(order => order.status === statusId);
  };

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '200px',
        fontSize: '18px',
        color: '#666'
      }}>
        Загрузка отчёта...
      </div>
    );
  }

  if (!report) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Отчёт не найден</h2>
        <p>Отчёт за {reportDate} не найден в системе</p>
        <button onClick={onBack} style={{
          padding: '8px 16px',
          backgroundColor: '#1976d2',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          ← Назад к списку отчётов
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Заголовок */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        borderBottom: '2px solid #e0e0e0',
        paddingBottom: '16px'
      }}>
        <div>
          <h1 style={{ margin: 0, color: '#333' }}>
            📊 Отчёт за {reportDate}
          </h1>
          <p style={{ margin: '8px 0 0 0', color: '#666' }}>
            Пользователь: {report.user_name || 'Неизвестный'} | 
            Заказов: {report.orders?.length || 0} | 
            Выручка: {getTotalRevenue().toLocaleString('ru-RU')} BYN
          </p>
        </div>
        <button
          onClick={onBack}
          style={{
            padding: '8px 16px',
            backgroundColor: '#f0f0f0',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          ← Назад к списку отчётов
        </button>
      </div>

      {/* Статистика по статусам */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {statuses.map(status => {
          const statusOrders = getOrdersByStatus(status.id);
          const statusRevenue = statusOrders.reduce((sum, order) => {
            const orderTotal = order.items.reduce((itemSum, item) => 
              itemSum + (item.price * (item.quantity || 1)), 0
            );
            return sum + orderTotal;
          }, 0);

          return (
            <div
              key={status.id}
              style={{
                padding: '16px',
                backgroundColor: status.color ? `${status.color}20` : '#f5f5f5',
                borderRadius: '8px',
                border: `2px solid ${status.color || '#e0e0e0'}`,
                textAlign: 'center'
              }}
            >
              <div style={{ 
                fontSize: '20px', 
                fontWeight: 'bold', 
                color: status.color || '#333',
                marginBottom: '8px'
              }}>
                {statusOrders.length}
              </div>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>
                {status.name}
              </div>
              <div style={{ fontSize: '12px', color: '#888' }}>
                {statusRevenue.toLocaleString('ru-RU')} BYN
              </div>
            </div>
          );
        })}
      </div>

      {/* Список заказов */}
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e0e0e0',
        overflow: 'hidden'
      }}>
        <div style={{
          backgroundColor: '#f5f5f5',
          padding: '16px',
          borderBottom: '1px solid #e0e0e0',
          fontWeight: 'bold'
        }}>
          Заказы ({report.orders?.length || 0})
        </div>

        {!report.orders || report.orders.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
            Нет заказов за эту дату
          </div>
        ) : (
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {report.orders.map(order => {
              const orderStatus = statuses.find(s => s.id === order.status);
              const orderTotal = order.items.reduce((sum, item) => 
                sum + (item.price * (item.quantity || 1)), 0
              );

              return (
                <div
                  key={order.id}
                  style={{
                    padding: '16px',
                    borderBottom: '1px solid #f0f0f0',
                    backgroundColor: editingOrder?.id === order.id ? '#f8f9fa' : 'white'
                  }}
                >
                  {/* Заголовок заказа */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '16px' }}>
                        {order.number}
                      </h3>
                      <span style={{
                        padding: '4px 8px',
                        backgroundColor: orderStatus?.color || '#e0e0e0',
                        color: 'white',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        {orderStatus?.name || 'Неизвестно'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setEditingOrder(editingOrder?.id === order.id ? null : order)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: editingOrder?.id === order.id ? '#ff9800' : '#2196f3',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        {editingOrder?.id === order.id ? '✏️ Закрыть' : '✏️ Редактировать'}
                      </button>
                      <button
                        onClick={() => handleDuplicateOrder(order.id)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#4caf50',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        📋 Дублировать
                      </button>
                      <button
                        onClick={() => handleDeleteOrder(order.id)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: '#f44336',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        🗑️ Удалить
                      </button>
                    </div>
                  </div>

                  {/* Информация о заказе */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px',
                    marginBottom: '12px',
                    fontSize: '14px',
                    color: '#666'
                  }}>
                    <div>Клиент: <strong>{order.customerName}</strong></div>
                    <div>Телефон: <strong>{order.customerPhone}</strong></div>
                    <div>Email: <strong>{order.customerEmail}</strong></div>
                    <div>Создан: <strong>{new Date(order.created_at).toLocaleString('ru-RU')}</strong></div>
                    <div>Сумма: <strong>{orderTotal.toLocaleString('ru-RU')} BYN</strong></div>
                    {order.prepaymentAmount && order.prepaymentAmount > 0 && (
                      <div>Предоплата: <strong>{order.prepaymentAmount} BYN</strong></div>
                    )}
                  </div>

                  {/* Прогресс-бар статуса */}
                  <div style={{ marginBottom: '12px' }}>
                    <ProgressBar
                      current={order.status}
                      statuses={statuses}
                      onStatusChange={(newStatusId) => handleStatusChange(order.id, newStatusId)}
                      width="100%"
                      height="8px"
                    />
                  </div>

                  {/* Позиции заказа */}
                  <div style={{ marginTop: '12px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#333' }}>
                      Позиции заказа:
                    </h4>
                    {order.items.map(item => (
                      <OrderItem
                        key={item.id}
                        item={item}
                        orderId={order.id}
                        order={order}
                        onUpdate={loadReportData}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
