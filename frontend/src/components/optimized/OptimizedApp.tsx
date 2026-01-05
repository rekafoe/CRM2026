import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Order } from "../../types";
import {
  getOrders,
  createOrder,
  deleteOrder,
  deleteOrderItem,
  updateOrderStatus,
  updateOrderItem,
  addOrderItem,
} from "../../api";
import { useNavigate } from 'react-router-dom';
import AddItemModal from "../AddItemModal";
import ManagePresetsModal from "../ManagePresetsModal";
import { PrepaymentModal } from "../PrepaymentModal";
import { FeatureFlaggedCalculator } from "../calculator/FeatureFlaggedCalculator";
import { PaperTypesManager } from "../PaperTypesManager";
import { CountersPage } from "../../pages/CountersPage";
import { useToastNotifications } from "../Toast";
import { useLogger } from "../../utils/logger";
import "../../styles/admin-page-layout.css";
import "../../styles/admin-cards.css";

import { ProgressBar } from "../order/ProgressBar";
import { OrderTotal } from "../order/OrderTotal";
import { FilesModal } from "../FilesModal";
import { OrderPool } from "../orders/OrderPool";
import { UserOrderPage } from "../orders/UserOrderPage";
import { TopBar } from "./TopBar";
import { DateSwitchContainer } from "../orders/DateSwitchContainer";
import { setAuthToken, getOrderStatuses, listOrderFiles, uploadOrderFile, deleteOrderFile, approveOrderFile, createPrepaymentLink, getLowStock, getCurrentUser, getUsers, getDailyReportByDate, createDailyReport } from '../../api';
import { APP_CONFIG } from '../../types';
import type { OrderFile } from '../../types';

import { MemoizedOrderItem } from './MemoizedOrderItem';
import { MemoizedOrderList } from './MemoizedOrderList';
import { useOptimizedAppData } from './hooks/useOptimizedAppData';
import { useModalState } from './hooks/useModalState';
import { useOrderHandlers } from './hooks/useOrderHandlers';
import { OrderDetailSection } from './components/OrderDetailSection';

interface OptimizedAppProps {
  onClose?: () => void;
}

