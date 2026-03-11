import React from 'react';
import { OrderPool } from '../orders/OrderPool';
import { UserOrderPage } from '../orders/UserOrderPage';
import { CountersPage } from '../../pages/CountersPage';
import { DateSwitchContainer } from '../orders/DateSwitchContainer';
import { AppIcon } from '../ui/AppIcon';
import type { Order } from '../../types';

interface PageModalsProps {
  // Modal states
  showOrderPool: boolean;
  showUserOrderPage: boolean;
  showCountersPage: boolean;
  showPageSwitcher: boolean;
  orderManagementTab: 'pool' | 'page';
  
  // Data
  currentUser: { id: number; name: string; role: string } | null;
  contextDate: string;
  contextUserId: number | null;
  orders: Order[];
  selectedId: number | null;
  
  // Handlers
  onCloseOrderPool: () => void;
  onCloseUserOrderPage: () => void;
  onCloseCountersPage: () => void;
  onClosePageSwitcher: () => void;
  onSetOrderManagementTab: (tab: 'pool' | 'page') => void;
  onDateChange: (date: string) => void;
  onOrdersChange: (orders: Order[]) => void;
  onSelectedIdChange: (id: number | null) => void;
}

export const PageModals: React.FC<PageModalsProps> = ({
  showOrderPool,
  showUserOrderPage,
  showCountersPage,
  showPageSwitcher,
  orderManagementTab,
  currentUser,
  contextDate,
  contextUserId,
  orders,
  selectedId,
  onCloseOrderPool,
  onCloseUserOrderPage,
  onCloseCountersPage,
  onClosePageSwitcher,
  onSetOrderManagementTab,
  onDateChange,
  onOrdersChange,
  onSelectedIdChange,
}) => {
  return (
    <>
      {/* Управление заказами */}
      {(showOrderPool || showUserOrderPage) && (
        <div className="new-order-management-overlay">
          <div className="new-order-management-container">
            <div className="new-order-management-header">
              <div className="flex items-center gap-4">
                <h2>📋 Управление заказами</h2>
                <div className="tab-switcher">
                  <button
                    onClick={() => onSetOrderManagementTab('pool')}
                    className={orderManagementTab === 'pool' ? 'active' : ''}
                  >
                    📋 Пул заказов
                  </button>
                  <button
                    onClick={() => onSetOrderManagementTab('page')}
                    className={orderManagementTab === 'page' ? 'active' : ''}
                  >
                    📄 Мои заказы
                  </button>
                </div>
              </div>
              <button
                className="close-btn"
                onClick={() => {
                  onCloseOrderPool();
                  onCloseUserOrderPage();
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
                    onSetOrderManagementTab('page');
                  }}
                />
              )}
              {orderManagementTab === 'page' && (
                <UserOrderPage
                  userId={currentUser?.id || 0}
                  date={contextDate}
                  isAdmin={currentUser?.role === 'admin'}
                  onDateChange={onDateChange}
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
              <h2><AppIcon name="chart-bar" size="sm" /> Счётчики принтеров и кассы</h2>
              <button
                className="close-btn"
                onClick={onCloseCountersPage}
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
        onDateChange={onDateChange}
        onOrdersChange={onOrdersChange}
        onSelectedIdChange={onSelectedIdChange}
        selectedId={selectedId}
        isVisible={showPageSwitcher}
        onClose={onClosePageSwitcher}
      />
    </>
  );
};
