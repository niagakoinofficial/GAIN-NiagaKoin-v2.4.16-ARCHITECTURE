import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TradingPosition, UserWallet } from '../types';
import { calculatePositionAnalytics } from './positionAnalytics';

const wallet = { liquidBalance: 1000, allocatedAssetUsdt: 500 } as UserWallet;

function position(overrides: Partial<TradingPosition> = {}): TradingPosition {
  return {
    id: 'p1', coin: 'BTC', pair: 'BTC/USDT', badgeSymbol: '₿', badgeBg: '', badgeColor: '',
    price: 50000, change24h: 0, engine: 'GAIN', allocationQty: '0.01', allocationUsdt: '500',
    stepLayer: 2, maxStep: 10, layerQuota: '10', floatingPnl: 25, roiPct: 5,
    status: 'active', statusLabel: 'Active', trailingInfo: '', trailingProgressPct: 0,
    totalCoinQty: 0.01, totalCostUsdt: 500,
    ...overrides,
  };
}

test('position analytics aggregates pnl, exposure, and layers', () => {
  const result = calculatePositionAnalytics([
    position(),
    position({ id: 'p2', pair: 'ETH/USDT', coin: 'ETH', floatingPnl: -10, totalCostUsdt: 250, stepLayer: 5 }),
  ], wallet, [
    { recoveryState: 'HEALTHY', realizedPnlToday: 12 },
    { recoveryState: 'RECONCILIATION_PENDING', realizedPnlToday: -2 },
  ]);

  assert.equal(result.positionCount, 2);
  assert.equal(result.activeCount, 2);
  assert.equal(result.floatingPnlUsdt, 15);
  assert.equal(result.realizedPnlTodayUsdt, 10);
  assert.equal(result.totalCostUsdt, 750);
  assert.equal(result.layerUtilizationPct, 35);
  assert.equal(result.reconciliationCount, 1);
  assert.equal(result.runtimeRiskCount, 1);
});

test('zero-cost portfolio stays numerically safe', () => {
  const result = calculatePositionAnalytics([position({ totalCostUsdt: 0, allocationUsdt: '0', floatingPnl: 0, totalCoinQty: 0 })], wallet);
  assert.equal(result.floatingRoiPct, 0);
  assert.equal(result.currentDrawdownPct, 0);
  assert.equal(result.topPositionConcentrationPct, 0);
});
