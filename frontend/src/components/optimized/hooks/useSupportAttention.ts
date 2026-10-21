import { useCallback, useEffect, useState } from 'react';
import { supportChatsApi } from '../../../services/supportChats';

const POLL_INTERVAL_MS = 30_000;

export function useSupportAttention(enabled: boolean) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled || document.visibilityState !== 'visible') return;
    try {
      const data = await supportChatsApi.attention();
      const next = Number(data?.count || 0);
      setCount(Number.isFinite(next) && next > 0 ? next : 0);
    } catch {
      setCount(0);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    let timer: ReturnType<typeof setInterval> | null = null;
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        await refresh();
      } finally {
        inFlight = false;
      }
    };
    void tick();
    timer = setInterval(tick, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  return count;
}
