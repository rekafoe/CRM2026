import React, { useState } from 'react';

interface PrepaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: number;
  orderNumber: string;
  currentAmount?: number;
  currentPaymentMethod?: 'online' | 'offline' | 'telegram';
  currentEmail?: string;
  totalOrderAmount?: number; // Общая сумма заказа для валидации
  onPrepaymentCreated: (amount: number, email: string, paymentMethod: 'online' | 'offline' | 'telegram') => void;
}

export const PrepaymentModal: React.FC<PrepaymentModalProps> = ({
  isOpen,
  onClose,
  orderId,
  orderNumber,
  currentAmount = 0,
  currentPaymentMethod = 'online',
  currentEmail = '',
  totalOrderAmount = 0,
  onPrepaymentCreated
}) => {
  if (!isOpen) return null;
  
  const [amount, setAmount] = useState<string>(currentAmount.toString());
  const [email, setEmail] = useState<string>(currentEmail);
  const [paymentMethod, setPaymentMethod] = useState<'online' | 'offline' | 'telegram'>(currentPaymentMethod || 'online');
  const [isLoading, setIsLoading] = useState(false);

  // Вычисляем amountNum для использования в JSX
  const amountNum = Number(amount) || 0;

  // Обновляем поля при изменении пропсов
  React.useEffect(() => {
    setAmount(currentAmount.toString());
    setEmail(currentEmail);
    setPaymentMethod(currentPaymentMethod);
  }, [currentAmount, currentEmail, currentPaymentMethod]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Для онлайн предоплаты email обязателен
    if (paymentMethod === 'online' && !email) {
      alert('Для онлайн предоплаты необходимо указать email клиента');
      return;
    }

    // Проверяем, что предоплата не больше общей суммы заказа
    if (totalOrderAmount > 0 && amountNum > totalOrderAmount) {
      alert(`Предоплата не может быть больше общей суммы заказа (${totalOrderAmount.toLocaleString()} BYN)`);
      return;
    }

    setIsLoading(true);
    try {
      // Здесь будет вызов API для создания предоплаты
      onPrepaymentCreated(amountNum, email, paymentMethod);
      onClose();
    } catch (error) {
      alert('Ошибка при создании предоплаты');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div 
        style={{
          backgroundColor: 'white',
          padding: '24px',
          borderRadius: '8px',
          minWidth: '400px',
          maxWidth: '500px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, color: '#1976d2' }}>
            {currentAmount > 0 ? '✏️ Изменить предоплату' : '💳 Предоплата'} для заказа {orderNumber}
          </h3>
          <button 
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: '#666'
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Сумма предоплаты (BYN):
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '16px'
              }}
            />
          </div>

          {/* Email только для онлайн предоплаты */}
          {paymentMethod === 'online' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                Email клиента:
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '16px'
                }}
                required
              />
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Способ оплаты:
            </label>
            <div style={{ display: 'flex', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="online"
                  checked={paymentMethod === 'online'}
                  onChange={(e) => setPaymentMethod(e.target.value as 'online' | 'offline')}
                  style={{ marginRight: '8px' }}
                />
                <span>🌐 Онлайн (через ссылку)</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="offline"
                  checked={paymentMethod === 'offline'}
                  onChange={(e) => setPaymentMethod(e.target.value as 'online' | 'offline')}
                  style={{ marginRight: '8px' }}
                />
                <span>🏪 Оффлайн (в кассе)</span>
              </label>
            </div>
            
            {/* Индикация для оффлайн предоплаты */}
            {paymentMethod === 'offline' && (
              <div style={{ 
                marginTop: '8px', 
                padding: '8px 12px', 
                backgroundColor: '#fff3cd', 
                border: '1px solid #ffeaa7', 
                borderRadius: '4px',
                fontSize: '12px',
                color: '#856404'
              }}>
                💡 Для оффлайн предоплаты email не требуется - оплата получена в кассе
              </div>
            )}
          </div>

          <div style={{ 
            display: 'flex', 
            gap: '12px', 
            justifyContent: 'flex-end',
            paddingTop: '16px',
            borderTop: '1px solid #eee'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: isLoading ? '#ccc' : '#1976d2',
                color: 'white',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                fontSize: '14px'
              }}
            >
              {isLoading 
                ? 'Сохранение...' 
                : currentAmount > 0 
                  ? (amountNum === 0 ? 'Убрать предоплату' : 'Сохранить изменения')
                  : (amountNum === 0 ? 'Убрать предоплату' : 'Создать предоплату')
              }
            </button>
          </div>
        </form>

        <div style={{ 
          marginTop: '16px', 
          padding: '12px', 
          backgroundColor: '#f5f5f5', 
          borderRadius: '4px',
          fontSize: '12px',
          color: '#666'
        }}>
          <strong>ℹ️ Информация:</strong><br />
          {amountNum === 0 
            ? 'Установка предоплаты в 0 BYN уберёт предоплату с заказа.'
            : paymentMethod === 'online' 
              ? '🌐 Онлайн: После создания предоплаты клиенту будет отправлена ссылка для оплаты на указанный email.'
              : '🏪 Оффлайн: Предоплата будет отмечена как полученная в кассе. Email не требуется.'
          }
        </div>
      </div>
    </div>
  );
};
