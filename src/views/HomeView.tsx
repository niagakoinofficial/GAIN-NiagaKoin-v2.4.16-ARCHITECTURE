import { useState } from 'react';
import { UserWallet, TradingPosition } from '../types';
import { deriveAllocatedAssetUsdt } from '../utils/portfolioSnapshot';
import { CoinDistributionPieChart } from '../components/CoinDistributionPieChart';
import { CoinLogo } from '../components/common/CoinLogo';
import { SUPPORTED_COINS } from '../data/appData';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Sliders,
  Key,
  ShieldCheck,
  ChevronRight,
  TrendingUp,
  Cpu,
  Layers,
  Users,
  Zap,
  Fuel,
  Building2,
  Info,
  HelpCircle,
  CheckCircle2,
  PieChart as PieChartIcon,
  Bell,
  BellRing,
  Sparkles,
  Activity,
} from 'lucide-react';
import { formatUsdt } from '../utils/formatters';

interface HomeViewProps {
  wallet: UserWallet;
  positions: TradingPosition[];
  engineBots?: Array<{
    id?: string;
    botId?: string;
    pair?: string;
    exchange?: string;
    isSandbox?: boolean;
    status?: string;
    positionQty?: number;
    avgEntryPrice?: number;
    lastPrice?: number;
  }>;
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onOpenCustomBot: (pair?: string) => void;
  onOpenApiKey: () => void;
  onNavigateTrading: () => void;
  onOpenProfitShare: () => void;
  onOpenTransfer: () => void;
  onNavigateAccount?: () => void;
  onOpenPriceAlert?: (symbol?: string) => void;
}

