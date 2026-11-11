import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../src/adapters/tungee/rate-limiter.js';
import { TanjiError } from '../src/errors/catalog.js';

describe('rate limiter', () => {
  it('unlimited does not queue', async () => {
    const l = new RateLimiter(0);
    expect(l.unlimited).toBe(true);
    await l.acquire('bulk');
    await l.acquire('priority');
    expect(l.bulkPending).toBe(0);
  });

  it('priority jumps ahead of queued bulk when token is at reserve', async () => {
    // 2 tokens; reserve 1 → bulk can use only the first token, priority can use the reserved one
    const l = new RateLimiter(20, { capacity: 2, refillPerMs: 0.5, priorityReserve: 1, bulkQueueMax: 10 });
    await l.acquire('bulk'); // tokens 2 -> 1
    const order: string[] = [];
    const bulk = l.acquire('bulk').then(() => order.push('bulk')); // waits: tokens==reserve
    const priority = l.acquire('priority').then(() => order.push('priority')); // consumes reserved token
    await priority;
    expect(order).toEqual(['priority']);
    await bulk; // refill ~2ms
    expect(order).toEqual(['priority', 'bulk']);
    expect(l.stats().servedPriority).toBe(1);
    expect(l.stats().servedBulk).toBe(2);
  });

  it('bulk queue overflow rejects with RATE_LIMITED', async () => {
    const l = new RateLimiter(20, { capacity: 1, refillPerMs: 0.0001, priorityReserve: 0, bulkQueueMax: 1 });
    await l.acquire('bulk'); // drain the only token
    const pending = l.acquire('bulk'); // fills the single bulk slot
    await expect(l.acquire('bulk')).rejects.toBeInstanceOf(TanjiError);
    await expect(l.acquire('bulk')).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfterMs: expect.any(Number) });
    // 收尾：不等待未完成的排队请求
    pending.catch(() => {});
  });
});
