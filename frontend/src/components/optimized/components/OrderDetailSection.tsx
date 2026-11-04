import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Order } from '../../../types';
import { StatusTrack } from '../../order/StatusTrack';
import { OrderStamp } from '../../order/OrderStamp';
import { getSourceLabel } from '../../orderPool/orderPoolUtils';
import { Menu, MenuItem } from '../../ui/Menu';
import './OrderDetailSection.css';
import '../workplace.css';
import { OrderTotal } from '../../order/OrderTotal';
import { MemoizedOrderItem } from '../MemoizedOrderItem';
import { OrderDates } from '../../order/OrderDates';
import { useToast } from '../../Toast';
import { generateOrderBlankPdf, generateCommodityReceiptPdf, generateCommodityReceiptBlankPdf, updateOrderDiscount, updateOrderPaymentChannel, updateOrderNotes, getDepartments, type Department } from '../../../api';
import { parseNumberFlexible } from '../../../utils/numberInput';
import { getOrderAmounts } from '../../../utils/orderTotal';
import { CustomerSelector } from '../../customers/CustomerSelector';
import { AppIcon } from '../../ui/AppIcon';
import { OrderDeliveryBlock } from '../../orders/OrderDeliveryBlock';
import { OrderDispatchMenu } from '../../orders/OrderDispatchMenu';
import { PostalShipmentPanel } from '../../orders/PostalShipmentPanel';
import { OrderCostSheetPanel } from '../../orders/OrderCostSheetPanel';
import { AssignableUserSelect } from '../../orders/AssignableUserSelect';
import { OrderTransferModal } from '../../orders/OrderTransferModal';
import { useAssignableUsers } from '../../../hooks/useAssignableUsers';
import { useOrderLegalDocuments } from '../hooks/useOrderLegalDocuments';
import { useFreshOrderItem } from '../../order/useFreshOrderItem';

interface OrderDetailSectionProps {
  selectedOrder: Order;
  statuses: Array<{ id: number; name: string; color?: string; sort_order: number }>;
  contextDate: string;
  contextUserId: number | null;
  currentUser: { id: number; name: string; role: string } | null;
  allUsers: Array<{ id: number; name: string }>;
  operatorsToday?: Array<{ id: number; name: string }>;
  onAssigneesChange?: (orderId: number, patch: { contact_user_id?: number | null; responsible_user_id?: number | null }) => void;
  onReturnToPool?: (order: Order) => Promise<void>;
  onExecutorChange?: (orderId: number, itemId: number, executor_user_id: number | null) => void;
  onDateChange: (date: string) => void;
  onUserIdChange: (userId: number | null) => void;
  onStatusChange: (orderId: number, status: number) => Promise<void>;
  onLoadOrders: () => void;
  onShowFilesModal: () => void;
  onShowPrepaymentModal: () => void;
  onRemovePrepayment?: (orderId: number) => Promise<void>;
  onIssueOrder?: (orderId: number) => Promise<void>;
  onOpenCalculator: () => void;
  onEditOrderItem: (orderId: number, item: any) => void;
  onGetDailyReportByDate: (date: string) => Promise<any>;
  onCreateDailyReport: (params: { report_date: string; user_id: number }) => Promise<any>;
  /** Обновить заказ в списке (для мгновенного отображения после API) */
  onOrderPatch?: (orderId: number, patch: Partial<Order>) => void;
}

