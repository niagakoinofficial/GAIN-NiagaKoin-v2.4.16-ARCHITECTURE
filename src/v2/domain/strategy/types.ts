export type StrategyKind = 'DCA' | 'GRID' | 'HYBRID' | 'TREND' | 'DEFENSIVE';
export type StrategyAction = 'BUY' | 'SELL' | 'HOLD' | 'PAUSE';

export interface StrategyCandle {
  timeframe: string;
  timestamp: number;
  closeTimestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  isClosed: true;
}

export interface MarketSnapshot {
  exchange: string;
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  timestamp: number;
  spreadPct: number;
  volatilityPct?: number;
  volume24h?: number;
  orderBook?: OrderBook;
  timeframe?: string;
  candle?: StrategyCandle;
  previousCandleClose?: number;
}

export interface PriceLevel { price: number; quantity: number; }
export interface OrderBook { bids: PriceLevel[]; asks: PriceLevel[]; }

export interface DcaConfig {
  baseOrderUsd: number;
  stepDeviationPct: number;
  stepScale: number;
  volumeMultiplier: number;
  maxLayers: number;
  maxCapitalUsd: number;
  takeProfitPct: number;
  trailingTpPct: number;
  callbackPct: number;
  minPrice?: number;
  maxPrice?: number;
}

export interface DcaLayer {
  layerNo: number;
  deviationPct: number;
  amountUsd: number;
  triggerPrice?: number;
  status: 'WAITING' | 'TRIGGERED' | 'RISK_BLOCKED' | 'ORDERED' | 'FILLED' | 'CLOSED';
}

export interface GridConfig {
  lowerPrice: number;
  upperPrice: number;
  gridCount: number;
  orderSizeUsd: number;
  takeProfitPct: number;
  maxCapitalUsd: number;
  arithmetic?: boolean;
}

export interface GridLevel {
  id: string;
  index: number;
  price: number;
  side: 'BUY' | 'SELL';
  status: 'WAITING' | 'ORDERED' | 'FILLED' | 'PAUSED' | 'COOLDOWN';
  pairedLevelId?: string;
  filledQty?: number;
}

export interface PositionState {
  quantity: number;
  averageEntryPrice: number;
  realizedPnl: number;
  unrealizedPnl?: number;
  fees?: number;
}

export interface OrderIntent {
  id: string;
  idempotencyKey: string;
  botId: string;
  userId: string;
  strategy: StrategyKind;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: number;
  referencePrice: number;
  notional: number;
  layerNo?: number;
  gridLevelId?: string;
  reason: string;
  createdAt: number;
}

export interface RiskContext {
  botExposureUsd: number;
  userExposureUsd: number;
  portfolioExposureUsd: number;
  futureCommittedUsd: number;
  dailyNetPnlUsd: number;
  drawdownPct: number;
  maxOrderUsd: number;
  maxBotExposureUsd: number;
  maxUserExposureUsd: number;
  maxPortfolioExposureUsd: number;
  maxCommittedCapitalUsd: number;
  maxDailyLossUsd: number;
  maxDrawdownPct: number;
  maxSpreadPct: number;
  maxSlippagePct: number;
  marketPriceTimestamp: number;
  now: number;
  killSwitch: boolean;
  exchangeHealthy: boolean;
}
