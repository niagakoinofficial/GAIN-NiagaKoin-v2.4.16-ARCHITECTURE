import test from 'node:test';
import assert from 'node:assert/strict';
import { assessStrategyRisk } from './strategyRiskGuardrails';

const steps = (count: number, multiplier = 1.15) => Array.from({ length: count }, (_, i) => ({
  amountUsdt: 10 * Math.pow(multiplier, i),
  dropPct: 2,
}));

const base = {
  botMode: 'Avarage Only' as const, averagingLayers: 3, gridLayers: 0, baseAmount: 10, baseTp: 1.5, averageDownPct: 2, gridProfitPct: 1.2, tpCallbackPct: 0.2, layerCallbackPct: 0.2, pairedCoinsCount: 1, availableBalanceUsdt: 200, useMoneyManagement: true, currentUserExposureUsdt: 0, minPrice: 0, maxPrice: 0, marketPrice: 100,
  steps: steps(3),
};

test('passes safe configuration', () => {
  const result = assessStrategyRisk(base);
  assert.equal(result.status, 'PASS');
  assert.equal(result.blockers.length, 0);
});

test('blocks insufficient modal versus layers', () => {
  const result = assessStrategyRisk({ ...base, availableBalanceUsdt: 20 });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.some((item) => item.code === 'CAPITAL_INSUFFICIENT'));
});

test('blocks total user exposure', () => {
  const result = assessStrategyRisk({ ...base, pairedCoinsCount: 15, availableBalanceUsdt: 1000 });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.some((item) => item.code === 'USER_EXPOSURE_LIMIT'));
});

test('warns on extreme but allowed parameters', () => {
  const result = assessStrategyRisk({ ...base, averagingLayers: 3, averageDownPct: 16, availableBalanceUsdt: 500, steps: steps(3) });
  assert.equal(result.status, 'WARNING');
  assert.ok(result.warnings.some((item) => item.code === 'AVERAGE_DOWN_HIGH'));
});

test('blocks invalid price bounds', () => {
  const result = assessStrategyRisk({ ...base, minPrice: 120, maxPrice: 100 });
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.some((item) => item.code === 'PRICE_BOUND_INVALID'));
});


test('allows configured layers when money management is off', () => {
  const result = assessStrategyRisk({
    ...base,
    botMode: 'Grid Only',
    averagingLayers: 0,
    gridLayers: 100,
    pairedCoinsCount: 3,
    availableBalanceUsdt: 30,
    useMoneyManagement: false,
    steps: Array.from({ length: 100 }, (_, i) => ({ amountUsdt: 10, dropPct: 0 })),
  });
  assert.notEqual(result.blockers.some((item) => ['BOT_EXPOSURE_LIMIT', 'USER_EXPOSURE_LIMIT', 'CAPITAL_INSUFFICIENT', 'CAPITAL_UNAVAILABLE'].includes(item.code)), true);
  assert.ok(result.warnings.some((item) => item.code === 'MM_OFF_EXPOSURE_DEFERRED'));
});
