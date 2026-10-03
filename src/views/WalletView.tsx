import { useState } from 'react';
import { UserWallet, TransactionRecord, TradingPosition } from '../types';
import { CoinDistributionPieChart } from '../components/CoinDistributionPieChart';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Send,
  Fuel,
  Search,
  Download,
  Filter,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  PieChart as PieChartIcon,
  Wallet,
  Building2,
  Key,
  ShieldCheck,
  Zap,
  Info,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { formatUsdt, formatNumber } from '../utils/formatters';

interface WalletViewProps {
  wallet: UserWallet;
  transactions: TransactionRecord[];
  hasMoreTransactions?: boolean;
  isLoadingTransactions?: boolean;
  onLoadMoreTransactions?: () => void;
  positions?: TradingPosition[];
  onOpenDeposit: () => void;
  onOpenWithdraw: () => void;
  onOpenTransfer: () => void;
  onOpenGas: () => void;
  onOpenProfitShare: () => void;
  onOpenApiKey?: () => void;
  onOpenActivationModal?: () => void;
  onOpenCoinsChecker?: () => void;
  onSelectActiveExchange?: (exchange: import('../types').ExchangeName) => void;
}

export function WalletView({
  wallet,
  transactions,
  hasMoreTransactions = false,
  isLoadingTransactions = false,
  onLoadMoreTransactions,
  positions = [],
  onOpenDeposit,
  onOpenWithdraw,
  onOpenTransfer,
  onOpenGas,
  onOpenProfitShare,
  onOpenApiKey,
  onOpenActivationModal,
  onOpenCoinsChecker,
  onSelectActiveExchange,
}: WalletViewProps) {
  const [filterTab, setFilterTab] = useState<'all' | 'inflow' | 'outflow' | 'gas'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [period, setPeriod] = useState('Semua Periode');
  const [showDistribution, setShowDistribution] = useState(false);
  const filteredTransactions = transactions.filter((tx) => {
    if (tx.id.startsWith('tx-ex-') || tx.id.startsWith('tx-dc-') || tx.title?.includes('Sinkronisasi API') || tx.title?.includes('Pemutusan Sambungan')) {
      return false;
    }
    if (filterTab !== 'all' && tx.type !== filterTab) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      tx.title.toLowerCase().includes(q) ||
      (tx.memberId && tx.memberId.toLowerCase().includes(q)) ||
      (tx.sourceMemberId && tx.sourceMemberId.toLowerCase().includes(q)) ||
      (tx.recipientMemberId && tx.recipientMemberId.toLowerCase().includes(q)) ||
      (tx.counterparty && tx.counterparty.toLowerCase().includes(q)) ||
      (tx.txHash && tx.txHash.toLowerCase().includes(q))
    );
  });

  const handleExportCsv = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'ID,Member ID,Source Member ID,Recipient Member ID,Title,Type,Status,Timestamp,Counterparty,Amount,Fee\n' +
      transactions
        .map(
          (t) =>
            `${t.id},${t.memberId || ''},${t.sourceMemberId || ''},${t.recipientMemberId || ''},"${t.title}",${t.type},${t.status},"${t.timestamp}","${t.counterparty || ''}",${t.amount},"${t.feeInfo}"`
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'GAIN_Ledger_Mutasi.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const connectedList =
    wallet.connectedExchanges && wallet.connectedExchanges.length > 0
      ? wallet.connectedExchanges
      : wallet.connectedExchange?.isConnected
      ? [wallet.connectedExchange]
      : [];

  const totalExchangesUsdt = connectedList.reduce((sum, ex) => sum + (ex.usdtBalance || 0), 0);
  const activeExchangeName = wallet.connectedExchange?.exchange || wallet.activeExchange || 'Belum Terhubung';
  const isAnyExchangeConnected = connectedList.length > 0;
  const activeExchangeConfig = wallet.connectedExchange?.isConnected
    ? wallet.connectedExchange
    : connectedList.find((c) => c.exchange === activeExchangeName) || connectedList[0];

  return (
    <div className="space-y-4 pb-20">
      {/* Notice Bar Explaining Two Balances */}
      <div className="p-3 rounded-xl bg-slate-100 dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] flex items-center justify-between text-xs font-sans transition-colors">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
          <span className="text-slate-600 dark:text-slate-300 text-xs">
            Sistem membedakan <strong className="text-slate-900 dark:text-white">Saldo Wallet GAIN</strong> (Aktivasi & Gas Fee) dengan <strong className="text-slate-900 dark:text-white">Saldo API Multi-Exchanger</strong> (Modal Trading Spot).
          </span>
        </div>
        {onOpenCoinsChecker && (
          <button
            onClick={onOpenCoinsChecker}
            className="px-2.5 py-1 rounded-lg bg-slate-200/70 hover:bg-slate-300 dark:bg-[#142033] dark:hover:bg-[#1C2C45] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition shrink-0 cursor-pointer flex items-center gap-1 font-sans"
          >
            <Layers className="w-3 h-3 text-sky-500 dark:text-sky-400" />
            <span>Cek 14 Koin</span>
          </button>
        )}
      </div>

      {/* DUAL BALANCE SECTION: Wallet GAIN vs Exchange API */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        {/* CARD 1: SALDO WALLET GAIN (INTERNAL) */}
        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] p-5 shadow-xs transition-colors flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Wallet className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-slate-900 dark:text-white uppercase tracking-tight text-xs font-sans">
                  1. Saldo Wallet GAIN (Internal)
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-sans bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                BEP-20 Ledger
              </span>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans mt-1.5 leading-relaxed">
              Khusus untuk membayar <strong className="text-slate-700 dark:text-slate-200">Biaya Aktivasi Lisensi</strong> & mencadangkan <strong className="text-slate-700 dark:text-slate-200">Gas Fee Trading (20%)</strong>.
            </p>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-white tabular-nums">
                {formatUsdt(wallet.liquidBalance)}
              </span>
              <span className="text-sm font-bold font-mono text-slate-500 dark:text-slate-400">USDT</span>
            </div>

            {/* Sub-details: Available Cash vs Gas Tank */}
            <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-[#162338] text-xs">
              <div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans uppercase tracking-wider block">
                  Liquid Bebas Dipakai
                </span>
                <span className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5 block tabular-nums">
                  {formatUsdt(wallet.liquidBalance)} USDT
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans uppercase tracking-wider block">
                  Cadangan Gas Fee (20% Profit)
                </span>
                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                  <span className={`text-sm font-bold font-mono block tabular-nums ${
                    wallet.gasReserve <= 5.0
                      ? 'text-rose-600 dark:text-rose-400 font-extrabold'
                      : wallet.gasReserve <= 10.0
                      ? 'text-amber-600 dark:text-amber-400 font-bold'
                      : 'text-emerald-600 dark:text-emerald-400'
                  }`}>
                    +{formatUsdt(wallet.gasReserve)} USDT
                  </span>
                  {wallet.gasReserve <= 5.0 ? (
                    <span className="px-1 py-0.2 rounded text-[9px] bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                      Kritis
                    </span>
                  ) : wallet.gasReserve <= 10.0 ? (
                    <span className="px-1 py-0.2 rounded text-[9px] bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      Waspada
                    </span>
                  ) : (
                    <span className="px-1 py-0.2 rounded text-[9px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      Aman
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick status & activation helper */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#162338] flex items-center justify-between text-xs font-sans">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 dark:text-slate-400">Status Lisensi:</span>
              <span className={`font-bold ${wallet.accountStatus === 'active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                {wallet.accountStatus === 'active' ? 'ACTIVE' : 'NON-ACTIVE'}
              </span>
            </div>
            {onOpenActivationModal && (
              <button
                onClick={onOpenActivationModal}
                className="text-xs text-amber-600 dark:text-[#F0B90B] hover:underline flex items-center gap-1 cursor-pointer font-medium"
              >
                <span>Info Biaya Aktivasi</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

        </div>

        {/* CARD 2: SALDO MULTI-EXCHANGER API (SPOT TRADING) */}
        <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] p-5 shadow-xs transition-colors flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Building2 className="w-3.5 h-3.5" />
                </div>
                <span className="font-bold text-slate-900 dark:text-white uppercase tracking-tight text-xs font-sans">
                  2. Saldo Exchanger API (Multi-Bursa)
                </span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold border ${
                isAnyExchangeConnected
                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-500/20'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-500/20'
              }`}>
                {isAnyExchangeConnected
                  ? `${connectedList.length} Bursa Terhubung (${activeExchangeName})`
                  : 'Belum Terhubung'}
              </span>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans mt-1.5 leading-relaxed">
              Modal trading riil di akun bursa Anda (Reku, Binance, Bybit, dll). <strong className="text-slate-700 dark:text-slate-200">100% aman non-kustodian</strong>, terhubung simultan ke 1 akun Google.
            </p>

            <div className="mt-3 flex items-baseline justify-between gap-2 flex-wrap">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight text-slate-900 dark:text-white tabular-nums">
                  {isAnyExchangeConnected ? formatUsdt(totalExchangesUsdt) : '0.00'}
                </span>
                <span className="text-sm font-bold font-mono text-blue-600 dark:text-blue-400">USDT Total</span>
              </div>

              {isAnyExchangeConnected && activeExchangeConfig && (
                <div className="text-right">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans block">Bursa Aktif ({activeExchangeName}):</span>
                  <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400">
                    {formatUsdt(activeExchangeConfig.usdtBalance)} USDT
                  </span>
                </div>
              )}
            </div>

            {/* List of Connected Exchanges Chips */}
            {connectedList.length > 0 && (
              <div className="mt-3.5 space-y-1.5 pt-3 border-t border-slate-100 dark:border-[#162338]">
                <div className="flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400 font-mono">
                  <span>Exchanger Terhubung ({connectedList.length}):</span>
                  {onOpenApiKey && (
                    <button
                      onClick={onOpenApiKey}
                      className="text-amber-600 dark:text-[#F0B90B] hover:underline cursor-pointer font-sans"
                    >
                      + Tambah Bursa
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {connectedList.map((item) => {
                    const isItemActive = item.exchange === activeExchangeName;
                    return (
                      <div
                        key={item.exchange}
                        className={`p-2 rounded-xl border text-xs font-mono flex items-center justify-between ${
                          isItemActive
                            ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-500/40 text-blue-950 dark:text-white'
                            : 'bg-slate-50 dark:bg-[#0C1524] border-slate-200 dark:border-[#16263B] text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${isItemActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                          <span className="font-bold truncate">{item.exchange}</span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                            {item.isSandbox ? 'Demo' : 'Live'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold tabular-nums">{formatUsdt(item.usdtBalance)} USDT</span>
                          {!isItemActive && onSelectActiveExchange && (
                            <button
                              onClick={() => onSelectActiveExchange(item.exchange)}
                              className="text-[9.5px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold hover:bg-amber-500/25 cursor-pointer font-sans"
                              title={`Pilih ${item.exchange} sebagai bursa aktif trading`}
                            >
                              Aktifkan
                            </button>
                          )}
                          {isItemActive && (
                            <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 font-sans">
                              ✓ Aktif
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Quick API action button & Coin Compatibility Checker */}
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-[#162338] flex items-center justify-between text-xs font-sans">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Multi-Exchange: Reku, Binance, Bybit, Bitget, OKX
            </span>
            {onOpenApiKey && (
              <button
                onClick={onOpenApiKey}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
              >
                <Key className="w-3.5 h-3.5" />
                <span>{isAnyExchangeConnected ? 'Kelola / Tambah Exchanger' : 'Hubungkan API Exchanger'}</span>
              </button>
            )}
          </div>

          {onOpenCoinsChecker && (
            <button
              onClick={onOpenCoinsChecker}
              className="w-full mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-[#121E31] hover:bg-slate-100 dark:hover:bg-[#182740] border border-slate-200 dark:border-[#1A283D] text-slate-700 dark:text-slate-300 transition flex items-center justify-between text-xs font-sans cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                <span className="font-semibold">Cek Ketersediaan Koin di Reku, Binance, Bitget, OKX, Bybit...</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            </button>
          )}
        </div>
      </div>

      {/* 4 Action Buttons Grid (For GAIN Internal Wallet) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Deposit */}
        <button
          onClick={onOpenDeposit}
          className="p-3 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] hover:border-amber-400/50 hover:bg-slate-50 dark:hover:bg-[#142033] shadow-xs transition group text-left cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2 group-hover:scale-105 transition">
            <ArrowDownLeft className="w-4 h-4" />
          </div>
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 font-sans">Deposit USDT</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">Isi Gas & Aktivasi</div>
        </button>

        {/* Withdraw */}
        <button
          onClick={onOpenWithdraw}
          className="p-3 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] hover:border-amber-400/50 hover:bg-slate-50 dark:hover:bg-[#142033] shadow-xs transition group text-left cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2 group-hover:scale-105 transition">
            <ArrowUpRight className="w-4 h-4" />
          </div>
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 font-sans">Withdraw</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">Fee 2 USDT • 2FA</div>
        </button>

        {/* Transfer */}
        <button
          onClick={onOpenTransfer}
          className="p-3 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] hover:border-indigo-400/50 hover:bg-slate-50 dark:hover:bg-[#142033] shadow-xs transition group text-left cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-2 group-hover:scale-105 transition">
            <Send className="w-4 h-4" />
          </div>
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 font-sans">Transfer P2P</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">Kirim Antar Member</div>
        </button>

        {/* Gas Fee */}
        <button
          onClick={onOpenGas}
          className="p-3 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] hover:border-amber-400/50 hover:bg-slate-50 dark:hover:bg-[#142033] shadow-xs transition group text-left cursor-pointer"
        >
          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2 group-hover:scale-105 transition">
            <Fuel className="w-4 h-4" />
          </div>
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 font-sans">Gas Fee Tank</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">Bagi Hasil 20%</div>
        </button>
      </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div className="p-3 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] shadow-xs">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans uppercase tracking-wider block">
            Total Inflow
          </span>
          <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1 block tabular-nums">
            +{formatUsdt(wallet.totalInflow)} USDT
          </span>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] shadow-xs">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans uppercase tracking-wider block">
            Total Outflow
          </span>
          <span className="text-sm font-bold font-mono text-rose-600 dark:text-rose-400 mt-1 block tabular-nums">
            -{formatUsdt(wallet.totalOutflow)} USDT
          </span>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans uppercase tracking-wider block">
              Gas Consumed
            </span>
            <button
              onClick={onOpenProfitShare}
              className="text-[9.5px] text-amber-600 dark:text-[#F0B90B] hover:underline font-sans cursor-pointer"
            >
              20%
            </button>
          </div>
          <span className="text-sm font-bold font-mono text-amber-600 dark:text-amber-400 mt-1 block tabular-nums">
            {formatUsdt(wallet.gasConsumed)} USDT
          </span>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans uppercase tracking-wider block">
              Bagi Hasil Cash
            </span>
            <span className="text-[9px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1 rounded">
              Bisa Withdraw
            </span>
          </div>
          <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1 block tabular-nums">
            +{formatUsdt(wallet.withdrawableTradingYield ?? wallet.referralYield ?? 0)} USDT
          </span>
          <span className="text-[9.5px] text-slate-400 font-sans block mt-0.5">
            20% dari 20% Fee Manajemen
          </span>
        </div>

        <div className="p-3 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] shadow-xs col-span-2 sm:col-span-4 mt-1 bg-gradient-to-r from-amber-500/5 to-transparent">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Fuel className="w-4 h-4 text-amber-500 shrink-0" />
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white font-sans">
                  Bonus Referral Top-Up Fee Trading (10% Non-Cash): +{formatUsdt(wallet.nonCashGasBonus ?? 0)} USDT
                </span>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                  10% Non-Cash dari topup downline langsung masuk ke Gas Fee Tank Anda untuk bahan bakar bot (tidak dapat di-withdraw).
                </p>
              </div>
            </div>
            <button
              onClick={onOpenProfitShare}
              className="text-xs text-amber-600 dark:text-[#F0B90B] hover:underline font-semibold shrink-0 cursor-pointer font-sans"
            >
              Info Bagi Hasil 20% Cash & 10% Non-Cash →
            </button>
          </div>
        </div>
      </div>

      {/* Toggleable Coin Distribution Pie Chart */}
      {positions && positions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <PieChartIcon className="w-4 h-4 text-amber-500 dark:text-[#F0B90B]" />
              <span className="text-xs font-bold text-slate-900 dark:text-white font-sans">
                Bagan Distribusi Komposisi Koin
              </span>
            </div>
            <button
              onClick={() => setShowDistribution((prev) => !prev)}
              className="text-xs text-amber-600 dark:text-[#F0B90B] hover:underline font-sans font-medium cursor-pointer"
            >
              {showDistribution ? 'Sembunyikan' : 'Buka Bagan (%)'}
            </button>
          </div>

          {showDistribution && (
            <CoinDistributionPieChart positions={positions} wallet={wallet} />
          )}
        </div>
      )}

      {/* Riwayat Mutasi & Transaksi Section */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] space-y-3 shadow-xs">
        {/* Section Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white font-sans tracking-tight">
              Riwayat Mutasi & Transaksi
            </h3>
            <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-sans">
              Live Ledger Synchronized
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportCsv}
              className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#152238] border border-slate-200 dark:border-[#1E2E44] text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white text-xs font-sans font-medium flex items-center gap-1 transition cursor-pointer"
              title="Download CSV"
            >
              <Download className="w-3.5 h-3.5 text-amber-500 dark:text-[#F0B90B]" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Cari TxID, Member ID, atau tipe..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-[#0B121E] border border-slate-200 dark:border-[#18273F] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-400 font-sans"
            />
          </div>

          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-[#0B121E] border border-slate-200 dark:border-[#18273F] text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-amber-400 font-sans cursor-pointer"
          >
            <option value="Semua Periode">Semua Periode</option>
            <option value="7 Hari Terakhir">7 Hari Terakhir</option>
            <option value="30 Hari Terakhir">30 Hari Terakhir</option>
          </select>
        </div>

        {/* Filter Tabs */}
        <div className="flex border-b border-slate-100 dark:border-[#142236] text-xs font-sans overflow-x-auto custom-scrollbar">
          {[
            { id: 'all', label: 'Semua Riwayat (All)' },
            { id: 'inflow', label: 'Deposit & Reward (Inflow)' },
            { id: 'outflow', label: 'Withdraw & Fee (Outflow)' },
            { id: 'gas', label: 'Gas Trading Fee' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id as any)}
              className={`py-2 px-3 whitespace-nowrap transition-colors border-b-2 font-medium cursor-pointer ${
                filterTab === tab.id
                  ? 'border-amber-500 dark:border-[#F0B90B] text-amber-600 dark:text-[#F0B90B] font-semibold'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Transaction Ledger Items */}
        <div className="space-y-2 pt-1">
          {filteredTransactions.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-xs font-sans">
              Tidak ada data transaksi yang cocok.
            </div>
          ) : (
            filteredTransactions.map((tx, idx) => (
              <div
                key={`${tx.id || 'tx'}-${idx}`}
                className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B121E] border border-slate-100 dark:border-[#162338] hover:border-slate-200 dark:hover:border-[#1E2E44] transition flex items-center justify-between gap-3 text-xs"
              >
                {/* Left icon & details */}
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      tx.type === 'inflow'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                        : tx.type === 'gas'
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                        : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                    }`}
                  >
                    {tx.type === 'inflow' ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : tx.type === 'gas' ? (
                      <Fuel className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white font-sans text-xs">{tx.title}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-sans font-medium border ${tx.statusColor}`}
                      >
                        {tx.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-sans mt-0.5 space-x-2">
                      <span>{tx.timestamp}</span>
                      {tx.memberId && <span>• Member: <strong className="font-mono font-normal">{tx.memberId}</strong></span>}
                      {tx.sourceMemberId && <span>• Sumber: <strong className="font-mono font-normal">{tx.sourceMemberId}</strong></span>}
                      {tx.recipientMemberId && <span>• Penerima: <strong className="font-mono font-normal">{tx.recipientMemberId}</strong></span>}
                      {tx.counterparty && (
                        <span>
                          • {tx.counterpartyLabel || ''}
                          <strong className="text-slate-700 dark:text-slate-300 font-normal">{tx.counterparty}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Amount & Fee */}
                <div className="text-right shrink-0">
                  <span
                    className={`font-mono font-bold text-xs tabular-nums ${
                      tx.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {tx.amountFormatted}
                  </span>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-sans mt-0.5">{tx.feeInfo}</p>
                </div>
              </div>
            ))
          )}
        </div>
        {hasMoreTransactions && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={onLoadMoreTransactions}
              disabled={isLoadingTransactions}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-[#1E2E44] text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#152238] disabled:opacity-50"
            >
              {isLoadingTransactions && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              {isLoadingTransactions ? 'Memuat...' : 'Muat transaksi lebih lama'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
