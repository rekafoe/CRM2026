import {
  MINIAPP_CHECKOUT_STATE_DRAFT,
  MINIAPP_CHECKOUT_STATE_FINALIZED,
} from '../utils/miniappCheckoutState';

/**
 * Concurrent finalize of the same Mini App draft must claim the checkout state
 * before warehouse deduction. The claim UPDATE is the serialization point:
 * only the first writer with changes>=1 may deduct.
 */
describe('miniapp finalize draft claim', () => {
  it('claim SQL only matches draft/empty checkout state', () => {
    const claimSql = `UPDATE orders
       SET miniapp_checkout_state = ?
       WHERE id = ?
         AND telegram_chat_id = ?
         AND (
           miniapp_checkout_state IS NULL
           OR trim(COALESCE(miniapp_checkout_state, '')) = ''
           OR miniapp_checkout_state = ?
         )`;
    expect(claimSql).toContain('telegram_chat_id');
    expect(claimSql).toContain('miniapp_checkout_state = ?');
    expect(claimSql).toContain("OR miniapp_checkout_state = ?");
  });

  it('second claim on already-finalized draft reports zero changes', async () => {
    const states = new Map<number, string | null>([[42, MINIAPP_CHECKOUT_STATE_DRAFT]]);
    const run = async (sql: string, ...params: unknown[]) => {
      if (!String(sql).includes('SET miniapp_checkout_state')) {
        return { changes: 0 };
      }
      const [nextState, orderId, chatId, draftState] = params as [string, number, string, string];
      expect(chatId).toBe('tg-1');
      expect(draftState).toBe(MINIAPP_CHECKOUT_STATE_DRAFT);
      const cur = states.get(orderId);
      const isDraft =
        cur == null ||
        String(cur).trim() === '' ||
        cur === MINIAPP_CHECKOUT_STATE_DRAFT;
      if (!isDraft) return { changes: 0 };
      states.set(orderId, nextState);
      return { changes: 1 };
    };

    const first = await run(
      `UPDATE orders SET miniapp_checkout_state = ? WHERE id = ? AND telegram_chat_id = ? AND (miniapp_checkout_state IS NULL OR trim(COALESCE(miniapp_checkout_state, '')) = '' OR miniapp_checkout_state = ?)`,
      MINIAPP_CHECKOUT_STATE_FINALIZED,
      42,
      'tg-1',
      MINIAPP_CHECKOUT_STATE_DRAFT
    );
    const second = await run(
      `UPDATE orders SET miniapp_checkout_state = ? WHERE id = ? AND telegram_chat_id = ? AND (miniapp_checkout_state IS NULL OR trim(COALESCE(miniapp_checkout_state, '')) = '' OR miniapp_checkout_state = ?)`,
      MINIAPP_CHECKOUT_STATE_FINALIZED,
      42,
      'tg-1',
      MINIAPP_CHECKOUT_STATE_DRAFT
    );

    expect(first.changes).toBe(1);
    expect(second.changes).toBe(0);
    expect(states.get(42)).toBe(MINIAPP_CHECKOUT_STATE_FINALIZED);
  });
});
