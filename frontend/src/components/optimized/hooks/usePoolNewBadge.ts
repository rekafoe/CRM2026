import { useState, useEffect, useCallback } from 'react';
import { getOrderPoolSync } from '../../../api';

const STORAGE_KEY = 'orderPoolLastSeenAt';
const POLL_INTERVAL_MS = 30_000;

export function usePoolNewBadge() {
  const [hasNew, setHasNew] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState(() => {
    try {
      return Number(localStorage.getItem(STORAGE_KEY) || '0');
    } catch {
      return 0;
    }
  });

  const fetchAndCompare = useCallback(async () => {
    try {
      const { data } = await getOrderPoolSync();
      const at = data?.lastWebsiteOrderAt ?? 0;
      const seen = lastSeenAt;
      if (seen === 0 && at > 0) {
        setLastSeenAt(at);
        try {
          localStorage.setItem(STORAGE_KEY, String(at));
        } catch {}
        setHasNew(false);
      } else {
        setHasNew(at > 0 && at > seen);
      }
    } catch {
      setHasNew(false);
    }
  }, [lastSeenAt]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let inFlight = false;

    const tick = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        await fetchAndCompare();
      } finally {
        inFlight = false;
      }
    };

    void tick();
    timer = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [fetchAndCompare]);

  const markAsSeen = useCallback(() => {
    const now = Date.now();
    setLastSeenAt(now);
    setHasNew(false);
    try {
      localStorage.setItem(STORAGE_KEY, String(now));
    } catch {}
  }, []);

  const markAsSeenWithCurrent = useCallback(async () => {
    try {
      const { data } = await getOrderPoolSync();
      const at = data?.lastWebsiteOrderAt ?? Date.now();
      setLastSeenAt(at);
      setHasNew(false);
      localStorage.setItem(STORAGE_KEY, String(at));
    } catch {
      markAsSeen();
    }
  }, [markAsSeen]);

  return { hasNew, markAsSeen: markAsSeenWithCurrent };
}
