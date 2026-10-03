import type { MarketSnapshot, OrderIntent } from '../domain/strategy/types';

export interface ExchangePort {
  getMarketSnapshot(symbol: string): Promise<MarketSnapshot>;
  submit(intent: OrderIntent): Promise<{ exchangeOrderId: string; filledQty: number; fillPrice: number; status: string }>;
  cancel(exchangeOrderId: string, symbol: string): Promise<void>;
  getOpenOrders(symbol: string): Promise<Array<{ id: string }>>;
  getPosition(symbol: string): Promise<{ quantity: number; averageEntryPrice?: number }>;
}

export interface DistributedLock {
  acquire(key: string, ttlMs: number): Promise<boolean>;
  release(key: string): Promise<void>;
}

export interface EventBus {
  publish(topic: string, payload: unknown): Promise<void>;
  subscribe(topic: string, handler: (payload: unknown) => Promise<void>|void): Promise<() => void>;
}
