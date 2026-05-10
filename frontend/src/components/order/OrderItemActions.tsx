import React from 'react';
import { Item } from '../../types';
import { AppIcon } from '../ui/AppIcon';

interface OrderItemActionsProps {
  editing: boolean;
  onEditParameters?: (orderId: number, item: Item) => void;
  orderId: number;
  item: Item;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  /** Компактная шапка: как кнопки шапки заказа — иконки карандаш / корзина */
  variant?: 'default' | 'compact';
}

/** Кнопки позиции: сохранение при редактировании или Редактировать / Удалить (компактно — как на странице заказа). */
export const OrderItemActions: React.FC<OrderItemActionsProps> = React.memo(
  ({ editing, onEditParameters, orderId, item, onSave, onCancel, onDelete, variant = 'default' }) => {
    const compact = variant === 'compact';

    if (editing) {
      return (
        <div className={`order-item-actions${compact ? ' order-item-actions--compact' : ''}`}>
          <button type="button" className="order-item-btn order-item-btn--primary" onClick={onSave}>
            Сохранить
          </button>
          <button type="button" className="order-item-btn order-item-btn--neutral" onClick={onCancel}>
            Отмена
          </button>
        </div>
      );
    }

    return (
      <div className={`order-item-actions${compact ? ' order-item-actions--compact' : ''}`}>
        {onEditParameters &&
          (compact ? (
            <button
              type="button"
              className="order-item-toolbar-btn order-item-toolbar-btn--primary"
              onClick={() => onEditParameters(orderId, item)}
              title="Редактировать параметры позиции"
              aria-label="Редактировать параметры позиции"
            >
              <AppIcon name="pencil" size="sm" />
            </button>
          ) : (
            <button
              type="button"
              className="order-item-btn order-item-btn--primary"
              onClick={() => onEditParameters(orderId, item)}
            >
              Редактировать
            </button>
          ))}
        {compact ? (
          <button
            type="button"
            className="order-item-toolbar-btn order-item-toolbar-btn--danger"
            onClick={onDelete}
            title="Удалить позицию"
            aria-label="Удалить позицию"
          >
            <AppIcon name="trash" size="sm" />
          </button>
        ) : (
          <button type="button" className="order-item-btn order-item-btn--danger" onClick={onDelete}>
            Удалить
          </button>
        )}
      </div>
    );
  }
);

OrderItemActions.displayName = 'OrderItemActions';
