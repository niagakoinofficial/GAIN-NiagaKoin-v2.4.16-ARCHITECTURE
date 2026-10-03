import type { PositionState } from '../../domain/strategy/types';

export interface ReconciliationSnapshot {
  internal: PositionState;
  exchangeQuantity: number;
  exchangeAverageEntry?: number;
  openOrderIds: string[];
  trackedOpenOrderIds: string[];
}

export function reconcilePosition(snapshot: ReconciliationSnapshot, tolerancePct = 0.005): { ok: boolean; codes: string[] } {
  const codes: string[] = [];
  const base = Math.max(Math.abs(snapshot.internal.quantity), 1e-8);
  const deltaPct = Math.abs(snapshot.exchangeQuantity - snapshot.internal.quantity) / base;
  if (deltaPct > tolerancePct) codes.push('POSITION_MISMATCH');
  const exchangeSet = new Set(snapshot.openOrderIds);
  for (const tracked of snapshot.trackedOpenOrderIds) if (!exchangeSet.has(tracked)) codes.push(`MISSING_ORDER:${tracked}`);
  for (const actual of snapshot.openOrderIds) if (!snapshot.trackedOpenOrderIds.includes(actual)) codes.push(`UNTRACKED_ORDER:${actual}`);
  return { ok: codes.length === 0, codes };
}
