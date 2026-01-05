import React from 'react';
import { Order, Item } from '../../types';
import { ProgressBar } from '../order/ProgressBar';
import { OrderTotal } from '../order/OrderTotal';
import { OrderHeader } from './OrderHeader';
import { OrderMeta } from './OrderMeta';
import { OrderActions } from './OrderActions';
import { OrderContent } from './OrderContent';

interface DetailSectionProps {
  selectedOrder: Order | null;
  contextDate: string;
  contextUserId: number | null;
  currentUser: { id: number; name: string; role: string } | null;
  allUsers: Array<{ id: number; name: string }>;
  statuses: Array<{ id: number; name: string; color?: string; sort_order: number }>;
  selectedId: number | null;
  orders: Order[];
  onUpdateOrderStatus: (orderId: number, newStatus: number) => Promise<void>;
  onShowFilesModal: () => void;
  onShowPrepaymentModal: () => void;
  onShowProductSelector: () => void;
  onDateChange: (date: string) => void;
  onUserChange: (userId: number | null) => void;
  onSetSelectedId: (id: number | null) => void;
  onLoadOrders: () => void;
  onEditOrderItem: (orderId: number, item: Item) => void;
}

export const DetailSection: React.FC<DetailSectionProps> = ({
  selectedOrder,
  contextDate,
  contextUserId,
  currentUser,
  allUsers,
  statuses,
  selectedId,
  orders,
  onUpdateOrderStatus,
  onShowFilesModal,
  onShowPrepaymentModal,
  onShowProductSelector,
  onDateChange,
  onUserChange,
  onSetSelectedId,
  onLoadOrders,
  onEditOrderItem,
}) => {
  if (!selectedOrder) {
    return (
      <section className="detail">
        <div className="empty-state">
          <p>Выберите заказ слева</p>
          {selectedId && (
            <div className="empty-state--error">
              <p>Заказ с ID {selectedId} не найден в списке</p>
              <p>Всего заказов: {orders.length}</p>
              <button onClick={() => onSetSelectedId(null)}>
                Сбросить выбор
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="detail">
      <div className="detail-header">
        <OrderHeader
          order={selectedOrder}
          onShowFilesModal={onShowFilesModal}
          onShowPrepaymentModal={onShowPrepaymentModal}
        />
        <OrderMeta
          contextDate={contextDate}
          contextUserId={contextUserId}
          currentUser={currentUser}
          allUsers={allUsers}
          onDateChange={onDateChange}
          onUserChange={onUserChange}
        />
        <OrderActions
          order={selectedOrder}
          statuses={statuses}
          onUpdateOrderStatus={onUpdateOrderStatus}
          onShowProductSelector={onShowProductSelector}
        />
      </div>

      <ProgressBar
        current={selectedOrder.status}
        statuses={statuses}
        onStatusChange={async (newStatus) => {
          await onUpdateOrderStatus(selectedOrder.id, newStatus);
        }}
        height="12px"
      />

      <OrderContent
        order={selectedOrder}
        onLoadOrders={onLoadOrders}
        onEditOrderItem={onEditOrderItem}
      />

      <OrderTotal
        items={selectedOrder.items.map((item) => ({
          id: item.id,
          type: item.type,
          price: item.price,
          quantity: item.quantity ?? 1,
        }))}
        discount={0}
        taxRate={0}
        prepaymentAmount={selectedOrder.prepaymentAmount}
        prepaymentStatus={selectedOrder.prepaymentStatus}
        paymentMethod={selectedOrder.paymentMethod === 'telegram' ? 'online' : selectedOrder.paymentMethod}
      />
    </section>
  );
};
