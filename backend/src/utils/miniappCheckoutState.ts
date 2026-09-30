export const MINIAPP_CHECKOUT_STATE_DRAFT = 'draft';
export const MINIAPP_CHECKOUT_STATE_FINALIZED = 'finalized';

export type MiniappCheckoutState =
  | typeof MINIAPP_CHECKOUT_STATE_DRAFT
  | typeof MINIAPP_CHECKOUT_STATE_FINALIZED;

/** Черновик Mini App: null/пусто/draft можно финализировать один раз. */
export function isClaimableMiniappCheckoutState(state: unknown): boolean {
  if (state == null) return true;
  const normalized = String(state).trim();
  return normalized === '' || normalized === MINIAPP_CHECKOUT_STATE_DRAFT;
}

type DbRunResult = { changes?: number } | undefined;

/**
 * Атомарно забирает draft → finalized.
 * Второй параллельный finalize получает changes=0 и не должен списывать склад.
 */
export async function claimMiniappDraftFinalizeInTx(
  db: { run: (sql: string, ...params: unknown[]) => Promise<DbRunResult> },
  orderId: number,
  telegramChatId: string,
): Promise<boolean> {
  const result = await db.run(
    `UPDATE orders
        SET miniapp_checkout_state = ?
      WHERE id = ?
        AND telegram_chat_id = ?
        AND (
          miniapp_checkout_state IS NULL
          OR TRIM(COALESCE(miniapp_checkout_state, '')) = ''
          OR miniapp_checkout_state = ?
        )`,
    MINIAPP_CHECKOUT_STATE_FINALIZED,
    orderId,
    telegramChatId,
    MINIAPP_CHECKOUT_STATE_DRAFT,
  );
  return Number(result?.changes ?? 0) > 0;
}

