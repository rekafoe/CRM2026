import React from 'react';
import { Order } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import {
  formatPoolDateTimeFull,
  getEffectiveResponsibleUserId,
  getOrderReadyLabel,
  getSourceLabel,
} from './orderPoolUtils';

interface OrderPoolDetailHeaderProps {
  order: Order;
  currentUserId: number;
  allUsers: Array<{ id: number; name: string }>;
  onResponsibleChange: (userId: number | null) => void;
  onAssignToMe: () => void;
  onShowFiles: () => void;
  onShowPrepayment: () => void;
  onSendPaymentLink: () => void;
  onRemovePrepayment: () => void;
  onIssueOrder: () => void;
  onCancelOrder: () => void;
  onPermanentDelete: () => void;
  onCopyPhone?: (phone: string) => void;
  showRemovePrepayment: boolean;
  showIssueOrder: boolean;
  showCancelOrder: boolean;
  showPermanentDelete: boolean;
  issuing: boolean;
}

export const OrderPoolDetailHeader: React.FC<OrderPoolDetailHeaderProps> = ({
  order,
  currentUserId,
  allUsers,
  onResponsibleChange,
  onAssignToMe,
  onShowFiles,
  onShowPrepayment,
  onSendPaymentLink,
  onRemovePrepayment,
  onIssueOrder,
  onCancelOrder,
  onPermanentDelete,
  onCopyPhone,
  showRemovePrepayment,
  showIssueOrder,
  showCancelOrder,
  showPermanentDelete,
  issuing,
}) => {
  const responsibleId = getEffectiveResponsibleUserId(order);
  const canReassign = Number(order.status) === 0 || Number(order.status) === 1;
  const showCancelled = order.is_cancelled === 1;
  const readiness = getOrderReadyLabel(order);
  const needsAssign = canReassign && responsibleId !== currentUserId;
  const createdAt = order.created_at ?? (order as { createdAt?: string }).createdAt;
  const createdLabel = formatPoolDateTimeFull(createdAt);

  return (
    <div className="order-pool-detail-header">
      <div className="order-pool-detail-header__top">
        <div className="order-pool-detail-header__titles">
          <div className="order-pool-detail-header__number-row">
            <h2 className="order-pool-detail-header__number">{order.number}</h2>
            {showCancelled && <StatusBadge status="Отменён" color="error" size="sm" />}
            {order.source && (
              <StatusBadge status={getSourceLabel(order.source)} color="info" size="sm" />
            )}
          </div>
          <div className="order-pool-detail-header__client-row">
            <span className="order-pool-detail-header__client">
              {order.customerName || 'Клиент не указан'}
            </span>
            {order.customerPhone ? (
              <button
                type="button"
                className="order-pool-detail-header__phone-btn"
                title="Скопировать телефон"
                onClick={() => onCopyPhone?.(order.customerPhone!)}
              >
                {order.customerPhone}
              </button>
            ) : (
              <span className="order-pool-detail-header__phone">—</span>
            )}
          </div>
          <div className="order-pool-detail-header__dates">
            <p className="order-pool-detail-header__date-row">
              Оформлен: <strong>{createdLabel}</strong>
            </p>
            <p className="order-pool-detail-header__date-row order-pool-detail-header__readiness">
              Готовность: <strong>{readiness.readyAtLabel}</strong>
              {readiness.label ? <span className="order-pool-detail-header__ready-hint"> · {readiness.label}</span> : null}
            </p>
          </div>
        </div>

        {needsAssign && (
          <Button
            type="button"
            variant="success"
            className="order-pool-detail-header__take-primary"
            onClick={onAssignToMe}
          >
            Взять в работу
          </Button>
        )}
      </div>

      <div className="order-detail-responsible">
        <label htmlFor="order-pool-responsible">
          Ответственный
          <select
            id="order-pool-responsible"
            value={responsibleId ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') {
                if (responsibleId != null) onResponsibleChange(null);
                return;
              }
              const uid = Number(v);
              if (uid === responsibleId) return;
              onResponsibleChange(uid);
            }}
            disabled={!canReassign}
            title={
              !canReassign
                ? 'Переназначить можно только при статусе «Ожидает» (0 или 1)'
                : undefined
            }
          >
            <option value="">— Не назначен</option>
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="order-detail-actions" role="toolbar" aria-label="Действия по заказу">
        <Button type="button" variant="secondary" size="sm" onClick={onShowFiles}>
          Файлы
        </Button>
        <Button type="button" variant="success" size="sm" onClick={onShowPrepayment}>
          Предоплата
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onSendPaymentLink}
          title="Создать ссылку BePaid и отправить клиенту"
        >
          Ссылка на оплату
        </Button>
        {showIssueOrder && (
          <Button
            type="button"
            variant="success"
            size="sm"
            onClick={onIssueOrder}
            disabled={issuing}
            loading={issuing}
          >
            {issuing ? 'Выдача…' : 'Выдать'}
          </Button>
        )}
        {showRemovePrepayment && (
          <Button type="button" variant="error" size="sm" onClick={onRemovePrepayment}>
            Снять предоплату
          </Button>
        )}
        {showCancelOrder && (
          <Button type="button" variant="warning" size="sm" onClick={onCancelOrder}>
            Отменить
          </Button>
        )}
        {showPermanentDelete && (
          <Button type="button" variant="error" size="sm" onClick={onPermanentDelete}>
            Удалить из базы
          </Button>
        )}
      </div>
    </div>
  );
};
