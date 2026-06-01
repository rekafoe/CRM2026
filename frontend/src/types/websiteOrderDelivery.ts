/** Способ получения заказа с сайта (контракт POST /api/orders/from-website). */
export type WebsiteDeliveryKind =
  | 'pickup'
  | 'courier_minsk'
  | 'pickup_point'
  | 'courier_country'
  | 'other';

export interface WebsiteOrderDelivery {
  kind: WebsiteDeliveryKind | string;
  providerId: string;
  label: string;
  description?: string | null;
  cost?: number | null;
  costLabel?: string | null;
  address?: string | null;
  meta?: Record<string, unknown>;
}
