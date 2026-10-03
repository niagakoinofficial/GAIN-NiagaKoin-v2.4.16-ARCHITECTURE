import { generateDcaLayers, refreshDcaTriggerPrices } from '../v2/engines/strategy/DcaEngine';
import { generateGridLevels } from '../v2/engines/strategy/GridEngine';
import type { DcaConfig, GridConfig, MarketSnapshot } from '../v2/domain/strategy/types';

export interface BacktestCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface BacktestConfig {
  strategy: 'DCA' | 'GRID';
  initialCapitalUsd: number;
  baseOrderUsd: number;
  stepDeviationPct: number;
  stepScale: number;
  volumeMultiplier: number;
  maxLayers: number;
  takeProfitPct: number;
  maxCapitalUsd: number;
  useMoneyManagement: boolean;
  maxOrderUsd: number;
  maxBotExposureUsd: number;
  lowerPrice: number;
  upperPrice: number;
  gridCount: number;
  gridOrderUsd: number;
  maxSpreadPct: number;
  feePct?: number;
  slippagePct?: number;
}

export interface BacktestTrade {
  timestamp: number;
  side: 'BUY' | 'SELL';
  price: number;
  quantity: number;
  notional: number;
  reason: string;
  pnlUsd: number;
}

export interface BacktestResult {
  initialCapitalUsd: number;
  endingCapitalUsd: number;
  endingEquityUsd: number;
  pnlUsd: number;
  roiPct: number;
  maxDrawdownPct: number;
  winRatePct: number;
  trades: BacktestTrade[];
  bars: number;
  skippedBars: number;
  peakEquityUsd: number;
}

const EPSILON = 1e-12;

