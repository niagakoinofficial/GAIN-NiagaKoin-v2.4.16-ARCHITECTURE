import type { MarketSnapshot, OrderIntent, RiskContext } from '../../domain/strategy/types';

export type RiskDecision = { approved: true; estimatedSlippagePct: number } | { approved: false; code: string; message: string };

export function estimateMarketSlippage(intent: OrderIntent, market: MarketSnapshot): number {
  if (!market.orderBook || intent.quantity <= 0) return 0;
  const levels = intent.side === 'buy' ? market.orderBook.asks : market.orderBook.bids;
  let remaining = intent.quantity;
  let cost = 0;
  for (const level of levels) {
    if (level.price <= 0 || level.quantity <= 0) continue;
    const qty = Math.min(remaining, level.quantity);
    cost += qty * level.price;
    remaining -= qty;
    if (remaining <= 1e-12) break;
  }
  if (remaining > 1e-12) return Infinity;
  const vwap = cost / intent.quantity;
  return Math.abs(vwap - intent.referencePrice) / intent.referencePrice * 100;
}

export function evaluateRisk(intent: OrderIntent, market: MarketSnapshot, ctx: RiskContext): RiskDecision {
  if (ctx.killSwitch) return { approved: false, code: 'GLOBAL_KILL_SWITCH', message: 'Global kill switch is active.' };
  if (!ctx.exchangeHealthy) return { approved: false, code: 'EXCHANGE_UNHEALTHY', message: 'Exchange health check failed.' };
  if (Date.now() - market.timestamp < 0 || Date.now() - market.timestamp > 10_000) return { approved: false, code: 'STALE_MARKET_DATA', message: 'Market data is stale.' };
  if (!Number.isFinite(intent.notional) || intent.notional <= 0) return { approved: false, code: 'INVALID_NOTIONAL', message: 'Invalid order notional.' };
  if (intent.notional > ctx.maxOrderUsd) return { approved: false, code: 'MAX_ORDER_EXCEEDED', message: 'Order exceeds maximum order size.' };
  if (market.spreadPct > ctx.maxSpreadPct) return { approved: false, code: 'SPREAD_TOO_HIGH', message: 'Market spread is above the configured limit.' };
  const slippage = estimateMarketSlippage(intent, market);
  if (slippage > ctx.maxSlippagePct) return { approved: false, code: 'SLIPPAGE_TOO_HIGH', message: `Estimated slippage ${slippage.toFixed(4)}% exceeds limit.` };
  if (intent.side === 'buy') {
    if (ctx.botExposureUsd + intent.notional > ctx.maxBotExposureUsd) return { approved: false, code: 'MAX_BOT_EXPOSURE', message: 'Bot exposure limit exceeded.' };
    if (ctx.userExposureUsd + intent.notional > ctx.maxUserExposureUsd) return { approved: false, code: 'MAX_USER_EXPOSURE', message: 'User exposure limit exceeded.' };
    if (ctx.portfolioExposureUsd + intent.notional > ctx.maxPortfolioExposureUsd) return { approved: false, code: 'MAX_PORTFOLIO_EXPOSURE', message: 'Portfolio exposure limit exceeded.' };
    if (ctx.futureCommittedUsd + intent.notional > ctx.maxCommittedCapitalUsd) return { approved: false, code: 'MAX_COMMITTED_CAPITAL', message: 'Committed capital limit exceeded.' };
    if (ctx.dailyNetPnlUsd <= -Math.abs(ctx.maxDailyLossUsd)) return { approved: false, code: 'MAX_DAILY_LOSS', message: 'Daily loss limit reached.' };
    if (ctx.drawdownPct >= ctx.maxDrawdownPct) return { approved: false, code: 'MAX_DRAWDOWN', message: 'Maximum drawdown reached.' };
  }
  return { approved: true, estimatedSlippagePct: slippage };
}
