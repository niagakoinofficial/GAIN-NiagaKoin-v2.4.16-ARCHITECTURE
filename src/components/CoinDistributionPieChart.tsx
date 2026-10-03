import { useState, useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { TradingPosition, UserWallet } from '../types';
import { CoinLogo } from './common/CoinLogo';
import { PieChart as PieChartIcon, TrendingUp, TrendingDown, DollarSign, Percent, Sparkles, Layers } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

interface CoinDistributionPieChartProps {
  positions: TradingPosition[];
  wallet?: UserWallet;
  compact?: boolean;
}

interface ChartSliceData {
  name: string;
  coin: string;
  pair: string;
  value: number; // Nilai dalam USD
  percentage: number; // Porsi dalam %
  pnl: number; // PNL dalam USD
  pnlPct: number; // PNL ROI %
  color: string;
  status: string;
  stepLayer: number;
  maxStep: number;
}

const COIN_COLORS: Record<string, string> = {
  BTC: '#F59E0B', // Amber
  ETH: '#6366F1', // Indigo
  BNB: '#EAB308', // Yellow
  SOL: '#A855F7', // Purple
  HYPE: '#00F0C8', // Cyan
  LINK: '#3B82F6', // Blue
  UNI: '#EC4899', // Pink
  NEAR: '#10B981', // Emerald
  XRP: '#0EA5E9', // Sky
  SUI: '#06B6D4', // Cyan
  ZEC: '#F59E0B', // Amber Gold (Zcash)
  DOGE: '#EAB308', // Yellow
  USDT: '#10B981', // Emerald
};

const DEFAULT_COLORS = ['#00F0C8', '#3B82F6', '#F59E0B', '#A855F7', '#14B8A6', '#EC4899', '#EAB308', '#6366F1'];

export function CoinDistributionPieChart({
  positions,
  wallet,
  compact = false,
}: CoinDistributionPieChartProps) {
  const { theme } = useTheme();
  const [includeCash, setIncludeCash] = useState(false);
  const [activeCoinIndex, setActiveCoinIndex] = useState<number | null>(null);

  // Helper parse USD value
  const parseUsdt = (val: unknown): number => {
    if (typeof val === 'number') {
      return Number.isFinite(val) ? val : 0;
    }

    if (typeof val !== 'string') {
      return 0;
    }
    const cleaned = val.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const realPortfolioAssets = useMemo(() => {
    const assets = wallet?.connectedExchange?.portfolioAssets || [];
    return Array.isArray(assets) ? assets.filter((asset) => Number(asset?.valueUsdt || 0) > 0) : [];
  }, [wallet?.connectedExchange?.portfolioAssets]);

  const exchangeCashUsdt = useMemo(() => {
    const connectedCash = Number(wallet?.connectedExchange?.usdtBalance ?? 0);
    return Number.isFinite(connectedCash) && connectedCash > 0 ? connectedCash : 0;
  }, [wallet?.connectedExchange?.usdtBalance]);

  const chartData = useMemo(() => {
    const items: {
      name: string;
      coin: string;
      pair: string;
      value: number;
      pnl: number;
      pnlPct: number;
      color: string;
      status: string;
      stepLayer: number;
      maxStep: number;
    }[] = [];

    if (realPortfolioAssets.length > 0) {
      realPortfolioAssets.forEach((asset, idx) => {
        const coin = String(asset.coin || asset.pair || '').split('/')[0].toUpperCase();
        const value = Number(asset.valueUsdt || 0);
        if (value <= 0) return;
        const matched = positions.find((pos) => String(pos?.coin ?? pos?.pair ?? '').split('/')[0].toUpperCase() === coin);
        items.push({
          name: coin,
          coin,
          pair: asset.pair || `${coin}/USDT`,
          value: Number(value.toFixed(2)),
          pnl: Number(matched?.floatingPnl ?? 0),
          pnlPct: Number(matched?.roiPct ?? asset.change24h ?? 0),
          color: COIN_COLORS[coin] || DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
          status: matched?.status || 'active',
          stepLayer: matched?.stepLayer || 0,
          maxStep: matched?.maxStep || 0,
        });
      });
    } else {
      positions.forEach((pos, idx) => {
        const val = parseUsdt(pos.allocationUsdt);
        if (val > 0) {
          items.push({
            name: String(pos?.coin ?? pos?.pair ?? '').split('/')[0] || 'UNKNOWN',
            coin: String(pos?.coin ?? pos?.pair ?? '').split('/')[0].toUpperCase() || 'UNKNOWN',
            pair: pos.pair || `${String(pos?.coin ?? 'UNKNOWN').toUpperCase()}/USDT`,
            value: Number(val.toFixed(2)),
            pnl: Number(pos.floatingPnl ?? 0),
            pnlPct: Number(pos.roiPct ?? 0),
            color: COIN_COLORS[String(pos?.coin ?? pos?.pair ?? '').split('/')[0].toUpperCase()] || DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
            status: pos.status,
            stepLayer: pos.stepLayer,
            maxStep: pos.maxStep,
          });
        }
      });
    }

    if (includeCash && exchangeCashUsdt > 0) {
      items.push({
        name: 'USDT Cash',
        coin: 'USDT',
        pair: `${wallet?.connectedExchange?.exchange || 'Exchange'} USDT Cash`,
        value: Number(exchangeCashUsdt.toFixed(2)),
        pnl: 0,
        pnlPct: 0,
        color: COIN_COLORS.USDT,
        status: 'active',
        stepLayer: 0,
        maxStep: 100,
      });
    }

    const totalVal = items.reduce((acc, curr) => acc + curr.value, 0);

    return items.map((item) => ({
      ...item,
      percentage: totalVal > 0 ? Number(((item.value / totalVal) * 100).toFixed(1)) : 0,
    }));
  }, [positions, wallet, includeCash, realPortfolioAssets, exchangeCashUsdt]);

  const totalPortfolioValue = useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.value, 0);
  }, [chartData]);

  const totalPnl = useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.pnl, 0);
  }, [chartData]);

  const activeSlice: ChartSliceData | undefined =
    activeCoinIndex !== null && chartData[activeCoinIndex]
      ? chartData[activeCoinIndex]
      : undefined;

  return (
    <div className="theme-surface p-4 rounded-2xl border shadow-xl space-y-4 transition-colors">
      {/* Header with Title and Cash Toggle */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[#00F0C8]/10 border border-[#00F0C8]/30 flex items-center justify-center text-[#00F0C8]">
            <PieChartIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-1.5">
              <span>Distribusi Komposisi Koin</span>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-teal-50 dark:bg-[#00F0C8]/15 text-teal-800 dark:text-[#00F0C8] border border-teal-200 dark:border-[#00F0C8]/30 font-bold">
                {chartData.length} Aset
              </span>
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">
              Porsi (%) · Nilai Bursa Riil ($) · Floating PNL · Kas USDT Bursa ${exchangeCashUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {wallet && (
          <button
            onClick={() => setIncludeCash((prev) => !prev)}
            title={`Kas USDT bursa: $${exchangeCashUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono transition flex items-center gap-1.5 border cursor-pointer ${
              includeCash
                ? 'bg-[#00F0C8]/15 border-[#00F0C8]/40 text-[#00F0C8] font-bold'
                : 'bg-slate-50 dark:bg-[#0B1525] border-slate-200 dark:border-[#162740] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${includeCash ? 'bg-[#00F0C8]' : 'bg-slate-500'}`} />
            <span>{includeCash ? `Termasuk Kas USDT ($${exchangeCashUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : `+ Tambah Kas USDT ($${exchangeCashUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`}</span>
          </button>
        )}
      </div>

      {/* Summary KPI Pills */}
      <div className="grid grid-cols-3 gap-2 font-mono text-xs">
        <div className="theme-surface-secondary p-2.5 rounded-xl border">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 uppercase">
            <DollarSign className="w-3 h-3 text-[#00F0C8]" />
            <span>Total Nilai ($)</span>
          </div>
          <span className="text-sm font-bold text-slate-900 dark:text-white mt-1 block font-mono">
            ${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className="theme-surface-secondary p-2.5 rounded-xl border">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 uppercase">
            <Percent className="w-3 h-3 text-emerald-400" />
            <span>Akumulasi PNL</span>
          </div>
          <span
            className={`text-sm font-bold mt-1 block font-mono ${
              totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {totalPnl >= 0 ? `+$${totalPnl.toFixed(2)}` : `-$${Math.abs(totalPnl).toFixed(2)}`}
          </span>
        </div>

        <div className="theme-surface-secondary p-2.5 rounded-xl border">
          <div className="flex items-center gap-1 text-[10px] text-slate-400 uppercase">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Porsi Dominan</span>
          </div>
          <div className="text-xs font-bold text-slate-900 dark:text-white mt-1 truncate">
            {chartData.length > 0
              ? `${chartData[0].coin} (${chartData[0].percentage}%)`
              : '-'}
          </div>
        </div>
      </div>

      {/* Main Visuals: Donut Chart + Center Focus Badge */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center pt-2 min-w-0">
        {/* Donut Chart Canvas */}
        <div className="md:col-span-6 min-w-0 w-full flex flex-col items-center justify-center relative">
          <div className="w-full max-w-full min-w-0 h-56 relative flex items-center justify-center overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={92}
                  paddingAngle={3}
                  dataKey="value"
                  onMouseEnter={(_, index) => setActiveCoinIndex(index)}
                  onMouseLeave={() => setActiveCoinIndex(null)}
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${entry.coin}-${index}`}
                      fill={entry.color}
                      stroke={theme === 'light' ? '#FFFFFF' : '#08101D'}
                      strokeWidth={3}
                      className="cursor-pointer transition-opacity duration-200"
                      opacity={activeCoinIndex === null || activeCoinIndex === index ? 1 : 0.45}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as ChartSliceData;
                      return (
                        <div className="p-2.5 rounded-xl bg-white dark:bg-[#0B1527] border border-slate-200 dark:border-[#1C3354] shadow-2xl text-xs font-mono space-y-1">
                          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: data.color }}
                            />
                            <span>{data.pair}</span>
                            <span className="text-[10px] text-teal-600 dark:text-[#00F0C8]">({data.percentage}%)</span>
                          </div>
                          <div className="text-slate-600 dark:text-slate-300">
                            Nilai: <strong className="text-slate-900 dark:text-white">${data.value.toLocaleString()} USDT</strong>
                          </div>
                          <div
                            className={
                              data.pnl >= 0 ? 'text-emerald-500 dark:text-emerald-400 font-bold' : 'text-red-500 dark:text-red-400 font-bold'
                            }
                          >
                            PNL: {data.pnl >= 0 ? `+${data.pnl.toFixed(2)}` : data.pnl.toFixed(2)} USDT
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Donut Center Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
              {activeSlice ? (
                <>
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    {activeSlice.coin}
                  </span>
                  <span className="text-lg font-black font-mono text-slate-900 dark:text-white">
                    {activeSlice.percentage}%
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold ${
                      activeSlice.pnl >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                    }`}
                  >
                    {activeSlice.pnl >= 0 ? `+$${activeSlice.pnl.toFixed(1)}` : `-$${Math.abs(activeSlice.pnl).toFixed(1)}`}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                    Portofolio
                  </span>
                  <span className="text-base font-black font-mono text-slate-900 dark:text-white">
                    100%
                  </span>
                  <span className="text-[10px] font-mono text-teal-600 dark:text-[#00F0C8]">
                    ${totalPortfolioValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="text-[11px] text-slate-400 font-mono text-center mt-1">
            Sentuh atau hover sektor koin untuk melihat rincian
          </div>
        </div>

        {/* Breakdown List (Porsi %, Nilai $, PNL) */}
        <div className="md:col-span-6 space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
          {chartData.map((item, index) => {
            const isHovered = activeCoinIndex === index;
            return (
              <div
                key={`${item.coin || "asset"}-${index}`}
                onMouseEnter={() => setActiveCoinIndex(index)}
                onMouseLeave={() => setActiveCoinIndex(null)}
                className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between gap-2 text-xs font-mono ${
                  isHovered
                    ? 'bg-[#0E1B2E] border-[#00F0C8]/60 shadow-md'
                    : 'bg-[#060B14] border-[#121E31] hover:border-[#1C3050]'
                }`}
              >
                {/* Left: Coin identifier & Color */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  {item.coin !== 'USDT' && (
                    <CoinLogo coin={item.coin} size="xs" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white text-xs">{item.coin}</span>
                      {item.stepLayer > 0 && (
                        <span className="px-1 py-0.2 rounded text-[9px] bg-slate-800 text-slate-300">
                          L{item.stepLayer}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 truncate block">
                      {item.pair}
                    </span>
                  </div>
                </div>

                {/* Center: Porsi % Badge */}
                <div className="text-center px-2 py-1 rounded-md bg-[#081220] border border-[#142338]">
                  <span className="text-[10px] text-slate-400 block">Porsi</span>
                  <span className="font-bold text-white text-xs">{item.percentage}%</span>
                </div>

                {/* Right: Nilai $ & PNL */}
                <div className="text-right shrink-0">
                  <span className="font-bold text-white text-xs block">
                    ${item.value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                  </span>
                  <span
                    className={`text-[10px] font-bold flex items-center justify-end gap-0.5 ${
                      item.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {item.pnl >= 0 ? (
                      <TrendingUp className="w-2.5 h-2.5 inline" />
                    ) : (
                      <TrendingDown className="w-2.5 h-2.5 inline" />
                    )}
                    <span>
                      {item.pnl >= 0 ? `+$${item.pnl.toFixed(2)}` : `-$${Math.abs(item.pnl).toFixed(2)}`}
                    </span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