export function parseBacktestCsv(csv: string): BacktestCandle[] {
  const rows = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (rows.length < 2) throw new Error('CSV membutuhkan header dan minimal 1 candle.');

  const header = rows[0].split(',').map((v) => v.trim().toLowerCase());
  const find = (names: string[]) => {
    for (const name of names) {
      const index = header.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  };
  const timestampIndex = find(['timestamp', 'time', 'date']);
  const openIndex = find(['open', 'o']);
  const highIndex = find(['high', 'h']);
  const lowIndex = find(['low', 'l']);
  const closeIndex = find(['close', 'c']);
  const volumeIndex = find(['volume', 'v']);
  if ([timestampIndex, openIndex, highIndex, lowIndex, closeIndex].some((i) => i < 0)) {
    throw new Error('CSV harus memiliki timestamp, open, high, low, close.');
  }

  const candles = rows.slice(1).map((row, rowOffset) => {
    const parts = row.split(',').map((v) => v.trim());
    const rawTs = parts[timestampIndex];
    const numericTs = Number(rawTs);
    const timestamp = Number.isFinite(numericTs)
      ? (numericTs < 1e12 ? numericTs * 1000 : numericTs)
      : Date.parse(rawTs);
    const candle = {
      timestamp,
      open: Number(parts[openIndex]),
      high: Number(parts[highIndex]),
      low: Number(parts[lowIndex]),
      close: Number(parts[closeIndex]),
      volume: volumeIndex >= 0 ? Number(parts[volumeIndex]) : undefined,
    };
    if (!Number.isFinite(candle.timestamp) || [candle.open, candle.high, candle.low, candle.close].some((v) => !Number.isFinite(v) || v <= 0)) {
      throw new Error(`Baris CSV ke-${rowOffset + 2} tidak valid.`);
    }
    return candle;
  });
  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

function marketFromCandle(candle: BacktestCandle): MarketSnapshot {
  return {
    exchange: 'backtest',
    symbol: 'BTC/USDT',
    bid: candle.close,
    ask: candle.close,
    last: candle.close,
    timestamp: candle.timestamp,
    spreadPct: 0,
    volume24h: candle.volume,
  };
}

export function runBacktest(candles: BacktestCandle[], config: BacktestConfig): BacktestResult {
  if (!candles.length) throw new Error('Tidak ada candle untuk di-backtest.');
  if (!Number.isFinite(config.initialCapitalUsd) || config.initialCapitalUsd <= 0) throw new Error('Initial capital harus > 0.');

  let cash = config.initialCapitalUsd;
  let qty = 0;
  let avgEntry = 0;
  let realizedPnl = 0;
  let skippedBars = 0;
  let peakEquity = cash;
  let maxDrawdownPct = 0;
  const trades: BacktestTrade[] = [];
  const effectiveMaxCapitalUsd = config.useMoneyManagement ? Math.max(0, config.maxCapitalUsd) : Number.POSITIVE_INFINITY;
  const effectiveMaxOrderUsd = config.useMoneyManagement ? Math.max(0, config.maxOrderUsd) : Number.POSITIVE_INFINITY;
  const effectiveMaxBotExposureUsd = config.useMoneyManagement ? Math.max(0, config.maxBotExposureUsd) : Number.POSITIVE_INFINITY;

  const dcaConfig: DcaConfig = {
    baseOrderUsd: config.baseOrderUsd,
    stepDeviationPct: config.stepDeviationPct,
    stepScale: config.stepScale,
    volumeMultiplier: config.volumeMultiplier,
    maxLayers: config.maxLayers,
    maxCapitalUsd: effectiveMaxCapitalUsd,
    takeProfitPct: config.takeProfitPct,
    trailingTpPct: 0,
    callbackPct: 0,
  };
  let dcaLayers = refreshDcaTriggerPrices(generateDcaLayers(dcaConfig), candles[0].close);
  let gridLevels = config.strategy === 'GRID'
    ? generateGridLevels({
      lowerPrice: config.lowerPrice,
      upperPrice: config.upperPrice,
      gridCount: config.gridCount,
      orderSizeUsd: config.gridOrderUsd,
      takeProfitPct: config.takeProfitPct,
      maxCapitalUsd: effectiveMaxCapitalUsd,
    })
    : [];

  const recordEquity = (price: number) => {
    const equity = cash + qty * price;
    if (equity > peakEquity) peakEquity = equity;
    const drawdown = peakEquity > EPSILON ? ((peakEquity - equity) / peakEquity) * 100 : 0;
    if (drawdown > maxDrawdownPct) maxDrawdownPct = drawdown;
  };

  const executionPriceForExposure = (price: number) => price * (1 + Number(config.slippagePct ?? 0.05) / 100);

  const buy = (price: number, notional: number, timestamp: number, reason: string) => {
    const feePct = Number(config.feePct ?? 0.1);
    const slippagePct = Number(config.slippagePct ?? 0.05);
    const spend = Math.min(cash, Math.max(0, notional));
    if (spend <= EPSILON || price <= 0) return false;
    if (spend > effectiveMaxOrderUsd + EPSILON) return false;
    const projectedExposure = qty * executionPriceForExposure(price) + spend;
    if (projectedExposure > effectiveMaxBotExposureUsd + EPSILON) return false;
    if (cash - spend < -EPSILON) return false;
    const executionPrice = price * (1 + slippagePct / 100);
    const fee = spend * feePct / 100;
    const addedQty = Math.max(0, (spend - fee) / executionPrice);
    const nextQty = qty + addedQty;
    avgEntry = nextQty > EPSILON ? ((avgEntry * qty) + (executionPrice * addedQty)) / nextQty : 0;
    qty = nextQty;
    cash -= spend;
    trades.push({ timestamp, side: 'BUY', price: executionPrice, quantity: addedQty, notional: spend, reason: `${reason} (fee ${feePct}%, slip ${slippagePct}%)`, pnlUsd: 0 });
    return true;
  };

  const sell = (price: number, requestedQty: number, timestamp: number, reason: string) => {
    const sellQty = Math.min(qty, Math.max(0, requestedQty));
    if (sellQty <= EPSILON || price <= 0) return false;
    const feePct = Number(config.feePct ?? 0.1);
    const slippagePct = Number(config.slippagePct ?? 0.05);
    const executionPrice = price * (1 - slippagePct / 100);
    const grossProceeds = sellQty * executionPrice;
    const fee = grossProceeds * feePct / 100;
    const proceeds = grossProceeds - fee;
    const pnl = (executionPrice - avgEntry) * sellQty - fee;
    cash += proceeds;
    qty -= sellQty;
    realizedPnl += pnl;
    if (qty <= EPSILON) {
      qty = 0;
      avgEntry = 0;
    }
    trades.push({ timestamp, side: 'SELL', price: executionPrice, quantity: sellQty, notional: proceeds, reason: `${reason} (fee ${feePct}%, slip ${slippagePct}%)`, pnlUsd: pnl });
    return true;
  };

  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    const market = marketFromCandle(candle);
    if (config.strategy === 'DCA') {
      dcaLayers = refreshDcaTriggerPrices(dcaLayers, avgEntry || candle.close);
      const layer = dcaLayers.find((entry) => entry.status === 'WAITING' && (qty <= EPSILON ? entry.layerNo === 0 : entry.layerNo > 0));
      if (layer && (qty <= EPSILON || candle.low <= (layer.triggerPrice || candle.close))) {
        const price = qty <= EPSILON ? candle.close : Math.min(candle.close, layer.triggerPrice || candle.close);
        if (buy(price, layer.amountUsd, candle.timestamp, `DCA layer ${layer.layerNo}`)) {
          dcaLayers = dcaLayers.map((entry) => entry.layerNo === layer.layerNo ? { ...entry, status: 'FILLED' as const } : entry);
        }
      }
      if (qty > EPSILON && candle.high >= avgEntry * (1 + config.takeProfitPct / 100)) {
        sell(avgEntry * (1 + config.takeProfitPct / 100), qty, candle.timestamp, 'DCA take profit');
        dcaLayers = dcaLayers.map((entry) => ({ ...entry, status: 'WAITING' as const }));
      }
    } else {
      const previousClose = i === 0 ? candle.open : candles[i - 1].close;
      const triggeredBuy = gridLevels.find((level) => level.status === 'WAITING' && level.side === 'BUY' && previousClose > level.price && candle.low <= level.price);
      const triggeredSell = gridLevels.find((level) => level.status === 'WAITING' && level.side === 'SELL' && previousClose < level.price && candle.high >= level.price);
      if (triggeredBuy) {
        const bought = buy(triggeredBuy.price, config.gridOrderUsd, candle.timestamp, `GRID buy ${triggeredBuy.id}`);
        if (bought) gridLevels = gridLevels.map((level) => level.id === triggeredBuy.id ? { ...level, status: 'FILLED' as const } : level);
      }
      if (triggeredSell && qty > EPSILON) {
        const sold = sell(triggeredSell.price, Math.min(qty, config.gridOrderUsd / triggeredSell.price), candle.timestamp, `GRID sell ${triggeredSell.id}`);
        if (sold) gridLevels = gridLevels.map((level) => level.id === triggeredSell.id ? { ...level, status: 'COOLDOWN' as const } : level);
      }
      if (qty > EPSILON && candle.high >= avgEntry * (1 + config.takeProfitPct / 100)) {
        sell(avgEntry * (1 + config.takeProfitPct / 100), qty, candle.timestamp, 'GRID take profit');
        gridLevels = gridLevels.map((level) => level.status === 'COOLDOWN' ? { ...level, status: 'WAITING' as const } : level);
      }
    }
    if (market.spreadPct > config.maxSpreadPct) skippedBars += 1;
    recordEquity(candle.close);
  }

  const finalPrice = candles[candles.length - 1].close;
  const endingEquityUsd = cash + qty * finalPrice;
  const pnlUsd = endingEquityUsd - config.initialCapitalUsd;
  const winningTrades = trades.filter((trade) => trade.side === 'SELL' && trade.pnlUsd > 0).length;
  const closedTrades = trades.filter((trade) => trade.side === 'SELL').length;

  return {
    initialCapitalUsd: config.initialCapitalUsd,
    endingCapitalUsd: cash,
    endingEquityUsd,
    pnlUsd,
    roiPct: config.initialCapitalUsd > EPSILON ? (pnlUsd / config.initialCapitalUsd) * 100 : 0,
    maxDrawdownPct,
    winRatePct: closedTrades ? (winningTrades / closedTrades) * 100 : 0,
    trades,
    bars: candles.length,
    skippedBars,
    peakEquityUsd: peakEquity,
  };
}

export const BACKTEST_SAMPLE_CSV = `timestamp,open,high,low,close,volume\n2026-01-01T00:00:00Z,100,102,99,101,1000\n2026-01-01T01:00:00Z,101,103,100,102,1100\n2026-01-01T02:00:00Z,102,104,101,103,1200\n2026-01-01T03:00:00Z,103,103,98,99,1600\n2026-01-01T04:00:00Z,99,100,96,97,1900\n2026-01-01T05:00:00Z,97,101,96,100,1700\n2026-01-01T06:00:00Z,100,104,99,103,1500\n2026-01-01T07:00:00Z,103,106,102,105,1400`;


export interface MonteCarloResult {
  simulations: number;
  seed: number;
  medianRoiPct: number;
  p05RoiPct: number;
  p95RoiPct: number;
  medianMaxDrawdownPct: number;
  worstMaxDrawdownPct: number;
  positiveOutcomePct: number;
  roiSamples: number[];
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function runMonteCarlo(candles: BacktestCandle[], config: BacktestConfig, simulations = 200, seed = 20261002): MonteCarloResult {
  if (candles.length < 3) throw new Error('Monte Carlo membutuhkan minimal 3 candle.');
  const count = Math.max(20, Math.min(2000, Math.floor(simulations)));
  const random = seededRandom(seed);
  const returns = candles.slice(1).map((c, i) => {
    const prev = candles[i].close;
    return prev > 0 ? c.close / prev - 1 : 0;
  }).filter((value) => Number.isFinite(value));
  const samples: number[] = [];
  const dd: number[] = [];
  const first = candles[0];
  for (let simulation = 0; simulation < count; simulation += 1) {
    const synthetic: BacktestCandle[] = [{ ...first }];
    let close = first.close;
    for (let i = 1; i < candles.length; i += 1) {
      const sampled = returns[Math.floor(random() * returns.length)] || 0;
      const nextClose = Math.max(1e-8, close * (1 + sampled));
      const wiggle = Math.max(0.0001, Math.abs(sampled) * 0.5);
      synthetic.push({ timestamp: first.timestamp + i * 60_000, open: close, close: nextClose, high: Math.max(close, nextClose) * (1 + wiggle), low: Math.min(close, nextClose) * Math.max(0.0001, 1 - wiggle), volume: candles[i].volume });
      close = nextClose;
    }
    const result = runBacktest(synthetic, config);
    samples.push(result.roiPct);
    dd.push(result.maxDrawdownPct);
  }
  samples.sort((a,b)=>a-b); dd.sort((a,b)=>a-b);
  const quantile=(arr:number[], q:number)=>arr[Math.min(arr.length-1, Math.max(0, Math.floor((arr.length-1)*q)))];
  return { simulations: count, seed, medianRoiPct: quantile(samples,0.5), p05RoiPct: quantile(samples,0.05), p95RoiPct: quantile(samples,0.95), medianMaxDrawdownPct: quantile(dd,0.5), worstMaxDrawdownPct: quantile(dd,0.95), positiveOutcomePct: (samples.filter(v=>v>0).length/samples.length)*100, roiSamples:samples };
}
