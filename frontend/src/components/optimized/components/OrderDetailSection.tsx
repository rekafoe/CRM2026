import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Order } from '../../../types';
import { ProgressBar } from '../../order/ProgressBar';
import { OrderTotal } from '../../order/OrderTotal';
import { MemoizedOrderItem } from '../MemoizedOrderItem';
import { OrderDates } from '../../order/OrderDates';
import { useToast } from '../../Toast';
import { generateOrderBlankPdf, generateCommodityReceiptPdf, generateCommodityReceiptBlankPdf, updateOrderDiscount } from '../../../api';
import { parseNumberFlexible } from '../../../utils/numberInput';
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
  onIssueOrder?: (orderId: number) => Promise<void>;
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
  onIssueOrder,
  onOpenCalculator,
  onEditOrderItem,
  onGetDailyReportByDate,
  onCreateDailyReport,
}) => {
  const { addToast } = useToast();
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
  const [receiptMenuOpen, setReceiptMenuOpen] = useState(false);
  const receiptMenuRef = useRef<HTMLDivElement>(null);
  const [discountMenuOpen, setDiscountMenuOpen] = useState(false);
  const discountMenuRef = useRef<HTMLDivElement>(null);

  const items = selectedOrder.items ?? [];
  const subtotal = React.useMemo(() => {
    return items.reduce((sum, it) => {
      const p = parseNumberFlexible(it.price);
      const q = parseNumberFlexible(it.quantity ?? 1);
      const s = parseNumberFlexible((it as any).serviceCost);
      return sum + p * q + s;
    }, 0);
  }, [items]);
  const discountPercent = selectedOrder.discount_percent ?? 0;
  const discountAmount = Math.round(subtotal * (discountPercent / 100) * 100) / 100;
  const total = Math.round((subtotal - discountAmount) * 100) / 100;
  const prepay = parseNumberFlexible(selectedOrder.prepaymentAmount ?? 0);
  const debt = Math.max(0, Math.round((total - prepay) * 100) / 100);

  useEffect(() => {
    if (!receiptMenuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (receiptMenuRef.current && !receiptMenuRef.current.contains(e.target as Node)) {
        setReceiptMenuOpen(false);
      }
    };
    document.addEventListener('click', onOutside, true);
    return () => document.removeEventListener('click', onOutside, true);
  }, [receiptMenuOpen]);

  useEffect(() => {
    if (!discountMenuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (discountMenuRef.current && !discountMenuRef.current.contains(e.target as Node)) {
        setDiscountMenuOpen(false);
      }
    };
    document.addEventListener('click', onOutside, true);
    return () => document.removeEventListener('click', onOutside, true);
  }, [discountMenuOpen]);
  
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

  const openPdfInNewTab = useCallback((data: BlobPart, filename: string) => {
    const blob = new Blob([data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) throw new Error('Браузер заблокировал открытие новой вкладки');
    setTimeout(() => window.URL.revokeObjectURL(url), 30000);
  }, []);

  const handleGenerateReceipt = useCallback(async () => {
    try {
      setIsGeneratingReceipt(true);
      setReceiptMenuOpen(false);
      const response = await generateCommodityReceiptPdf(selectedOrder.id);
      openPdfInNewTab(response.data, `commodity-receipt-${selectedOrder.id}.pdf`);
      addToast({ type: 'success', title: 'Успешно', message: 'Товарный чек открыт в новой вкладке' });
    } catch (error: any) {
      console.error('Ошибка генерации товарного чека:', error);
      addToast({ type: 'error', title: 'Ошибка', message: error.message || 'Не удалось создать товарный чек' });
    } finally {
      setIsGeneratingReceipt(false);
    }
  }, [selectedOrder.id, addToast, openPdfInNewTab]);

  const handleGenerateReceiptBlank = useCallback(async () => {
    try {
      setIsGeneratingReceipt(true);
      setReceiptMenuOpen(false);
      const response = await generateCommodityReceiptBlankPdf();
      openPdfInNewTab(response.data, 'commodity-receipt-blank.pdf');
      addToast({ type: 'success', title: 'Успешно', message: 'Бланк товарного чека открыт в новой вкладке' });
    } catch (error: any) {
      console.error('Ошибка генерации бланка товарного чека:', error);
      addToast({ type: 'error', title: 'Ошибка', message: error.message || 'Не удалось создать бланк товарного чека' });
    } finally {
      setIsGeneratingReceipt(false);
    }
  }, [addToast, openPdfInNewTab]);

  const DISCOUNT_OPTIONS = [0, 5, 10, 15, 20, 25] as const;
  const handleSetDiscount = useCallback(async (percent: number) => {
    try {
      setDiscountMenuOpen(false);
      await updateOrderDiscount(selectedOrder.id, percent);
      onLoadOrders();
      addToast({
        type: 'success',
        title: 'Успешно',
        message: percent === 0 ? 'Скидка снята' : `Скидка ${percent}% применена`,
      });
    } catch (error: any) {
      addToast({ type: 'error', title: 'Ошибка', message: error.message || 'Не удалось применить скидку' });
    }
  }, [selectedOrder.id, onLoadOrders, addToast]);

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
                title="Внести предоплату"
              >
                💳 Внести предоплату
              </button>
              {onIssueOrder && debt > 0 && (
                <button 
                  onClick={() => onIssueOrder(selectedOrder.id)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#17a2b8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Выдать заказ (100% остатка, долг закрыт)"
                >
                  ✅ Выдать заказ
                </button>
              )}
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
              <div ref={receiptMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isGeneratingReceipt) setReceiptMenuOpen((v) => !v);
                  }}
                  disabled={isGeneratingReceipt}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: isGeneratingReceipt ? '#ccc' : '#17a2b8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isGeneratingReceipt ? 'not-allowed' : 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    opacity: isGeneratingReceipt ? 0.6 : 1
                  }}
                  title="Товарный чек: по заказу или бланк"
                >
                  {isGeneratingReceipt ? '⏳ Генерация...' : '🧾 Товарный чек ▼'}
                </button>
                {receiptMenuOpen && !isGeneratingReceipt && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: 4,
                      background: '#fff',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 1000,
                      minWidth: '140px'
                    }}
                    role="menu"
                  >
                    <button
                      type="button"
                      onClick={handleGenerateReceipt}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '8px 12px',
                        textAlign: 'left',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                      role="menuitem"
                    >
                      По заказу
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateReceiptBlank}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '8px 12px',
                        textAlign: 'left',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        fontSize: '12px',
                        borderTop: '1px solid #eee'
                      }}
                      role="menuitem"
                    >
                      Бланк
                    </button>
                  </div>
                )}
              </div>
              <div ref={discountMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDiscountMenuOpen((v) => !v);
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: discountPercent > 0 ? '#6f42c1' : '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Скидка на итог заказа"
                >
                  {discountPercent > 0 ? `🏷️ Скидка ${discountPercent}% ▼` : '🏷️ Скидка ▼'}
                </button>
                {discountMenuOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      marginTop: 4,
                      background: '#fff',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 1000,
                      minWidth: '120px'
                    }}
                    role="menu"
                  >
                    {DISCOUNT_OPTIONS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handleSetDiscount(p)}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '8px 12px',
                          textAlign: 'left',
                          border: 'none',
                          background: p === discountPercent ? '#e7e7ff' : 'none',
                          cursor: 'pointer',
                          fontSize: '12px',
                          borderTop: p === 0 ? 'none' : '1px solid #eee'
                        }}
                        role="menuitem"
                      >
                        {p === 0 ? 'Без скидки' : `${p}%`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
        discount={discountAmount}
        taxRate={0}
        prepaymentAmount={selectedOrder.prepaymentAmount}
        prepaymentStatus={selectedOrder.prepaymentStatus}
        paymentMethod={selectedOrder.paymentMethod === 'telegram' ? 'online' : selectedOrder.paymentMethod}
      />
    </>
  );
});

OrderDetailSection.displayName = 'OrderDetailSection';