export const OrderDetailSection: React.FC<OrderDetailSectionProps> = React.memo(({
  selectedOrder,
  statuses,
  contextDate,
  contextUserId,
  currentUser,
  allUsers,
  operatorsToday = [],
  onAssigneesChange,
  onReturnToPool,
  onExecutorChange,
  onDateChange,
  onUserIdChange,
  onStatusChange,
  onLoadOrders,
  onShowFilesModal,
  onShowPrepaymentModal,
  onRemovePrepayment,
  onIssueOrder,
  onOpenCalculator,
  onEditOrderItem,
  onGetDailyReportByDate,
  onCreateDailyReport,
  onOrderPatch,
}) => {
  const { addToast } = useToast();
  const {
    showLegalDocsButton,
    docsMenuOpen,
    setDocsMenuOpen,
    docsMenuRef,
    generatingKind,
    generateLegalDocument,
  } = useOrderLegalDocuments({ order: selectedOrder, addToast });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
  const [receiptMenuOpen, setReceiptMenuOpen] = useState(false);
  const receiptMenuRef = useRef<HTMLDivElement>(null);
  const [discountMenuOpen, setDiscountMenuOpen] = useState(false);
  const discountMenuRef = useRef<HTMLDivElement>(null);
  const [paymentChannelMenuOpen, setPaymentChannelMenuOpen] = useState(false);
  const paymentChannelMenuRef = useRef<HTMLDivElement>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);

  const { onShift: assignableOnShift, all: assignableAll } = useAssignableUsers({
    date: contextDate,
  });
  const roleOnShift = assignableOnShift.length > 0 ? assignableOnShift : operatorsToday;
  const roleAll = assignableAll.length > 0 ? assignableAll : (allUsers.length > 0 ? allUsers : operatorsToday);

  useEffect(() => {
    getDepartments()
      .then((res) => setDepartments(res.data ?? []))
      .catch(() => setDepartments([]));
  }, []);

  const items = selectedOrder.items ?? [];
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);
  const freshItemId = useFreshOrderItem(
    selectedOrder.id,
    items.map((item) => item.id)
  );

  useEffect(() => {
    setExpandedItemId(null);
  }, [selectedOrder.id]);
  const orderAmounts = React.useMemo(
    () => getOrderAmounts(selectedOrder),
    [selectedOrder],
  );
  const discountPercent = orderAmounts.discountPercent;
  const statusInfo = statuses.find((status) => status.id === Number(selectedOrder.status));
  const canIssue = Boolean(
    onIssueOrder
    && (orderAmounts.debt > 0 || (orderAmounts.debt === 0 && orderAmounts.total > 0))
    && Number(selectedOrder.status) !== 7,
  );
  const createdAt = selectedOrder.created_at ? new Date(selectedOrder.created_at) : null;
  const createdLabel = createdAt && !Number.isNaN(createdAt.getTime())
    ? createdAt.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';
  const sourceLabel = selectedOrder.source ? getSourceLabel(selectedOrder.source) : '';
  const eyebrow = [sourceLabel && sourceLabel !== 'Неизвестно' ? sourceLabel : '', createdLabel ? `создан ${createdLabel}` : '']
    .filter(Boolean)
    .join(' · ');

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

  useEffect(() => {
    if (!paymentChannelMenuOpen) return;
    const onOutside = (e: MouseEvent) => {
      if (paymentChannelMenuRef.current && !paymentChannelMenuRef.current.contains(e.target as Node)) {
        setPaymentChannelMenuOpen(false);
      }
    };
    document.addEventListener('click', onOutside, true);
    return () => document.removeEventListener('click', onOutside, true);
  }, [paymentChannelMenuOpen]);
  
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

  const PAYMENT_CHANNELS = [
    { value: 'cash' as const, label: 'Касса', desc: 'Учитывается в кассе' },
    { value: 'invoice' as const, label: 'Счёт', desc: 'Безнал, не в кассе' },
    { value: 'not_cashed' as const, label: '—', desc: '' },
    { value: 'internal' as const, label: 'Внутренние работы', desc: 'Не в кассе и не в ЗП' },
  ];
  const paymentChannel = (selectedOrder.payment_channel || 'cash') as 'cash' | 'invoice' | 'not_cashed' | 'internal';
  const channelLabel = PAYMENT_CHANNELS.find((channel) => channel.value === paymentChannel)?.label ?? paymentChannel;
  const handleSetPaymentChannel = useCallback(async (ch: 'cash' | 'invoice' | 'not_cashed' | 'internal') => {
    try {
      setPaymentChannelMenuOpen(false);
      await updateOrderPaymentChannel(selectedOrder.id, ch);
      onOrderPatch?.(selectedOrder.id, { payment_channel: ch });
      onLoadOrders();
      const label = PAYMENT_CHANNELS.find((p) => p.value === ch)?.label ?? ch;
      addToast({ type: 'success', title: 'Успешно', message: `Канал оплаты: ${label}` });
    } catch (error: any) {
      addToast({ type: 'error', title: 'Ошибка', message: error.message || 'Не удалось изменить канал оплаты' });
    }
  }, [selectedOrder.id, onLoadOrders, onOrderPatch, addToast]);

  const [notesValue, setNotesValue] = useState(selectedOrder.notes ?? '');
  const notesSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesDirtyRef = useRef(false);
  const notesValueRef = useRef(notesValue);
  const notesSaveGenRef = useRef(0);
  const notesOrderIdRef = useRef(selectedOrder.id);
  notesValueRef.current = notesValue;

  useEffect(() => {
    if (notesOrderIdRef.current !== selectedOrder.id) {
      notesOrderIdRef.current = selectedOrder.id;
      notesDirtyRef.current = false;
      notesSaveGenRef.current += 1;
      if (notesSaveRef.current) {
        clearTimeout(notesSaveRef.current);
        notesSaveRef.current = null;
      }
      setNotesValue(selectedOrder.notes ?? '');
      return;
    }
    if (notesDirtyRef.current) return;
    setNotesValue(selectedOrder.notes ?? '');
  }, [selectedOrder.id, selectedOrder.notes]);

  const handleNotesChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    notesDirtyRef.current = true;
    setNotesValue(v);
    if (notesSaveRef.current) clearTimeout(notesSaveRef.current);
    const gen = ++notesSaveGenRef.current;
    const orderId = selectedOrder.id;
    notesSaveRef.current = setTimeout(async () => {
      notesSaveRef.current = null;
      if (gen !== notesSaveGenRef.current || notesOrderIdRef.current !== orderId) return;
      const toSave = notesValueRef.current;
      try {
        await updateOrderNotes(orderId, toSave.trim() || null);
        if (gen !== notesSaveGenRef.current || notesOrderIdRef.current !== orderId) return;
        onOrderPatch?.(orderId, { notes: toSave.trim() });
        if (notesValueRef.current === toSave) {
          notesDirtyRef.current = false;
        }
      } catch (err: any) {
        addToast({ type: 'error', title: 'Ошибка', message: err.message || 'Не удалось сохранить примечания' });
      }
    }, 500);
  }, [selectedOrder.id, onOrderPatch, addToast]);
  useEffect(() => () => { if (notesSaveRef.current) clearTimeout(notesSaveRef.current); }, []);

  return (
    <>
      <header className="pc-order-head">
        <div className="pc-order-head__eyebrow">{eyebrow || 'Заказ'}</div>
        <div className="pc-order-head__title">
          <h2 className="pc-order-head__number">{selectedOrder.number}</h2>
          <OrderStamp
            status={statusInfo ?? { id: Number(selectedOrder.status), name: '' }}
            statuses={statuses}
            onlineCancelled={selectedOrder.is_cancelled === 1}
          />
          <span className="pc-order-tag">{channelLabel}</span>
          {(selectedOrder.issued_by_me === true || selectedOrder.issued_by_me === 1) && (
            <span className="pc-order-tag">Выдали вы</span>
          )}
        </div>
      </header>
      <div className="detail-header detail-header--notes-aligned">
        <div className="pc-order-actions">
              <div className="pc-btn-group">
              <button
                type="button"
                onClick={onShowFilesModal}
                className="pc-btn"
                title="Файлы макетов"
              >
                <AppIcon name="folder" size="xs" /> Файлы
              </button>
              <button
                type="button"
                onClick={onShowPrepaymentModal}
                className="pc-btn"
                title="Внести предоплату"
              >
                <AppIcon name="card" size="xs" /> Внести предоплату
              </button>
              </div>
              {orderAmounts.prepayment > 0 && onRemovePrepayment && (
                <button
                  type="button"
                  onClick={() => onRemovePrepayment(selectedOrder.id)}
                  className="pc-btn pc-btn--danger-text"
                  title="Удалить предоплату по заказу"
                >
                  <AppIcon name="trash" size="xs" /> Удалить предоплату
                </button>
              )}
              <button
                type="button"
                onClick={handleGenerateBlank}
                disabled={isGeneratingPdf}
                className="pc-btn"
                title="Создать PDF бланк заказа"
              >
                {isGeneratingPdf ? <><AppIcon name="refresh" size="xs" /> Генерация...</> : <><AppIcon name="document" size="xs" /> Бланк</>}
              </button>
              <PostalShipmentPanel
                order={selectedOrder}
                onNotify={(type, message) => addToast({
                  type,
                  title: type === 'success' ? 'Доставка' : 'Ошибка',
                  message,
                })}
              />
              <OrderCostSheetPanel orderId={selectedOrder.id} />
              {currentUser?.role === 'admin' ? (
                <OrderDispatchMenu orderId={selectedOrder.id} customerPhone={selectedOrder.customerPhone} />
              ) : null}
              {showLegalDocsButton && (
                <div className="pc-menu-anchor" ref={docsMenuRef}>
                  <button
                    type="button"
                    onClick={(e) =>{
                      e.stopPropagation();
                      if (!generatingKind) setDocsMenuOpen((v) => !v);
                    }}
                    disabled={Boolean(generatingKind)}
                    className="pc-btn"
                    title="Договор, акт, счёт и товарная накладная по этому заказу"
                  >
                    {generatingKind
                      ? <><AppIcon name="refresh" size="xs" /> Генерация...</>
                      : <><AppIcon name="briefcase" size="xs" /> Документы</>}
                  </button>
                  {docsMenuOpen && !generatingKind && (
                    <Menu label="Документы">
                      <MenuItem onClick={() => generateLegalDocument('contract')}>Договор Word</MenuItem>
                      <MenuItem onClick={() => generateLegalDocument('act')}>Акт Excel</MenuItem>
                      <MenuItem onClick={() => generateLegalDocument('invoice')}>Счёт Excel</MenuItem>
                      <MenuItem onClick={() => generateLegalDocument('tn')}>ТН Excel</MenuItem>
                    </Menu>
                  )}
                </div>
              )}
              <div className="pc-menu-anchor" ref={receiptMenuRef}>
                <button
                  type="button"
                  onClick={(e) =>{
                    e.stopPropagation();
                    if (!isGeneratingReceipt) setReceiptMenuOpen((v) => !v);
                  }}
                  disabled={isGeneratingReceipt}
                  className="pc-btn"
                  title="Товарный чек: по заказу или бланк"
                >
                  {isGeneratingReceipt ? <><AppIcon name="refresh" size="xs" /> Генерация...</> : <><AppIcon name="receipt" size="xs" /> Товарный чек</>}
                </button>
                {receiptMenuOpen && !isGeneratingReceipt && (
                  <Menu label="Товарный чек">
                    <MenuItem onClick={handleGenerateReceipt}>По заказу</MenuItem>
                    <MenuItem onClick={handleGenerateReceiptBlank}>Бланк</MenuItem>
                  </Menu>
                )}
              </div>
              <div className="pc-menu-anchor" ref={discountMenuRef}>
                <button
                  type="button"
                  onClick={(e) =>{
                    e.stopPropagation();
                    setDiscountMenuOpen((v) => !v);
                  }}
                  className="pc-btn"
                  title="Скидка на итог заказа"
                >
                  <AppIcon name="tag" size="xs" /> {discountPercent > 0 ? `Скидка ${discountPercent}%` : 'Скидка'}
                </button>
                {discountMenuOpen && (
                  <Menu label="Скидка">
                    {DISCOUNT_OPTIONS.map((percent) => (
                      <MenuItem
                        key={percent}
                        selected={percent === discountPercent}
                        onClick={() => handleSetDiscount(percent)}
                      >
                        {percent === 0 ? 'Без скидки' : `${percent}%`}
                      </MenuItem>
                    ))}
                  </Menu>
                )}
              </div>
              <div className="pc-menu-anchor" ref={paymentChannelMenuRef}>
                <button
                  type="button"
                  onClick={(e) =>{
                    e.stopPropagation();
                    setPaymentChannelMenuOpen((v) => !v);
                  }}
                  className="pc-btn"
                  title="Канал оплаты"
                >
                  Канал: {channelLabel}
                </button>
                {paymentChannelMenuOpen && (
                  <Menu label="Канал оплаты">
                    {PAYMENT_CHANNELS.map((channel) => (
                      <MenuItem
                        key={channel.value}
                        selected={channel.value === paymentChannel}
                        onClick={() => handleSetPaymentChannel(channel.value)}
                      >
                        {channel.label}
                        {channel.desc ? <small>{channel.desc}</small> : null}
                      </MenuItem>
                    ))}
                  </Menu>
                )}
              </div>
              {((roleOnShift.length > 0 || roleAll.length > 0) && onAssigneesChange) ? (
                <button
                  type="button"
                  className="pc-btn"
                  onClick={() => setTransferOpen(true)}
                  title="Передать коллеге или в другой павильон"
                >
                  Передать
                </button>
              ) : null}
            </div>
        <div className="detail-header__main pc-order-data">
        <div className="detail-header__col-left">
          <h3>Клиент</h3>
          <CustomerSelector
            orderId={selectedOrder.id}
            currentCustomerId={selectedOrder.customer_id}
            onCustomerChange={onLoadOrders}
            onOrderPatch={onOrderPatch}
            orderTotal={selectedOrder.totalAmount}
            orderPrepayment={selectedOrder.prepaymentAmount}
            orderStatus={selectedOrder.status}
          />
        </div>
        <div className="pc-order-work">
          <h3>Работа по заказу</h3>
          <div className="detail-meta-row">
            {((roleOnShift.length > 0 || roleAll.length > 0) && onAssigneesChange) ? (
              <>
                <div className="detail-meta-field">
                  <label>Контактёр</label>
                  <AssignableUserSelect
                    value={selectedOrder.contact_user_id ?? null}
                    onChange={(uid) => onAssigneesChange(selectedOrder.id, { contact_user_id: uid })}
                    onShift={roleOnShift}
                    all={roleAll}
                  />
                </div>
                <span className="detail-meta-divider" />
                <div className="detail-meta-field">
                  <label>Ответственный</label>
                  <AssignableUserSelect
                    value={(selectedOrder.responsible_user_id ?? selectedOrder.userId) ?? null}
                    onChange={(uid) => {
                      if (uid == null && onReturnToPool) {
                        void onReturnToPool(selectedOrder);
                        return;
                      }
                      onAssigneesChange(selectedOrder.id, { responsible_user_id: uid });
                    }}
                    onShift={roleOnShift}
                    all={roleAll}
                  />
                </div>
                <span className="detail-meta-divider" />
              </>
            ) : null}
            <div className="detail-meta-field">
              <label>Дата</label>
              <input 
                type="date" 
                value={contextDate} 
                onChange={async e => {
                  onDateChange(e.target.value);
                  try {
                    const uid = contextUserId ?? currentUser?.id ?? undefined;
                    await onGetDailyReportByDate(e.target.value).catch(async () => {
                      if (uid) await onCreateDailyReport({ report_date: e.target.value, user_id: uid });
                    });
                  } catch (error) {
                    // Игнорируем ошибки - они не критичны
                  }
                }} 
              />
            </div>
            <span className="detail-meta-divider" />
            <div className="detail-meta-field" style={{ display: 'none' }}>
              <label>Пользователь</label>
              <select 
                value={String(contextUserId ?? currentUser?.id ?? '')} 
                onChange={async e => {
                  const uid = e.target.value ? Number(e.target.value) : null;
                  onUserIdChange(uid);
                  try {
                    await onGetDailyReportByDate(contextDate).catch(async () => {
                      if (uid) await onCreateDailyReport({ report_date: contextDate, user_id: uid });
                    });
                  } catch (error) {
                    // Игнорируем ошибки - они не критичны
                  }
                }} 
              >
                {currentUser?.role === 'admin' ? (
                  allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)
                ) : (
                  <option value={currentUser?.id}>{currentUser?.name}</option>
                )}
              </select>
            </div>
            <OrderDates
              order={selectedOrder}
              onUpdate={onLoadOrders}
              onSuccess={(msg) => addToast({ type: 'success', title: 'Успешно', message: msg })}
              onError={(msg) => addToast({ type: 'error', title: 'Ошибка', message: msg })}
              inline
            />
          </div>
        </div>
        <div className="detail-header__col-notes">
          <h3>Примечания</h3>
          <textarea
            value={notesValue}
            onChange={handleNotesChange}
            placeholder="Описание, примечания по заказу..."
            rows={3}
            className="detail-notes-input"
          />
        </div>
        </div>
      </div>

      <div className="pc-track-row">
        <button type="button" className="pc-btn" onClick={() => onOpenCalculator()}>
          <AppIcon name="plus" size="xs" /> Добавить продукт
        </button>
        <StatusTrack
          currentStatusId={Number(selectedOrder.status)}
          statuses={statuses}
          onStatusChange={handleStatusChange}
          createdAt={selectedOrder.created_at}
          readyAt={selectedOrder.actualCompletion ?? null}
        />
        {canIssue && onIssueOrder ? (
          <button
            type="button"
            className="pc-btn pc-btn--primary"
            title="Выдать заказ (100% остатка, долг закрыт)"
            onClick={() => onIssueOrder(selectedOrder.id)}
          >
            <AppIcon name="check" size="xs" /> Выдать заказ
          </button>
        ) : (
          <span className="pc-track-row__end" aria-hidden="true" />
        )}
      </div>

      <div className="detail-body">
        {selectedOrder.delivery ? (
          <OrderDeliveryBlock delivery={selectedOrder.delivery} />
        ) : null}
        <div className="order-positions">
          <div className="order-positions__head">
            <span>#</span>
            <span>Позиция</span>
            <span>Суть</span>
            <span>Кол-во</span>
            <span>Сумма</span>
            <span>Исполнитель</span>
          </div>
          {items.length === 0 ? (
            <div className="order-positions__empty">Пока нет позиций</div>
          ) : (
            items.map((it, index) => (
              <MemoizedOrderItem
                key={it.id}
                item={it}
                orderId={selectedOrder.id}
                order={{
                  ...selectedOrder,
                  priceType: (selectedOrder as any).priceType ?? items[0]?.params?.priceType ?? (items[0]?.params as any)?.price_type,
                }}
                onUpdate={onLoadOrders}
                onEditParameters={onEditOrderItem}
                operatorsToday={operatorsToday}
                assignableOnShift={roleOnShift}
                assignableAll={roleAll}
                onExecutorChange={onExecutorChange}
                layout="table"
                rowIndex={index + 1}
                expanded={expandedItemId === it.id}
                onToggleExpanded={() =>
                  setExpandedItemId((current) => (current === it.id ? null : it.id))
                }
                fresh={freshItemId === it.id}
              />
            ))
          )}
        </div>
      </div>

      <OrderTransferModal
        isOpen={transferOpen}
        onClose={() => setTransferOpen(false)}
        order={selectedOrder}
        departments={departments}
        date={contextDate}
        onTransferred={(updated) => {
          onOrderPatch?.(updated.id, updated);
          onLoadOrders();
          addToast({ type: 'success', title: 'Готово', message: 'Заказ передан' });
        }}
        onError={(msg) => addToast({ type: 'error', title: 'Ошибка', message: msg })}
      />

      <OrderTotal
        variant="passport"
        discountPercent={discountPercent}
        prepaymentUpdatedAt={selectedOrder.prepaymentUpdatedAt}
        subtotal={orderAmounts.subtotal}
        discountAmount={orderAmounts.discountAmount}
        total={orderAmounts.total}
        debt={orderAmounts.debt}
        taxRate={0}
        prepaymentAmount={selectedOrder.prepaymentAmount}
        prepaymentStatus={selectedOrder.prepaymentStatus}
        paymentMethod={selectedOrder.paymentMethod === 'telegram' ? 'online' : selectedOrder.paymentMethod}
      />

    </>
  );
});

OrderDetailSection.displayName = 'OrderDetailSection';

