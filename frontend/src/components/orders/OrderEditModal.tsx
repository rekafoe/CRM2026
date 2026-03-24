import React, { useState, useEffect, useCallback } from 'react';
import { Order } from '../../types';
import { useLogger } from '../../utils/logger';
import { useToastNotifications } from '../Toast';
import { LoadingSpinner } from '../LoadingSpinner';
import { useOrderStatuses } from '../../hooks/useOrderStatuses';
import './OrderEditModal.css';

interface OrderEditModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
  onSave: (updatedOrder: Order) => void;
}

interface OrderFormData {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  prepaymentAmount: string;
  paymentMethod: 'online' | 'offline' | 'telegram';
  status: number;
}

export const OrderEditModal: React.FC<OrderEditModalProps> = ({
  isOpen,
  order,
  onClose,
  onSave
}) => {
  const logger = useLogger('OrderEditModal');
  const toast = useToastNotifications();
  
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<OrderFormData>({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    prepaymentAmount: '0',
    paymentMethod: 'online',
    status: 1
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  const { statuses: orderStatuses } = useOrderStatuses();

  // Инициализация формы при изменении заказа
  useEffect(() => {
    if (order) {
      setFormData({
        customerName: order.customerName || '',
        customerPhone: order.customerPhone || '',
        customerEmail: order.customerEmail || '',
        prepaymentAmount: String(order.prepaymentAmount || 0),
        paymentMethod: order.paymentMethod || 'online',
        status: order.status
      });
      setErrors({});
    }
  }, [order]);

  // Валидация формы
  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.customerName.trim()) {
      newErrors.customerName = 'Имя клиента обязательно';
    }
    
    if (formData.customerPhone && !/^\+375\d{9}$/.test(formData.customerPhone)) {
      newErrors.customerPhone = 'Неверный формат телефона (+375XXXXXXXXX)';
    }
    
    if (formData.customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.customerEmail)) {
      newErrors.customerEmail = 'Неверный формат email';
    }
    
    const prepaymentAmount = parseFloat(formData.prepaymentAmount);
    if (isNaN(prepaymentAmount) || prepaymentAmount < 0) {
      newErrors.prepaymentAmount = 'Сумма предоплаты должна быть положительным числом';
    }
    
    // Проверяем, что предоплата не больше общей суммы заказа
    if (order && prepaymentAmount > 0) {
      const totalOrderAmount = (order.items ?? []).reduce((sum, item) => sum + (item.price * item.quantity), 0);
      if (prepaymentAmount > totalOrderAmount) {
        newErrors.prepaymentAmount = `Предоплата не может быть больше общей суммы заказа (${totalOrderAmount.toLocaleString()} BYN)`;
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  // Обработка изменений в форме
  const handleInputChange = useCallback((field: keyof OrderFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Очищаем ошибку при изменении поля
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  }, [errors]);

  // Сохранение заказа
  const handleSave = useCallback(async () => {
    if (!order || !validateForm()) {
      return;
    }
    
    setLoading(true);
    
    try {
      const updatedOrder: Order = {
        ...order,
        customerName: formData.customerName.trim(),
        customerPhone: formData.customerPhone.trim() || undefined,
        customerEmail: formData.customerEmail.trim() || undefined,
        prepaymentAmount: parseFloat(formData.prepaymentAmount) || 0,
        paymentMethod: formData.paymentMethod,
        status: formData.status
      };
      
      // Здесь можно добавить API вызов для обновления заказа
      // await updateOrder(order.id, updatedOrder);
      
      onSave(updatedOrder);
      toast.success('Заказ обновлен');
      onClose();
      
      logger.info('Заказ обновлен', { orderId: order.id });
    } catch (error) {
      logger.error('Ошибка обновления заказа', error);
      toast.error('Ошибка обновления заказа');
    } finally {
      setLoading(false);
    }
  }, [order, formData, validateForm, onSave, onClose, toast, logger]);

  // Обработка закрытия модального окна
  const handleClose = useCallback(() => {
    if (loading) return;
    onClose();
  }, [loading, onClose]);

  // Обработка нажатия Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, handleClose]);

  if (!isOpen || !order) {
    return null;
  }

  return (
    <div className="order-edit-modal-overlay" onClick={handleClose}>
      <div className="order-edit-modal" onClick={(e) => e.stopPropagation()}>
        {/* Заголовок */}
        <div className="modal-header">
          <h2>✏️ Редактирование заказа {order.number}</h2>
          <button 
            className="close-btn"
            onClick={handleClose}
            disabled={loading}
          >
            ×
          </button>
        </div>

        {/* Содержимое */}
        <div className="modal-content">
          {loading ? (
            <LoadingSpinner />
          ) : (
            <div className="form-grid">
              {/* Информация о клиенте */}
              <div className="form-section">
                <h3>👤 Информация о клиенте</h3>
                
                <div className="form-group">
                  <label htmlFor="customerName">
                    Имя клиента <span className="required">*</span>
                  </label>
                  <input
                    id="customerName"
                    type="text"
                    value={formData.customerName}
                    onChange={(e) => handleInputChange('customerName', e.target.value)}
                    className={`form-control ${errors.customerName ? 'error' : ''}`}
                    placeholder="Введите имя клиента"
                    disabled={loading}
                  />
                  {errors.customerName && (
                    <div className="error-message">{errors.customerName}</div>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="customerPhone">Телефон</label>
                  <input
                    id="customerPhone"
                    type="tel"
                    value={formData.customerPhone}
                    onChange={(e) => handleInputChange('customerPhone', e.target.value)}
                    className={`form-control ${errors.customerPhone ? 'error' : ''}`}
                    placeholder="+375XXXXXXXXX"
                    disabled={loading}
                  />
                  {errors.customerPhone && (
                    <div className="error-message">{errors.customerPhone}</div>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="customerEmail">Email</label>
                  <input
                    id="customerEmail"
                    type="email"
                    value={formData.customerEmail}
                    onChange={(e) => handleInputChange('customerEmail', e.target.value)}
                    className={`form-control ${errors.customerEmail ? 'error' : ''}`}
                    placeholder="client@example.com"
                    disabled={loading}
                  />
                  {errors.customerEmail && (
                    <div className="error-message">{errors.customerEmail}</div>
                  )}
                </div>
              </div>

              {/* Статус и оплата */}
              <div className="form-section">
                <h3>📋 Статус и оплата</h3>
                
                <div className="form-group">
                  <label htmlFor="status">Статус заказа</label>
                  <select
                    id="status"
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', Number(e.target.value))}
                    className="form-control"
                    disabled={loading}
                  >
                    {orderStatuses.map(status => (
                      <option key={status.id} value={status.id}>
                        {status.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="prepaymentAmount">Предоплата (BYN)</label>
                  <input
                    id="prepaymentAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.prepaymentAmount}
                    onChange={(e) => handleInputChange('prepaymentAmount', e.target.value)}
                    className={`form-control ${errors.prepaymentAmount ? 'error' : ''}`}
                    placeholder="0.00"
                    disabled={loading}
                  />
                  {errors.prepaymentAmount && (
                    <div className="error-message">{errors.prepaymentAmount}</div>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="paymentMethod">Способ оплаты</label>
                  <select
                    id="paymentMethod"
                    value={formData.paymentMethod}
                    onChange={(e) => handleInputChange('paymentMethod', e.target.value as OrderFormData['paymentMethod'])}
                    className="form-control"
                    disabled={loading}
                  >
                    <option value="online">🌐 Онлайн</option>
                    <option value="offline">🏪 Оффлайн</option>
                    <option value="telegram">💬 Telegram</option>
                  </select>
                </div>
              </div>

              {/* Информация о заказе */}
              <div className="form-section">
                <h3>📊 Информация о заказе</h3>
                
                <div className="info-grid">
                  <div className="info-item">
                    <label>Номер заказа:</label>
                    <span>{order.number}</span>
                  </div>
                  
                  <div className="info-item">
                    <label>Дата создания:</label>
                    <span>{new Date(order.created_at).toLocaleString('ru-RU')}</span>
                  </div>
                  
                  <div className="info-item">
                    <label>Количество позиций:</label>
                    <span>{order.items?.length ?? 0}</span>
                  </div>
                  
                  <div className="info-item">
                    <label>Общая сумма:</label>
                    <span className="amount">
                      {(order.items ?? [])
                        .reduce((sum, item) => sum + (item.price * item.quantity), 0)
                        .toLocaleString()} BYN
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Действия */}
        <div className="modal-actions">
          <button 
            className="btn btn-outline"
            onClick={handleClose}
            disabled={loading}
          >
            Отмена
          </button>
          <button 
            className="btn btn-primary"
            onClick={handleSave}
            disabled={loading}
          >
            {loading ? 'Сохранение...' : 'Сохранить изменения'}
          </button>
        </div>
      </div>
    </div>
  );
};
