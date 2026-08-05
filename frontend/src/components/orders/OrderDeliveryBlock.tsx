import type { WebsiteOrderDelivery } from '../../types/websiteOrderDelivery';
import './OrderDeliveryBlock.css';

const KIND_LABELS: Record<string, string> = {
  pickup: 'Самовывоз',
  courier_minsk: 'Курьер по Минску',
  pickup_point: 'Пункт выдачи',
  courier_country: 'Доставка по Беларуси',
  other: 'Доставка',
};

type Props = {
  delivery: WebsiteOrderDelivery;
  compact?: boolean;
};

function sanitizeDeliveryLabel(value: string | null | undefined): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  const withoutPickupCodeTail = raw
    .replace(/\s*\(\s*pickup-[^)]+\s*\)\s*$/i, '')
    .trim();
  if (withoutPickupCodeTail) return withoutPickupCodeTail;
  if (/^pickup-[a-z0-9_-]+$/i.test(raw)) return '';
  return raw;
}

function formatCost(delivery: WebsiteOrderDelivery): string | null {
  if (delivery.cost != null && Number.isFinite(delivery.cost)) {
    return `${delivery.cost.toFixed(2)} BYN`;
  }
  return delivery.costLabel ?? null;
}

function addressLabel(kind: string): string {
  if (kind === 'pickup') return 'Точка самовывоза';
  if (kind === 'pickup_point') return 'Пункт выдачи';
  if (kind === 'courier_minsk' || kind === 'courier_country') return 'Куда доставить';
  return 'Адрес';
}

/** Для самовывоза адрес часто лежит в label; для доставки — в address. */
function resolveLocation(delivery: WebsiteOrderDelivery, label: string): string | null {
  const address = typeof delivery.address === 'string' ? delivery.address.trim() : '';
  if (address) return address;
  if (delivery.kind === 'pickup' && label) {
    return label;
  }
  return null;
}

export function OrderDeliveryBlock({ delivery, compact }: Props) {
  const label = sanitizeDeliveryLabel(delivery.label);
  const kindLabel = KIND_LABELS[delivery.kind] ?? delivery.kind;
  const cost = formatCost(delivery);
  const location = resolveLocation(delivery, label);
  const showVariant =
    delivery.kind !== 'pickup'
    && Boolean(label)
    && label !== location;

  if (compact) {
    return (
      <span className="order-delivery-block order-delivery-block--compact">
        {kindLabel}
        {location ? `: ${location}` : label ? `: ${label}` : ''}
        {cost ? ` (${cost})` : ''}
      </span>
    );
  }

  return (
    <div className="order-delivery-block">
      <div className="order-delivery-block__title">Получение</div>
      <dl className="order-delivery-block__list">
        <div className="order-delivery-block__row">
          <dt>Способ</dt>
          <dd>{kindLabel}</dd>
        </div>
        {showVariant ? (
          <div className="order-delivery-block__row">
            <dt>Вариант</dt>
            <dd>{label}</dd>
          </div>
        ) : null}
        {location ? (
          <div className="order-delivery-block__row order-delivery-block__row--emphasis">
            <dt>{addressLabel(delivery.kind)}</dt>
            <dd>{location}</dd>
          </div>
        ) : null}
        {delivery.description ? (
          <div className="order-delivery-block__row">
            <dt>Комментарий</dt>
            <dd>{delivery.description}</dd>
          </div>
        ) : null}
        {cost ? (
          <div className="order-delivery-block__row">
            <dt>Стоимость</dt>
            <dd>{cost}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
