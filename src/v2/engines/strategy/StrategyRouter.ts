import type { StrategyKind } from '../../domain/strategy/types';

export type MarketRegime = 'TREND_UP'|'TREND_DOWN'|'RANGE'|'HIGH_VOLATILITY'|'CRASH'|'RECOVERY';

export function chooseStrategy(regime: MarketRegime): StrategyKind {
  switch (regime) {
    case 'RANGE': return 'GRID';
    case 'TREND_UP': return 'TREND';
    case 'TREND_DOWN': return 'DEFENSIVE';
    case 'CRASH': return 'DEFENSIVE';
    case 'RECOVERY': return 'DCA';
    case 'HIGH_VOLATILITY': return 'DCA';
  }
}
