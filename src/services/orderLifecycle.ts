export type OrderLifecycleState =
  | 'CREATED'
  | 'SUBMITTING'
  | 'SUBMITTED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'RECONCILING'
  | 'RECONCILED'
  | 'CANCELLED'
  | 'UNKNOWN';

const transitions: Record<OrderLifecycleState, ReadonlySet<OrderLifecycleState>> = {
  CREATED: new Set(['SUBMITTING']),
  SUBMITTING: new Set(['SUBMITTED', 'PARTIALLY_FILLED', 'FILLED', 'RECONCILING', 'UNKNOWN', 'CANCELLED']),
  SUBMITTED: new Set(['PARTIALLY_FILLED', 'FILLED', 'RECONCILING', 'CANCELLED', 'UNKNOWN']),
  PARTIALLY_FILLED: new Set(['PARTIALLY_FILLED', 'FILLED', 'RECONCILING', 'UNKNOWN', 'CANCELLED']),
  FILLED: new Set(['RECONCILED']),
  RECONCILING: new Set(['RECONCILED', 'FILLED', 'CANCELLED', 'UNKNOWN']),
  RECONCILED: new Set(),
  CANCELLED: new Set(),
  UNKNOWN: new Set(['RECONCILING', 'SUBMITTED', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED']),
};

export function canTransitionOrder(from: OrderLifecycleState, to: OrderLifecycleState): boolean {
  return from === to || transitions[from].has(to);
}

export function assertOrderTransition(from: OrderLifecycleState, to: OrderLifecycleState): void {
  if (!canTransitionOrder(from, to)) {
    throw new Error(`Invalid order lifecycle transition: ${from} -> ${to}`);
  }
}
