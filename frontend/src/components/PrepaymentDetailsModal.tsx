import React, { useState } from 'react';
import { Order } from '../types';
import { createPrepaymentLink } from '../api';

interface PrepaymentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: Order;
  onPrepaymentUpdate: () => void;
  onOpenPrepaymentModal: () => void;
}

export const PrepaymentDetailsModal: React.FC<PrepaymentDetailsModalProps> = ({
  isOpen,
  onClose,
  order,
  onPrepaymentUpdate,
  onOpenPrepaymentModal
}) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateLink = async () => {
    if (!order.prepaymentAmount || order.prepaymentAmount <= 0) {
      alert('Сначала установите сумму предоплаты');
      onOpenPrepaymentModal();
      return;
    }

    setIsGenerating(true);
    try {
      await createPrepaymentLink(order.id, order.prepaymentAmount);
      onPrepaymentUpdate();
    } catch (error) {
      alert('Не удалось создать ссылку для оплаты');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = () => {
    if (order.paymentUrl) {
      navigator.clipboard.writeText(order.paymentUrl);
      alert('Ссылка скопирована в буфер обмена');
    }
  };

  if (!isOpen || !order) return null;

  const hasPrepayment = order.prepaymentAmount && order.prepaymentAmount > 0;
  const isPaid = order.prepaymentStatus === 'paid';
  
  // Расчёт общей суммы заказа и долга
  const totalOrderAmount = order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
  const prepaymentAmount = order.prepaymentAmount || 0;
  const debtAmount = totalOrderAmount - prepaymentAmount;

  return (
    <div className="prepayment-modal-overlay" onClick={onClose}>
      <div className="prepayment-modal" onClick={(e) => e.stopPropagation()}>
        {/* Заголовок */}
        <div className="prepayment-modal-header">
          <h3>💳 Предоплата - Заказ #{order.number}</h3>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {/* Основная информация */}
        <div className="prepayment-content">
          {!hasPrepayment ? (
            <div className="no-prepayment">
              <div className="no-prepayment-icon">💳</div>
              <div className="no-prepayment-text">Предоплата не установлена</div>
              <div className="no-prepayment-hint">Установите сумму предоплаты для этого заказа</div>
              <button 
                className="btn-set-prepayment"
                onClick={onOpenPrepaymentModal}
              >
                💳 Установить предоплату
              </button>
            </div>
          ) : (
            <>
              {/* Статус предоплаты */}
              <div className="prepayment-status">
                <div className="status-card">
                  <div className="status-header">
                    <span className="status-label">Статус предоплаты</span>
                    <span className={`status-badge ${isPaid ? 'paid' : 'pending'}`}>
                      {isPaid ? 'Оплачено' : 'Ожидает оплаты'}
                    </span>
                  </div>
                  <div className="amount-display">
                    <span className="amount-label">Сумма:</span>
                    <span className="amount-value">{order.prepaymentAmount} BYN</span>
                  </div>
                  <div className="payment-method-display">
                    <span className="method-label">Способ оплаты:</span>
                    <span className={`method-badge ${order.paymentMethod === 'online' ? 'online' : order.paymentMethod === 'telegram' ? 'telegram' : 'offline'}`}>
                      {order.paymentMethod === 'online' ? '🌐 Онлайн' : order.paymentMethod === 'telegram' ? '📱 Telegram' : '🏪 Оффлайн'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Информация о долге */}
              <div className="debt-info">
                <div className="debt-card">
                  <div className="debt-header">
                    <h4>💰 Финансовая информация</h4>
                  </div>
                  <div className="debt-details">
                    <div className="debt-row">
                      <span className="debt-label">Общая сумма заказа:</span>
                      <span className="debt-value total">{totalOrderAmount.toFixed(2)} BYN</span>
                    </div>
                    <div className="debt-row">
                      <span className="debt-label">Предоплата:</span>
                      <span className="debt-value prepayment">-{prepaymentAmount.toFixed(2)} BYN</span>
                    </div>
                    <div className="debt-row debt-total">
                      <span className="debt-label">Долг клиента:</span>
                      <span className={`debt-value debt ${debtAmount > 0 ? 'positive' : 'zero'}`}>
                        {debtAmount > 0 ? `${debtAmount.toFixed(2)} BYN` : 'Оплачено полностью'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Действия с предоплатой */}
              <div className="prepayment-actions">
                <div className="action-buttons">
                  <button 
                    className="btn-edit-prepayment"
                    onClick={onOpenPrepaymentModal}
                    title="Изменить сумму предоплаты"
                  >
                    ✏️ Изменить предоплату
                  </button>
                  {order.paymentUrl && (
                    <button 
                      className="btn-regenerate-link"
                      onClick={handleGenerateLink}
                      disabled={isGenerating}
                      title="Пересоздать ссылку для оплаты"
                    >
                      🔄 Пересоздать ссылку
                    </button>
                  )}
                </div>
              </div>

              {/* Ссылка для оплаты */}
              {order.paymentUrl ? (
                <div className="payment-link-section">
                  <div className="section-header">
                    <h4>🔗 Ссылка для оплаты</h4>
                    <div className="link-actions">
                      <a 
                        href={order.paymentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-pay-link"
                      >
                        🔗 Перейти к оплате
                      </a>
                      <button 
                        className="btn-copy-link"
                        onClick={handleCopyLink}
                      >
                        📋 Копировать
                      </button>
                    </div>
                  </div>
                  <div className="link-url">
                    <code>{order.paymentUrl}</code>
                  </div>
                </div>
              ) : (
                <div className="no-link-section">
                  <div className="section-header">
                    <h4>🔗 Ссылка для оплаты</h4>
                    <span className="no-link-text">Ссылка не создана</span>
                  </div>
                  <div className="no-link-actions">
                    <button 
                      className="btn-generate-link"
                      onClick={handleGenerateLink}
                      disabled={isGenerating}
                    >
                      {isGenerating ? '⏳ Создание...' : '🔗 Создать ссылку'}
                    </button>
                    <button 
                      className="btn-change-amount"
                      onClick={onOpenPrepaymentModal}
                    >
                      💳 Изменить сумму
                    </button>
                  </div>
                </div>
              )}

              {/* Действия */}
              <div className="prepayment-actions">
                <button 
                  className="btn-change-amount"
                  onClick={onOpenPrepaymentModal}
                >
                  💳 Изменить сумму предоплаты
                </button>
                {!order.paymentUrl && !isPaid && (
                  <button 
                    className="btn-generate-link"
                    onClick={handleGenerateLink}
                    disabled={isGenerating}
                  >
                    {isGenerating ? '⏳ Создание...' : '🔗 Создать ссылку для оплаты'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// CSS стили
const styles = `
  .prepayment-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }

  .prepayment-modal {
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    width: 100%;
    max-width: 600px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .prepayment-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    background: #f8f9fa;
    border-bottom: 1px solid #e9ecef;
  }

  .prepayment-modal-header h3 {
    margin: 0;
    color: #2c3e50;
    font-size: 18px;
  }

  .btn-close {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: #6c757d;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.2s ease;
  }

  .btn-close:hover {
    background: #e9ecef;
    color: #495057;
  }

  .prepayment-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  .no-prepayment {
    text-align: center;
    padding: 40px 20px;
  }

  .no-prepayment-icon {
    font-size: 64px;
    margin-bottom: 20px;
  }

  .no-prepayment-text {
    font-size: 20px;
    font-weight: 600;
    color: #2c3e50;
    margin-bottom: 8px;
  }

  .no-prepayment-hint {
    font-size: 14px;
    color: #6c757d;
    margin-bottom: 24px;
  }

  .btn-set-prepayment {
    padding: 12px 24px;
    background: #1976d2;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .btn-set-prepayment:hover {
    background: #1565c0;
  }

  .prepayment-status {
    margin-bottom: 24px;
  }

  .status-card {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    padding: 20px;
  }

  .status-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .status-label {
    font-size: 14px;
    color: #6c757d;
    font-weight: 500;
  }

  .status-badge {
    padding: 6px 12px;
    border-radius: 16px;
    font-weight: 600;
    font-size: 12px;
  }

  .status-badge.paid {
    background: #d4edda;
    color: #155724;
  }

  .status-badge.pending {
    background: #fff3cd;
    color: #856404;
  }

  .amount-display {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .amount-label {
    font-size: 16px;
    color: #2c3e50;
    font-weight: 500;
  }

  .payment-method-display {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .method-label {
    font-size: 14px;
    color: #6c757d;
    font-weight: 500;
  }

  .method-badge {
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }

  .method-badge.online {
    background: #d1ecf1;
    color: #0c5460;
  }

  .method-badge.offline {
    background: #f8d7da;
    color: #721c24;
  }

  .debt-info {
    margin-top: 20px;
  }

  .debt-card {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    padding: 16px;
  }

  .debt-header h4 {
    margin: 0 0 12px 0;
    color: #2c3e50;
    font-size: 16px;
  }

  .debt-details {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .debt-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
  }

  .debt-row.debt-total {
    border-top: 1px solid #dee2e6;
    margin-top: 8px;
    padding-top: 12px;
    font-weight: 600;
  }

  .debt-label {
    font-size: 14px;
    color: #6c757d;
  }

  .debt-value {
    font-size: 14px;
    font-weight: 500;
  }

  .debt-value.total {
    color: #2c3e50;
  }

  .debt-value.prepayment {
    color: #28a745;
  }

  .debt-value.debt.positive {
    color: #dc3545;
    font-weight: 700;
  }

  .debt-value.debt.zero {
    color: #28a745;
    font-weight: 700;
  }

  .prepayment-actions {
    margin-top: 20px;
    padding: 16px;
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 8px;
  }

  .action-buttons {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .btn-edit-prepayment,
  .btn-regenerate-link {
    padding: 10px 16px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-edit-prepayment {
    background: #1976d2;
    color: white;
  }

  .btn-edit-prepayment:hover {
    background: #1565c0;
    transform: translateY(-1px);
  }

  .btn-regenerate-link {
    background: #ff9800;
    color: white;
  }

  .btn-regenerate-link:hover:not(:disabled) {
    background: #f57c00;
    transform: translateY(-1px);
  }

  .btn-regenerate-link:disabled {
    background: #cccccc;
    cursor: not-allowed;
    transform: none;
  }

  .amount-value {
    font-size: 24px;
    font-weight: 700;
    color: #1976d2;
  }

  .payment-link-section,
  .no-link-section {
    background: #ffffff;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 24px;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }

  .section-header h4 {
    margin: 0;
    color: #2c3e50;
    font-size: 16px;
  }

  .link-actions {
    display: flex;
    gap: 8px;
  }

  .btn-pay-link,
  .btn-copy-link {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .btn-pay-link {
    background: #28a745;
    color: white;
    text-decoration: none;
  }

  .btn-pay-link:hover {
    background: #218838;
  }

  .btn-copy-link {
    background: #6c757d;
    color: white;
  }

  .btn-copy-link:hover {
    background: #5a6268;
  }

  .link-url {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 4px;
    padding: 12px;
  }

  .link-url code {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #666;
    word-break: break-all;
  }

  .no-link-text {
    font-size: 14px;
    color: #6c757d;
    font-style: italic;
  }

  .no-link-actions {
    display: flex;
    gap: 12px;
  }

  .prepayment-actions {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }

  .btn-change-amount,
  .btn-generate-link {
    padding: 12px 20px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.2s ease;
    flex: 1;
    min-width: 200px;
  }

  .btn-change-amount {
    background: #1976d2;
    color: white;
  }

  .btn-change-amount:hover {
    background: #1565c0;
  }

  .btn-generate-link {
    background: #28a745;
    color: white;
  }

  .btn-generate-link:hover:not(:disabled) {
    background: #218838;
  }

  .btn-generate-link:disabled {
    background: #cccccc;
    cursor: not-allowed;
  }

  /* Адаптивность */
  @media (max-width: 768px) {
    .prepayment-modal {
      margin: 10px;
      max-height: 90vh;
    }

    .status-header,
    .section-header {
      flex-direction: column;
      gap: 12px;
      align-items: stretch;
    }

    .link-actions,
    .no-link-actions,
    .prepayment-actions {
      flex-direction: column;
    }

    .btn-change-amount,
    .btn-generate-link {
      min-width: auto;
    }
  }
`;

// Добавляем стили в head
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}
