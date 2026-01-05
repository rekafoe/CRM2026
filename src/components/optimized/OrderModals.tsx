import React from 'react';
import { Order } from '../../types';
import AddItemModal from '../AddItemModal';
import { PrepaymentModal } from '../PrepaymentModal';
import { FilesModal } from '../FilesModal';

interface OrderModalsProps {
  // Modal states
  showAddItem: boolean;
  showPrepaymentModal: boolean;
  showFilesModal: boolean;
  
  // Data
  selectedOrder: Order | null;
  prepayAmount: string;
  
  // Handlers
  onCloseAddItem: () => void;
  onClosePrepaymentModal: () => void;
  onCloseFilesModal: () => void;
  onLoadOrders: () => void;
  onPrepaymentCreated: (amount: number, email: string, paymentMethod: string) => Promise<void>;
}

export const OrderModals: React.FC<OrderModalsProps> = ({
  showAddItem,
  showPrepaymentModal,
  showFilesModal,
  selectedOrder,
  prepayAmount,
  onCloseAddItem,
  onClosePrepaymentModal,
  onCloseFilesModal,
  onLoadOrders,
  onPrepaymentCreated,
}) => {
  return (
    <>
      {/* Добавление позиции в заказ */}
      {showAddItem && selectedOrder && (
        <AddItemModal
          order={selectedOrder}
          allowedCategories={['Листовки']}
          initialCategory={'Листовки'}
          onSave={() => {
            onCloseAddItem();
            onLoadOrders();
          }}
          onClose={onCloseAddItem}
        />
      )}

      {/* Предоплата */}
      {showPrepaymentModal && selectedOrder && (
        <PrepaymentModal
          isOpen={showPrepaymentModal}
          onClose={onClosePrepaymentModal}
          orderId={selectedOrder.id}
          orderNumber={selectedOrder.number}
          currentAmount={selectedOrder.prepaymentAmount}
          currentPaymentMethod={selectedOrder.paymentMethod === 'telegram' ? 'online' : selectedOrder.paymentMethod}
          currentEmail={selectedOrder.customerEmail || ''}
          onPrepaymentCreated={onPrepaymentCreated}
        />
      )}

      {/* Файлы макетов */}
      <FilesModal
        isOpen={showFilesModal}
        onClose={onCloseFilesModal}
        orderId={selectedOrder?.id || 0}
        orderNumber={selectedOrder?.number || ''}
      />

    </>
  );
};
