import type { MarketSnapshot } from '../../domain/strategy/types';

export type MarketListener = (snapshot: MarketSnapshot) => void | Promise<void>;

export class MarketDataEngine {
  private readonly snapshots = new Map<string, MarketSnapshot>();
  private readonly listeners = new Set<MarketListener>();
  subscribe(listener: MarketListener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  publish(snapshot: MarketSnapshot) {
    const key = `${snapshot.exchange}:${snapshot.symbol}`;
    this.snapshots.set(key, snapshot);
    for (const listener of this.listeners) void listener(snapshot);
  }
  get(exchange: string, symbol: string) { return this.snapshots.get(`${exchange}:${symbol}`); }
}
