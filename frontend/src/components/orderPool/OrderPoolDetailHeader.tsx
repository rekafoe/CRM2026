import React, { useState } from 'react';
import { Order } from '../../types';
import { StatusBadge } from '../common/StatusBadge';
import { Button } from '../common/Button';
import { AssignableUserSelect } from '../orders/AssignableUserSelect';
import { OrderTransferModal } from '../orders/OrderTransferModal';
import type { AssignableUser, Department } from '../../api';
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
  assignableOnShift?: AssignableUser[];
  assignableAll?: AssignableUser[];
  departments?: Department[];
  assignableDate?: string;
  onResponsibleChange: (userId: number | null) => void;
  onTransferred?: (order: Order) => void;
  onTransferError?: (message: string) => void;
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
  assignableOnShift = [],
  assignableAll = [],
  departments = [],
  assignableDate,
  onResponsibleChange,
  onTransferred,
  onTransferError,
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
  const [transferOpen, setTransferOpen] = useState(false);
  const responsibleId = getEffectiveResponsibleUserId(order);
  const canReassign = Number(order.status) === 0 || Number(order.status) === 1;
  const showCancelled = order.is_cancelled === 1;
  const readiness = getOrderReadyLabel(order);
  const needsAssign = canReassign && responsibleId !== currentUserId;
  const createdAt = order.created_at ?? (order as { createdAt?: string }).createdAt;
  const createdLabel = formatPoolDateTimeFull(createdAt);
  const roleOnShift = assignableOnShift.length > 0 ? assignableOnShift : allUsers;
  const roleAll = assignableAll.length > 0 ? assignableAll : allUsers;

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

      <div className="order-detail-responsible order-detail-responsible--with-transfer">
        <label htmlFor="order-pool-responsible">
          Ответственный
          <AssignableUserSelect
            id="order-pool-responsible"
            value={responsibleId}
            onChange={(uid) => {
              if (uid == null) {
                if (responsibleId != null) onResponsibleChange(null);
                return;
              }
              if (uid === responsibleId) return;
              onResponsibleChange(uid);
            }}
            onShift={roleOnShift}
            all={roleAll}
            emptyLabel="— Не назначен"
            disabled={!canReassign}
            title={
              !canReassign
                ? 'Переназначить можно только при статусе «Ожидает» (0 или 1)'
                : undefined
            }
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setTransferOpen(true)}
          title="Передать коллеге или в другой павильон"
        >
          Передать
        </Button>
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

      <OrderTransferModal
        isOpen={transferOpen}
        onClose={() => setTransferOpen(false)}
        order={order}
        departments={departments}
        date={assignableDate}
        onTransferred={(updated) => onTransferred?.(updated)}
        onError={onTransferError}
      />
    </div>
  );
};
