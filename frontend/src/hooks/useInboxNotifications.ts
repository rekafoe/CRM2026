import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getInboxNotifications,
  markInboxNotificationsRead,
  type InboxNotification,
} from '../api';
import { useToastNotifications } from '../components/Toast';

const POLL_MS = 45000;

export function getInboxNotificationPath(notification: InboxNotification): string | null {
  const path = notification.payload?.path;
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') ? path : null;
}

export function useInboxNotifications(opts?: {
  enabled?: boolean;
  onExecutorAssigned?: (notification: InboxNotification) => void;
  onOpenPath?: (path: string, notification: InboxNotification) => void;
}) {
  const enabled = opts?.enabled !== false;
  const toast = useToastNotifications();
  const toastInfoRef = useRef(toast.info);
  toastInfoRef.current = toast.info;
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const knownIdsRef = useRef<Set<number>>(new Set());
  const bootstrappedRef = useRef(false);
  const refreshInFlightRef = useRef(false);
  const onExecutorAssignedRef = useRef(opts?.onExecutorAssigned);
  onExecutorAssignedRef.current = opts?.onExecutorAssigned;
  const onOpenPathRef = useRef(opts?.onOpenPath);
  onOpenPathRef.current = opts?.onOpenPath;

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const res = await getInboxNotifications({ limit: 30 });
      const nextItems = Array.isArray(res.data?.items) ? res.data.items : [];
      const nextUnread = Number(res.data?.unreadCount) || 0;

      if (!bootstrappedRef.current) {
        knownIdsRef.current = new Set(nextItems.map((n) => n.id));
        bootstrappedRef.current = true;
      } else {
        for (const n of nextItems) {
          if (knownIdsRef.current.has(n.id)) continue;
          knownIdsRef.current.add(n.id);
          if (!n.isRead) {
            toastInfoRef.current(n.title, n.message);
            if (n.type === 'executor_assigned') {
              onExecutorAssignedRef.current?.(n);
            }
          }
        }
      }

      setItems(nextItems);
      setUnreadCount(nextUnread);
    } catch {
      // тихо: нет смысла спамить ошибками поллинга
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  const markAllRead = useCallback(async () => {
    try {
      const res = await markInboxNotificationsRead();
      setUnreadCount(Number(res.data?.unreadCount) || 0);
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // ignore
    }
  }, []);

  const markOneRead = useCallback(async (id: number) => {
    try {
      const res = await markInboxNotificationsRead([id]);
      setUnreadCount(Number(res.data?.unreadCount) || 0);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch {
      // ignore
    }
  }, []);

  const openNotification = useCallback(async (notification: InboxNotification) => {
    await markOneRead(notification.id);
    setOpen(false);
    const path = getInboxNotificationPath(notification);
    if (path) {
      onOpenPathRef.current?.(path, notification);
      return;
    }
    if (notification.type === 'executor_assigned') {
      onExecutorAssignedRef.current?.(notification);
    }
  }, [markOneRead]);

  return {
    items,
    unreadCount,
    open,
    setOpen,
    refresh,
    markAllRead,
    markOneRead,
    openNotification,
  };
}
