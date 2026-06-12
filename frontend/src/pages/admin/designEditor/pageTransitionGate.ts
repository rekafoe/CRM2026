/** Синхронизация async-переходов страниц / разворотов на Fabric-холсте. */

export type PageTransitionGate = {
  isBusy: () => boolean;
  begin: () => void;
  end: () => void;
  waitUntilIdle: () => Promise<void>;
};

export function createPageTransitionGate(): PageTransitionGate {
  let depth = 0;
  const waiters: Array<() => void> = [];

  const notifyIfIdle = () => {
    if (depth > 0) return;
    const pending = waiters.splice(0);
    pending.forEach((resolve) => resolve());
  };

  return {
    isBusy: () => depth > 0,
    begin: () => {
      depth += 1;
    },
    end: () => {
      depth = Math.max(0, depth - 1);
      notifyIfIdle();
    },
    waitUntilIdle: () => {
      if (depth === 0) return Promise.resolve();
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
