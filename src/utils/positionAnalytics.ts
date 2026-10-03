import type { TradingPosition, UserWallet } from '../types';

export interface AnalyticsEngineBot {
  status?: string;
  recoveryState?: 'HEALTHY' | 'RECONCILIATION_PENDING' | 'STARTUP_RESUME_REQUIRED' | 'ORDER_STATUS_UNCERTAIN' | 'ERROR';
  pendingOrderStatus?: 'submitting' | 'reconciling' | 'unknown' | 'filled' | null;
  realizedPnlToday?: number;
  positionQty?: number;
  avgEntryPrice?: number;
}

export interface PositionAnalytics {
  positionCount: number;
  activeCount: number;
  inactiveCount: number;
  profitableCount: number;
  drawdownCount: number;
  totalCostUsdt: number;
  totalMarketValueUsdt: number;
  floatingPnlUsdt: number;
  floatingRoiPct: number;
  realizedPnlTodayUsdt: number;
  exposurePct: number;
  layerUtilizationPct: number;
  currentDrawdownUsdt: number;
  currentDrawdownPct: number;
  topPositionConcentrationPct: number;
  runtimeHealthyCount: number;
  runtimeRiskCount: number;
  pendingOrderCount: number;
  reconciliationCount: number;
  uncertainOrderCount: number;
  errorCount: number;
  healthScore: number;
  pnlLeaders: Array<{ pair: string; pnl: number; sharePct: number; botId?: string; id?: string }>;
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function positionCost(position: TradingPosition): number {
  const explicit = toNumber(position.totalCostUsdt);
  if (explicit > 0) return explicit;
  const allocation = Number.parseFloat(position.allocationUsdt || '0');
  return Number.isFinite(allocation) && allocation > 0 ? allocation : 0;
}

function positionMarketValue(position: TradingPosition): number {
  const qty = toNumber(position.totalCoinQty);
  const price = toNumber(position.price);
  if (qty > 0 && price > 0) return qty * price;
  return Math.max(0, positionCost(position) + toNumber(position.floatingPnl));
}

export function calculatePositionAnalytics(
  positions: TradingPosition[],
  wallet: UserWallet,
  engineBots: AnalyticsEngineBot[] = []
): PositionAnalytics {
  const positionCount = positions.length;
  const active = positions.filter((position) => position.status === 'active' || position.status === 'averaging');
  const activeCount = active.length;
  const inactiveCount = positions.filter((position) => position.status === 'inactive').length;
  const floatingPnlUsdt = positions.reduce((sum, position) => sum + toNumber(position.floatingPnl), 0);
  const totalCostUsdt = positions.reduce((sum, position) => sum + positionCost(position), 0);
  const totalMarketValueUsdt = positions.reduce((sum, position) => sum + positionMarketValue(position), 0);
  const profitableCount = positions.filter((position) => toNumber(position.floatingPnl) > 0).length;
  const drawdownCount = positions.filter((position) => toNumber(position.floatingPnl) < 0 && position.status !== 'inactive').length;
  const currentDrawdownUsdt = Math.abs(positions.reduce((sum, position) => {
    const pnl = toNumber(position.floatingPnl);
    return pnl < 0 ? sum + pnl : sum;
  }, 0));
  const floatingRoiPct = totalCostUsdt > 0 ? (floatingPnlUsdt / totalCostUsdt) * 100 : 0;
  const currentDrawdownPct = totalCostUsdt > 0 ? (currentDrawdownUsdt / totalCostUsdt) * 100 : 0;
  const deployedCapitalUsdt = totalCostUsdt > 0
    ? totalCostUsdt
    : toNumber(wallet.allocatedAssetUsdt);
  const portfolioCapital = Math.max(0, toNumber(wallet.liquidBalance) + deployedCapitalUsdt);
  const exposurePct = portfolioCapital > 0 ? (deployedCapitalUsdt / portfolioCapital) * 100 : 0;
  const maxLayerCapacity = active.reduce((sum, position) => sum + Math.max(0, toNumber(position.maxStep)), 0);
  const usedLayers = active.reduce((sum, position) => sum + Math.max(0, toNumber(position.stepLayer)), 0);
  const layerUtilizationPct = maxLayerCapacity > 0 ? Math.min(100, (usedLayers / maxLayerCapacity) * 100) : 0;
  const topPositionCost = positions.reduce((max, position) => Math.max(max, positionCost(position)), 0);
  const topPositionConcentrationPct = totalCostUsdt > 0 ? (topPositionCost / totalCostUsdt) * 100 : 0;

  const runtimeHealthyCount = engineBots.filter((bot) => (bot.recoveryState || 'HEALTHY') === 'HEALTHY' && !bot.pendingOrderStatus).length;
  const pendingOrderCount = engineBots.filter((bot) => Boolean(bot.pendingOrderStatus)).length;
  const reconciliationCount = engineBots.filter((bot) => bot.recoveryState === 'RECONCILIATION_PENDING').length;
  const uncertainOrderCount = engineBots.filter((bot) => bot.recoveryState === 'ORDER_STATUS_UNCERTAIN').length;
  const errorCount = engineBots.filter((bot) => bot.recoveryState === 'ERROR' || bot.status === 'error').length;
  const startupResumeCount = engineBots.filter((bot) => bot.recoveryState === 'STARTUP_RESUME_REQUIRED').length;
  const runtimeRiskCount = pendingOrderCount + reconciliationCount + startupResumeCount + uncertainOrderCount + errorCount;
  const realizedPnlTodayUsdt = engineBots.reduce((sum, bot) => sum + toNumber(bot.realizedPnlToday), 0);

  const riskPenalty = Math.min(60, runtimeRiskCount * 15 + currentDrawdownPct * 2 + Math.max(0, layerUtilizationPct - 75) * 0.4);
  const healthScore = Math.max(0, Math.min(100, Math.round(100 - riskPenalty)));

  const pnlLeaders = positions
    .map((position) => ({
      pair: position.pair,
      id: position.id,
      pnl: toNumber(position.floatingPnl),
      sharePct: Math.abs(floatingPnlUsdt) > 1e-12
        ? (toNumber(position.floatingPnl) / Math.abs(floatingPnlUsdt)) * 100
        : 0,
    }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
    .slice(0, 5);

  return {
    positionCount,
    activeCount,
    inactiveCount,
    profitableCount,
    drawdownCount,
    totalCostUsdt,
    totalMarketValueUsdt,
    floatingPnlUsdt,
    floatingRoiPct,
    realizedPnlTodayUsdt,
    exposurePct,
    layerUtilizationPct,
    currentDrawdownUsdt,
    currentDrawdownPct,
    topPositionConcentrationPct,
    runtimeHealthyCount,
    runtimeRiskCount,
    pendingOrderCount,
    reconciliationCount,
    uncertainOrderCount,
    errorCount,
    healthScore,
    pnlLeaders,
  };
}
