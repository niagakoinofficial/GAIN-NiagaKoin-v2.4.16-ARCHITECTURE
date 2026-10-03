import type { OrderIntent } from '../../domain/strategy/types';

export type OrderStatus = 'CREATED'|'RISK_APPROVED'|'QUEUED'|'SUBMITTING'|'SUBMITTED'|'PARTIALLY_FILLED'|'FILLED'|'CANCELLED'|'REJECTED'|'UNKNOWN';
export interface ManagedOrder { intent: OrderIntent; status: OrderStatus; exchangeOrderId?: string; filledQty?: number; fillPrice?: number; rejectionReason?: string; updatedAt: number; }

export interface OrderStore {
  getByIdempotencyKey(key: string): Promise<ManagedOrder | undefined>;
  save(order: ManagedOrder): Promise<void>;
}

export class MemoryOrderStore implements OrderStore {
  private readonly orders = new Map<string, ManagedOrder>();
  async getByIdempotencyKey(key: string) { return this.orders.get(key); }
  async save(order: ManagedOrder) { this.orders.set(order.intent.idempotencyKey, order); }
}

export class OrderManager {
  constructor(private readonly store: OrderStore) {}
  async create(intent: OrderIntent): Promise<ManagedOrder> {
    const existing = await this.store.getByIdempotencyKey(intent.idempotencyKey);
    if (existing) return existing;
    const order: ManagedOrder = { intent, status: 'CREATED', updatedAt: Date.now() };
    await this.store.save(order);
    return order;
  }
  async transition(order: ManagedOrder, status: OrderStatus, patch: Partial<ManagedOrder> = {}) {
    const next = { ...order, ...patch, status, updatedAt: Date.now() };
    await this.store.save(next);
    return next;
  }
}
