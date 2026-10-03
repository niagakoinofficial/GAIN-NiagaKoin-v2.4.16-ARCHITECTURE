import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canTransitionOrder } from './orderLifecycle';

describe('order lifecycle', () => {
  it('allows the normal submit/fill/reconcile path', () => {
    assert.equal(canTransitionOrder('CREATED', 'SUBMITTING'), true);
    assert.equal(canTransitionOrder('SUBMITTING', 'SUBMITTED'), true);
    assert.equal(canTransitionOrder('SUBMITTED', 'PARTIALLY_FILLED'), true);
    assert.equal(canTransitionOrder('PARTIALLY_FILLED', 'FILLED'), true);
    assert.equal(canTransitionOrder('FILLED', 'RECONCILED'), true);
  });
  it('forces unknown orders through reconciliation', () => {
    assert.equal(canTransitionOrder('SUBMITTED', 'UNKNOWN'), true);
    assert.equal(canTransitionOrder('UNKNOWN', 'RECONCILING'), true);
    assert.equal(canTransitionOrder('UNKNOWN', 'FILLED'), true);
  });
  it('rejects terminal-state mutation', () => {
    assert.equal(canTransitionOrder('CANCELLED', 'SUBMITTED'), false);
    assert.equal(canTransitionOrder('RECONCILED', 'FILLED'), false);
  });
});
