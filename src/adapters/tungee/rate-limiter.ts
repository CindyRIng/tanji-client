/**
 * 上游限频（令牌桶 + 优先级/预留 + 读队列背压）
 *
 * - 总速率 ratePerMin（0 = 不限，仅压测）
 * - priority（解锁/登录等写操作）可消费全部令牌，并优先出队
 * - bulk（搜索/列表/详情/联系人等读操作）只能消费 reserve 以上的令牌
 * - bulk 等待队列超过 bulkQueueMax 时立即抛 RATE_LIMITED（带 retryAfterMs），避免队列堆到分钟级
 */
import { TanjiError } from '../../errors/catalog.js';

export type RateClass = 'bulk' | 'priority';

export interface RateLimiterOptions {
  /** 为 priority 预留的令牌数（默认 5） */
  priorityReserve?: number;
  /** bulk 等待队列上限（默认 12；0=不限） */
  bulkQueueMax?: number;
  /** 测试用：桶容量覆盖（默认 = ratePerMin） */
  capacity?: number;
  /** 测试用：每毫秒补充令牌数（默认 capacity/60000） */
  refillPerMs?: number;
}

export class RateLimiter {
  private tokens: number;
  private last = Date.now();
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly reserve: number;
  private readonly bulkQueueMax: number;
  private readonly priorityWaiters: Array<(value: void) => void> = [];
  private readonly bulkWaiters: Array<(value: void) => void> = [];
  private timer?: NodeJS.Timeout;
  private servedPriority = 0;
  private servedBulk = 0;
  private rejectedBulk = 0;

  constructor(ratePerMin: number, opts: RateLimiterOptions = {}) {
    this.capacity = Math.max(0, opts.capacity ?? ratePerMin);
    this.tokens = this.capacity;
    this.refillPerMs = opts.refillPerMs ?? (this.capacity > 0 ? this.capacity / 60_000 : 0);
    // 至少给 bulk 留 1 个令牌，避免容量过小时 bulk 永远拿不到
    this.reserve = Math.min(Math.max(0, opts.priorityReserve ?? 5), Math.max(0, this.capacity - 1));
    this.bulkQueueMax = Math.max(0, opts.bulkQueueMax ?? 12);
  }

  get unlimited(): boolean {
    return this.capacity === 0;
  }

  get priorityPending(): number {
    return this.priorityWaiters.length;
  }

  get bulkPending(): number {
    return this.bulkWaiters.length;
  }

  get reserveTokens(): number {
    return this.reserve;
  }

  get maxBulkQueue(): number {
    return this.bulkQueueMax;
  }

  /** 读请求入口背压：队列即将超限时直接拒绝，而不是排队几分钟 */
  assertBulkCapacity(count = 1): void {
    if (this.unlimited) return;
    if (this.bulkQueueMax > 0 && this.bulkWaiters.length + count > this.bulkQueueMax) {
      this.rejectedBulk++;
      throw this.rejectError();
    }
  }

  async acquire(kind: RateClass = 'bulk'): Promise<void> {
    if (this.unlimited) return;
    if (kind === 'bulk') this.assertBulkCapacity(1);
    await new Promise<void>((resolve) => {
      const queue = kind === 'priority' ? this.priorityWaiters : this.bulkWaiters;
      queue.push(resolve);
      this.pump();
    });
  }

  stats(): {
    tokens: number;
    capacity: number;
    reserve: number;
    priorityPending: number;
    bulkPending: number;
    bulkQueueMax: number;
    servedPriority: number;
    servedBulk: number;
    rejectedBulk: number;
  } {
    return {
      tokens: this.tokens,
      capacity: this.capacity,
      reserve: this.reserve,
      priorityPending: this.priorityWaiters.length,
      bulkPending: this.bulkWaiters.length,
      bulkQueueMax: this.bulkQueueMax,
      servedPriority: this.servedPriority,
      servedBulk: this.servedBulk,
      rejectedBulk: this.rejectedBulk,
    };
  }

  private rejectError(): TanjiError {
    const perMin = this.capacity > 0 ? this.capacity : 0;
    const base = perMin > 0 ? 60_000 / perMin : 60_000;
    const retryAfterMs = Math.max(1_000, Math.ceil((this.bulkWaiters.length + 1) * base));
    return new TanjiError('RATE_LIMITED', '本地读请求队列已满，请按 retryAfterMs 退避后重试', {
      retryAfterMs,
      details: {
        queueDepth: this.bulkWaiters.length,
        maxQueue: this.bulkQueueMax,
        waitingTokens: this.tokens,
        reserveTokens: this.reserve,
      },
    });
  }

  private refill(): void {
    const now = Date.now();
    if (this.capacity > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.refillPerMs);
    }
    this.last = now;
  }

  private pump(): void {
    if (this.unlimited) return;
    this.refill();
    for (;;) {
      if (this.priorityWaiters.length > 0) {
        if (this.tokens >= 1) {
          this.tokens -= 1;
          this.servedPriority++;
          const resolve = this.priorityWaiters.shift()!;
          resolve();
          continue;
        }
        break;
      }
      if (this.bulkWaiters.length > 0) {
        if (this.tokens > this.reserve) {
          this.tokens -= 1;
          this.servedBulk++;
          const resolve = this.bulkWaiters.shift()!;
          resolve();
          continue;
        }
        break;
      }
      break;
    }
    if (this.timer || (this.priorityWaiters.length === 0 && this.bulkWaiters.length === 0)) return;
    const need = this.priorityWaiters.length > 0 ? 1 : Math.min(this.capacity, this.reserve + 1);
    const waitMs = Math.max(5, Math.ceil((need - this.tokens) / this.refillPerMs));
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.pump();
    }, waitMs);
    this.timer.unref?.();
  }
}
