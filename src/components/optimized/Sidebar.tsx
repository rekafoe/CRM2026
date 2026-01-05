import React from 'react';
import { Order } from '../../types';
import { OrderList } from './OrderList';

interface SidebarProps {
  orders: Order[];
  selectedId: number | null;
  statuses: Array<{ id: number; name: string; color?: string; sort_order: number }>;
  isAdmin: boolean;
  onCreateOrder: () => void;
  onDeleteOrder: () => void;
  onSelectOrder: (id: number | null) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  orders,
  selectedId,
  statuses,
  isAdmin,
  onCreateOrder,
  onDeleteOrder,
  onSelectOrder,
}) => {
  return (
    <aside className="sidebar">
      <div className="sidebar-toolbar">
        <button 
          className="icon-btn" 
          title="Добавить заказ" 
          aria-label="Добавить заказ" 
          onClick={onCreateOrder}
        >
          ＋
        </button>
        <button
          className="icon-btn"
          title="Удалить выбранный заказ"
          aria-label="Удалить выбранный заказ"
          disabled={!selectedId}
          onClick={onDeleteOrder}
        >
          🗑️
        </button>
      </div>

      <h2>Заказы</h2>

      <OrderList
        orders={orders}
        selectedId={selectedId}
        statuses={statuses}
        onSelect={onSelectOrder}
      />
    </aside>
  );
};
