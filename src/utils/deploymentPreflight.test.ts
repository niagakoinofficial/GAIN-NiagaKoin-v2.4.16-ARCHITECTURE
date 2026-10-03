import test from 'node:test';
import assert from 'node:assert/strict';
import { assessDeploymentPreflight } from './deploymentPreflight';
import type { StrategyRiskAssessment } from './strategyRiskGuardrails';

const risk: StrategyRiskAssessment = {
  status: 'PASS', blockers: [], warnings: [], effectiveLayerCount: 10,
  singleCoinCapitalUsdt: 50, totalProjectedCapitalUsdt: 50, exposureRatioPct: 10,
  maxStepAmountUsdt: 10, maxCoveragePct: 20,
};

test('deployment preflight is ready for valid testnet deployment', () => {
  const result = assessDeploymentPreflight({
    botName: 'Bot BTC', executionMode: 'testnet', pairedCoinsCount: 1,
    marketPrice: 100000, minPrice: 90000, maxPrice: 110000,
    isTestnetConnected: true, isLiveConnected: false, strategyRisk: risk,
  });
  assert.equal(result.status, 'READY');
});

test('deployment preflight blocks when exchange is disconnected', () => {
  const result = assessDeploymentPreflight({
    botName: 'Bot BTC', executionMode: 'testnet', pairedCoinsCount: 1,
    marketPrice: 100000, minPrice: 90000, maxPrice: 110000,
    isTestnetConnected: false, isLiveConnected: false, strategyRisk: risk,
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.checks.find((c) => c.code === 'EXCHANGE_CONNECTION')?.status, 'BLOCKED');
});

test('deployment preflight blocks inverted price bounds', () => {
  const result = assessDeploymentPreflight({
    botName: 'Bot BTC', executionMode: 'testnet', pairedCoinsCount: 1,
    marketPrice: 100000, minPrice: 110000, maxPrice: 90000,
    isTestnetConnected: true, isLiveConnected: false, strategyRisk: risk,
  });
  assert.equal(result.status, 'BLOCKED');
});
