import React, { Suspense, lazy } from 'react';
import { Order } from '../../types';

const OrderModals = lazy(() => import('./OrderModals').then(m => ({ default: m.OrderModals })));
const ManagementModals = lazy(() => import('./ManagementModals').then(m => ({ default: m.ManagementModals })));
const PageModals = lazy(() => import('./PageModals').then(m => ({ default: m.PageModals })));

interface ModalsContainerProps {
  // Modal states
  showAddItem: boolean;
  showPrepaymentModal: boolean;
  showPrintingCalculator: boolean;
  showFilesModal: boolean;
  showOrderPool: boolean;
  showUserOrderPage: boolean;
  showCountersPage: boolean;
  showPageSwitcher: boolean;
  orderManagementTab: 'pool' | 'page';

  // Data
  selectedOrder: Order | null;
  currentUser: { id: number; name: string; role: string } | null;
  contextDate: string;
  contextUserId: number | null;
  orders: Order[];
  selectedId: number | null;
  prepayAmount: string;

  // Handlers
  onCloseAddItem: () => void;
  onClosePrepaymentModal: () => void;
  onClosePrintingCalculator: () => void;
  onCloseFilesModal: () => void;
  onCloseOrderPool: () => void;
  onCloseUserOrderPage: () => void;
  onCloseCountersPage: () => void;
  onClosePageSwitcher: () => void;
  onSetOrderManagementTab: (tab: 'pool' | 'page') => void;
  onSetShowOrderPool: (show: boolean) => void;
  onSetShowUserOrderPage: (show: boolean) => void;
  onSetShowPageSwitcher: (show: boolean) => void;
  onSetPrepayAmount: (amount: string) => void;
  onLoadOrders: () => void;
  onAddToOrder: (item: any) => Promise<void>;
  onDateChange: (date: string) => void;
  onOrdersChange: (orders: Order[]) => void;
  onSelectedIdChange: (id: number | null) => void;
  onPrepaymentCreated: (amount: number, email: string, paymentMethod: string) => Promise<void>;
}

export const ModalsContainer: React.FC<ModalsContainerProps> = ({
  showAddItem,
  showPrepaymentModal,
  showPrintingCalculator,
  showFilesModal,
  showOrderPool,
  showUserOrderPage,
  showCountersPage,
  showPageSwitcher,
  orderManagementTab,
  selectedOrder,
  currentUser,
  contextDate,
  contextUserId,
  orders,
  selectedId,
  prepayAmount,
  onCloseAddItem,
  onClosePrepaymentModal,
  onClosePrintingCalculator,
  onCloseFilesModal,
  onCloseOrderPool,
  onCloseUserOrderPage,
  onCloseCountersPage,
  onClosePageSwitcher,
  onSetOrderManagementTab,
  onSetShowOrderPool,
  onSetShowUserOrderPage,
  onSetShowPageSwitcher,
  onSetPrepayAmount,
  onLoadOrders,
  onAddToOrder,
  onDateChange,
  onOrdersChange,
  onSelectedIdChange,
  onPrepaymentCreated,
}) => {
  return (
    <Suspense fallback={null}>
      <OrderModals
        showAddItem={showAddItem}
        showPrepaymentModal={showPrepaymentModal}
        showFilesModal={showFilesModal}
        selectedOrder={selectedOrder}
        prepayAmount={prepayAmount}
        onCloseAddItem={onCloseAddItem}
        onClosePrepaymentModal={onClosePrepaymentModal}
        onCloseFilesModal={onCloseFilesModal}
        onLoadOrders={onLoadOrders}
        onPrepaymentCreated={onPrepaymentCreated}
      />

      <ManagementModals
        showPrintingCalculator={showPrintingCalculator}
        currentUser={currentUser}
        onClosePrintingCalculator={onClosePrintingCalculator}
        onAddToOrder={onAddToOrder}
      />

      <PageModals
        showOrderPool={showOrderPool}
        showUserOrderPage={showUserOrderPage}
        showCountersPage={showCountersPage}
        showPageSwitcher={showPageSwitcher}
        orderManagementTab={orderManagementTab}
        currentUser={currentUser}
        contextDate={contextDate}
        contextUserId={contextUserId}
        orders={orders}
        selectedId={selectedId}
        onCloseOrderPool={onCloseOrderPool}
        onCloseUserOrderPage={onCloseUserOrderPage}
        onCloseCountersPage={onCloseCountersPage}
        onClosePageSwitcher={onClosePageSwitcher}
        onSetOrderManagementTab={onSetOrderManagementTab}
        onDateChange={onDateChange}
        onOrdersChange={onOrdersChange}
        onSelectedIdChange={onSelectedIdChange}
      />
    </Suspense>
  );
};
