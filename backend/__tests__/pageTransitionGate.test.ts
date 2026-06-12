/** Логика синхронизации переходов страниц (зеркало frontend/pageTransitionGate.ts). */
import { describe, expect, it } from '@jest/globals';
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

  it('nested begin/end stays busy until all transitions finish', async () => {
    const gate = createPageTransitionGate();
    gate.begin();
    gate.begin();
    expect(gate.isBusy()).toBe(true);
    gate.end();
    expect(gate.isBusy()).toBe(true);
    let done = false;
    const pending = gate.waitUntilIdle().then(() => {
      done = true;
    });
    await new Promise((r) => setImmediate(r));
    expect(done).toBe(false);
    gate.end();
    await pending;
    expect(done).toBe(true);
    expect(gate.isBusy()).toBe(false);
  });

  it('extra end never makes future waiters stuck', async () => {
    const gate = createPageTransitionGate();
    gate.end();
    expect(gate.isBusy()).toBe(false);
    await expect(gate.waitUntilIdle()).resolves.toBeUndefined();

    gate.begin();
    expect(gate.isBusy()).toBe(true);
    gate.end();
    expect(gate.isBusy()).toBe(false);
    await expect(gate.waitUntilIdle()).resolves.toBeUndefined();
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

  it('navigation queue continues after a failed task', async () => {
    const queue = createNavigationQueue();
    const order: string[] = [];

    await expect(queue.enqueue(async () => {
      order.push('failed');
      throw new Error('transition failed');
    })).rejects.toThrow('transition failed');

    await queue.enqueue(async () => {
      order.push('next');
    });

    expect(order).toEqual(['failed', 'next']);
  });
});
