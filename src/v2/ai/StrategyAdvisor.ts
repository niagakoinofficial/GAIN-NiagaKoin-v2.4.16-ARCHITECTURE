import type { DcaConfig, GridConfig } from '../domain/strategy/types';
import type { RegimeResult } from './MarketRegime';

export interface StrategyRecommendation { strategy: 'DCA'|'GRID'|'DEFENSIVE'; confidence: number; dca?: Partial<DcaConfig>; grid?: Partial<GridConfig>; }
export function recommend(regime: RegimeResult): StrategyRecommendation {
  if (regime.regime === 'RANGE') return { strategy: 'GRID', confidence: regime.confidence, grid: { takeProfitPct: 0.8 } };
  if (regime.regime === 'RECOVERY') return { strategy: 'DCA', confidence: regime.confidence, dca: { volumeMultiplier: 1.1 } };
  if (regime.regime === 'HIGH_VOLATILITY') return { strategy: 'DCA', confidence: regime.confidence, dca: { volumeMultiplier: 1, stepScale: 1.5 } };
  return { strategy: 'DEFENSIVE', confidence: regime.confidence };
}
