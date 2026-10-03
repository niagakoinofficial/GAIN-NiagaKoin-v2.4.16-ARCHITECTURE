import type { ExecutedLayerDetail, TradingPosition } from '../types';

function parseQuantity(position: TradingPosition): number {
  if (Number.isFinite(Number(position.totalCoinQty)) && Number(position.totalCoinQty) > 0) {
    return Number(position.totalCoinQty);
  }
  const raw = String(position.allocationQty || '');
  const match = raw.match(/[+-]?(?:\d+\.?\d*|\.\d+)/);
  const qty = match ? Number(match[0]) : 0;
  return Number.isFinite(qty) ? qty : 0;
}

export function generateDefaultLayersForPosition(position: TradingPosition): ExecutedLayerDetail[] {
  const currentPrice = Number(position.price) > 0 ? Number(position.price) : 0;
  const quantity = parseQuantity(position);
  const buyPrice = Number(position.avgBuyPrice) > 0
    ? Number(position.avgBuyPrice)
    : Number(position.initialEntryPrice) > 0
      ? Number(position.initialEntryPrice)
      : currentPrice;

  if (!(quantity > 0) || !(buyPrice > 0)) return [];

  const costUsdt = Number((quantity * buyPrice).toFixed(4));
  const pnlUsdt = Number(((currentPrice - buyPrice) * quantity).toFixed(4));
  const pnlPct = buyPrice > 0 ? Number((((currentPrice - buyPrice) / buyPrice) * 100).toFixed(2)) : 0;
  const estimatedTpPrice = Number((buyPrice * 1.015).toFixed(4));

  return [{
    id: `position-${position.id}-aggregate`,
    orderId: position.botId || position.id,
    symbol: position.pair,
    coin: position.coin,
    side: 'buy',
    layerStep: 1,
    layerType: 'average',
    label: `BUY -> ${quantity.toFixed(8)} ${position.coin}`,
    amount: quantity,
    costUsdt,
    buyPrice,
    currentPrice,
    estimatedTpPrice,
    estimatedTpPct: 1.5,
    estimatedTpUsdt: Number((costUsdt * 0.015).toFixed(4)),
    floatingPnlUsdt: pnlUsdt,
    floatingPnlPct: pnlPct,
    fee: 0,
    feeAsset: 'USDT',
    date: 'Live position snapshot',
    timestamp: Date.now(),
    isInitialEntry: true,
    status: 'filled',
  }];
}
