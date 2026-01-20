import React, { useCallback, useState } from 'react';
import { Order } from '../../../types';
import { ProgressBar } from '../../order/ProgressBar';
import { OrderTotal } from '../../order/OrderTotal';
import { MemoizedOrderItem } from '../MemoizedOrderItem';
import { OrderDates } from '../../order/OrderDates';
import { useToast } from '../../Toast';
import { generateOrderBlankPdf } from '../../../api';
import { CustomerSelector } from '../../customers/CustomerSelector';

interface OrderDetailSectionProps {
  selectedOrder: Order;
  statuses: Array<{ id: number; name: string; color?: string; sort_order: number }>;
  contextDate: string;
  contextUserId: number | null;
  currentUser: { id: number; name: string; role: string } | null;
  allUsers: Array<{ id: number; name: string }>;
  onDateChange: (date: string) => void;
  onUserIdChange: (userId: number | null) => void;
  onStatusChange: (orderId: number, status: number) => Promise<void>;
  onLoadOrders: () => void;
  onShowFilesModal: () => void;
  onShowPrepaymentModal: () => void;
  onOpenCalculator: () => void;
  onEditOrderItem: (orderId: number, item: any) => void;
  onGetDailyReportByDate: (date: string) => Promise<any>;
  onCreateDailyReport: (params: { report_date: string; user_id: number }) => Promise<any>;
}

