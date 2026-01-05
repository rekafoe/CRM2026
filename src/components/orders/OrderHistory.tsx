import React, { useState, useEffect, useCallback } from 'react';
import { Order } from '../../types';
import { useLogger } from '../../utils/logger';
import { useToastNotifications } from '../Toast';
import { LoadingSpinner } from '../LoadingSpinner';
import './OrderHistory.css';

interface OrderHistoryProps {
  order: Order;
  onClose: () => void;
}

interface HistoryEntry {
  id: number;
  orderId: number;
  action: string;
  description: string;
  oldValue?: string;
  newValue?: string;
  userId: number;
  userName: string;
  timestamp: string;
  details?: Record<string, any>;
}

export const OrderHistory: React.FC<OrderHistoryProps> = ({
  order,
  onClose
}) => {
  const logger = useLogger('OrderHistory');
  const toast = useToastNotifications();
  
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  // Загрузка истории изменений
  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Здесь должен быть реальный API вызов
      // const response = await fetch(`/api/orders/${order.id}/history`);
      // const data = await response.json();
      
      // Моковые данные для демонстрации
      const mockHistory: HistoryEntry[] = [
        {
          id: 1,
          orderId: order.id,
          action: 'created',
          description: 'Заказ создан',
          userId: 1,
          userName: 'Админ',
          timestamp: order.created_at,
          details: {
            customerName: order.customerName,
            customerPhone: order.customerPhone
          }
        },
        {
          id: 2,
          orderId: order.id,
          action: 'status_changed',
          description: 'Статус изменен',
          oldValue: 'Новый',
          newValue: 'В производстве',
          userId: 1,
          userName: 'Админ',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          details: {
            status: 2
          }
        },
        {
          id: 3,
          orderId: order.id,
          action: 'customer_updated',
          description: 'Данные клиента обновлены',
          oldValue: 'Иван Иванов',
          newValue: order.customerName || 'Без имени',
          userId: 1,
          userName: 'Админ',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          details: {
            field: 'customerName'
          }
        },
        {
          id: 4,
          orderId: order.id,
          action: 'item_added',
          description: 'Добавлена позиция',
          newValue: 'Листовки A6',
          userId: 1,
          userName: 'Админ',
          timestamp: new Date(Date.now() - 10800000).toISOString(),
          details: {
            itemType: 'Листовки A6',
            quantity: 100,
            price: 25.50
          }
        },
        {
          id: 5,
          orderId: order.id,
          action: 'prepayment_created',
          description: 'Создана предоплата',
          newValue: `${order.prepaymentAmount || 0} BYN`,
          userId: 1,
          userName: 'Админ',
          timestamp: new Date(Date.now() - 14400000).toISOString(),
          details: {
            amount: order.prepaymentAmount,
            paymentMethod: order.paymentMethod
          }
        }
      ];
      
      setHistory(mockHistory);
      logger.info('История заказа загружена', { orderId: order.id, count: mockHistory.length });
    } catch (err) {
      logger.error('Ошибка загрузки истории', err);
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
      toast.error('Ошибка загрузки истории заказа');
    } finally {
      setLoading(false);
    }
  }, [order.id, order.customerName, order.customerPhone, order.prepaymentAmount, order.paymentMethod, logger, toast]);

  // Фильтрация истории
  const filteredHistory = history.filter(entry => {
    if (filter === 'all') return true;
    if (filter === 'status') return entry.action.includes('status');
    if (filter === 'customer') return entry.action.includes('customer');
    if (filter === 'items') return entry.action.includes('item');
    if (filter === 'payment') return entry.action.includes('payment') || entry.action.includes('prepayment');
    return true;
  });

  // Получение иконки для действия
  const getActionIcon = (action: string): string => {
    const icons: Record<string, string> = {
      created: '🆕',
      status_changed: '🔄',
      customer_updated: '👤',
      item_added: '➕',
      item_updated: '✏️',
      item_removed: '➖',
      prepayment_created: '💳',
      prepayment_updated: '💳',
      prepayment_cancelled: '❌',
      file_uploaded: '📁',
      file_approved: '✅',
      file_rejected: '❌',
      comment_added: '💬',
      assigned: '👥',
      unassigned: '👤'
    };
    return icons[action] || '📝';
  };

  // Получение цвета для действия
  const getActionColor = (action: string): string => {
    const colors: Record<string, string> = {
      created: '#4caf50',
      status_changed: '#2196f3',
      customer_updated: '#ff9800',
      item_added: '#4caf50',
      item_updated: '#ff9800',
      item_removed: '#f44336',
      prepayment_created: '#9c27b0',
      prepayment_updated: '#9c27b0',
      prepayment_cancelled: '#f44336',
      file_uploaded: '#607d8b',
      file_approved: '#4caf50',
      file_rejected: '#f44336',
      comment_added: '#795548',
      assigned: '#3f51b5',
      unassigned: '#9e9e9e'
    };
    return colors[action] || '#9e9e9e';
  };

  // Форматирование времени
  const formatTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'только что';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} мин назад`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} ч назад`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} дн назад`;
    
    return date.toLocaleString('ru-RU');
  };

  // Загрузка истории при монтировании
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  if (loading) {
    return (
      <div className="order-history-modal">
        <div>
          <div className="modal-header">
            <h2>📋 История заказа {order.number}</h2>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          <div className="modal-content">
            <LoadingSpinner message="Загрузка истории..." />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="order-history-modal">
        <div>
          <div className="modal-header">
            <h2>📋 История заказа {order.number}</h2>
            <button className="close-btn" onClick={onClose}>×</button>
          </div>
          <div className="modal-content">
            <div className="error-state">
              <div className="error-icon">⚠️</div>
              <h3>Ошибка загрузки</h3>
              <p>{error}</p>
              <button className="btn btn-primary" onClick={loadHistory}>
                Попробовать снова
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="order-history-modal">
      <div>
        {/* Заголовок */}
        <div className="modal-header">
          <h2>📋 История заказа {order.number}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

      {/* Фильтры */}
      <div className="history-filters">
        <div className="filter-buttons">
          <button 
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Все
          </button>
          <button 
            className={`filter-btn ${filter === 'status' ? 'active' : ''}`}
            onClick={() => setFilter('status')}
          >
            Статусы
          </button>
          <button 
            className={`filter-btn ${filter === 'customer' ? 'active' : ''}`}
            onClick={() => setFilter('customer')}
          >
            Клиент
          </button>
          <button 
            className={`filter-btn ${filter === 'items' ? 'active' : ''}`}
            onClick={() => setFilter('items')}
          >
            Позиции
          </button>
          <button 
            className={`filter-btn ${filter === 'payment' ? 'active' : ''}`}
            onClick={() => setFilter('payment')}
          >
            Оплата
          </button>
        </div>
      </div>

      {/* Содержимое */}
      <div className="modal-content">
        {filteredHistory.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <h3>История пуста</h3>
            <p>Нет записей для выбранного фильтра</p>
          </div>
        ) : (
          <div className="history-timeline">
            {filteredHistory.map((entry, index) => (
              <div key={entry.id} className="history-entry">
                <div className="entry-icon">
                  <div 
                    className="icon-circle"
                    style={{ backgroundColor: getActionColor(entry.action) }}
                  >
                    {getActionIcon(entry.action)}
                  </div>
                  {index < filteredHistory.length - 1 && (
                    <div className="timeline-line"></div>
                  )}
                </div>
                
                <div className="entry-content">
                  <div className="entry-header">
                    <h4 className="entry-title">{entry.description}</h4>
                    <span className="entry-time">{formatTime(entry.timestamp)}</span>
                  </div>
                  
                  <div className="entry-details">
                    <div className="entry-user">
                      👤 {entry.userName}
                    </div>
                    
                    {entry.oldValue && entry.newValue && (
                      <div className="entry-changes">
                        <div className="change-item">
                          <span className="change-label">Было:</span>
                          <span className="change-old">{entry.oldValue}</span>
                        </div>
                        <div className="change-arrow">→</div>
                        <div className="change-item">
                          <span className="change-label">Стало:</span>
                          <span className="change-new">{entry.newValue}</span>
                        </div>
                      </div>
                    )}
                    
                    {entry.details && (
                      <div className="entry-meta">
                        {Object.entries(entry.details).map(([key, value]) => (
                          <div key={key} className="meta-item">
                            <span className="meta-key">{key}:</span>
                            <span className="meta-value">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
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
