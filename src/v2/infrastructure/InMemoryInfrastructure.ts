import type { DistributedLock, EventBus } from './ports';

export class MemoryLock implements DistributedLock {
  private readonly locks = new Map<string, number>();
  async acquire(key: string, ttlMs: number) {
    const now = Date.now();
    const expires = this.locks.get(key) || 0;
    if (expires > now) return false;
    this.locks.set(key, now + ttlMs);
    return true;
  }
  async release(key: string) { this.locks.delete(key); }
}

export class MemoryEventBus implements EventBus {
  private readonly handlers = new Map<string, Set<(payload: unknown) => Promise<void>|void>>();
  async publish(topic: string, payload: unknown) {
    for (const handler of this.handlers.get(topic) || []) await handler(payload);
  }
  async subscribe(topic: string, handler: (payload: unknown) => Promise<void>|void) {
    const set = this.handlers.get(topic) || new Set();
    set.add(handler); this.handlers.set(topic, set);
    return () => set.delete(handler);
  }
}
