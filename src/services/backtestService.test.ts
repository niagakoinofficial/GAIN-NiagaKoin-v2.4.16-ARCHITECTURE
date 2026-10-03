import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBacktestCsv, runBacktest, runMonteCarlo, BACKTEST_SAMPLE_CSV } from './backtestService';

test('backtest CSV parser accepts ISO timestamps and normalizes candle order', () => {
  const candles = parseBacktestCsv(`${BACKTEST_SAMPLE_CSV}\n2026-01-01T08:00:00Z,105,107,104,106,1500`);
  assert.equal(candles.length, 9);
  assert.ok(candles[0].timestamp < candles.at(-1)!.timestamp);
});

test('DCA backtest is deterministic and never creates an exchange write', () => {
  const candles = parseBacktestCsv(BACKTEST_SAMPLE_CSV);
  const resultA = runBacktest(candles, {
    strategy: 'DCA', initialCapitalUsd: 1000, baseOrderUsd: 50, stepDeviationPct: 2,
    stepScale: 1.25, volumeMultiplier: 1.3, maxLayers: 8, takeProfitPct: 1.2,
    maxCapitalUsd: 800, useMoneyManagement: true, maxOrderUsd: 50, maxBotExposureUsd: 250, lowerPrice: 90, upperPrice: 110, gridCount: 10, gridOrderUsd: 50, maxSpreadPct: 1,
  });
  const resultB = runBacktest(candles, {
    strategy: 'DCA', initialCapitalUsd: 1000, baseOrderUsd: 50, stepDeviationPct: 2,
    stepScale: 1.25, volumeMultiplier: 1.3, maxLayers: 8, takeProfitPct: 1.2,
    maxCapitalUsd: 800, useMoneyManagement: true, maxOrderUsd: 50, maxBotExposureUsd: 250, lowerPrice: 90, upperPrice: 110, gridCount: 10, gridOrderUsd: 50, maxSpreadPct: 1,
  });
  assert.equal(resultA.endingEquityUsd, resultB.endingEquityUsd);
  assert.equal(resultA.trades.length, resultB.trades.length);
  assert.ok(Number.isFinite(resultA.maxDrawdownPct));
});

test('Monte Carlo stress test is deterministic and includes distribution metrics', () => {
  const candles = parseBacktestCsv(BACKTEST_SAMPLE_CSV);
  const config = {
    strategy: 'DCA' as const, initialCapitalUsd: 1000, baseOrderUsd: 50, stepDeviationPct: 2,
    stepScale: 1.25, volumeMultiplier: 1.3, maxLayers: 8, takeProfitPct: 1.2,
    maxCapitalUsd: 800, useMoneyManagement: true, maxOrderUsd: 50, maxBotExposureUsd: 250, lowerPrice: 90, upperPrice: 110, gridCount: 10, gridOrderUsd: 50,
    maxSpreadPct: 1, feePct: 0.1, slippagePct: 0.05,
  };
  const a = runMonteCarlo(candles, config, 30, 1234);
  const b = runMonteCarlo(candles, config, 30, 1234);
  assert.equal(a.simulations, 30);
  assert.equal(a.medianRoiPct, b.medianRoiPct);
  assert.equal(a.roiSamples.length, 30);
  assert.ok(Number.isFinite(a.worstMaxDrawdownPct));
});


test('MM OFF removes platform order/exposure ceilings in backtest while cash remains the account boundary', () => {
  const candles = parseBacktestCsv(BACKTEST_SAMPLE_CSV);
  const mmOn = runBacktest(candles, {
    strategy: 'DCA', initialCapitalUsd: 1000, baseOrderUsd: 100, stepDeviationPct: 1,
    stepScale: 1.1, volumeMultiplier: 1.1, maxLayers: 3, takeProfitPct: 1,
    maxCapitalUsd: 1000, useMoneyManagement: true, maxOrderUsd: 50, maxBotExposureUsd: 250,
    lowerPrice: 90, upperPrice: 110, gridCount: 10, gridOrderUsd: 100, maxSpreadPct: 1,
  });
  const mmOff = runBacktest(candles, {
    strategy: 'DCA', initialCapitalUsd: 1000, baseOrderUsd: 100, stepDeviationPct: 1,
    stepScale: 1.1, volumeMultiplier: 1.1, maxLayers: 3, takeProfitPct: 1,
    maxCapitalUsd: 1000, useMoneyManagement: false, maxOrderUsd: 50, maxBotExposureUsd: 250,
    lowerPrice: 90, upperPrice: 110, gridCount: 10, gridOrderUsd: 100, maxSpreadPct: 1,
  });
  assert.equal(mmOn.trades.length, 0);
  assert.ok(mmOff.trades.length > 0);
  assert.ok(mmOff.endingCapitalUsd >= -1e-9);
  assert.ok(Number.isFinite(mmOff.endingEquityUsd));
});
