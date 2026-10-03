import type { MarketSnapshot } from '../domain/strategy/types';
import type { MarketRegime } from '../engines/strategy/StrategyRouter';

export interface RegimeResult { regime: MarketRegime; confidence: number; reasons: string[]; }

export function detectMarketRegime(market: MarketSnapshot, recentReturnsPct: number[] = []): RegimeResult {
  const volatility = market.volatilityPct ?? 0;
  const lastReturn = recentReturnsPct.at(-1) ?? 0;
  const trend = recentReturnsPct.reduce((a, b) => a + b, 0);
  if (Math.abs(lastReturn) >= 8 || volatility >= 12) return { regime: 'CRASH', confidence: 0.75, reasons: ['extreme move or volatility'] };
  if (trend > 2) return { regime: 'TREND_UP', confidence: 0.65, reasons: ['positive recent returns'] };
  if (trend < -2) return { regime: 'TREND_DOWN', confidence: 0.65, reasons: ['negative recent returns'] };
  if (volatility >= 5) return { regime: 'HIGH_VOLATILITY', confidence: 0.6, reasons: ['elevated volatility'] };
  return { regime: 'RANGE', confidence: 0.55, reasons: ['no dominant directional regime'] };
}
