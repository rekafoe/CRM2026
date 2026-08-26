export const MINIAPP_CHECKOUT_STATE_DRAFT = 'draft';
/** In-flight claim so concurrent finalize cannot double-spend stock. */
export const MINIAPP_CHECKOUT_STATE_FINALIZING = 'finalizing';
export const MINIAPP_CHECKOUT_STATE_FINALIZED = 'finalized';

export type MiniappCheckoutState =
  | typeof MINIAPP_CHECKOUT_STATE_DRAFT
  | typeof MINIAPP_CHECKOUT_STATE_FINALIZING
  | typeof MINIAPP_CHECKOUT_STATE_FINALIZED;

