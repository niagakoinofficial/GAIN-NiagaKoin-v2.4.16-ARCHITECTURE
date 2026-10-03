import type { DcaConfig, DcaLayer, MarketSnapshot, OrderIntent, PositionState } from '../../domain/strategy/types';

export function generateDcaLayers(config: DcaConfig): DcaLayer[] {
  const layers: DcaLayer[] = [];
  let deviation = 0;
  let amount = config.baseOrderUsd;
  let committed = 0;
  for (let layerNo = 0; layerNo < config.maxLayers; layerNo += 1) {
    if (layerNo > 0) {
      deviation = deviation === 0 ? config.stepDeviationPct : deviation * config.stepScale;
      amount *= config.volumeMultiplier;
    }
    if (committed + amount > config.maxCapitalUsd + 1e-12) break;
    layers.push({ layerNo, deviationPct: deviation, amountUsd: amount, status: 'WAITING' });
    committed += amount;
  }
  return layers;
}

export function refreshDcaTriggerPrices(layers: DcaLayer[], anchorPrice: number): DcaLayer[] {
  return layers.map((layer) => ({ ...layer, triggerPrice: anchorPrice * (1 - layer.deviationPct / 100) }));
}

export function evaluateDca(
  botId: string,
  userId: string,
  symbol: string,
  config: DcaConfig,
  layers: DcaLayer[],
  position: PositionState,
  market: MarketSnapshot,
): { intent?: OrderIntent; layers: DcaLayer[]; reason: string } {
  if (market.last <= 0) return { layers, reason: 'INVALID_PRICE' };
  if (config.minPrice && market.last < config.minPrice) return { layers, reason: 'BELOW_MIN_PRICE' };
  if (config.maxPrice && market.last > config.maxPrice) return { layers, reason: 'ABOVE_MAX_PRICE' };
  const anchorPrice = position.averageEntryPrice || market.last;
  const refreshed = refreshDcaTriggerPrices(layers, anchorPrice);
  if (position.quantity <= 0) {
    const base = refreshed.find((layer) => layer.layerNo === 0 && layer.status === 'WAITING');
    if (!base) return { layers: refreshed, reason: 'BASE_ORDER_ALREADY_USED' };
    const intent: OrderIntent = {
      id: `dca-${botId}-base-${Math.floor(market.timestamp / 1000)}`,
      idempotencyKey: `${botId}:DCA:0`,
      botId, userId, strategy: 'DCA', symbol, side: 'buy', type: 'market',
      quantity: base.amountUsd / market.last, referencePrice: market.last, notional: base.amountUsd,
      layerNo: 0, reason: 'DCA base order', createdAt: Date.now(),
    };
    return { intent, layers: refreshed.map((l) => l.layerNo === 0 ? { ...l, status: 'TRIGGERED' as const, triggerPrice: market.last } : l), reason: 'DCA_BASE_TRIGGERED' };
  }
  const next = refreshed.find((layer) => layer.status === 'WAITING' && layer.layerNo > 0);
  if (!next || market.last > (next.triggerPrice || Infinity)) return { layers: refreshed, reason: 'WAITING_FOR_TRIGGER' };

  const id = `dca-${botId}-${next.layerNo}-${Math.floor(market.timestamp / 1000)}`;
  const intent: OrderIntent = {
    id,
    idempotencyKey: `${botId}:DCA:${next.layerNo}`,
    botId,
    userId,
    strategy: 'DCA',
    symbol,
    side: 'buy',
    type: 'market',
    quantity: next.amountUsd / market.last,
    referencePrice: market.last,
    notional: next.amountUsd,
    layerNo: next.layerNo,
    reason: `DCA layer ${next.layerNo} trigger at ${next.triggerPrice}`,
    createdAt: Date.now(),
  };
  return { intent, layers: refreshed.map((l) => l.layerNo === next.layerNo ? { ...l, status: 'TRIGGERED' } : l), reason: 'DCA_TRIGGERED' };
}
