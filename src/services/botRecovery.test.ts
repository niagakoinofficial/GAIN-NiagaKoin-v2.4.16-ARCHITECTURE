import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getBotRecoveryStatus, isStartupAutoResumeEnabled, STARTUP_AUTO_RESUME_CONFIRM } from './botRecovery';

test('recovery status prioritizes unresolved submitting order', () => {
  assert.equal(getBotRecoveryStatus({ status: 'paused', resumeAfterReconciliation: true, pendingOrder: { status: 'submitting' } }).state, 'ORDER_STATUS_UNCERTAIN');
});

test('recovery status exposes reconciliation gate', () => {
  const result = getBotRecoveryStatus({ status: 'paused', resumeAfterReconciliation: true });
  assert.equal(result.state, 'RECONCILIATION_PENDING');
});

test('healthy runner has no recovery gate', () => {
  const result = getBotRecoveryStatus({ status: 'active' });
  assert.equal(result.state, 'HEALTHY');
});


test('startup resume remains explicitly required after successful reconciliation', () => {
  const result = getBotRecoveryStatus({ status: 'paused', lastErrorReason: 'STARTUP_RESUME_REQUIRED' });
  assert.equal(result.state, 'STARTUP_RESUME_REQUIRED');
  assert.match(result.message, /Resume secara eksplisit/);
});


test('startup auto resume requires both explicit switches', () => {
  assert.equal(isStartupAutoResumeEnabled(undefined, undefined), false);
  assert.equal(isStartupAutoResumeEnabled('true', undefined), false);
  assert.equal(isStartupAutoResumeEnabled('false', STARTUP_AUTO_RESUME_CONFIRM), false);
  assert.equal(isStartupAutoResumeEnabled('true', STARTUP_AUTO_RESUME_CONFIRM), true);
});
