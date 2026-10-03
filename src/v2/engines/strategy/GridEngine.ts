import type { GridConfig, GridLevel, MarketSnapshot, OrderIntent, PositionState } from '../../domain/strategy/types';

export function generateGridLevels(config: GridConfig): GridLevel[] {
  if (config.gridCount < 1 || config.upperPrice <= config.lowerPrice) return [];
  const spacing = (config.upperPrice - config.lowerPrice) / config.gridCount;
  return Array.from({ length: config.gridCount + 1 }, (_, index) => {
    const price = config.lowerPrice + spacing * index;
    const side: 'BUY' | 'SELL' = index < Math.floor(config.gridCount / 2) ? 'BUY' : 'SELL';
    return { id: `grid-${index}`, index, price, side, status: 'WAITING' };
  });
}

export function evaluateGrid(
  botId: string,
  userId: string,
  symbol: string,
  config: GridConfig,
  levels: GridLevel[],
  position: PositionState,
  market: MarketSnapshot,
  previousPrice = market.last,
): { intent?: OrderIntent; levels: GridLevel[]; reason: string } {
  if (market.last < config.lowerPrice || market.last > config.upperPrice) return { levels, reason: 'OUTSIDE_GRID_RANGE' };
  const crossedBuy = levels
    .filter((l) => l.status === 'WAITING' && l.side === 'BUY' && previousPrice > l.price && market.last <= l.price)
    .sort((a, b) => b.price - a.price)[0];
  const crossedSell = levels
    .filter((l) => l.status === 'WAITING' && l.side === 'SELL' && previousPrice < l.price && market.last >= l.price)
    .sort((a, b) => a.price - b.price)[0];
  const level = crossedBuy || crossedSell;
  if (!level) return { levels, reason: 'NO_CROSSED_GRID_LEVEL' };
  if (level.side === 'SELL' && position.quantity <= 0) return { levels, reason: 'NO_POSITION_FOR_SELL' };

  const side = level.side === 'BUY' ? 'buy' : 'sell';
  const quantity = level.side === 'BUY' ? config.orderSizeUsd / market.last : Math.min(position.quantity, config.orderSizeUsd / market.last);
  const intent: OrderIntent = {
    id: `${botId}-${level.id}-${Math.floor(market.timestamp / 1000)}`,
    idempotencyKey: `${botId}:GRID:${level.id}:${side}`,
    botId,
    userId,
    strategy: 'GRID',
    symbol,
    side,
    type: 'limit',
    quantity,
    referencePrice: level.price,
    notional: quantity * level.price,
    gridLevelId: level.id,
    reason: `Grid ${side.toUpperCase()} level ${level.index} @ ${level.price}`,
    createdAt: Date.now(),
  };
  return { intent, levels: levels.map((l) => l.id === level.id ? { ...l, status: 'ORDERED' as const } : l), reason: 'GRID_LEVEL_TRIGGERED' };
}

export function pairGridLevel(levels: GridLevel[], filledLevelId: string, fillPrice: number): GridLevel[] {
  return levels.map((level) => {
    if (level.id !== filledLevelId) return level;
    return { ...level, status: 'FILLED' as const, filledQty: level.filledQty };
  }).map((level) => {
    if (level.id === filledLevelId) return level;
    if (Math.abs(level.price - fillPrice) < 1e-12) return { ...level, status: 'COOLDOWN' as const };
    return level;
  });
}
