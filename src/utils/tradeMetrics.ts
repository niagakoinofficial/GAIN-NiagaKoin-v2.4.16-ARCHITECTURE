import type { TradeRecord } from '../types';

type Lot = { quantity: number; unitCost: number };

export interface TradeMetrics {
  totalCount: number;
  buyCount: number;
  sellCount: number;
  totalVolumeUsdt: number;
  totalRealizedPnl: number;
  realizedTradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: string;
}

function feeInQuote(trade: TradeRecord): number {
  const fee = Number(trade.fee?.cost || 0);
  if (!Number.isFinite(fee) || fee <= 0) return 0;
  const currency = String(trade.fee?.currency || '').toUpperCase();
  const quote = String(trade.symbol || '').split('/')[1]?.toUpperCase() || 'USDT';
  return currency === quote ? fee : 0;
}

/**
 * Uses exchange fills as the source for execution metrics.
 * Realized PnL is calculated FIFO when the exchange payload does not already provide it.
 */
export function calculateTradeMetrics(trades: TradeRecord[]): TradeMetrics {
  const filled = trades
    .filter((t) => t.status === 'filled' || t.status === 'closed')
    .slice()
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

  const lots = new Map<string, Lot[]>();
  const realizedByTrade = new Map<string, number>();

  for (const trade of filled) {
    const symbol = String(trade.symbol || '').toUpperCase();
    const qty = Math.max(0, Number(trade.amount) || 0);
    const price = Math.max(0, Number(trade.price) || 0);
    if (!symbol || qty <= 0 || price <= 0) continue;

    const queue = lots.get(symbol) || [];
    const quoteFee = feeInQuote(trade);

    if (trade.side === 'buy') {
      const unitCost = ((Number(trade.costUsdt) || price * qty) + quoteFee) / qty;
      queue.push({ quantity: qty, unitCost });
      lots.set(symbol, queue);
      continue;
    }

    let remaining = qty;
    let realized = quoteFee ? -quoteFee : 0;
    while (remaining > 1e-12 && queue.length > 0) {
      const lot = queue[0];
      const matched = Math.min(remaining, lot.quantity);
      realized += (price * matched) - (lot.unitCost * matched);
      lot.quantity -= matched;
      remaining -= matched;
      if (lot.quantity <= 1e-12) queue.shift();
    }
    lots.set(symbol, queue);

    const provided = Number(trade.realizedPnl);
    realizedByTrade.set(trade.id, Number.isFinite(provided) && provided !== 0 ? provided : realized);
  }

  const totalRealizedPnl = filled.reduce((sum, trade) => {
    const calculated = realizedByTrade.get(trade.id);
    const provided = Number(trade.realizedPnl);
    return sum + (calculated ?? (Number.isFinite(provided) ? provided : 0));
  }, 0);
  const realizedTrades = filled.filter((trade) => trade.side === 'sell' && realizedByTrade.has(trade.id));
  const winCount = realizedTrades.filter((trade) => (realizedByTrade.get(trade.id) || 0) > 0).length;
  const lossCount = realizedTrades.filter((trade) => (realizedByTrade.get(trade.id) || 0) < 0).length;
  const realizedTradeCount = realizedTrades.length;

  return {
    totalCount: filled.length,
    buyCount: filled.filter((trade) => trade.side === 'buy').length,
    sellCount: filled.filter((trade) => trade.side === 'sell').length,
    totalVolumeUsdt: filled.reduce((sum, trade) => sum + Math.max(0, Number(trade.costUsdt) || 0), 0),
    totalRealizedPnl,
    realizedTradeCount,
    winCount,
    lossCount,
    winRate: realizedTradeCount > 0 ? ((winCount / realizedTradeCount) * 100).toFixed(1) : '—',
  };
}

export function decorateTradesWithRealizedPnl(trades: TradeRecord[]): TradeRecord[] {
  const filled = trades.slice().sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const lots = new Map<string, Lot[]>();

  return filled.map((trade) => {
    const symbol = String(trade.symbol || '').toUpperCase();
    const qty = Math.max(0, Number(trade.amount) || 0);
    const price = Math.max(0, Number(trade.price) || 0);
    if (!symbol || qty <= 0 || price <= 0) return trade;

    const queue = lots.get(symbol) || [];
    if (trade.side === 'buy') {
      const unitCost = ((Number(trade.costUsdt) || price * qty) + feeInQuote(trade)) / qty;
      queue.push({ quantity: qty, unitCost });
      lots.set(symbol, queue);
      return trade;
    }

    let remaining = qty;
    let pnl = -feeInQuote(trade);
    while (remaining > 1e-12 && queue.length > 0) {
      const lot = queue[0];
      const matched = Math.min(remaining, lot.quantity);
      pnl += (price - lot.unitCost) * matched;
      lot.quantity -= matched;
      remaining -= matched;
      if (lot.quantity <= 1e-12) queue.shift();
    }
    lots.set(symbol, queue);
    return { ...trade, realizedPnl: Number.isFinite(Number(trade.realizedPnl)) && Number(trade.realizedPnl) !== 0 ? trade.realizedPnl : pnl };
  });
}
