import React, { useEffect, useRef, useState } from 'react';
import { Order } from '../../types';
import { AssignableUserSelect } from '../orders/AssignableUserSelect';
import { OrderTransferModal } from '../orders/OrderTransferModal';
import type { AssignableUser, Department } from '../../api';
import {
  formatPoolStampDate,
  getEffectiveResponsibleUserId,
  getOrderReadyLabel,
  getPoolFulfillmentChip,
  getSourceStamp,
  poolFulfillmentShowsBanner,
} from './orderPoolUtils';
import { OrderPoolFulfillmentBanner } from './OrderPoolFulfillmentBanner';
import { isPoolOrderStatusId } from '../../hooks/useOrderStatuses';
import { OrderDeliveryBlock } from '../orders/OrderDeliveryBlock';
import { OrderPoolPaymentSummary } from './OrderPoolPaymentSummary';
import { getPoolPaymentInfo } from '../../utils/poolPaymentStatus';
import { Menu, MenuItem } from '../ui/Menu';
import { OrderStamp } from '../order/OrderStamp';
import { MoneyAmount } from '../ui';
import { AppIcon } from '../ui/AppIcon';

interface OrderPoolDetailHeaderProps {
  order: Order;
  currentUserId: number;
  total: number;
  prepay: number;
  debt: number;
  onCopyPaymentUrl: () => void;
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
  statusLabel?: string;
  children?: React.ReactNode;
}

function channelTag(channel?: string | null): string {
  switch (channel) {
    case 'invoice':
      return 'Счёт';
    case 'internal':
      return 'Внутренние';
    case 'not_cashed':
      return '';
    default:
      return 'Касса';
  }
}

function invoiceLine(channel?: string | null): string {
  return channel === 'invoice' ? 'по счёту' : 'не выставлен';
}

