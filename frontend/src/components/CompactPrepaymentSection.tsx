import React, { useState } from 'react';
import { Order } from '../types';
import { createPrepaymentLink } from '../api';

interface CompactPrepaymentSectionProps {
  order: Order;
  onPrepaymentUpdate: () => void;
  onOpenModal: () => void;
}

export const CompactPrepaymentSection: React.FC<CompactPrepaymentSectionProps> = ({
  order,
  onPrepaymentUpdate,
  onOpenModal
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateLink = async () => {
    if (!order.prepaymentAmount || order.prepaymentAmount <= 0) {
      alert('Сначала установите сумму предоплаты');
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

  const hasPrepayment = order.prepaymentAmount && order.prepaymentAmount > 0;
  const isPaid = order.prepaymentStatus === 'paid';

  return (
    <div className="compact-prepayment-section">
      {/* Компактная заголовочная строка */}
      <div className="prepayment-header">
        <div className="prepayment-info">
          <span className="prepayment-title">💳 Предоплата</span>
          <span className="prepayment-status">
            {hasPrepayment ? (
              <span className={`status-badge ${isPaid ? 'paid' : 'pending'}`}>
                {isPaid ? 'Оплачено' : 'Ожидает оплаты'}
              </span>
            ) : (
              'Не установлена'
            )}
          </span>
        </div>
        <div className="prepayment-actions">
          <button 
            className="btn-set-amount"
            onClick={onOpenModal}
            title="Установить сумму предоплаты"
          >
            💳 Сумма
          </button>
          {hasPrepayment && !isPaid && (
            <button 
              className="btn-generate-link"
              onClick={handleGenerateLink}
              disabled={isGenerating}
              title="Создать ссылку для оплаты"
            >
              {isGenerating ? '⏳' : '🔗'}
            </button>
          )}
          <button 
            className="btn-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Скрыть детали' : 'Показать детали'}
          >
            {isExpanded ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {/* Развернутая информация о предоплате */}
      {isExpanded && hasPrepayment && (
        <div className="prepayment-details">
          <div className="prepayment-amount">
            <span className="amount-label">Сумма предоплаты:</span>
            <span className="amount-value">{order.prepaymentAmount} BYN</span>
          </div>
          
          {order.paymentUrl && (
            <div className="payment-link-section">
              <div className="link-info">
                <span className="link-label">Ссылка для оплаты:</span>
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
                    title="Скопировать ссылку"
                  >
                    📋
                  </button>
                </div>
              </div>
              <div className="link-url">
                <code>{order.paymentUrl}</code>
              </div>
            </div>
          )}

          {!order.paymentUrl && !isPaid && (
            <div className="no-link-info">
              <span>Ссылка для оплаты не создана</span>
              <button 
                className="btn-create-link"
                onClick={handleGenerateLink}
                disabled={isGenerating}
              >
                {isGenerating ? 'Создание...' : 'Создать ссылку'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// CSS стили
const styles = `
  .compact-prepayment-section {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 8px;
    margin: 8px 0;
    overflow: hidden;
  }

  .prepayment-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: #ffffff;
    border-bottom: 1px solid #e9ecef;
  }

  .prepayment-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .prepayment-title {
    font-weight: 600;
    color: #2c3e50;
    font-size: 14px;
  }

  .prepayment-status {
    font-size: 12px;
  }

  .status-badge {
    padding: 2px 8px;
    border-radius: 12px;
    font-weight: 600;
    font-size: 11px;
  }

  .status-badge.paid {
    background: #4caf50;
    color: white;
  }

  .status-badge.pending {
    background: #ff9800;
    color: white;
  }

  .prepayment-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .btn-set-amount,
  .btn-generate-link,
  .btn-toggle {
    padding: 6px 10px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .btn-set-amount {
    background: #1976d2;
    color: white;
  }

  .btn-set-amount:hover {
    background: #1565c0;
  }

  .btn-generate-link {
    background: #4caf50;
    color: white;
  }

  .btn-generate-link:hover:not(:disabled) {
    background: #45a049;
  }

  .btn-generate-link:disabled {
    background: #cccccc;
    cursor: not-allowed;
  }

  .btn-toggle {
    background: #6c757d;
    color: white;
    min-width: 32px;
  }

  .btn-toggle:hover {
    background: #5a6268;
  }

  .prepayment-details {
    padding: 12px 16px;
    background: #ffffff;
  }

  .prepayment-amount {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #f0f8ff;
    border: 1px solid #e3f2fd;
    border-radius: 6px;
    margin-bottom: 12px;
  }

  .amount-label {
    font-weight: 500;
    color: #1976d2;
  }

  .amount-value {
    font-weight: 700;
    color: #1976d2;
    font-size: 16px;
  }

  .payment-link-section {
    background: #f8f9fa;
    border: 1px solid #e9ecef;
    border-radius: 6px;
    padding: 12px;
  }

  .link-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .link-label {
    font-weight: 500;
    color: #2c3e50;
    font-size: 13px;
  }

  .link-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .btn-pay-link {
    padding: 6px 12px;
    background: #4caf50;
    color: white;
    text-decoration: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .btn-pay-link:hover {
    background: #45a049;
  }

  .btn-copy-link {
    padding: 6px 8px;
    background: #6c757d;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s ease;
  }

  .btn-copy-link:hover {
    background: #5a6268;
  }

  .link-url {
    background: #ffffff;
    border: 1px solid #e9ecef;
    border-radius: 4px;
    padding: 8px;
  }

  .link-url code {
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #666;
    word-break: break-all;
  }

  .no-link-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #fff3cd;
    border: 1px solid #ffeaa7;
    border-radius: 6px;
    color: #856404;
  }

  .btn-create-link {
    padding: 6px 12px;
    background: #ff9800;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition: all 0.2s ease;
  }

  .btn-create-link:hover:not(:disabled) {
    background: #f57c00;
  }

  .btn-create-link:disabled {
    background: #cccccc;
    cursor: not-allowed;
  }

  /* Адаптивность */
  @media (max-width: 768px) {
    .prepayment-header {
      flex-direction: column;
      gap: 8px;
      align-items: stretch;
    }

    .prepayment-actions {
      justify-content: center;
    }

    .link-info {
      flex-direction: column;
      gap: 8px;
      align-items: stretch;
    }

    .link-actions {
      justify-content: center;
    }

    .no-link-info {
      flex-direction: column;
      gap: 8px;
      align-items: stretch;
    }
  }
`;

// Добавляем стили в head
if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}
