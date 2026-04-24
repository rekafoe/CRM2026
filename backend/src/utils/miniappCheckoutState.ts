export const MINIAPP_CHECKOUT_STATE_DRAFT = 'draft';
export const MINIAPP_CHECKOUT_STATE_FINALIZED = 'finalized';

export type MiniappCheckoutState =
  | typeof MINIAPP_CHECKOUT_STATE_DRAFT
  | typeof MINIAPP_CHECKOUT_STATE_FINALIZED;

