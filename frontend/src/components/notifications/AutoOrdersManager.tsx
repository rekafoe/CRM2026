import React, { useState } from 'react';
import { 
  useAutoOrders, 
  useCreateAutoOrder, 
  useApproveAutoOrder, 
  useSendAutoOrder,
  AutoOrder 
} from '../../api/hooks/useNotifications';
import { useUIStore } from '../../stores/uiStore';
import { MoneyAmount } from '../ui';
import './AutoOrdersManager.css';

interface AutoOrdersManagerProps {
  onClose: () => void;
}

export const AutoOrdersManager: React.FC<AutoOrdersManagerProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'orders' | 'create'>('orders');
  const [statusFilter, setStatusFilter] = useState<string>('');
  
  const { showToast } = useUIStore();
  
  // API хуки
  const { data: orders = [], isLoading } = useAutoOrders(statusFilter);
  const createAutoOrder = useCreateAutoOrder();
  const approveAutoOrder = useApproveAutoOrder();
  const sendAutoOrder = useSendAutoOrder();

  const handleApproveOrder = async (orderId: number) => {
    try {
      await approveAutoOrder.mutateAsync(orderId);
      showToast('Заказ подтвержден', 'success');
    } catch (error: any) {
      showToast(`Ошибка подтверждения: ${error.message}`, 'error');
    }
  };

  const handleSendOrder = async (orderId: number) => {
    try {
      await sendAutoOrder.mutateAsync(orderId);
      showToast('Заказ отправлен поставщику', 'success');
    } catch (error: any) {
      showToast(`Ошибка отправки: ${error.message}`, 'error');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { text: 'Ожидает', class: 'status-pending', icon: '⏳' },
      approved: { text: 'Подтвержден', class: 'status-approved', icon: '✅' },
      sent: { text: 'Отправлен', class: 'status-sent', icon: '📤' },
      delivered: { text: 'Доставлен', class: 'status-delivered', icon: '📦' },
      cancelled: { text: 'Отменен', class: 'status-cancelled', icon: '❌' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    
    return (
      <span className={`status-badge ${config.class}`}>
        {config.icon} {config.text}
      </span>
    );
  };

  const renderOrders = () => (
    <div className="auto-orders">
      <div className="orders-header">
        <h3>📋 Автоматические заказы</h3>
        <div className="orders-filters">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="status-filter"
          >
            <option value="">Все статусы</option>
            <option value="pending">Ожидают</option>
            <option value="approved">Подтверждены</option>
            <option value="sent">Отправлены</option>
            <option value="delivered">Доставлены</option>
            <option value="cancelled">Отменены</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="loading">Загрузка заказов...</div>
      ) : (
        <div className="orders-list">
          {orders.length === 0 ? (
            <div className="no-orders">
              <div className="no-orders-icon">📋</div>
              <p>Нет заказов для отображения</p>
            </div>
          ) : (
            orders.map(order => (
              <div key={order.id} className="order-card">
                <div className="order-header">
                  <div className="order-info">
                    <div className="order-id">Заказ #{order.id}</div>
                    <div className="order-supplier">{order.supplierName}</div>
                    <div className="order-date">
                      {new Date((order as any).created_at ?? (order as any).createdAt).toLocaleString('ru-RU')}
                    </div>
                  </div>
                  <div className="order-status">
                    {getStatusBadge(order.status)}
                  </div>
                </div>

                <div className="order-details">
                  <div className="order-amount">
                    <span className="amount-label">Сумма:</span>
                    <span className="amount-value"><MoneyAmount value={order.totalAmount} /></span>
                  </div>
                  
                  {order.notes && (
                    <div className="order-notes">
                      <span className="notes-label">Примечания:</span>
                      <span className="notes-value">{order.notes}</span>
                    </div>
                  )}
                </div>

                <div className="order-materials">
                  <h4>Материалы:</h4>
                  <div className="materials-list">
                    {order.materials.map(material => (
                      <div key={material.id} className="material-item">
                        <div className="material-name">{material.materialName}</div>
                        <div className="material-details">
                          <span>Текущий: {material.currentStock}</span>
                          <span>Минимум: {material.minStock}</span>
                          <span>Заказ: {material.orderQuantity} {material.unit}</span>
                          <span>Цена: <MoneyAmount value={material.price} /></span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="order-actions">
                  {order.status === 'pending' && (
                    <button
                      className="btn btn-success"
                      onClick={() => handleApproveOrder(order.id)}
                      disabled={approveAutoOrder.isPending}
                    >
                      {approveAutoOrder.isPending ? '⏳' : '✅'} Подтвердить
                    </button>
                  )}
                  
                  {order.status === 'approved' && (
                    <button
                      className="btn btn-primary"
                      onClick={() => handleSendOrder(order.id)}
                      disabled={sendAutoOrder.isPending}
                    >
                      {sendAutoOrder.isPending ? '⏳' : '📤'} Отправить
                    </button>
                  )}
                  
                  {order.status === 'sent' && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => {/* Отметить как доставленный */}}
                    >
                      📦 Доставлен
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  const renderCreate = () => (
    <div className="create-order">
      <h3>➕ Создать автоматический заказ</h3>
      <div className="create-form">
        <div className="form-note">
          <p>📝 Автоматические заказы создаются системой на основе правил мониторинга запасов.</p>
          <p>Для создания заказа вручную используйте раздел "Поставщики" → "Создать заказ".</p>
        </div>
        
        <div className="create-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              // Здесь можно добавить логику для ручного создания заказа
              showToast('Функция создания заказа в разработке', 'info');
            }}
          >
            🔧 Создать заказ вручную
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="auto-orders-manager">
      <div className="auto-orders-header">
        <h2>🤖 Управление автозаказами</h2>
        <button onClick={onClose} className="close-btn">✕</button>
      </div>

      <div className="auto-orders-tabs">
        <button
          className={activeTab === 'orders' ? 'active' : ''}
          onClick={() => setActiveTab('orders')}
        >
          📋 Заказы
        </button>
        <button
          className={activeTab === 'create' ? 'active' : ''}
          onClick={() => setActiveTab('create')}
        >
          ➕ Создать
        </button>
      </div>

      <div className="auto-orders-content">
        {activeTab === 'orders' && renderOrders()}
        {activeTab === 'create' && renderCreate()}
      </div>
    </div>
  );
};
