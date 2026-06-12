/** Синхронизация async-переходов страниц / разворотов на Fabric-холсте. */

export type PageTransitionGate = {
  isBusy: () => boolean;
  begin: () => void;
  end: () => void;
  waitUntilIdle: () => Promise<void>;
};

export function createPageTransitionGate(): PageTransitionGate {
  let busy = false;
  const waiters: Array<() => void> = [];

  return {
    isBusy: () => busy,
    begin: () => {
      busy = true;
    },
    end: () => {
      busy = false;
      const pending = waiters.splice(0);
      pending.forEach((resolve) => resolve());
    },
    waitUntilIdle: () => {
      if (!busy) return Promise.resolve();
      return new Promise<void>((resolve) => {
        waiters.push(resolve);
      });
    },
  };
}

/** Очередь навигации: следующий переход ждёт завершения предыдущего. */
export function createNavigationQueue() {
  let chain: Promise<void> = Promise.resolve();

  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      const next = chain.then(task, task);
      chain = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
}