export const OrderPoolDetailHeader: React.FC<OrderPoolDetailHeaderProps> = ({
  order,
  total,
  prepay,
  debt,
  onCopyPaymentUrl,
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
  statusLabel,
  children,
}) => {
  const [transferOpen, setTransferOpen] = useState(false);
  const [prepayMenuOpen, setPrepayMenuOpen] = useState(false);
  const prepayMenuRef = useRef<HTMLDivElement>(null);
  const responsibleId = getEffectiveResponsibleUserId(order);
  const canReassign = isPoolOrderStatusId(Number(order.status));
  const showCancelled = order.is_cancelled === 1;
  const readiness = getOrderReadyLabel(order);
  const needsAssign = canReassign && responsibleId == null;
  const createdAt = order.created_at ?? (order as { createdAt?: string }).createdAt;
  const createdLabel = formatPoolStampDate(createdAt);
  const roleOnShift = assignableOnShift.length > 0 ? assignableOnShift : allUsers;
  const roleAll = assignableAll.length > 0 ? assignableAll : allUsers;
  const payment = getPoolPaymentInfo(order);
  const fulfillmentChip = getPoolFulfillmentChip(order);
  const showFulfillmentBanner = poolFulfillmentShowsBanner(fulfillmentChip);
  const showDeliveryDetails = Boolean(order.delivery);
  const showFulfillmentPoint = !showDeliveryDetails && Boolean(order.fulfillment_department_name);
  const sourceStamp = order.source ? getSourceStamp(order.source) : '';
  const channel = channelTag(order.payment_channel);
  const customer = order.customer;
  const isLegal = customer?.type === 'legal';
  const legalName = customer?.legal_name || customer?.company_name || '';
  const taxId = customer?.tax_id || '';
  const contactName = customer?.authorized_person || '';

  useEffect(() => {
    if (!prepayMenuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!prepayMenuRef.current?.contains(event.target as Node)) setPrepayMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPrepayMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [prepayMenuOpen]);

  return (
    <div className="order-pool-detail-header">
      <div className="pool-passport__identity">
        <div className="pool-passport__eyebrow">
          <span>Выбран</span>
          {sourceStamp ? <span>{sourceStamp}</span> : null}
          {createdLabel ? <span>{createdLabel}</span> : null}
        </div>
        <div className="pool-passport__title">
          <h2 className="order-pool-detail-header__number">{order.number}</h2>
          <OrderStamp
            status={statusLabel ? { id: Number(order.status), name: statusLabel } : { id: Number(order.status), name: '' }}
            onlineCancelled={showCancelled}
          />
        </div>
        <div className="pool-passport__tags">
          {needsAssign ? <span className="pc-order-tag pc-order-tag--open">Без ответственного</span> : null}
          {channel ? <span className="pc-order-tag">{channel}</span> : null}
          {payment.tone === 'pending' || payment.tone === 'failed' ? (
            <span className="pc-order-tag">{payment.badge}</span>
          ) : null}
        </div>

        <div className="pool-passport__section">Клиент</div>
        <div className="pc-spec-list">
          {isLegal ? (
            <>
              <div className="pc-spec-row">
                <span className="pc-spec-row__label">Юрлицо</span>
                <span className="pc-spec-row__leader" />
                <span className="pc-spec-row__value">{legalName || order.customerName || 'Не указан'}</span>
              </div>
              <div className="pc-spec-row">
                <span className="pc-spec-row__label">УНП</span>
                <span className="pc-spec-row__leader" />
                <span className="pc-spec-row__value">{taxId || '—'}</span>
              </div>
            </>
          ) : (
            <div className="pc-spec-row">
              <span className="pc-spec-row__label">Клиент</span>
              <span className="pc-spec-row__leader" />
              <span className="pc-spec-row__value">{order.customerName || 'Не указан'}</span>
            </div>
          )}
          <div className="pc-spec-row">
            <span className="pc-spec-row__label">Телефон</span>
            <span className="pc-spec-row__leader" />
            {order.customerPhone ? (
              <button
                type="button"
                className="order-pool-detail-header__phone-btn pc-spec-row__value"
                title="Скопировать телефон"
                onClick={() => onCopyPhone?.(order.customerPhone!)}
              >
                {order.customerPhone}
              </button>
            ) : (
              <span className="pc-spec-row__value">—</span>
            )}
          </div>
          {contactName ? (
            <div className="pc-spec-row">
              <span className="pc-spec-row__label">Контакт</span>
              <span className="pc-spec-row__leader" />
              <span className="pc-spec-row__value">{contactName}</span>
            </div>
          ) : null}
          <div className="pc-spec-row">
            <span className="pc-spec-row__label">Готовность</span>
            <span className="pc-spec-row__leader" />
            <span className="pc-spec-row__value">
              {readiness.readyAtLabel}
              {readiness.label ? (
                <span className={['order-pool-detail-header__ready-hint', readiness.isHourSla ? 'is-hour-sla' : ''].filter(Boolean).join(' ')}>
                  {' '}· {readiness.label}
                </span>
              ) : null}
            </span>
          </div>
        </div>

        {(showFulfillmentBanner || showDeliveryDetails || showFulfillmentPoint) ? (
          <div className="order-pool-fulfillment-row">
            <OrderPoolFulfillmentBanner
              chip={fulfillmentChip}
              size="detail"
              showHint={!showDeliveryDetails}
            />
            {showDeliveryDetails && order.delivery ? (
              <OrderDeliveryBlock delivery={order.delivery} />
            ) : null}
            {showFulfillmentPoint ? (
              <div className="order-pool-fulfillment__point">
                Точка выдачи: <strong>{order.fulfillment_department_name}</strong>
                {order.fulfillment_department_code
                  ? ` (${order.fulfillment_department_code})`
                  : ''}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="order-detail-responsible">
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
                  ? 'Переназначить можно только при статусе «Ожидает» или «Оформлен»'
                  : undefined
              }
            />
          </label>
        </div>
      </div>

      {children}

      <div className="pool-passport__section">Оплата</div>
      <div className="pc-spec-list pool-passport__pay">
        <div className="pc-spec-row pc-spec-row--total">
          <span className="pc-spec-row__label">Итого</span>
          <span className="pc-spec-row__leader" />
          <span className="pc-spec-row__value"><MoneyAmount value={total} /></span>
        </div>
        <div className="pc-spec-row">
          <span className="pc-spec-row__label">Предоплата</span>
          <span className="pc-spec-row__leader" />
          <span className="pc-spec-row__value"><MoneyAmount value={prepay} /></span>
        </div>
        <div className="pc-spec-row">
          <span className="pc-spec-row__label">Счёт</span>
          <span className="pc-spec-row__leader" />
          <span className="pc-spec-row__value">{invoiceLine(order.payment_channel)}</span>
        </div>
        <div className={`pc-spec-row${debt > 0 ? ' is-due' : ''}`}>
          <span className="pc-spec-row__label">Долг</span>
          <span className="pc-spec-row__leader" />
          <span className="pc-spec-row__value"><MoneyAmount value={debt} /></span>
        </div>
      </div>

      <OrderPoolPaymentSummary
        order={order}
        prepay={prepay}
        debt={debt}
        onCopyPaymentUrl={onCopyPaymentUrl}
        linkOnly
      />

      <div className="pool-passport__actions">
        {needsAssign && (
          <button
            type="button"
            className="lg-btn lg-btn--primary pool-passport__take"
            onClick={onAssignToMe}
          >
            <AppIcon name="user" size="xs" />
            Взять себе
          </button>
        )}
        <div className="order-detail-actions" role="toolbar" aria-label="Действия по заказу">
          <div className="pc-menu-anchor" ref={prepayMenuRef}>
            <button
              type="button"
              className="lg-btn"
              aria-expanded={prepayMenuOpen}
              aria-haspopup="menu"
              onClick={() => setPrepayMenuOpen((open) => !open)}
            >
              Предоплата ▾
            </button>
            {prepayMenuOpen ? (
              <Menu label="Предоплата">
                <MenuItem onClick={() => { setPrepayMenuOpen(false); onShowPrepayment(); }}>
                  Внести предоплату
                </MenuItem>
                <MenuItem onClick={() => { setPrepayMenuOpen(false); onSendPaymentLink(); }}>
                  Ссылка на оплату · BePaid
                </MenuItem>
              </Menu>
            ) : null}
          </div>
          <button type="button" className="lg-btn" onClick={onShowFiles}>
            <AppIcon name="folder" size="xs" />
            Файлы
          </button>
          <button
            type="button"
            className={`lg-btn${fulfillmentChip?.variant === 'pickup' ? ' lg-btn--primary' : ''}`}
            onClick={() => setTransferOpen(true)}
            title={
              fulfillmentChip?.variant === 'pickup'
                ? `Передать заказ на точку «${fulfillmentChip.pointName}»`
                : 'Передать коллеге или в другой павильон'
            }
          >
            {fulfillmentChip?.variant === 'pickup'
              ? `Передать на ${fulfillmentChip.pointName}`
              : (
                <>
                  <span aria-hidden="true">→</span>
                  {' '}Передать
                </>
              )}
          </button>
          {showCancelOrder && (
            <button type="button" className="lg-btn lg-btn--danger" onClick={onCancelOrder}>
              <AppIcon name="x" size="xs" />
              Отменить
            </button>
          )}
          {showIssueOrder && (
            <button
              type="button"
              className="lg-btn"
              onClick={onIssueOrder}
              disabled={issuing}
            >
              {issuing ? 'Выдача…' : 'Выдать'}
            </button>
          )}
          {showRemovePrepayment && (
            <button type="button" className="lg-btn lg-btn--danger" onClick={onRemovePrepayment}>
              Снять предоплату
            </button>
          )}
          {showPermanentDelete && (
            <button type="button" className="lg-btn lg-btn--danger" onClick={onPermanentDelete}>
              Удалить из базы
            </button>
          )}
        </div>
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
