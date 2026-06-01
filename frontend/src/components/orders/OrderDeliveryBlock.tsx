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

function formatCost(delivery: WebsiteOrderDelivery): string | null {
  if (delivery.cost != null && Number.isFinite(delivery.cost)) {
    return `${delivery.cost.toFixed(2)} BYN`;
  }
  return delivery.costLabel ?? null;
}

export function OrderDeliveryBlock({ delivery, compact }: Props) {
  const kindLabel = KIND_LABELS[delivery.kind] ?? delivery.kind;
  const cost = formatCost(delivery);

  if (compact) {
    return (
      <span className="order-delivery-block order-delivery-block--compact">
        {kindLabel}: {delivery.label}
        {cost ? ` (${cost})` : ''}
      </span>
    );
  }

  return (
    <div className="order-delivery-block">
      <div className="order-delivery-block__title">Способ получения</div>
      <dl className="order-delivery-block__list">
        <div className="order-delivery-block__row">
          <dt>Тип</dt>
          <dd>{kindLabel}</dd>
        </div>
        <div className="order-delivery-block__row">
          <dt>Вариант</dt>
          <dd>{delivery.label}</dd>
        </div>
        {delivery.description ? (
          <div className="order-delivery-block__row">
            <dt>Описание</dt>
            <dd>{delivery.description}</dd>
          </div>
        ) : null}
        {delivery.address ? (
          <div className="order-delivery-block__row">
            <dt>Адрес</dt>
            <dd>{delivery.address}</dd>
          </div>
        ) : null}
        {cost ? (
          <div className="order-delivery-block__row">
            <dt>Стоимость</dt>
            <dd>{cost}</dd>
          </div>
        ) : null}
        <div className="order-delivery-block__row order-delivery-block__row--muted">
          <dt>ID на сайте</dt>
          <dd>
            <code>{delivery.providerId}</code>
          </dd>
        </div>
      </dl>
    </div>
  );
}
