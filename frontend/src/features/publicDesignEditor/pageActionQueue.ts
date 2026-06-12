export interface PageActionQueueIdleSource {
  whenPageTransitionIdle?: () => Promise<void>;
}

export interface PageActionQueueOptions {
  getIdleSource: () => PageActionQueueIdleSource | null | undefined;
}

export interface PageActionQueue {
  enqueue: (task: () => Promise<void>) => Promise<void>;
}

/**
 * Serializes page navigation/mutation actions around Fabric page transitions.
 * The queue must never drop a user action just because a previous transition is busy or failed.
 */
export function createPageActionQueue({ getIdleSource }: PageActionQueueOptions): PageActionQueue {
  let chain: Promise<void> = Promise.resolve();

  return {
    enqueue(task) {
      const next = chain.then(async () => {
        await getIdleSource()?.whenPageTransitionIdle?.();
        await task();
      });
      chain = next.catch(() => undefined);
      return next;
    },
  };
}
