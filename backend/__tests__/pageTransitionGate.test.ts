/** Логика синхронизации переходов страниц (зеркало frontend/pageTransitionGate.ts). */
import {
  createNavigationQueue,
  createPageTransitionGate,
} from '../../frontend/src/pages/admin/designEditor/pageTransitionGate';

describe('pageTransitionGate', () => {
  it('waitUntilIdle resolves when idle', async () => {
    const gate = createPageTransitionGate();
    await expect(gate.waitUntilIdle()).resolves.toBeUndefined();
  });

  it('waitUntilIdle waits for end()', async () => {
    const gate = createPageTransitionGate();
    gate.begin();
    let done = false;
    const pending = gate.waitUntilIdle().then(() => {
      done = true;
    });
    await new Promise((r) => setImmediate(r));
    expect(done).toBe(false);
    gate.end();
    await pending;
    expect(done).toBe(true);
  });

  it('navigation queue runs sequentially', async () => {
    const queue = createNavigationQueue();
    const order: number[] = [];
    await Promise.all([
      queue.enqueue(async () => { order.push(1); }),
      queue.enqueue(async () => { order.push(2); }),
    ]);
    expect(order).toEqual([1, 2]);
  });
});
