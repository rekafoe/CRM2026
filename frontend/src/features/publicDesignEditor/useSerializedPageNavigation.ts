import { useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import type { DesignEditorCanvasHandle } from '../../pages/admin/designEditor/DesignEditorCanvas';
import { createNavigationQueue } from '../../pages/admin/designEditor/pageTransitionGate';

export function useSerializedPageNavigation(
  canvasHandleRef: RefObject<DesignEditorCanvasHandle | null>,
) {
  const queueRef = useRef<ReturnType<typeof createNavigationQueue> | null>(null);
  if (!queueRef.current) {
    queueRef.current = createNavigationQueue();
  }

  const runPageNavigation = useMemo(() => {
    const queue = queueRef.current!;
    return (task: () => Promise<void>) => queue.enqueue(async () => {
      const handle = canvasHandleRef.current;
      await handle?.whenPageTransitionIdle?.();
      await task();
      await handle?.whenPageTransitionIdle?.();
    });
  }, [canvasHandleRef]);

  return { runPageNavigation };
}
