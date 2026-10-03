import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateOhlcv, nativeStrategyTimeframe, normalizeOhlcvRows, selectLastTwoClosedCandles, STRATEGY_TIMEFRAME_MS } from './candleDriven';

test('10m timeframe aggregates two native 5m candles', () => {
  const rows = normalizeOhlcvRows([
    [600000,100,102,99,101,10],
    [900000,101,104,100,103,12],
    [1200000,103,105,102,104,9],
    [1500000,104,107,103,106,11],
  ]);
  const out = aggregateOhlcv(rows, '10m');
  assert.deepEqual(out[0], [600000,100,104,99,103,22]);
  assert.deepEqual(out[1], [1200000,103,107,102,106,20]);
});

test('3m timeframe only selects closed candles', () => {
  const rows = normalizeOhlcvRows([
    [300000,100,102,99,101,10],
    [480000,101,104,100,103,12],
    [660000,103,105,102,104,9],
  ]);
  const selected = selectLastTwoClosedCandles(rows, '3m', 900000);
  assert.deepEqual(selected?.map((r) => r[0]), [480000, 660000]);
});

test('strategy clock is keyed to candle close timestamp, not polling timestamp', () => {
  const rows = normalizeOhlcvRows([
    [300000,100,101,99,100.5,1],
    [600000,100.5,102,100,101.5,1],
    [900000,101.5,103,101,102.5,1],
  ]);
  const selected = selectLastTwoClosedCandles(rows, '5m', 1001000);
  const lastClosed = selected?.[1];
  assert.ok(lastClosed);
  assert.equal(lastClosed[0] + STRATEGY_TIMEFRAME_MS['5m'], 900000);
  assert.equal(lastClosed[0] + STRATEGY_TIMEFRAME_MS['5m'] <= 1001000, true);
});


test('15m timeframe aggregates three contiguous 5m candles', () => {
  const rows = normalizeOhlcvRows([
    [900000,100,101,99,100.5,1],
    [1200000,100.5,103,100,102,2],
    [1500000,102,105,101,104,3],
    [1800000,104,106,103,105,4],
  ]);
  const out = aggregateOhlcv(rows, '15m');
  assert.deepEqual(out[0], [900000,100,105,99,104,6]);
});

test('larger strategy timeframes use the 5m native base', () => {
  assert.equal(nativeStrategyTimeframe('3m'), '3m');
  assert.equal(nativeStrategyTimeframe('5m'), '5m');
  assert.equal(nativeStrategyTimeframe('10m'), '5m');
  assert.equal(nativeStrategyTimeframe('15m'), '5m');
  assert.equal(nativeStrategyTimeframe('30m'), '5m');
  assert.equal(nativeStrategyTimeframe('1h'), '5m');
});
