import type { StrategyCandle } from '../../domain/strategy/types';

export const STRATEGY_TIMEFRAME_MS = {
  '3m': 3 * 60_000,
  '5m': 5 * 60_000,
  '10m': 10 * 60_000,
  '15m': 15 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
} as const;

export type StrategyTimeframe = keyof typeof STRATEGY_TIMEFRAME_MS;
export type OhlcvRow = [number, number, number, number, number, number];

/**
 * Choose a widely supported native exchange timeframe for strategy evaluation.
 * GAIN derives larger/odd timeframes from 5m candles so the UI timeframe is
 * the actual strategy timeframe even when an exchange does not expose it.
 */
export function nativeStrategyTimeframe(timeframe: StrategyTimeframe): '3m' | '5m' {
  return timeframe === '3m' ? '3m' : '5m';
}

export function normalizeOhlcvRows(rows: unknown[]): OhlcvRow[] {
  const seen = new Set<number>();
  return rows
    .filter((row): row is unknown[] => Array.isArray(row) && row.length >= 6)
    .map((row) => [
      Number(row[0]), Number(row[1]), Number(row[2]), Number(row[3]), Number(row[4]), Number(row[5]),
    ] as OhlcvRow)
    .filter((row) => Number.isFinite(row[0]) && row[0] > 0 && row.slice(1).every(Number.isFinite))
    .sort((a, b) => a[0] - b[0])
    .filter((row) => {
      if (seen.has(row[0])) return false;
      seen.add(row[0]);
      return true;
    });
}

/**
 * Aggregate native OHLCV rows into the selected strategy timeframe. A bucket
 * is only emitted when it contains the expected number of native bars. This
 * prevents partial buckets from being evaluated as closed candles.
 */
export function aggregateOhlcv(rows: OhlcvRow[], timeframe: StrategyTimeframe): OhlcvRow[] {
  const targetMs = STRATEGY_TIMEFRAME_MS[timeframe];
  const nativeMs = STRATEGY_TIMEFRAME_MS[nativeStrategyTimeframe(timeframe)];
  if (targetMs === nativeMs) return [...rows].sort((a, b) => a[0] - b[0]);

  const expectedBars = targetMs / nativeMs;
  const buckets = new Map<number, OhlcvRow[]>();
  for (const row of rows) {
    const bucketStart = Math.floor(row[0] / targetMs) * targetMs;
    const bucket = buckets.get(bucketStart) || [];
    bucket.push(row);
    buckets.set(bucketStart, bucket);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .filter(([, bucket]) => {
      if (bucket.length !== expectedBars) return false;
      const sorted = [...bucket].sort((a, b) => a[0] - b[0]);
      for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index][0] - sorted[index - 1][0] !== nativeMs) return false;
      }
      return sorted[0][0] + targetMs === sorted[sorted.length - 1][0] + nativeMs;
    })
    .map(([timestamp, bucket]) => {
      const sorted = [...bucket].sort((a, b) => a[0] - b[0]);
      return [
        timestamp,
        sorted[0][1],
        Math.max(...sorted.map((row) => row[2])),
        Math.min(...sorted.map((row) => row[3])),
        sorted[sorted.length - 1][4],
        sorted.reduce((sum, row) => sum + row[5], 0),
      ] as OhlcvRow;
    });
}

export function selectLastTwoClosedCandles(rows: OhlcvRow[], timeframe: StrategyTimeframe, now: number): [OhlcvRow, OhlcvRow] | null {
  const timeframeMs = STRATEGY_TIMEFRAME_MS[timeframe];
  const closed = rows
    .filter((row) => row[0] + timeframeMs <= now)
    .sort((a, b) => a[0] - b[0]);
  if (closed.length < 2) return null;
  return [closed[closed.length - 2], closed[closed.length - 1]];
}

export function toClosedStrategyCandle(row: OhlcvRow, timeframe: StrategyTimeframe): StrategyCandle {
  const timeframeMs = STRATEGY_TIMEFRAME_MS[timeframe];
  return {
    timeframe,
    timestamp: row[0],
    closeTimestamp: row[0] + timeframeMs,
    open: row[1],
    high: row[2],
    low: row[3],
    close: row[4],
    volume: row[5],
    isClosed: true,
  };
}