export const OrderDetailSection: React.FC<OrderDetailSectionProps> = React.memo(({
  selectedOrder,
  statuses,
  contextDate,
  contextUserId,
  currentUser,
  allUsers,
  onDateChange,
  onUserIdChange,
  onStatusChange,
  onLoadOrders,
  onShowFilesModal,
  onShowPrepaymentModal,
  onOpenCalculator,
  onEditOrderItem,
  onGetDailyReportByDate,
  onCreateDailyReport,
}) => {
  const { addToast } = useToast();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const items = selectedOrder.items ?? [];
  
  const handleStatusChange = useCallback(async (newStatus: number) => {
    try {
      await onStatusChange(selectedOrder.id, newStatus);
      // Не вызываем onLoadOrders - handleStatusChange в useOrderHandlers уже вызывает loadOrders
    } catch (e: any) {
      alert('Не удалось изменить статус');
    }
  }, [selectedOrder.id, onStatusChange]);

  const handleGenerateBlank = useCallback(async () => {
    try {
      setIsGeneratingPdf(true);
      
      // Телефон компании (можно вынести в конфиг)
      const companyPhones = ['+375 33 336 56 78'];
      
      const response = await generateOrderBlankPdf(selectedOrder.id, companyPhones);
      
      // Создаем blob и открываем в новой вкладке
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        throw new Error('Браузер заблокировал открытие новой вкладки');
      }
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 30000);
      
      addToast({ 
        type: 'success', 
        title: 'Успешно', 
        message: 'Бланк заказа открыт в новой вкладке' 
      });
    } catch (error: any) {
      console.error('Ошибка генерации PDF бланка:', error);
      addToast({ 
        type: 'error', 
        title: 'Ошибка', 
        message: error.message || 'Не удалось создать PDF бланк заказа' 
      });
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [selectedOrder.id, selectedOrder.number, addToast]);

  return (
    <>
      <div className="detail-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>{selectedOrder.number}</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                onClick={onShowFilesModal}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#1976d2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Файлы макетов"
              >
                📁 Файлы
              </button>
              <button 
                onClick={onShowPrepaymentModal}
                style={{
                  padding: '6px 12px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
                title="Предоплата"
              >
                💳 Предоплата
              </button>
              <button 
                onClick={handleGenerateBlank}
                disabled={isGeneratingPdf}
                style={{
                  padding: '6px 12px',
                  backgroundColor: isGeneratingPdf ? '#ccc' : '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isGeneratingPdf ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  opacity: isGeneratingPdf ? 0.6 : 1
                }}
                title="Создать PDF бланк заказа"
              >
                {isGeneratingPdf ? '⏳ Генерация...' : '📄 Бланк'}
              </button>
            </div>
          </div>
          
          <CustomerSelector
            orderId={selectedOrder.id}
            currentCustomerId={selectedOrder.customer_id}
            onCustomerChange={onLoadOrders}
          />
          
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 12, color: '#666' }}>Дата</label>
              <input 
                type="date" 
                value={contextDate} 
                onChange={async e => {
                  onDateChange(e.target.value);
                  // Не вызываем onLoadOrders - useEffect в useOptimizedAppData уже обработает изменение даты
                  try {
                    const uid = contextUserId ?? currentUser?.id ?? undefined;
                    await onGetDailyReportByDate(e.target.value).catch(async () => {
                      if (uid) await onCreateDailyReport({ report_date: e.target.value, user_id: uid });
                    });
                  } catch (error) {
                    // Игнорируем ошибки - они не критичны
                  }
                }} 
                style={{ marginLeft: 8 }} 
              />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#666' }}>Пользователь</label>
              <select 
                value={String(contextUserId ?? currentUser?.id ?? '')} 
                onChange={async e => {
                  const uid = e.target.value ? Number(e.target.value) : null;
                  onUserIdChange(uid);
                  // Не вызываем onLoadOrders - useEffect в useOptimizedAppData уже обработает изменение пользователя
                  try {
                    await onGetDailyReportByDate(contextDate).catch(async () => {
                      if (uid) await onCreateDailyReport({ report_date: contextDate, user_id: uid });
                    });
                  } catch (error) {
                    // Игнорируем ошибки - они не критичны
                  }
                }} 
                style={{ marginLeft: 8 }}
              >
                {currentUser?.role === 'admin' ? (
                  allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)
                ) : (
                  <option value={currentUser?.id}>{currentUser?.name}</option>
                )}
              </select>
            </div>
          </div>
          <OrderDates
            order={selectedOrder}
            onUpdate={onLoadOrders}
            onSuccess={(msg) => addToast({ type: 'success', title: 'Успешно', message: msg })}
            onError={(msg) => addToast({ type: 'error', title: 'Ошибка', message: msg })}
          />
        </div>
        <div className="detail-actions">
          <select
            value={String(selectedOrder.status)}
            onChange={async (e) => {
              const newStatus = Number(e.target.value);
              try {
                await onStatusChange(selectedOrder.id, newStatus);
                // Не вызываем onLoadOrders - handleStatusChange уже вызывает loadOrders
              } catch (err) {
                alert('Не удалось обновить статус. Возможно нужна авторизация.');
              }
            }}
            style={{ marginRight: 8 }}
          >
            {statuses.map((s) => (
              <option key={s.id} value={s.sort_order}>{s.name}</option>
            ))}
          </select>
          <button onClick={() => onOpenCalculator()}>+ Калькулятор</button>
        </div>
      </div>

      <ProgressBar
        current={selectedOrder.status}
        statuses={statuses}
        onStatusChange={handleStatusChange}
        height="12px"
      />

      <div className="detail-body">
        {items.length === 0 && (
          <div className="item">Пока нет позиций</div>
        )}

        {items.map((it) => (
          <MemoizedOrderItem 
            key={it.id} 
            item={it} 
            orderId={selectedOrder.id}
            order={selectedOrder}
            onUpdate={onLoadOrders}
            onEditParameters={onEditOrderItem}
          />
        ))}
      </div>

      <OrderTotal
        items={items.map((it) => ({
          id: it.id,
          type: it.type,
          price: it.price,
          quantity: it.quantity ?? 1,
        }))}
        discount={0}
        taxRate={0}
        prepaymentAmount={selectedOrder.prepaymentAmount}
        prepaymentStatus={selectedOrder.prepaymentStatus}
        paymentMethod={selectedOrder.paymentMethod === 'telegram' ? 'online' : selectedOrder.paymentMethod}
      />
    </>
  );
});

OrderDetailSection.displayName = 'OrderDetailSection';