export function HomeView({
  wallet,
  positions,
  engineBots = [],
  onOpenDeposit,
  onOpenWithdraw,
  onOpenCustomBot,
  onOpenApiKey,
  onNavigateTrading,
  onOpenProfitShare,
  onOpenTransfer,
  onNavigateAccount,
  onOpenPriceAlert,
}: HomeViewProps) {
  // Backend runtime is authoritative for active bot positions. Firestore/UI
  // positions are projections and must not resurrect a stale position count.
  const runtimeCandidates = engineBots.filter((bot) => {
    const sameExchange = !wallet.connectedExchange?.exchange || String(bot.exchange || '').toLowerCase() === String(wallet.connectedExchange.exchange).toLowerCase();
    const sameEnvironment = wallet.connectedExchange?.isSandbox == null || Boolean(bot.isSandbox) === Boolean(wallet.connectedExchange.isSandbox);
    return sameExchange && sameEnvironment && (bot.status === 'active' || bot.status === 'paused' || bot.status === 'error') && Number(bot.positionQty || 0) > 0;
  });
  const activePositionCount = runtimeCandidates.length;
  const activePositions = runtimeCandidates.slice(0, 3).map((bot) => ({
    id: bot.id || bot.botId || bot.pair || 'runtime-position',
    coin: String(bot.pair || '').split('/')[0] || 'COIN',
    pair: bot.pair || '—',
    badgeSymbol: String(bot.pair || '').split('/')[0] || 'C',
    badgeBg: 'bg-slate-800',
    badgeColor: 'text-slate-200',
    status: bot.status === 'active' ? 'active' : 'averaging',
    statusLabel: bot.status === 'active' ? 'ACTIVE' : bot.status?.toUpperCase() || 'PAUSED',
    engine: `${bot.exchange || 'Exchange'} Spot ${bot.isSandbox ? '(Testnet)' : '(Live)'} · Backend Runtime`,
    price: Number(bot.lastPrice || 0),
    change24h: 0,
    totalCoinQty: Number(bot.positionQty || 0),
    allocationQty: `${Number(bot.positionQty || 0)} ${String(bot.pair || '').split('/')[0] || ''}`.trim(),
    allocationUsdt: '',
    floatingPnl: 0,
  } as TradingPosition));
  const isExchangeConnected = Boolean(wallet.connectedExchange?.isConnected);
  const [showPieChart, setShowPieChart] = useState(true);
  const [showBeginnerGuide, setShowBeginnerGuide] = useState(false);

  const exchangeUsdt = wallet.connectedExchange?.usdtBalance ?? 0;
  const portfolioSyncStatus = wallet.connectedExchange?.portfolioSyncStatus || (isExchangeConnected ? 'SYNCING' : 'ERROR');

  // Exchange allocation is derived from the authoritative portfolio snapshot,
  // not from the GAIN internal wallet field. The latter can legitimately remain
  // zero because it represents GAIN's own liquid balance, not exchange assets.
  const exchangeAllocatedAssetUsdt = deriveAllocatedAssetUsdt({
    portfolioAssets: wallet.connectedExchange?.portfolioAssets,
    totalPortfolioUsdt: wallet.connectedExchange?.totalPortfolioUsdt,
    usdtBalance: wallet.connectedExchange?.usdtBalance,
    legacyAllocatedAssetUsdt: wallet.allocatedAssetUsdt,
  });
  const gasReserve = wallet.gasReserve ?? 0;
  const isGasCritical = gasReserve <= 5.0;
  const isGasWarning = gasReserve > 5.0 && gasReserve <= 10.0;

  return (
    <div className="space-y-4 pb-20">
      {/* Live User & Exchange Status Banner */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0B121F] border border-slate-200 dark:border-[#162740] flex items-center justify-between shadow-xs transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold font-mono text-slate-800 dark:text-slate-200 text-sm shrink-0">
            {wallet.username[0]?.toUpperCase() || 'U'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-xs text-slate-900 dark:text-white truncate max-w-[140px] sm:max-w-none">
                {wallet.username}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${
                  wallet.accountStatus === 'active'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                }`}
              >
                {wallet.accountStatus === 'active' ? 'ACTIVE' : 'NON-ACTIVE'}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-sans truncate max-w-[200px] sm:max-w-none">
              {wallet.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowBeginnerGuide(!showBeginnerGuide)}
            className="p-2 rounded-xl text-slate-500 hover:text-sky-500 dark:text-slate-400 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-[#14233A] transition cursor-pointer"
            title="Panduan Cepat Pemula"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <button
            onClick={onOpenApiKey}
            className={`px-2.5 py-1.5 rounded-xl border text-[10px] font-sans font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
              isExchangeConnected
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                : 'bg-slate-100 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isExchangeConnected ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
            <span>
              {isExchangeConnected
                ? `${wallet.connectedExchange?.exchange} ${wallet.connectedExchange?.isSandbox ? 'Testnet' : 'Live'}`
                : 'Hubungkan API'}
            </span>
          </button>
        </div>
      </div>

      {/* DUAL-VAULT ARCHITECTURE INFOGRAPHIC (Penting untuk Pemula & Pro) */}
      <div className="rounded-2xl bg-gradient-to-b from-white via-slate-50 to-slate-100 dark:from-[#0E1726] dark:via-[#0A101C] dark:to-[#070B13] border border-slate-200 dark:border-[#1E2E44] p-4 sm:p-5 shadow-xs transition-colors">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200/80 dark:border-[#18263B]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white font-sans uppercase tracking-tight">
                Arsitektur Dual-Vault (Pemisahan Saldo Aman)
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                Modal spot Anda 100% tetap di exchange, GAIN hanya memotong Gas Fee saat profit.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowBeginnerGuide(!showBeginnerGuide)}
            className="text-[11px] font-sans font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:underline cursor-pointer flex items-center gap-1 shrink-0"
          >
            <span>{showBeginnerGuide ? 'Tutup Panduan' : 'Lihat Cara Kerja'}</span>
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showBeginnerGuide ? 'rotate-90' : ''}`} />
          </button>
        </div>

        {/* Dual Vault Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* VAULT 1: EXCHANGER SPOT BALANCE */}
          <div className="rounded-xl bg-white dark:bg-[#111A29] border border-slate-200 dark:border-[#1B2B3F] p-3.5 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
                    <Building2 className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-900 dark:text-white uppercase font-sans">
                    Vault 1: Modal Trading Spot
                  </span>
                </div>
                <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-mono font-bold ${
                  isExchangeConnected
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                }`}>
                  {isExchangeConnected ? wallet.connectedExchange?.exchange : 'Belum Konek'}
                </span>
              </div>

              <div className="mt-2.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold font-mono text-slate-900 dark:text-white tabular-nums">
                  {isExchangeConnected ? formatUsdt(exchangeUsdt) : '0.00'}
                </span>
                <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">USDT</span>
              </div>

              <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-sans mt-1.5 leading-tight">
                Tersimpan di akun {isExchangeConnected ? wallet.connectedExchange?.exchange : 'Exchange'} Anda. Bot hanya memiliki hak baca &amp; beli/jual spot (<strong>Tanpa Hak Penarikan/No Withdrawal</strong>).
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-[#17253B] flex items-center justify-between">
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3 h-3" /> Dana 100% Milik Anda
              </span>
              <button
                type="button"
                onClick={onOpenApiKey}
                className="text-[10px] text-teal-600 dark:text-[#2DD4BF] font-sans font-semibold hover:underline cursor-pointer"
              >
                {isExchangeConnected ? 'Cek API' : 'Hubungkan API'}
              </button>
            </div>
          </div>

          {/* VAULT 2: GAS FEE & LISENSI (GAIN WALLET) */}
          <div className="rounded-xl bg-white dark:bg-[#111A29] border border-slate-200 dark:border-[#1B2B3F] p-3.5 flex flex-col justify-between shadow-xs">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-[#2DD4BF] flex items-center justify-center">
                    <Fuel className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-900 dark:text-white uppercase font-sans">
                    Vault 2: Gas Fee &amp; Lisensi
                  </span>
                </div>
                <span className={`px-1.5 py-0.2 rounded text-[9.5px] font-mono font-bold border ${
                  isGasCritical
                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-500/30'
                    : isGasWarning
                    ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-500/30'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                }`}>
                  {isGasCritical ? 'Kritis ≤ 5' : isGasWarning ? 'Waspada' : 'Aman'}
                </span>
              </div>

              <div className="mt-2.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold font-mono text-teal-600 dark:text-[#2DD4BF] tabular-nums">
                  {formatUsdt(gasReserve)}
                </span>
                <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">USDT Gas</span>
                <span className="text-[10px] text-slate-400 font-sans ml-1">
                  (Total Liquid: {formatUsdt(wallet.liquidBalance)})
                </span>
              </div>

              <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-sans mt-1.5 leading-tight">
                Bahan bakar operasional bot. Otomatis dipotong 20% hanya saat bot berhasil mencetak profit di exchange Anda (80% profit bersih untuk Anda).
              </p>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-[#17253B] flex items-center justify-between">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                Min. Cadangan: 10 USDT
              </span>
              <button
                type="button"
                onClick={onOpenDeposit}
                className="text-[10px] text-teal-600 dark:text-[#2DD4BF] font-sans font-semibold hover:underline cursor-pointer"
              >
                + Isi Gas Fee
              </button>
            </div>
          </div>
        </div>

        {/* Accordion: 3 Langkah Cepat untuk Pemula */}
        {showBeginnerGuide && (
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-[#16253B] animate-in fade-in duration-200">
            <h4 className="text-[11px] font-bold text-slate-900 dark:text-white font-sans uppercase mb-2">
              Panduan 3 Langkah Cepat Memulai Trading Bot:
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-sans">
              <div className="p-2.5 rounded-xl bg-white dark:bg-[#0C1422] border border-slate-200 dark:border-[#16253B]">
                <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                  <span className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center text-[10px]">1</span>
                  <span>Siapkan Modal di Exchange</span>
                </div>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Deposit USDT di akun exchange resmi Anda (Binance/Bitget/OKX). Hubungkan API Key spot tanpa akses withdraw.
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-[#0C1422] border border-slate-200 dark:border-[#16253B]">
                <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                  <span className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center text-[10px]">2</span>
                  <span>Isi Gas Fee di GAIN</span>
                </div>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Kirim 10-20 USDT ke Wallet GAIN sebagai cadangan biaya 20% bagi hasil profit ketika bot menghasilkan cuan.
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-[#0C1422] border border-slate-200 dark:border-[#16253B]">
                <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 text-[11px]">
                  <span className="w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center text-[10px]">3</span>
                  <span>Aktifkan Bot Matrix</span>
                </div>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Pilih koin favorit (BTC, ETH, SOL) di menu Bot Matrix &rarr; klik Aktifkan Bot. Bot otomatis trading 24 jam nonstop!
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Portfolio Card */}
      <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-gradient-to-br dark:from-[#111A29] dark:via-[#0E1624] dark:to-[#0B101B] border border-slate-200 dark:border-[#1E2E44] p-5 shadow-xs dark:shadow-md transition-colors">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-sans">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500"></span>
            <span className="font-medium">Total Saldo Portofolio Algoritmik</span>
          </div>
          <button
            onClick={onOpenProfitShare}
            className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center gap-0.5 font-medium cursor-pointer"
          >
            Vault Settle <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-white tabular-nums">
            {formatUsdt(wallet.liquidBalance)}
          </span>
          <span className="text-sm font-bold font-mono text-slate-500 dark:text-slate-400">USDT</span>
        </div>

        {/* Sub metrics */}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-[#162338] text-xs">
          <div>
            <span className="text-[10.5px] text-slate-500 dark:text-slate-400 font-sans font-medium block">
              Aset Koin Alokasi
            </span>
            {isExchangeConnected && (
              <span className={`text-[9px] font-mono font-bold ${portfolioSyncStatus === 'LIVE' ? 'text-emerald-400' : portfolioSyncStatus === 'STALE' ? 'text-amber-400' : portfolioSyncStatus === 'ERROR' ? 'text-rose-400' : 'text-sky-400'}`}>
                {portfolioSyncStatus} · {wallet.connectedExchange?.portfolioAsOf ? new Date(wallet.connectedExchange.portfolioAsOf).toLocaleTimeString() : '—'}
              </span>
            )}
            <span className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5 block tabular-nums">
              {formatUsdt(exchangeAllocatedAssetUsdt)} USDT
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10.5px] text-slate-500 dark:text-slate-400 font-sans font-medium block">
              Volume Trading (24h)
            </span>
            <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5 block tabular-nums">
              +{formatUsdt(wallet.volume24h)} USDT
            </span>
          </div>
        </div>
      </div>

      {/* The Real Money Machine VIP Banner */}
      <div className="relative overflow-hidden rounded-xl bg-slate-50 dark:bg-gradient-to-r dark:from-[#0E1A2B] dark:via-[#0C1625] dark:to-[#0A111E] border border-slate-200 dark:border-[#1E2E44] p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold tracking-tight text-slate-900 dark:text-white font-sans">
                The Real Money Machine
              </span>
              <span title="Verified Engine">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              </span>
            </div>
            <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">
              QUANTITATIVE ASSET AUTOMATION ENGINE • DCA MARTINGALE &amp; GRID
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
        </div>
      </div>

      {/* Quick Action Grid */}
      <div className="grid grid-cols-2 xs:grid-cols-5 sm:grid-cols-5 gap-2">
        <button
          onClick={onOpenDeposit}
          className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] hover:border-emerald-500/40 hover:bg-slate-50 dark:hover:bg-[#142033] shadow-xs transition group text-center cursor-pointer active:scale-95 select-none"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-1 group-hover:scale-105 transition">
            <ArrowDownLeft className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-sans">Deposit</span>
          <span className="text-[9px] sm:text-[9.5px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">BEP-20</span>
        </button>

        <button
          onClick={onOpenWithdraw}
          className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] hover:border-sky-500/40 hover:bg-slate-50 dark:hover:bg-[#142033] shadow-xs transition group text-center cursor-pointer active:scale-95 select-none"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-1 group-hover:scale-105 transition">
            <ArrowUpRight className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-sans">Withdraw</span>
          <span className="text-[9px] sm:text-[9.5px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">2 USDT</span>
        </button>

        <button
          onClick={() => onOpenCustomBot('BTC/USDT')}
          className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] hover:border-purple-500/40 hover:bg-slate-50 dark:hover:bg-[#142033] shadow-xs transition group text-center cursor-pointer active:scale-95 select-none"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-1 group-hover:scale-105 transition">
            <Sliders className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-sans">Custom Bot</span>
          <span className="text-[9px] sm:text-[9.5px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">100 Steps</span>
        </button>

        {onOpenPriceAlert && (
          <button
            onClick={() => onOpenPriceAlert()}
            className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] hover:border-amber-500/40 hover:bg-slate-50 dark:hover:bg-[#142033] shadow-xs transition group text-center cursor-pointer active:scale-95 select-none"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-1 group-hover:scale-105 transition">
              <BellRing className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-sans">Price Alert</span>
            <span className="text-[9px] sm:text-[9.5px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">Notifikasi</span>
          </button>
        )}

        <button
          onClick={onOpenApiKey}
          className="flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-[#142033] shadow-xs transition group text-center cursor-pointer active:scale-95 select-none"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center mb-1 group-hover:scale-105 transition">
            <Key className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 font-sans">API Key</span>
          <span className="text-[9px] sm:text-[9.5px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">Exchange</span>
        </button>
      </div>

      {/* Bagan Lingkaran Distribusi Komposisi Koin (Porsi %, Nilai $, PNL) */}
      <div className="pt-1">
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <PieChartIcon className="w-4 h-4 text-sky-500 dark:text-sky-400" />
            <h3 className="font-bold text-sm text-slate-900 dark:text-white tracking-tight font-sans">
              Distribusi Portofolio Koin
            </h3>
          </div>
          <button
            onClick={() => setShowPieChart((prev) => !prev)}
            className="text-xs text-sky-600 dark:text-sky-400 hover:underline font-sans font-medium cursor-pointer flex items-center gap-1"
          >
            <span>{showPieChart ? 'Sembunyikan' : 'Tampilkan Bagan'}</span>
          </button>
        </div>

        {showPieChart && (
          <CoinDistributionPieChart positions={positions} wallet={wallet} />
        )}
      </div>

      {/* Posisi Trading Aktif Header */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
          <h3 className="font-bold text-sm text-slate-900 dark:text-white tracking-tight font-sans">Posisi Trading Aktif</h3>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
            {activePositionCount}
          </span>
        </div>
        <button
          onClick={onNavigateTrading}
          className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-sans font-medium flex items-center gap-0.5 cursor-pointer"
        >
          Lihat Semua →
        </button>
      </div>

      {/* Position Cards (Top 3) */}
      <div className="space-y-2.5">
        {activePositions.length === 0 ? (
          <div className="p-6 rounded-2xl bg-white dark:bg-[#101A29] border border-dashed border-slate-300 dark:border-[#1E2E44] text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 mx-auto">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white font-sans">
                {isExchangeConnected ? 'Belum Ada Posisi Bot Aktif' : 'Belum Ada Posisi Trading Aktif'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-sans mt-1 max-w-sm mx-auto">
                {isExchangeConnected
                  ? `${wallet.connectedExchange?.exchange || 'Exchange'} ${wallet.connectedExchange?.isSandbox ? 'Testnet' : 'Live'} sudah terhubung. Saldo dan aset exchange ditampilkan pada Distribusi Portofolio Koin; saat ini belum ada bot GAIN yang memegang posisi aktif.`
                  : `${SUPPORTED_COINS.length} pair koin resmi siap trading (termasuk TAO/USDT & XAUT/USDT). Hubungkan API exchange Anda untuk sinkronisasi saldo riil atau aktifkan bot averaging.`}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
              {isExchangeConnected ? (
                <button
                  onClick={() => onOpenCustomBot('BTC/USDT')}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold text-xs font-sans shadow-sm transition cursor-pointer"
                >
                  Buka Bot Matrix
                </button>
              ) : (
                <button
                  onClick={onOpenApiKey}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold text-xs font-sans shadow-sm transition cursor-pointer"
                >
                  Hubungkan API Exchange
                </button>
              )}
              <button
                onClick={onNavigateTrading}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#152238] text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-[#1E2E44] font-semibold text-xs font-sans transition cursor-pointer"
              >
                Lihat {SUPPORTED_COINS.length} Pair Standby
              </button>
            </div>
          </div>
        ) : (
          activePositions.map((pos, idx) => (
            <div
              key={`${pos.id || pos.coin}-${idx}`}
              className="p-4 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] hover:border-amber-400/40 shadow-xs transition space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <CoinLogo
                    coin={pos.coin || pos.pair}
                    size="md"
                    fallbackSymbol={pos.badgeSymbol}
                    fallbackBg={pos.badgeBg}
                    fallbackColor={pos.badgeColor}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-900 dark:text-white font-sans">{pos.pair}</span>
                      {onOpenPriceAlert && (
                        <button
                          type="button"
                          onClick={() => onOpenPriceAlert(pos.pair)}
                          title={`Pasang Price Alert ${pos.pair}`}
                          className="p-1 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition cursor-pointer"
                        >
                          <Bell className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold ${
                          pos.status === 'active'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                        }`}
                      >
                        {pos.statusLabel}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">{pos.engine}</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="font-mono text-sm font-bold text-slate-900 dark:text-white block tabular-nums">
                    {Number.isFinite(Number(pos.price)) && Number(pos.price) > 0
                      ? `$${Number(pos.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      : '—'}
                  </span>
                  <span
                    className={`text-[11px] font-mono font-semibold tabular-nums ${
                      Number(pos.change24h) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {Number.isFinite(Number(pos.change24h))
                      ? (Number(pos.change24h) >= 0 ? `+${Number(pos.change24h)}%` : `${Number(pos.change24h)}%`)
                      : '—'}
                  </span>
                </div>
              </div>

              {/* Position stats */}
              <div className="grid grid-cols-3 gap-2 py-2 px-3 rounded-lg bg-slate-50 dark:bg-[#0B121E] border border-slate-100 dark:border-[#162338] text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans block">Alokasi / Qty</span>
                  <span className="text-slate-800 dark:text-slate-200 font-mono font-semibold tabular-nums">{pos.allocationQty}</span>
                </div>
                <div className="text-center">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans block">Layer Step</span>
                  <span className="text-slate-900 dark:text-slate-100 font-mono font-bold tabular-nums">
                    #{pos.stepLayer} / {pos.maxStep}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans block">Floating PnL</span>
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      pos.floatingPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {pos.floatingPnl >= 0 ? `+${formatUsdt(pos.floatingPnl)}` : formatUsdt(pos.floatingPnl)} USDT
                  </span>
                </div>
              </div>

              {/* Trailing Progress & Action */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">{pos.trailingInfo}</span>
                <button
                  onClick={() => onOpenCustomBot(pos.pair)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#142033] border border-slate-200 dark:border-[#1C3050] text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-[#1A2B44] text-[11px] font-sans font-semibold transition cursor-pointer"
                >
                  Formula 100 Step →
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Fitur & Ekosistem GAIN */}
      <div className="pt-3 space-y-2.5">
        <h4 className="text-xs font-sans font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          Fitur & Ekosistem GAIN
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div
            onClick={() => onOpenCustomBot('BTC/USDT')}
            className="p-3.5 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] hover:border-amber-400/50 shadow-xs transition cursor-pointer flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-[#F0B90B]">
              <Layers className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900 dark:text-white font-sans">Bot Setting & Grid Matrix</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                Konfigurasi 100 layer averaging dinamis & trailing take profit
              </p>
            </div>
          </div>

          <div
            onClick={onNavigateAccount || onOpenTransfer}
            className="p-3.5 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] hover:border-purple-500/50 shadow-xs transition cursor-pointer flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-500/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
              <Users className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900 dark:text-white font-sans">Jaringan & Referral Matrix</span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                Spillover reward, bagi hasil 20% & transfer instan 0% fee
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
