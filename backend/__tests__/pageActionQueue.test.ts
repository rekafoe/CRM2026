import { describe, expect, it, jest } from '@jest/globals';
import { createPageActionQueue } from '../../frontend/src/features/publicDesignEditor/pageActionQueue';

describe('pageActionQueue', () => {
  it('waits for page transition idle before running every action', async () => {
    const order: string[] = [];
    let releaseIdle: (() => void) | undefined;
    const waitUntilIdle = jest.fn(() => new Promise<void>((resolve) => {
      releaseIdle = resolve;
    }));
    const queue = createPageActionQueue({
      getIdleSource: () => ({ whenPageTransitionIdle: waitUntilIdle }),
    });

    const pending = queue.enqueue(async () => {
      order.push('action');
    });
    await Promise.resolve();
    expect(order).toEqual([]);

    order.push('idle');
    releaseIdle?.();
    await pending;

    expect(waitUntilIdle).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['idle', 'action']);
  });

  it('serializes actions without dropping rapid clicks', async () => {
    const queue = createPageActionQueue({
      getIdleSource: () => ({ whenPageTransitionIdle: async () => undefined }),
    });
    const order: number[] = [];

    await Promise.all([
      queue.enqueue(async () => { order.push(1); }),
      queue.enqueue(async () => { order.push(2); }),
      queue.enqueue(async () => { order.push(3); }),
    ]);

    expect(order).toEqual([1, 2, 3]);
  });

  it('continues processing after a failed action', async () => {
    const queue = createPageActionQueue({
      getIdleSource: () => ({ whenPageTransitionIdle: async () => undefined }),
    });
    const order: string[] = [];

    await expect(queue.enqueue(async () => {
      order.push('failed');
      throw new Error('mutation failed');
    })).rejects.toThrow('mutation failed');

    await queue.enqueue(async () => {
      order.push('next');
    });

    expect(order).toEqual(['failed', 'next']);
  });
});
