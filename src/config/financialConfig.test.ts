import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINANCIAL_CONFIG, getGasTopupBonus } from './financialConfig';

test('financial config keeps referral semantics explicit', () => {
  assert.equal(FINANCIAL_CONFIG.referral.activationCashPct, 20);
  assert.equal(FINANCIAL_CONFIG.referral.tradingFeeCashPct, 20);
  assert.equal(FINANCIAL_CONFIG.referral.topupGasNonCashPct, 10);
});

test('gas topup promo is deterministic', () => {
  assert.deepEqual(getGasTopupBonus(49), { pct: 0, bonusUsdt: 0 });
  assert.deepEqual(getGasTopupBonus(50), { pct: 10, bonusUsdt: 5 });
  assert.deepEqual(getGasTopupBonus(100), { pct: 20, bonusUsdt: 20 });
  assert.deepEqual(getGasTopupBonus(200), { pct: 25, bonusUsdt: 50 });
  assert.deepEqual(getGasTopupBonus(500), { pct: 30, bonusUsdt: 150 });
});