// Основной компонент приложения с оптимизацией
export const OptimizedApp: React.FC<OptimizedAppProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [prepayAmount, setPrepayAmount] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<string>('orders');
  const [contextDate, setContextDate] = useState<string>(() => new Date().toISOString().slice(0,10));
  const [contextUserId, setContextUserId] = useState<number | null>(null);
  const [orderManagementTab, setOrderManagementTab] = useState<'pool' | 'page'>('pool');

  // Хуки для уведомлений и логирования
  const toast = useToastNotifications();
  const logger = useLogger('OptimizedApp');

  // Хук для загрузки данных
  const {
    orders,
    setOrders,
    statuses,
    files,
    lowStock,
    currentUser,
    setCurrentUser,
    allUsers,
    loadOrders,
  } = useOptimizedAppData(contextDate, contextUserId, selectedId);

  // Хук для состояния модальных окон
  const modalState = useModalState();

  // Хук для обработчиков заказов
  const orderHandlers = useOrderHandlers({
    orders,
    setOrders,
    selectedId,
    setSelectedId,
    contextDate,
    loadOrders,
    closeCalculator: modalState.closeCalculator,
  });

  // Деструктуризация modalState для удобства
  const {
    showAddItem,
    setShowAddItem,
    showPresets,
    setShowPresets,
    showPrepaymentModal,
    setShowPrepaymentModal,
    showTopPicker,
    setShowTopPicker,
    showPrintingCalculator,
    showPaperTypesManager,
    setShowPaperTypesManager,
    showFilesModal,
    setShowFilesModal,
    showOrderPool,
    setShowOrderPool,
    showUserOrderPage,
    setShowUserOrderPage,
    showCountersPage,
    setShowCountersPage,
    showPageSwitcher,
    setShowPageSwitcher,
    calculatorContext,
    closeCalculator,
    openCalculator,
    openCalculatorForEdit,
  } = modalState;

  // Мемоизированные обработчики
  const handleLogout = useCallback(() => {
    try {
      setAuthToken(undefined);
      localStorage.removeItem('crmRole');
      localStorage.removeItem('crmSessionDate');
      localStorage.removeItem('crmUserId');
    } catch {}
    location.href = '/login';
  }, []);

  // Простая функция для обновления даты
  const handleDateChange = useCallback((newDate: string) => {
    setContextDate(newDate);
  }, []);

  const handleOpenCalculator = useCallback(
    (productType?: string) => {
      openCalculator(productType, selectedId ?? undefined);
    },
    [selectedId, openCalculator]
  );

  const handleOpenCalculatorForEdit = useCallback((orderId: number, item: any) => {
    setSelectedId((prev) => prev ?? orderId);
    openCalculatorForEdit(orderId, item);
  }, [openCalculatorForEdit]);

  // Мемоизированные колбэки для модальных окон
  const handleShowFilesModal = useCallback(() => setShowFilesModal(true), [setShowFilesModal]);
  const handleShowPrepaymentModal = useCallback(() => setShowPrepaymentModal(true), [setShowPrepaymentModal]);
  const handleShowPresets = useCallback(() => setShowPresets(true), [setShowPresets]);
  const handleShowPaperTypesManager = useCallback(() => setShowPaperTypesManager(true), [setShowPaperTypesManager]);

  // Мемоизированные обёртки для API функций
  const handleGetDailyReportByDate = useCallback(async (date: string) => {
    return await getDailyReportByDate(date);
  }, []);

  const handleCreateDailyReport = useCallback(async (params: { report_date: string; user_id: number }) => {
    return await createDailyReport(params);
  }, []);

  // Мемоизированные обработчики для topbar picker
  const handleDateChangeInPicker = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    setContextDate(newDate);
    setShowTopPicker(false);
    // Не вызываем loadOrders - useEffect в useOptimizedAppData уже обработает изменение даты
    try {
      const uid = contextUserId ?? currentUser?.id ?? undefined;
      await getDailyReportByDate(newDate).catch(() => Promise.resolve());
    } catch (error) {
      // Игнорируем ошибки
    }
  }, [contextUserId, currentUser?.id, setShowTopPicker]);

  const handleUserIdChangeInPicker = useCallback(async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const uid = e.target.value ? Number(e.target.value) : null;
    setContextUserId(uid);
    setShowTopPicker(false);
    // Не вызываем loadOrders - useEffect в useOptimizedAppData уже обработает изменение пользователя
    try {
      await getDailyReportByDate(contextDate).catch(() => Promise.resolve());
    } catch (error) {
      // Игнорируем ошибки
    }
  }, [contextDate, setShowTopPicker]);

  // Мемоизированные вычисления
  const selectedOrder = useMemo(() => {
    return orders.find((o) => o.id === selectedId) || null;
  }, [orders, selectedId]);

  const lowStockCount = useMemo(() => {
    return lowStock.length;
  }, [lowStock]);

  const totalRevenue = useMemo(() => {
    return orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
  }, [orders]);

  // Эффекты
  useEffect(() => {
    if (currentUser && !contextUserId) setContextUserId(currentUser.id);
  }, [currentUser, contextUserId]);

  return (
    <div className="app">
      {currentPage === 'orders' && (
        <>
          <TopBar
            contextDate={contextDate}
            currentUserName={currentUser?.name || ''}
            isAdmin={currentUser?.role === 'admin'}
            onShowPageSwitcher={useCallback(() => setShowPageSwitcher(true), [setShowPageSwitcher])}
            onShowOrderPool={useCallback(() => navigate('/order-pool'), [navigate])}
            onShowUserOrderPage={useCallback(() => {
              setOrderManagementTab('page');
              setShowUserOrderPage(true);
            }, [setOrderManagementTab, setShowUserOrderPage])}
            onShowCountersPage={useCallback(() => setShowCountersPage(true), [setShowCountersPage])}
            onLogout={handleLogout}
          />

          {showTopPicker && (
            <div className="topbar-picker" onMouseLeave={() => setShowTopPicker(false)}>
              <div className="row">
                <span style={{ width: 90 }}>Дата:</span>
                <input 
                  type="date" 
                  value={contextDate} 
                  onChange={handleDateChangeInPicker}
                />
              </div>
              <div className="row">
                <span style={{ width: 90 }}>Пользователь:</span>
                <select 
                  value={String(contextUserId ?? currentUser?.id ?? '')} 
                  onChange={handleUserIdChangeInPicker}
                >
                  {currentUser?.role === 'admin' ? (
                    allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)
                  ) : (
                    <option value={currentUser?.id}>{currentUser?.name}</option>
                  )}
                </select>
              </div>
              <div className="note">Отчёт создаётся только в день входа. Переключение даты показывает сохранённые данные.</div>
            </div>
          )}

          <aside className="sidebar">
            <div className="sidebar-toolbar">
              <button className="icon-btn" title="Добавить заказ" aria-label="Добавить заказ" onClick={orderHandlers.handleCreateOrder}>＋</button>
              <button
                className="icon-btn"
                title="Удалить выбранный заказ"
                aria-label="Удалить выбранный заказ"
                disabled={!selectedOrder}
                onClick={async () => {
                  if (!selectedOrder) return;
                  try {
                    await orderHandlers.handleDeleteOrder(selectedOrder.id);
                  } catch (e: any) {
                    alert('Не удалось удалить заказ. Возможно нужна авторизация.');
                  }
                }}
              >🗑️</button>
            </div>
            
        <h2>Заказы</h2>
            
            <MemoizedOrderList
              orders={orders}
              selectedId={selectedId}
              statuses={statuses}
              onSelect={setSelectedId}
            />
            
            {currentUser?.role === 'admin' && (
              <button
                className="add-order-btn"
                style={{ marginTop: 8 }}
                onClick={() => handleOpenCalculator()}
              >
                🧮 Калькулятор
              </button>
            )}
          </aside>

          <section className="detail">
            {selectedOrder ? (
              <OrderDetailSection
                selectedOrder={selectedOrder}
                statuses={statuses}
                contextDate={contextDate}
                contextUserId={contextUserId}
                currentUser={currentUser}
                allUsers={allUsers}
                onDateChange={handleDateChange}
                onUserIdChange={setContextUserId}
                onStatusChange={orderHandlers.handleStatusChange}
                onLoadOrders={loadOrders}
                onShowFilesModal={handleShowFilesModal}
                onShowPrepaymentModal={handleShowPrepaymentModal}
                onShowPresets={handleShowPresets}
                onOpenCalculator={handleOpenCalculator}
                onShowPaperTypesManager={handleShowPaperTypesManager}
                onEditOrderItem={handleOpenCalculatorForEdit}
                onGetDailyReportByDate={handleGetDailyReportByDate}
                onCreateDailyReport={handleCreateDailyReport}
              />
            ) : (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <p>Выберите заказ слева</p>
                {selectedId && (
                  <div style={{ marginTop: '10px', color: '#666', fontSize: '14px' }}>
                    <p>Заказ с ID {selectedId} не найден в списке</p>
                    <p>Всего заказов: {orders.length}</p>
                    <button 
                      onClick={() => setSelectedId(null)}
                      style={{ 
                        marginTop: '10px', 
                        padding: '8px 16px', 
                        backgroundColor: '#f5f5f5', 
                        border: '1px solid #ddd', 
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      Сбросить выбор
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}


      {/* Модальные окна */}
      {showAddItem && selectedOrder && (
        <AddItemModal
          order={selectedOrder}
          allowedCategories={[ 'Листовки' ]}
          initialCategory={'Листовки'}
          onSave={() => {
            setShowAddItem(false);
            loadOrders();
          }}
          onClose={() => setShowAddItem(false)}
        />
      )}


      {showPresets && (
        <ManagePresetsModal
          onClose={() => setShowPresets(false)}
          onSave={() => setShowPresets(false)}
        />
      )}

      {showPrepaymentModal && selectedOrder && (
        <PrepaymentModal
          isOpen={showPrepaymentModal}
          onClose={() => setShowPrepaymentModal(false)}
          orderId={selectedOrder.id}
          orderNumber={selectedOrder.number}
          currentAmount={selectedOrder.prepaymentAmount}
          currentPaymentMethod={selectedOrder.paymentMethod === 'telegram' ? 'online' : selectedOrder.paymentMethod}
          currentEmail={selectedOrder.customerEmail || ''}
          onPrepaymentCreated={async (amount, email, paymentMethod) => {
            try {
              const normalizedMethod = paymentMethod === 'telegram' ? 'online' : paymentMethod;
              const res = await createPrepaymentLink(selectedOrder.id, amount, normalizedMethod);
              await loadOrders();
              setPrepayAmount(String(amount));
              const isEditing = selectedOrder.prepaymentAmount && selectedOrder.prepaymentAmount > 0;
              const actionText = isEditing ? 'изменена' : 'создана';
              
              if (amount === 0) {
                toast.info('Предоплата убрана с заказа');
              } else if (paymentMethod === 'online') {
                toast.success(
                  `Онлайн предоплата ${actionText}`,
                  `Сумма: ${amount} BYN. Ссылка отправлена на ${email}`
                );
              } else {
                toast.success(
                  `Оффлайн предоплата ${actionText}`,
                  `Сумма: ${amount} BYN. Оплата отмечена как полученная в кассе`
                );
              }
            } catch (error) {
              logger.error('Failed to create prepayment', error);
              const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
              toast.error('Ошибка создания предоплаты', errorMessage);
            }
          }}
        />
      )}

      {/* Админ-страницы теперь доступны через /adminpanel */}
      
      {/* Все админ функции теперь доступны через /adminpanel */}

      {/* Калькулятор типографии (feature-flagged) */}
      <FeatureFlaggedCalculator
        isOpen={showPrintingCalculator}
        onClose={closeCalculator}
        onAddToOrder={orderHandlers.handleAddToOrder}
        initialProductType={calculatorContext.initialProductType}
        initialProductId={calculatorContext.initialProductId}
        editContext={
          calculatorContext.mode === 'edit' && calculatorContext.item && calculatorContext.orderId
            ? { orderId: calculatorContext.orderId, item: calculatorContext.item }
            : undefined
        }
        onSubmitExisting={calculatorContext.mode === 'edit' ? orderHandlers.handleReplaceOrderItem : undefined}
      />

      {/* Настройки калькулятора - теперь это страница, а не модальное окно */}

      {/* Управление типами бумаги */}
      <PaperTypesManager
        isOpen={showPaperTypesManager}
        onClose={() => setShowPaperTypesManager(false)}
      />


      {/* Модальное окно файлов макетов */}
      <FilesModal
        isOpen={showFilesModal}
        onClose={() => setShowFilesModal(false)}
        orderId={selectedOrder?.id || 0}
        orderNumber={selectedOrder?.number || ''}
      />

      {/* Модальное окно предоплаты */}



      {/* Стили для заглушек */}
      <style>{`
        .admin-page {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #f5f5f5;
          z-index: 1000;
          overflow-y: auto;
        }
        .admin-page-header {
          background: white;
          padding: 20px;
          border-bottom: 1px solid #ddd;
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .back-btn {
          background: #007bff;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 5px;
          cursor: pointer;
          font-size: 14px;
        }
        .back-btn:hover {
          background: #0056b3;
        }
        .admin-page-content {
          padding: 40px;
          text-align: center;
        }
        .admin-page-content p {
          font-size: 18px;
          color: #666;
        }

        /* Стили для новой системы управления заказами */
        .new-order-management-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        
        .new-order-management-container {
          background: white;
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          max-width: 95vw;
          max-height: 95vh;
          width: 100%;
          height: 95vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        
        .new-order-management-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px 24px;
          background: #f8f9fa;
          border-bottom: 1px solid #dee2e6;
          flex-shrink: 0;
        }
        
        .new-order-management-header h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #333;
        }
        
        .new-order-management-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
        }
        
        .close-btn {
          background: #f44336;
          border: none;
          font-size: 20px;
          color: white;
          cursor: pointer;
          padding: 8px;
          border-radius: 50%;
          transition: all 0.2s ease;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        
        .close-btn:hover {
          background: #d32f2f;
          transform: scale(1.1);
        }
        
        /* Компактное модальное окно для выбора даты */
        .date-switcher-modal {
          background: white;
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          max-width: 500px;
          width: 90vw;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
      `}</style>

      {/* Управление заказами */}
      {(showOrderPool || showUserOrderPage) && (
        <div className="new-order-management-overlay">
          <div className="new-order-management-container">
            <div className="new-order-management-header">
              <div className="flex items-center gap-4">
                <h2>📋 Управление заказами</h2>
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setOrderManagementTab('pool')}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      orderManagementTab === 'pool'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    📋 Пул заказов
                  </button>
                  <button
                    onClick={() => setOrderManagementTab('page')}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      orderManagementTab === 'page'
                        ? 'bg-white text-green-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    📄 Мои заказы
                  </button>
                </div>
              </div>
              <button 
                className="close-btn"
                onClick={() => {
                  setShowOrderPool(false);
                  setShowUserOrderPage(false);
                }}
              >
                ×
              </button>
            </div>
            <div className="new-order-management-content">
              {orderManagementTab === 'pool' && (
                <OrderPool 
                  currentUserId={currentUser?.id || 0}
                  currentUserName={currentUser?.name || ''}
                  onOrderAssigned={() => {
                    setOrderManagementTab('page');
                    toast.success('Заказ успешно назначен!');
                  }}
                />
              )}
              {orderManagementTab === 'page' && (
                <UserOrderPage 
                  userId={currentUser?.id || 0}
                  date={contextDate}
                  isAdmin={currentUser?.role === 'admin'}
                  onDateChange={(newDate) => setContextDate(newDate)}
                />
              )}
            </div>
          </div>
        </div>
      )}


      {/* Страница счетчиков */}
      {showCountersPage && (
        <div className="new-order-management-overlay">
          <div className="new-order-management-container">
            <div className="new-order-management-header">
              <h2>📊 Счётчики принтеров и кассы</h2>
              <button 
                className="close-btn"
                onClick={() => setShowCountersPage(false)}
              >
                ✕
              </button>
            </div>
            <div className="new-order-management-content">
              <CountersPage />
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно выбора даты */}
      <DateSwitchContainer
        currentDate={contextDate}
        contextUserId={contextUserId}
        currentUser={currentUser}
        onDateChange={handleDateChange}
        onOrdersChange={setOrders}
        onSelectedIdChange={setSelectedId}
        selectedId={selectedId}
        isVisible={showPageSwitcher}
        onClose={() => setShowPageSwitcher(false)}
      />
    </div>
  );
};
