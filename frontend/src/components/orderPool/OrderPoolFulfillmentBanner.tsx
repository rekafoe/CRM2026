import React from 'react';
import { AppIcon } from '../ui';
import {
  poolFulfillmentShowsBanner,
  type PoolFulfillmentChip,
} from './orderPoolUtils';

type Props = {
  chip: PoolFulfillmentChip | null;
  size?: 'card' | 'detail';
  showHint?: boolean;
};

function bannerHint(chip: PoolFulfillmentChip): string | null {
  if (!chip.title) return null;
  if (chip.title === chip.pointName || chip.title === chip.label) return null;
  if (chip.title === 'Способ получения') return null;
  return chip.title;
}

export const OrderPoolFulfillmentBanner: React.FC<Props> = ({
  chip,
  size = 'card',
  showHint = true,
}) => {
  if (!poolFulfillmentShowsBanner(chip)) return null;
  const hint = size === 'detail' && showHint ? bannerHint(chip) : null;
  const icon = chip.variant === 'pickup' ? 'building' : 'package';

  return (
    <div
      className={`order-pool-fulfillment-banner order-pool-fulfillment-banner--${size}`}
      title={chip.title}
    >
      <AppIcon name={icon} size={size === 'detail' ? 'sm' : 'xs'} />
      <div className="order-pool-fulfillment-banner__text">
        <span className="order-pool-fulfillment-banner__kicker">{chip.kicker}</span>
        <strong className="order-pool-fulfillment-banner__point">{chip.pointName}</strong>
        {hint ? <span className="order-pool-fulfillment-banner__hint">{hint}</span> : null}
      </div>
    </div>
  );
};
