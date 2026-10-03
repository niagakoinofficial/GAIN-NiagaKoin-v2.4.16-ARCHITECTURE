import { useMemo, useRef, useState } from 'react';
import { APP_LANGUAGES, useLanguage } from '../context/LanguageContext';
import { TradingPosition, UserWallet, TradeRecord, BotMode } from '../types';
import { CoinDistributionPieChart } from '../components/CoinDistributionPieChart';
import { TradeHistoryTab } from '../components/trading/TradeHistoryTab';
import { TradeDetailModal } from '../components/modals/TradeDetailModal';
import { CoinLogo } from '../components/common/CoinLogo';
import { formatUsdt } from '../utils/formatters';
import { getLicenseTierConfig } from '../config/licensePromo';
import { getBotModeLabel, normalizeBotMode } from '../utils/botModeLabels';
import { calculatePositionAnalytics } from '../utils/positionAnalytics';
import {
  TrendingUp,
  Sliders,
  Play,
  Pause,
  AlertCircle,
  AlertTriangle,
  Search,
  Fuel,
  CheckCircle2,
  DollarSign,
  Layers,
  Sparkles,
  PieChart as PieChartIcon,
  History,
  Activity,
  ArrowDownRight,
  Split,
  Maximize2,
  X,
  Plus,
  Trash2,
  Coins,
  Bot,
  Zap,
  HelpCircle,
  Info,
  Pencil,
  ShieldCheck,
  Eye,
  EyeOff,
  Lock,
  Bell,
  FlaskConical,
} from 'lucide-react';

interface TradingPositionsViewProps {
  positions: TradingPosition[];
  engineBots?: Array<{ id: string; botId?: string; botName?: string; pair: string; mode: 'testnet' | 'live'; strategy: BotMode; stepLayer: number; maxLayers: number; lastPrice: number; status: string; positionQty: number; positionVersion?: number; avgEntryPrice: number; realizedPnlToday: number; lastErrorReason?: string; priceBoundaryStatus?: string; resumeAfterReconciliation?: boolean; lastReconciledAt?: number; pendingOrderStatus?: 'submitting' | 'reconciling' | 'unknown' | 'filled' | null; pendingClientOrderId?: string | null; pendingSide?: 'buy' | 'sell' | null; pendingRequestedQty?: number | null; pendingCreatedAt?: number | null; pendingExchangeOrderId?: string | null; timeframe?: string; lastStrategyCandleTimestamp?: number | null; strategyPriceSource?: 'CLOSED_CANDLE' | string; strategySignalPrice?: number | null; strategySignalCloseTimestamp?: number | null; minPrice?: number | null; maxPrice?: number | null; recoveryState?: 'HEALTHY' | 'RECONCILIATION_PENDING' | 'STARTUP_RESUME_REQUIRED' | 'ORDER_STATUS_UNCERTAIN' | 'ERROR'; recoveryLabel?: string; recoveryMessage?: string; }>;
  wallet: UserWallet;
  tradeHistory?: TradeRecord[];
  activeApiCreds?: {
    exchange: string;
    apiKey: string;
    secret: string;
    password?: string;
    isSandbox: boolean;
  } | null;
  isDemoOrTestnet?: boolean;
  onSyncExchangeTrades?: () => Promise<void>;
  isSyncingTrades?: boolean;
  hasMoreTrades?: boolean;
  isLoadingMoreTrades?: boolean;
  onLoadMoreTrades?: () => void;
  onOpenApiKeyModal?: () => void;
  onOpenMatrixModal: (
    pair: string,
    mode?: BotMode,
    layers?: number,
    botId?: string | null,
    botName?: string,
    isNewBot?: boolean,
    minPrice?: number | null,
    maxPrice?: number | null,
    pairedCoins?: string[]
  ) => void;
  onDeleteBot?: (posId: string) => void;
  onDeleteAllStandbyBots?: () => void;
  onOpenGasModal: () => void;
  onForceTakeProfit: (posId: string) => Promise<{
    success: boolean;
    orderId?: string;
    isLiveExchange?: boolean;
    filled?: number;
    price?: number;
    exchangeError?: string;
    error?: string;
  } | void> | void;
  onTogglePause: (posId: string) => void;
  onReconcileBot?: (botId: string) => Promise<any> | any;
  onBatchForceTp: () => void;
  onBatchPauseAll: () => void;
  onOpenActivationModal?: () => void;
  onCloseLayer?: (positionId: string, layerId: string) => Promise<any> | void;
  onExecuteBotOrder?: (
    pair: string,
    side: 'buy' | 'sell',
    amount?: number
  ) => Promise<{ success: boolean; orderId?: string; message?: string; error?: string }>;
  onOpenPriceAlert?: (symbol?: string) => void;
  onOpenBacktest?: () => void;
}

export function TradingPositionsView({
  positions,
  engineBots = [],
  wallet,
  tradeHistory = [],
  activeApiCreds,
  isDemoOrTestnet = false,
  onSyncExchangeTrades,
  isSyncingTrades = false,
  hasMoreTrades = false,
  isLoadingMoreTrades = false,
  onLoadMoreTrades,
  onOpenApiKeyModal,
  onOpenMatrixModal,
  onOpenGasModal,
  onForceTakeProfit,
  onTogglePause,
  onReconcileBot,
  onBatchForceTp,
  onBatchPauseAll,
  onOpenActivationModal,
  onExecuteBotOrder,
  onDeleteBot,
  onDeleteAllStandbyBots,
  onCloseLayer,
  onOpenPriceAlert,
  onOpenBacktest,
}: TradingPositionsViewProps) {
  const { language, setLanguage, t } = useLanguage();
  const [mainTab, setMainTab] = useState<'positions' | 'history'>('positions');
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'profit' | 'drawdown' | 'inactive' | 'avg_only' | 'grid_only' | 'hybrid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'stable' | 'pnl_desc' | 'pnl_asc' | 'layer_desc'>('stable');
  const stableOrderRef = useRef(new Map<string, number>());
  const nextStableOrderRef = useRef(0);
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<'success' | 'warning'>('success');
  const [isConfirmBatchTpOpen, setIsConfirmBatchTpOpen] = useState(false);
  const [isConfirmBatchPauseOpen, setIsConfirmBatchPauseOpen] = useState(false);
  const [selectedSingleTpPos, setSelectedSingleTpPos] = useState<TradingPosition | null>(null);

  // The backend runner owns the authoritative position quantity + average entry.
  // Do not derive floating PnL from current portfolio value; that makes PnL zero
  // because currentValue - currentValue === 0.
  const displayPositions = useMemo(() => {
    const merged = positions.map((position) => {
      // Multi-pair bots share the same botId. Pair is therefore the primary key;
      // using botId first would make ETH/SOL inherit BTC's market price.
      const targetId = position.botId || position.id;
      const samePair = engineBots.filter((bot) => bot.pair === position.pair);
      const byPairAndId = samePair.find((bot) => bot.id === position.id || bot.id === targetId || bot.botId === targetId);
      const bot = byPairAndId || (samePair.length === 1 ? samePair[0] : undefined);
      if (!bot) return position;

      const qty = Number(bot.positionQty);
      const avgEntry = Number(bot.avgEntryPrice);
      const marketPrice = Number(bot.lastPrice);
      if (!(qty > 0) || !(avgEntry > 0) || !(marketPrice > 0)) return position;

      const costBasis = avgEntry * qty;
      const floatingPnl = Number(((marketPrice - avgEntry) * qty).toFixed(4));
      const roiPct = costBasis > 0 ? Number(((floatingPnl / costBasis) * 100).toFixed(2)) : 0;

      return {
        ...position,
        botId: bot.botId || bot.id || position.botId,
        botName: bot.botName || position.botName,
        price: marketPrice,
        floatingPnl,
        roiPct,
        totalCoinQty: qty,
        avgBuyPrice: avgEntry,
        allocationQty: `${qty} ${position.coin || position.pair.split('/')[0] || position.pair}`,
        coin: position.coin || position.pair.split('/')[0] || position.pair,
        allocationUsdt: `$${costBasis.toFixed(2)}`,
        stepLayer: Math.max(1, Number(bot.stepLayer) || position.stepLayer || 1),
        maxStep: Math.max(1, Number(bot.maxLayers) || position.maxStep || 1),
        timeframe: bot.timeframe || position.timeframe,
        minPrice: bot.minPrice ?? position.minPrice,
        maxPrice: bot.maxPrice ?? position.maxPrice,
        priceBoundaryStatus: (bot.priceBoundaryStatus || position.priceBoundaryStatus) as TradingPosition['priceBoundaryStatus'],
        status: bot.status === 'active' ? 'active' : bot.status === 'error' ? 'averaging' : position.status,
        statusLabel: bot.status === 'active' ? 'AKTIF RUNNING' : position.statusLabel,
        botMode: normalizeBotMode(bot.strategy || position.botMode),
      };
    });

    // If the backend runner has a real open quantity but the old Firestore projection
    // is missing/stale, surface the authoritative runtime position instead of showing 0.
    const existingRuntimeKeys = new Set(merged.map((position) => `${position.botId || position.id}:${position.pair}`));
    for (const bot of engineBots) {
      const qty = Number(bot.positionQty);
      const avgEntry = Number(bot.avgEntryPrice);
      const marketPrice = Number(bot.lastPrice);
      if (!(qty > 0) || !(avgEntry > 0) || !(marketPrice > 0)) continue;
      const runtimeKey = `${bot.botId || bot.id}:${bot.pair}`;
      if (existingRuntimeKeys.has(runtimeKey)) continue;
      const coin = bot.pair.split('/')[0] || bot.pair;
      const costBasis = qty * avgEntry;
      const floatingPnl = Number(((marketPrice - avgEntry) * qty).toFixed(4));
      const roiPct = costBasis > 0 ? Number(((floatingPnl / costBasis) * 100).toFixed(2)) : 0;
      merged.push({
        id: bot.id,
        botId: bot.botId || bot.id,
        botName: bot.botName || bot.pair,
        coin,
        pair: bot.pair,
        badgeSymbol: coin.slice(0, 1),
        badgeBg: 'bg-teal-500/10',
        badgeColor: 'text-teal-500',
        price: marketPrice,
        change24h: 0,
        engine: 'GAIN Runtime Engine',
        botMode: normalizeBotMode(bot.strategy),
        allocationQty: `${qty} ${coin}`,
        allocationUsdt: `$${costBasis.toFixed(2)}`,
        stepLayer: Math.max(1, Number(bot.stepLayer) || 1),
        maxStep: Math.max(1, Number(bot.maxLayers) || 1),
        layerQuota: `${Math.max(1, Number(bot.maxLayers) || 1)} layers`,
        floatingPnl,
        roiPct,
        status: bot.status === 'active' ? 'active' : 'averaging',
        statusLabel: bot.status === 'active' ? 'AKTIF RUNNING' : 'PAUSED / RECOVERY',
        trailingInfo: 'Backend runner authoritative',
        trailingProgressPct: 0,
        timeframe: bot.timeframe,
        avgBuyPrice: avgEntry,
        totalCoinQty: qty,
        totalCostUsdt: costBasis,
        minPrice: bot.minPrice,
        maxPrice: bot.maxPrice,
        priceBoundaryStatus: bot.priceBoundaryStatus as TradingPosition['priceBoundaryStatus'],
      });
    }
    return merged;
  }, [positions, engineBots]);
  const [noProfitWarningPos, setNoProfitWarningPos] = useState<TradingPosition | null>(null);
  const [isExecutingSingleTp, setIsExecutingSingleTp] = useState(false);
  const [selectedDetailPos, setSelectedDetailPos] = useState<TradingPosition | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [botToDelete, setBotToDelete] = useState<TradingPosition | null>(null);
  const [isConfirmDeleteAllStandbyOpen, setIsConfirmDeleteAllStandbyOpen] = useState(false);
  const [executingPosId, setExecutingPosId] = useState<string | null>(null);
  const [showPieChart, setShowPieChart] = useState(true);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [showRealtimeEngine, setShowRealtimeEngine] = useState(true);

  // View Mode: 'simple' for beginners vs 'pro' for quant traders
  const [viewMode, setViewMode] = useState<'simple' | 'pro'>(() => {
    return (localStorage.getItem('gain_trading_view_mode') as 'simple' | 'pro') || 'pro';
  });
  const [showGlossaryModal, setShowGlossaryModal] = useState(false);
  const [quickBoundaryEditPos, setQuickBoundaryEditPos] = useState<TradingPosition | null>(null);
  const [editMinPrice, setEditMinPrice] = useState('');
  const [editMaxPrice, setEditMaxPrice] = useState('');

  const handleToggleViewMode = (mode: 'simple' | 'pro') => {
    setViewMode(mode);
    localStorage.setItem('gain_trading_view_mode', mode);
  };

  const handleOpenQuickBoundary = (pos: TradingPosition) => {
    setQuickBoundaryEditPos(pos);
    setEditMinPrice(pos.minPrice != null && pos.minPrice > 0 ? String(pos.minPrice) : '');
    setEditMaxPrice(pos.maxPrice != null && pos.maxPrice > 0 ? String(pos.maxPrice) : '');
  };

  const handleSaveQuickBoundary = () => {
    if (!quickBoundaryEditPos) return;
    const minP = editMinPrice ? parseFloat(editMinPrice) : null;
    const maxP = editMaxPrice ? parseFloat(editMaxPrice) : null;
    onOpenMatrixModal(
      quickBoundaryEditPos.pair,
      quickBoundaryEditPos.botMode,
      quickBoundaryEditPos.maxStep || 10,
      quickBoundaryEditPos.botId || quickBoundaryEditPos.id,
      quickBoundaryEditPos.botName,
      false,
      minP,
      maxP,
      quickBoundaryEditPos.pairedCoins || [quickBoundaryEditPos.pair]
    );
    setQuickBoundaryEditPos(null);
    showToast(`Batas harga Min/Max untuk ${quickBoundaryEditPos.pair} diperbarui!`, 'success');
  };

  // Active Bots calculation (distinct bot configurations)
  const activeBotIds = new Set(
    displayPositions
      .filter((p) => p.status === 'active' || p.status === 'averaging')
      .map((p) => p.botId || p.id)
  );
  const activeBotsCount = activeBotIds.size;
  const maxActiveBots = isDemoOrTestnet ? 999999 : (wallet.licenseStatus === 'active' ? (wallet.maxActiveBots || 6) : 6);
  const isStarterTier = wallet.licenseTier !== 'pro_12';

  const runtimeOpenBots = engineBots.filter((bot) => Number(bot.positionQty || 0) > 0);
  const openPositionCount = engineBots.length > 0
    ? runtimeOpenBots.length
    : displayPositions.filter((p) => Number(p.totalCoinQty || 0) > 0).length;
  const runtimeActiveBots = engineBots.filter((bot) => bot.status === 'active' && Number(bot.positionQty || 0) > 0);
  const activePositions = displayPositions.filter((p) => p.status === 'active' || p.status === 'averaging');
  // Footer counts follow authoritative backend runners when available.
  const activeCount = engineBots.length > 0 ? runtimeActiveBots.length : activePositions.length;
  const runtimeDeployedCapital = activePositions.reduce((sum, position) => {
    const explicitCost = Number(position.totalCostUsdt ?? 0);
    if (Number.isFinite(explicitCost) && explicitCost > 0) return sum + explicitCost;
    const qty = Number(position.totalCoinQty ?? 0);
    const avg = Number(position.avgBuyPrice ?? 0);
    return sum + (qty > 0 && avg > 0 ? qty * avg : 0);
  }, 0);
  // The wallet snapshot is a persisted fallback, while the backend runtime position
  // is authoritative for capital currently deployed in running bots.
  const capitalDeployedUsdt = runtimeDeployedCapital > 0
    ? runtimeDeployedCapital
    : Math.max(0, Number(wallet.allocatedAssetUsdt ?? 0));
  const totalFloatingPnl = displayPositions.reduce((acc, p) => acc + Number(p.floatingPnl ?? 0), 0);
  const profitablePositions = displayPositions.filter((p) => Number(p.floatingPnl ?? 0) > 0);
  const profitCount = profitablePositions.length;
  const totalProfitUsdt = profitablePositions.reduce((acc, p) => acc + Number(p.floatingPnl ?? 0), 0);
  const drawdownCount = displayPositions.filter((p) => Number(p.floatingPnl ?? 0) < 0 && p.status !== 'inactive').length;
  const inactiveCount = displayPositions.filter((p) => p.status === 'inactive').length;

  const totalCapital = Math.max(0, Number(wallet.liquidBalance ?? 0)) + capitalDeployedUsdt;
  const portfolioRoi = capitalDeployedUsdt > 0
    ? ((totalFloatingPnl / capitalDeployedUsdt) * 100).toFixed(2)
    : '0.00';
  const poolExposurePct = totalCapital > 0
    ? Math.round((capitalDeployedUsdt / totalCapital) * 100)
    : 0;
  const gasHealthPct = Math.min(100, Math.round((wallet.gasReserve / 100) * 100));
  const analytics = useMemo(
    () => calculatePositionAnalytics(displayPositions, wallet, engineBots),
    [displayPositions, wallet, engineBots]
  );


  const stableKeyFor = (pos: TradingPosition) => `${pos.botId || pos.id || pos.botName || 'bot'}::${pos.pair}`;
  for (const pos of displayPositions) {
    const key = stableKeyFor(pos);
    if (!stableOrderRef.current.has(key)) stableOrderRef.current.set(key, nextStableOrderRef.current++);
  }

  const filteredPositions = displayPositions
    .filter((pos) => {
      const mode = normalizeBotMode(pos.botMode);
      if (filterTab === 'active' && pos.status === 'inactive') return false;
      if (filterTab === 'profit' && Number(pos.floatingPnl ?? 0) <= 0) return false;
      if (filterTab === 'drawdown' && (Number(pos.floatingPnl ?? 0) >= 0 || pos.status === 'inactive')) return false;
      if (filterTab === 'inactive' && pos.status !== 'inactive') return false;
      if (filterTab === 'avg_only' && mode !== 'Avarage Only') return false;
      if (filterTab === 'grid_only' && mode !== 'Grid Only') return false;
      if (filterTab === 'hybrid' && mode !== 'Avarage+Grid') return false;

      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        pos.pair.toLowerCase().includes(q) ||
        pos.coin.toLowerCase().includes(q) ||
        getBotModeLabel(mode, language).toLowerCase().includes(q) ||
        mode.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'pnl_desc') return Number(b.floatingPnl ?? 0) - Number(a.floatingPnl ?? 0);
      if (sortBy === 'pnl_asc') return Number(a.floatingPnl ?? 0) - Number(b.floatingPnl ?? 0);
      if (sortBy === 'layer_desc') return Number(b.stepLayer ?? 0) - Number(a.stepLayer ?? 0);
      return (stableOrderRef.current.get(stableKeyFor(a)) ?? 0) - (stableOrderRef.current.get(stableKeyFor(b)) ?? 0);
    });

  const showToast = (msg: string, type: 'success' | 'warning' = 'success') => {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleTriggerBatchTp = () => {
    if (profitCount === 0) {
      showToast('Tidak ada posisi aktif yang sedang dalam profit untuk di-Take Profit.', 'warning');
      return;
    }
    setIsConfirmBatchTpOpen(true);
  };

  const handleConfirmBatchTp = () => {
    setIsConfirmBatchTpOpen(false);
    onBatchForceTp();
    showToast(`Berhasil mengeksekusi Take Profit untuk ${profitCount} posisi profit (+${totalProfitUsdt.toFixed(2)} USDT)!`, 'success');
  };

  const handleTriggerBatchPause = () => {
    setIsConfirmBatchPauseOpen(true);
  };

  const handleConfirmBatchPause = () => {
    setIsConfirmBatchPauseOpen(false);
    onBatchPauseAll();
    showToast(`Perintah Pause berhasil dikirim untuk seluruh (${activeCount}) bot trading!`, 'success');
  };

  const handleOpenSingleTpModal = (pos: TradingPosition) => {
    // Manual close is intentionally available even when PnL is negative.
    // A separate warning explains that closing a losing position realizes the loss.
    setSelectedSingleTpPos(pos);
  };

  const handleConfirmSingleTp = async () => {
    if (!selectedSingleTpPos) return;
    setIsExecutingSingleTp(true);
    try {
      const res = await onForceTakeProfit(selectedSingleTpPos.id);
      setIsExecutingSingleTp(false);
      setSelectedSingleTpPos(null);

      if (res && typeof res === 'object' && res.success) {
        if (res.isLiveExchange && res.orderId) {
          showToast(`✅ Take Profit Berhasil! Order Market Sell terisi di ${activeApiCreds?.exchange || 'Exchange'} (ID #${res.orderId}). Fill ${res.filled || 0} @ $${res.price || 0}.`, 'success');
        } else {
          showToast(`✅ Take Profit Berhasil! Fill ${res.filled || 0} @ $${res.price || 0}. Saldo dan ledger akan mengikuti settlement server.`, 'success');
        }
      } else {
        showToast(`✅ Force Take Profit dieksekusi untuk ${selectedSingleTpPos.pair}!`, 'success');
      }
    } catch (err: any) {
      setIsExecutingSingleTp(false);
      showToast(`Gagal mengeksekusi Take Profit: ${err.message || 'Kesalahan sistem'}`, 'warning');
    }
  };

  return (
    <div className="space-y-4 pb-20">
      {/* Sandbox/Demo Mode Notification when Account is Not Yet Activated */}
      {wallet.licenseStatus !== 'active' && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-950/20 to-transparent border border-amber-500/40 text-amber-200 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-bold text-xs flex-wrap">
                <span className="text-white font-bold">Lingkungan Trading: Testnet / Live Exchange</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-400/20 text-amber-300 font-bold border border-amber-400/30 uppercase">
                  Belum Aktivasi
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-sans mt-0.5 leading-snug">
                Bot menggunakan harga market real dan API exchange. Mode Testnet mengirim order ke sandbox/testnet exchange; mode Live mengirim order ke akun live setelah seluruh server-side gates terpenuhi.
              </p>
            </div>
          </div>
          {onOpenActivationModal && (
            <button
              onClick={onOpenActivationModal}
              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs font-sans shrink-0 transition cursor-pointer shadow-xs flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 fill-current" />
              <span>Aktivasi Akun</span>
            </button>
          )}
        </div>
      )}

      {/* View Header Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-100 via-white to-slate-100 dark:from-[#0C172A] dark:via-[#091222] dark:to-[#060B14] border border-slate-200 dark:border-[#162740] shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-wide flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-teal-600 dark:text-[#00F0C8]" />
              <span>Posisi Trading Aktif · Live Bot Positions</span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              3 Mode: Average Only (1L default) • Grid Only (5L default) • Average + Grid (1L + 5L) • Closed-Candle TF • Filter Uptrend • Trailing TP
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={() => setShowPieChart((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer ${
                showPieChart
                  ? 'bg-teal-500/10 border-teal-500/40 text-teal-700 dark:text-[#00F0C8]'
                  : 'bg-white dark:bg-[#0C1628] border-slate-200 dark:border-[#182B46] text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              <PieChartIcon className="w-3.5 h-3.5" />
              <span>{showPieChart ? 'Sembunyikan Bagan' : 'Bagan Distribusi'}</span>
            </button>

            <button
              onClick={() => onOpenMatrixModal('BTC/USDT', 'Avarage+Grid', 1, null, 'GAIN Matrix Multi-Pair Bot', true, null, null, ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'])}
              className="px-3 py-1.5 rounded-xl bg-teal-500 hover:bg-teal-400 dark:bg-[#00F0C8] dark:hover:bg-[#00d8b4] text-slate-950 font-bold text-xs font-mono glow-cyan-btn transition flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Buat Bot Baru (Multi-Koin)</span>
            </button>

            <button
              onClick={() => onOpenMatrixModal('BTC/USDT', 'Avarage+Grid', 1, null, 'Formula Matrix Bot', false)}
              className="px-3 py-1.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-700 dark:text-[#00F0C8] hover:bg-teal-500/20 transition text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Matrix Formula</span>
            </button>

            {onOpenBacktest && (
              <button
                onClick={onOpenBacktest}
                className="px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20 transition text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                title="Backtest strategi tanpa exchange write"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                <span>Backtest</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Realtime background engine — authoritative bot runner state */}
      <div className="mb-3 rounded-2xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] shadow-xs overflow-hidden">
        <div className="px-3.5 py-3 border-b border-slate-100 dark:border-[#1A283D] flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold font-mono text-slate-900 dark:text-white">REALTIME BOT ENGINE</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">Status berasal dari runner backend, bukan simulator.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-teal-600 dark:text-[#00F0C8]">{engineBots.length} BOT</span>
            <button
              type="button"
              onClick={() => setShowRealtimeEngine((visible) => !visible)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-[#243652] text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#17263B] transition"
              title={showRealtimeEngine ? 'Sembunyikan Realtime Bot Engine' : 'Tampilkan Realtime Bot Engine'}
              aria-label={showRealtimeEngine ? 'Sembunyikan Realtime Bot Engine' : 'Tampilkan Realtime Bot Engine'}
            >
              {showRealtimeEngine ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        {showRealtimeEngine && engineBots.length === 0 ? (
          <div className="px-3.5 py-5 text-center text-xs text-slate-500">Belum ada runner aktif. Buat bot baru dan hubungkan API Testnet/Live.</div>
        ) : showRealtimeEngine ? (
          <div className="divide-y divide-slate-100 dark:divide-[#14233A]">
            {engineBots.map((bot) => {
              const recoveryState = bot.recoveryState || (bot.resumeAfterReconciliation ? 'RECONCILIATION_PENDING' : bot.pendingOrderStatus ? 'ORDER_STATUS_UNCERTAIN' : 'HEALTHY');
              const recoveryTone = recoveryState === 'HEALTHY'
                ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300'
                : recoveryState === 'RECONCILIATION_PENDING'
                  ? 'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-300'
                  : 'border-red-500/30 bg-red-500/5 text-red-700 dark:text-red-300';
              return (
                <div key={bot.id} className="px-3.5 py-3">
                  <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 items-center">
                    <div className="min-w-0"><div className="text-xs font-bold truncate text-slate-900 dark:text-white">{bot.botName || bot.botId}</div><div className="text-[9px] font-mono text-slate-500">{bot.pair} · {bot.strategy}</div></div>
                    <div className="text-[10px] font-mono"><span className={bot.mode === 'live' ? 'text-amber-500' : 'text-sky-500'}>{bot.mode.toUpperCase()}</span></div>
                    <div className="text-[10px] font-mono text-slate-600 dark:text-slate-300">Market {Number(bot.lastPrice || 0).toLocaleString()}</div>
                    <div className="text-[10px] font-mono text-slate-600 dark:text-slate-300">L{bot.stepLayer}/{bot.maxLayers}</div>
                    <div className="text-[10px] font-mono text-slate-600 dark:text-slate-300">Qty {Number(bot.positionQty || 0).toFixed(6)}</div>
                    <div className="text-[10px] font-mono text-slate-600 dark:text-slate-300">Signal {bot.timeframe || '5m'} · {bot.strategyPriceSource === 'CLOSED_CANDLE' ? `$${Number(bot.strategySignalPrice || 0).toLocaleString()}` : '—'}</div>
                    <div className={bot.status === 'active' ? 'text-[10px] font-bold text-emerald-500' : 'text-[10px] font-bold text-amber-500'}>{String(bot.status).toUpperCase()}</div>
                  </div>
                  {recoveryState !== 'HEALTHY' && (
                    <div className={`mt-2 rounded-xl border px-3 py-2 ${recoveryTone}`}>
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold font-mono uppercase">{bot.recoveryLabel || recoveryState}</div>
                          <div className="text-[10px] mt-0.5 opacity-90">{bot.recoveryMessage || 'Bot ditahan oleh recovery gate.'}</div>
                          {bot.pendingClientOrderId && (
                            <div className="text-[9px] font-mono mt-1 opacity-80">Order {bot.pendingClientOrderId.slice(0, 8)}…{bot.pendingClientOrderId.slice(-6)} · {String(bot.pendingSide || '').toUpperCase()} · Qty {Number(bot.pendingRequestedQty || 0).toFixed(6)}</div>
                          )}
                          {bot.lastReconciledAt && (
                            <div className="text-[9px] font-mono mt-1 opacity-70">Rekonsiliasi terakhir: {new Date(bot.lastReconciledAt).toLocaleString()}</div>
                          )}
                        </div>
                        {recoveryState === 'RECONCILIATION_PENDING' && onReconcileBot && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await onReconcileBot(bot.botId || bot.id);
                                showToast(`Rekonsiliasi ${bot.pair} selesai dibaca dari exchange.`, 'success');
                              } catch (error: any) {
                                showToast(error?.message || 'Rekonsiliasi gagal. Bot tetap ditahan.', 'warning');
                              }
                            }}
                            className="shrink-0 px-3 py-1.5 rounded-lg border border-current/30 bg-white/60 dark:bg-black/10 text-[10px] font-bold font-mono hover:bg-white/90 dark:hover:bg-white/10 transition"
                          >
                            Reconcile Now
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Top Tab Switcher: Positions vs Trade History */}
      <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] shadow-xs transition-colors">
        <button
          onClick={() => setMainTab('positions')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-sans font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
            mainTab === 'positions'
              ? 'bg-teal-600 text-white dark:bg-[#00F0C8] dark:text-slate-950 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Posisi Berjalan & Standby</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums ${
              mainTab === 'positions'
                ? 'bg-black/20 text-white dark:text-slate-950 font-bold'
                : 'bg-slate-200 dark:bg-[#162338] text-slate-700 dark:text-slate-300'
            }`}
          >
            {displayPositions.length}
          </span>
        </button>

        <button
          onClick={() => setMainTab('history')}
          className={`flex-1 py-2 px-3 rounded-xl text-xs font-sans font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
            mainTab === 'history'
              ? 'bg-teal-600 text-white dark:bg-[#00F0C8] dark:text-slate-950 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Riwayat Trading & Orders</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums ${
              mainTab === 'history'
                ? 'bg-black/20 text-white dark:text-slate-950 font-bold'
                : 'bg-slate-200 dark:bg-[#162338] text-slate-700 dark:text-slate-300'
            }`}
          >
            {tradeHistory.length}
          </span>
        </button>
      </div>

      {mainTab === 'history' ? (
        <TradeHistoryTab
          trades={tradeHistory}
          wallet={wallet}
          positions={positions}
          activeApiCreds={activeApiCreds || null}
          onSyncExchangeTrades={onSyncExchangeTrades || (async () => {})}
          isSyncing={isSyncingTrades}
          hasMoreTrades={hasMoreTrades}
          isLoadingMoreTrades={isLoadingMoreTrades}
          onLoadMoreTrades={onLoadMoreTrades}
          onOpenApiKeyModal={onOpenApiKeyModal || (() => {})}
          onForceTakeProfit={onForceTakeProfit}
          onOpenMatrixModal={(pair) => onOpenMatrixModal(pair)}
          onCloseLayer={onCloseLayer}
        />
      ) : (
        <>
          {/* Bot Quota & Lifetime License Banner */}
          <div className="p-3 sm:p-4 rounded-2xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] shadow-xs flex items-center justify-between flex-wrap gap-3 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-[#2DD4BF] border border-teal-500/20 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-sans font-bold text-slate-900 dark:text-white">
                    Kuota Bot Aktif: <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">{activeBotsCount}</span> / <span className="font-mono tabular-nums">{isDemoOrTestnet ? '∞ (Tanpa Batas Demo)' : `${maxActiveBots} Bot`}</span>
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold border ${isDemoOrTestnet ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' : 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-[#2DD4BF] border border-teal-500/30'}`}>
                    {isDemoOrTestnet ? 'Mode Demo / Testnet (Bebas Bot & Gas)' : (wallet.licenseName || (wallet.licenseStatus === 'active' ? 'Starter Lifetime (6 Bot)' : 'Belum Teraktivasi'))}
                  </span>
                  <span className="text-xs font-sans text-slate-500 dark:text-slate-400">
                    • Draft Setting: <strong className="text-slate-900 dark:text-white">Tanpa Batas</strong>
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                  {isDemoOrTestnet
                    ? 'Mode Demo / Testnet aktif: Kuota bot aktif tidak terbatas. Anda bebas mengaktifkan bot sebanyak mungkin tanpa restriksi.'
                    : (activeBotsCount >= maxActiveBots
                      ? `Batas kuota ${maxActiveBots} bot aktif tercapai. Bot baru akan disimpan sebagai Draft (bisa dibuat tanpa batas).`
                      : `Tersedia sisa kuota ${maxActiveBots - activeBotsCount} bot untuk dijalankan bersamaan. Draft bot dapat dibuat tanpa batas.`)}
                </p>
              </div>
            </div>

            {onOpenActivationModal && (
              <button
                onClick={onOpenActivationModal}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-teal-500/15 to-indigo-500/15 hover:from-teal-500/25 hover:to-indigo-500/25 text-teal-700 dark:text-[#00F0C8] border border-teal-500/40 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Zap className="w-3.5 h-3.5 text-teal-600 dark:text-[#00F0C8]" />
                <span>
                  {wallet.licenseStatus === 'active'
                    ? isStarterTier
                      ? 'Upgrade ke 12 Bot ($100 Promo)'
                      : 'Paket Pro Lifetime (12 Bot)'
                    : 'Aktivasi Lisensi ($150 Promo)'}
                </span>
              </button>
            )}
          </div>

          {/* 4 KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-3.5 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] shadow-xs transition-colors">
              <span className="text-[10.5px] text-slate-500 dark:text-slate-400 uppercase tracking-tight block font-sans font-medium">
                Total Active Positions
              </span>
              <div className="text-base font-bold text-slate-900 dark:text-white mt-1 font-mono tabular-nums">
                {activeCount} <span className="text-xs text-slate-400 font-normal">/ {displayPositions.length}</span>
              </div>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans mt-0.5 block">Alokasi Otomatis</span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] shadow-xs transition-colors">
              <span className="text-[10.5px] text-slate-500 dark:text-slate-400 uppercase tracking-tight block font-sans font-medium">
                {t('floatingPnl')}
              </span>
              <div className={`text-base font-bold mt-1 font-mono tabular-nums ${totalFloatingPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                {totalFloatingPnl >= 0 ? `+${formatUsdt(totalFloatingPnl)}` : formatUsdt(totalFloatingPnl)} USDT
              </div>
              <span className={`text-[10px] font-mono mt-0.5 block tabular-nums ${Number(portfolioRoi) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                {Number(portfolioRoi) >= 0 ? `+${portfolioRoi}%` : `${portfolioRoi}%`} {t('portfolioRoi')}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] shadow-xs transition-colors">
              <span className="text-[10.5px] text-slate-500 dark:text-slate-400 uppercase tracking-tight block font-sans font-medium">
                {t('capitalDeployed')}
              </span>
              <div className="text-base font-bold text-slate-900 dark:text-white mt-1 font-mono tabular-nums">
                {formatUsdt(capitalDeployedUsdt)} USDT
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans mt-0.5 block">{poolExposurePct}% {t('poolExposure')}</span>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] shadow-xs transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] text-slate-500 dark:text-slate-400 uppercase tracking-tight block font-sans font-medium">
                  {t('gasHealth')}
                </span>
                <button onClick={onOpenGasModal} className="text-[10px] text-teal-600 dark:text-[#2DD4BF] hover:underline cursor-pointer font-sans font-semibold">
                  Top-Up
                </button>
              </div>
              <div className="text-base font-bold text-teal-600 dark:text-[#2DD4BF] mt-1 font-sans">
                {gasHealthPct}% {wallet.gasReserve >= 10 ? 'Aman' : 'Perlu Top-Up'}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5 block">
                +{formatUsdt(wallet.gasReserve)} USDT
              </span>
            </div>
          </div>

          {/* Portfolio Analytics */}
          <section className="rounded-2xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-[#1A283D] flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-600 dark:text-[#00F0C8]" />
                  <h3 className="text-xs font-bold font-mono text-slate-900 dark:text-white">PORTFOLIO ANALYTICS</h3>
                  <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#162338] text-[9px] font-mono text-slate-500 dark:text-slate-400">LIVE SNAPSHOT</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Ringkasan exposure, performa, utilisasi layer, dan kesehatan runtime bot.</p>
              </div>
              <button
                onClick={() => setShowAnalytics((prev) => !prev)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-[#20334D] text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white cursor-pointer"
              >
                {showAnalytics ? 'Sembunyikan' : 'Tampilkan'}
              </button>
            </div>

            {showAnalytics && (
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-xl bg-slate-50 dark:bg-[#0B1422] border border-slate-200 dark:border-[#1A2A42] p-3">
                    <div className="text-[9px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Floating ROI</div>
                    <div className={`mt-1 text-lg font-bold font-mono tabular-nums ${analytics.floatingRoiPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                      {analytics.floatingRoiPct >= 0 ? '+' : ''}{analytics.floatingRoiPct.toFixed(2)}%
                    </div>
                    <div className="text-[9px] text-slate-500 mt-0.5">Current mark-to-market</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-[#0B1422] border border-slate-200 dark:border-[#1A2A42] p-3">
                    <div className="text-[9px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Layer Utilization</div>
                    <div className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">{analytics.layerUtilizationPct.toFixed(1)}%</div>
                    <div className="h-1.5 mt-2 rounded-full bg-slate-200 dark:bg-[#18263B] overflow-hidden">
                      <div className={`h-full rounded-full ${analytics.layerUtilizationPct >= 90 ? 'bg-red-500' : analytics.layerUtilizationPct >= 75 ? 'bg-amber-500' : 'bg-teal-500'}`} style={{ width: `${Math.min(100, analytics.layerUtilizationPct)}%` }} />
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-[#0B1422] border border-slate-200 dark:border-[#1A2A42] p-3">
                    <div className="text-[9px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Current Drawdown</div>
                    <div className="mt-1 text-lg font-bold font-mono tabular-nums text-red-500 dark:text-red-400">-{formatUsdt(analytics.currentDrawdownUsdt)} USDT</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">{analytics.currentDrawdownPct.toFixed(2)}% of tracked cost</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-[#0B1422] border border-slate-200 dark:border-[#1A2A42] p-3">
                    <div className="text-[9px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Runtime Health</div>
                    <div className={`mt-1 text-lg font-bold font-mono tabular-nums ${analytics.healthScore >= 80 ? 'text-emerald-600 dark:text-emerald-400' : analytics.healthScore >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500 dark:text-red-400'}`}>{analytics.healthScore}/100</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">{analytics.runtimeHealthyCount} healthy · {analytics.runtimeRiskCount} flagged</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 dark:border-[#1A2A42] p-3">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-[10px] font-bold font-mono text-slate-900 dark:text-white">PNL CONTRIBUTION</div>
                      <div className="text-[9px] font-mono text-slate-500">{analytics.profitableCount} profit · {analytics.drawdownCount} drawdown</div>
                    </div>
                    <div className="space-y-2">
                      {analytics.pnlLeaders.length === 0 ? (
                        <div className="text-[10px] text-slate-500 py-3 text-center">Belum ada posisi.</div>
                      ) : analytics.pnlLeaders.map((item, itemIndex) => {
                        const magnitude = Math.max(...analytics.pnlLeaders.map((row) => Math.abs(row.pnl)), 1);
                        return (
                          <div key={`${item.pair}-${item.botId || "pos"}-${item.id || "item"}-${itemIndex}`} className="grid grid-cols-[82px_1fr_76px] items-center gap-2">
                            <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 truncate">{item.pair}</span>
                            <div className="h-2 rounded-full bg-slate-100 dark:bg-[#142339] overflow-hidden">
                              <div className={`h-full rounded-full ${item.pnl >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.max(6, Math.min(100, (Math.abs(item.pnl) / magnitude) * 100))}%` }} />
                            </div>
                            <span className={`text-[10px] font-mono font-bold text-right ${item.pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>{item.pnl >= 0 ? '+' : ''}{formatUsdt(item.pnl)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-[#1A2A42] p-3">
                    <div className="text-[10px] font-bold font-mono text-slate-900 dark:text-white mb-3">RUNTIME RISK POSTURE</div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        ['Pending Order', analytics.pendingOrderCount, 'amber'],
                        ['Reconciliation', analytics.reconciliationCount, 'amber'],
                        ['Uncertain Order', analytics.uncertainOrderCount, 'red'],
                        ['Runner Error', analytics.errorCount, 'red'],
                      ].map(([label, value, tone]) => (
                        <div key={label as string} className={`rounded-lg border p-2 ${value ? tone === 'red' ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5' : 'border-slate-200 dark:border-[#1A2A42]'}`}>
                          <div className="text-[9px] text-slate-500">{label as string}</div>
                          <div className={`text-base font-bold font-mono ${value ? tone === 'red' ? 'text-red-500' : 'text-amber-500' : 'text-slate-800 dark:text-white'}`}>{value as number}</div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 text-[9px] leading-relaxed text-slate-500 dark:text-slate-400">Health score menggunakan snapshot posisi + runtime recovery state. Ini indikator operasional, bukan prediksi profit.</div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Coin Distribution Pie Chart */}
          {showPieChart && (
            <CoinDistributionPieChart positions={positions} wallet={wallet} />
          )}

          {/* Filter Tabs */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#142236] text-xs font-mono">
            <div className="flex overflow-x-auto custom-scrollbar">
              {[
                { id: 'all', label: `Semua (${displayPositions.length})` },
                { id: 'active', label: `Aktif (${activeCount})` },
                { id: 'profit', label: `Profit (${profitCount})` },
                { id: 'drawdown', label: `Drawdown (${drawdownCount})` },
                { id: 'avg_only', label: 'Average Only' },
                { id: 'grid_only', label: 'Grid Only' },
                { id: 'hybrid', label: 'Average + Grid' },
                { id: 'inactive', label: `Standby (${inactiveCount})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterTab(tab.id as any)}
                  className={`py-2 px-3 whitespace-nowrap transition-colors border-b-2 font-medium cursor-pointer ${
                    filterTab === tab.id
                      ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white font-bold'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {onDeleteAllStandbyBots && inactiveCount > 0 && (
              <button
                type="button"
                onClick={() => setIsConfirmDeleteAllStandbyOpen(true)}
                className="py-1 px-2.5 my-1 ml-2 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/40 border border-red-500/30 text-red-600 dark:text-red-400 text-[11px] font-sans font-semibold transition flex items-center gap-1.5 cursor-pointer shrink-0 shadow-xs"
                title="Hapus semua bot berstatus Standby"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus Semua Standby ({inactiveCount})</span>
              </button>
            )}
          </div>

          {/* Mode Selector & Beginner Glossary Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2 p-2 rounded-2xl bg-white dark:bg-[#0E1726] border border-slate-200 dark:border-[#1A2A42] shadow-xs">
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-[#070D18] border border-slate-200 dark:border-[#142236]">
              <button
                type="button"
                onClick={() => handleToggleViewMode('simple')}
                className={`px-3 py-1.5 rounded-lg text-xs font-sans font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  viewMode === 'simple'
                    ? 'bg-white dark:bg-[#15202E] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>{t('beginner')}</span>
              </button>
              <button
                type="button"
                onClick={() => handleToggleViewMode('pro')}
                className={`px-3 py-1.5 rounded-lg text-xs font-sans font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  viewMode === 'pro'
                    ? 'bg-white dark:bg-[#15202E] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
                <span>{t('pro')}</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowGlossaryModal(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#15202E] border border-slate-200 dark:border-[#1E2E44] text-slate-700 dark:text-slate-300 text-xs font-sans font-medium hover:text-slate-900 dark:hover:text-white transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                <span>{t('glossary')}</span>
              </button>

              <div className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-[#0B1424] border border-slate-200 dark:border-[#162740] text-[10px] text-slate-500 dark:text-slate-400 max-w-[360px]">
                <Info className="w-3.5 h-3.5 shrink-0 text-teal-500" />
                <span>{viewMode === 'simple' ? t('beginnerHint') : t('proHint')}</span>
              </div>
              <label className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-slate-100 dark:bg-[#0B1424] border border-slate-200 dark:border-[#162740] text-[10px] font-sans text-slate-600 dark:text-slate-300">
                <span>{t('language')}</span>
                <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} className="bg-transparent outline-none font-semibold cursor-pointer">
                  {APP_LANGUAGES.map((item) => <option key={item.id} value={item.id}>{item.flag} {item.nativeLabel}</option>)}
                </select>
              </label>
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-[#0B1424] border border-slate-200 dark:border-[#162740] text-[11px] font-mono text-slate-500 dark:text-slate-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Bursa Aktif</span>
              </div>
            </div>
          </div>

          {/* Search & Sort controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder={t('searchAssets')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white dark:bg-[#08101D] border border-slate-300 dark:border-[#142236] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-teal-500 shadow-sm"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 text-[10px]">{t('sort')}:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#08101D] border border-slate-300 dark:border-[#142236] text-slate-800 dark:text-slate-300 focus:outline-none focus:border-teal-500 shadow-sm"
              >
                <option value="stable">{t('stableOrder')}</option>
                <option value="pnl_desc">{t('pnlHigh')}</option>
                <option value="pnl_asc">{t('pnlLow')}</option>
                <option value="layer_desc">{t('layerHigh')}</option>
              </select>
            </div>
          </div>

          {toastMsg && (
            <div
              className={`p-3 rounded-xl border text-xs font-mono flex items-center gap-2 justify-center animate-fadeIn shadow-sm ${
                toastType === 'warning'
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-300'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              }`}
            >
              {toastType === 'warning' ? (
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              )}
              <span>{toastMsg}</span>
            </div>
          )}

          {/* Positions Grid */}
          <div className="space-y-3" data-gain-bot-list>
            {filteredPositions.map((pos, idx) => {
              const currentMode: BotMode = normalizeBotMode(pos.botMode);
              const maxLayers = Math.max(1, Number(pos.maxStep) || 1);
              const runtimeStep = Math.max(0, Number(pos.stepLayer) || 0);
              const hasOpenQuantity = Number(pos.totalCoinQty ?? 0) > 0;
              const filledLayerCount = hasOpenQuantity ? Math.min(maxLayers, Math.max(1, runtimeStep - 1)) : 0;
              const nextLayerCount = Math.min(maxLayers, filledLayerCount + 1);
              const stepCount = filledLayerCount;
              const layerProgressPct = Math.min(100, Math.max(6, ((filledLayerCount || 0) / maxLayers) * 100));
              const isProfit = Number(pos.floatingPnl ?? 0) >= 0;

              if (viewMode === 'simple') {
                return (
                  <div
                    key={`${pos.botId || pos.id || pos.botName || 'bot'}::${pos.pair}`}
                    data-gain-bot-card className="p-4 rounded-2xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] hover:border-teal-500/40 dark:hover:border-teal-500/30 transition shadow-xs space-y-3.5"
                  >
                    {/* Top Header: Coin, Name & Simple Status */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CoinLogo coin={pos.coin || pos.pair} size="md" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-base text-slate-900 dark:text-white font-sans">{pos.pair}</span>
                            {onOpenPriceAlert && (
                              <button
                                type="button"
                                onClick={() => onOpenPriceAlert(pos.pair)}
                                title={`Pasang Price Alert untuk ${pos.pair}`}
                                className="p-1 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition cursor-pointer"
                              >
                                <Bell className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <span
                              className="px-2 py-0.5 rounded-full text-[10.5px] font-sans font-medium flex items-center gap-1.5 bg-slate-100 dark:bg-[#15202E] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#1E2E44]"
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  pos.status === 'active' || pos.status === 'averaging'
                                    ? 'bg-slate-400 dark:bg-slate-500'
                                    : 'bg-slate-300'
                                }`}
                              />
                              {pos.status === 'active' || pos.status === 'averaging'
                                ? t('runningAutomatically')
                                : t('paused')}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                            {pos.botName || 'GAIN Automated Bot'} · Strategi Jaring Beli Aman
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                          ${Number.isFinite(Number(pos.price)) && Number(pos.price) > 0 ? Number(pos.price).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                        </span>
                        <span
                          className={`text-[11px] font-mono block font-bold tabular-nums ${
                            pos.change24h >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
                          }`}
                        >
                          {Number.isFinite(Number(pos.change24h)) ? (Number(pos.change24h) >= 0 ? `+${Number(pos.change24h)}%` : `${Number(pos.change24h)}%`) : '—'} (24j)
                        </span>
                      </div>
                    </div>

                    {/* Prominent Profit Card */}
                    <div
                      className={`p-3.5 rounded-xl border flex items-center justify-between ${
                        isProfit
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-500/30 text-emerald-900 dark:text-emerald-300'
                          : 'bg-slate-50 dark:bg-[#0B121E] border-slate-200 dark:border-[#1A2C46] text-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <div>
                        <span className="text-[10.5px] uppercase font-bold tracking-tight block text-slate-500 dark:text-slate-400">
                          {isProfit ? 'Keuntungan Berjalan Saat Ini' : 'Nilai Sementara (Floating)'}
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span
                            className={`font-mono text-xl font-extrabold tabular-nums ${
                              isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
                            }`}
                          >
                            {isProfit
                                ? `+${Number(pos.floatingPnl ?? 0).toFixed(2)}`
                                : Number(pos.floatingPnl ?? 0).toFixed(2)} USDT
                          </span>
                          <span
                            className={`text-xs font-mono font-bold tabular-nums ${
                              isProfit ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
                            }`}
                          >
                            ({isProfit ? `+${Number(pos.roiPct ?? 0)}%` : `${Number(pos.roiPct ?? 0)}%`})
                          </span>
                        </div>
                        <span className="text-[10.5px] text-slate-500 dark:text-slate-400 block mt-0.5 font-sans">
                          {isProfit
                            ? '✅ Siap diambil kapan saja dengan tombol Ambil Untung di bawah'
                            : 'ℹ️ Koreksi wajar, bot otomatis membeli di harga diskon'}
                        </span>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Modal Terpasang</span>
                        <span className="font-mono text-xs font-bold text-slate-900 dark:text-white block mt-0.5 tabular-nums">
                          {pos.allocationUsdt}
                        </span>
                      </div>
                    </div>

                    {/* Simple Layer & Status Progress */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B1019] border border-slate-200 dark:border-[#162438] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-400 font-sans">
                          Tingkat Jaring Beli:{' '}
                          <strong className="text-slate-900 dark:text-white font-mono">
                            Tingkat #{stepCount} dari {maxLayers}
                          </strong>
                        </span>
                        <span className="text-emerald-600 dark:text-emerald-400 font-sans font-bold text-[11px]">
                          {stepCount <= 5 ? '🟢 Zona Sangat Aman' : stepCount <= 12 ? '🟡 Zona Wajar' : '🔵 Zona Averaging Dalam'}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-[#15202E] overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all"
                          style={{ width: `${Math.min(100, Math.max(6, (stepCount / maxLayers) * 100))}%` }}
                        />
                      </div>
                      <p className="text-[10.5px] text-slate-500 dark:text-slate-400 leading-tight font-sans">
                        Bot akan otomatis menjual koin saat harga naik mencapai target profit dan trailing rebound.
                      </p>
                    </div>

                    {/* Friendly Ergonomic Buttons */}
                    <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                        <button
                          onClick={() => {
                            setSelectedDetailPos(pos);
                            setIsDetailModalOpen(true);
                          }}
                          className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-500/30 text-teal-700 dark:text-[#2DD4BF] hover:bg-teal-100 dark:hover:bg-teal-900/50 text-xs font-sans font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Rincian Pembelian ({stepCount} Layer)</span>
                        </button>

                        <button
                          onClick={() => {
                            void onTogglePause(pos.id);
                          }}
                          className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-[#162338] border border-slate-200 dark:border-[#20324D] text-slate-700 dark:text-slate-200 text-xs font-sans font-semibold hover:text-slate-950 dark:hover:text-white transition flex items-center gap-1.5 cursor-pointer"
                        >
                          {pos.status === 'active' || pos.status === 'averaging' ? (
                            <>
                              <Pause className="w-3.5 h-3.5 text-amber-500" />
                              <span>Jeda Bot</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 text-emerald-500" />
                              <span>Lanjutkan Bot</span>
                            </>
                          )}
                        </button>
                      </div>

                      <button
                        onClick={() => handleOpenSingleTpModal(pos)}
                        className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-sans font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm ${
                          isProfit
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            : 'bg-slate-200 dark:bg-[#1A283D] text-slate-700 dark:text-slate-300 hover:bg-slate-300'
                        }`}
                      >
                        <DollarSign className="w-4 h-4" />
                        <span>{t('takeProfit')} / {t('closePosition')}</span>
                      </button>

                      {onDeleteBot && (
                        <button
                          type="button"
                          onClick={() => setBotToDelete(pos)}
                          className="p-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition cursor-pointer active:scale-95 shrink-0"
                          title={`Hapus bot ${pos.pair}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={`${pos.botId || pos.id || pos.botName || 'bot'}::${pos.pair}`}
                  className="p-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#1E293B] hover:border-teal-500/40 dark:hover:border-teal-500/30 transition shadow-xs space-y-3"
                >
                  {/* Top row: Symbol, Bot Specs & OKX-Style Live Price */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <CoinLogo
                        coin={pos.coin || pos.pair}
                        size="lg"
                        fallbackSymbol={pos.badgeSymbol}
                        fallbackBg={pos.badgeBg}
                        fallbackColor={pos.badgeColor}
                      />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-base text-slate-900 dark:text-white font-sans">{pos.pair}</span>
                          {pos.botName && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-sans font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30">
                              {pos.botName}
                            </span>
                          )}
                          {pos.pairedCoins && pos.pairedCoins.length > 0 && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-sans font-semibold bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-[#2DD4BF] border border-teal-500/30 flex items-center gap-1">
                              <Coins className="w-3 h-3" />
                              <span>{pos.pairedCoins.length} Koin Dipairing</span>
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold ${
                              pos.status === 'active'
                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20'
                                : pos.status === 'averaging'
                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {pos.statusLabel}
                          </span>

                          {/* Bot Mode Tag */}
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold flex items-center gap-1 border ${
                              currentMode === 'Avarage Only'
                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-500/30'
                                : currentMode === 'Grid Only'
                                ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-500/30'
                                : 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-[#2DD4BF] border-teal-500/30'
                            }`}
                          >
                            {currentMode === 'Avarage Only' && <ArrowDownRight className="w-3 h-3" />}
                            {currentMode === 'Grid Only' && <Split className="w-3 h-3" />}
                            {currentMode === 'Avarage+Grid' && <Maximize2 className="w-3 h-3" />}
                            <span>{getBotModeLabel(currentMode, language)}</span>
                          </span>

                          <span className="px-2 py-0.5 rounded text-[10px] font-mono tabular-nums bg-slate-100 dark:bg-[#0B121E] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#162338]">
                            {maxLayers} Layer
                          </span>

                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            Uptrend: {pos.uptrendFilter !== false ? 'ON' : 'OFF'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">{pos.engine}</p>
                      </div>
                    </div>

                    {/* OKX-Style Price & 24h Ticket */}
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                        ${Number.isFinite(Number(pos.price)) && Number(pos.price) > 0 ? Number(pos.price).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                      </div>
                      <div
                        className={`text-xs font-mono font-bold tabular-nums ${
                          pos.change24h >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'
                        }`}
                      >
                        {Number.isFinite(Number(pos.change24h)) ? (Number(pos.change24h) >= 0 ? `+${Number(pos.change24h)}%` : `${Number(pos.change24h)}%`) : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Bybit-Style Micro-Progress Layer Gauge */}
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#0B1019] border border-slate-200 dark:border-[#1A2433] space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10.5px] uppercase font-sans font-semibold text-slate-500 dark:text-slate-400">
                          Layer Terisi (Depth Gauge):
                        </span>
                        <span className="font-mono font-bold text-teal-600 dark:text-[#2DD4BF] tabular-nums">
                          #{stepCount} <span className="text-slate-400 font-normal">/ {maxLayers} Layer</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums">
                        <span className="text-slate-400">Porsi Terpakai:</span>
                        <span className={`font-bold ${layerProgressPct > 70 ? 'text-amber-500' : 'text-slate-800 dark:text-slate-200'}`}>
                          {layerProgressPct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    {/* Visual Segmented Progress Bar */}
                    <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-[#15202E] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${layerProgressPct}%`,
                          background: layerProgressPct > 75
                            ? 'linear-gradient(90deg, #10B981, #F59E0B, #F43F5E)'
                            : 'linear-gradient(90deg, #10B981, #06B6D4, #2DD4BF)'
                        }}
                      />
                    </div>
                  </div>

                  {/* OKX-Style 4 Metric Grid with Clean Contrasts */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl bg-slate-50 dark:bg-[#0B1019] border border-slate-200 dark:border-[#1A2433] text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-sans font-medium block">
                        Alokasi USDT
                      </span>
                      <span className="text-slate-900 dark:text-white font-mono font-bold block mt-0.5 tabular-nums">
                        {pos.allocationUsdt}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">{pos.allocationQty}</span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-sans font-medium block">
                        Target TP / Exit
                      </span>
                      <span className="text-slate-900 dark:text-white font-mono font-bold block mt-0.5 tabular-nums">
                        {pos.tpTriggerPrice || pos.tpTargetPrice || 'Dynamic'}
                      </span>
                      <span className="text-[10px] text-teal-600 dark:text-[#2DD4BF] font-sans font-medium">
                        {currentMode === 'Grid Only' ? 'Sub-Grid Osilasi' : 'Trailing Take Profit'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-sans font-medium block">
                        Trailing Callback
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 font-mono font-semibold block mt-0.5 tabular-nums">
                        {pos.tpCallbackPct || 0.2}% Rebound
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                        Auto Lock Profit
                      </span>
                    </div>

                    {/* Bybit High-Visibility Floating PnL Card */}
                    <div className={`p-2 rounded-lg border flex flex-col justify-center ${
                      isProfit
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500/30'
                        : 'bg-rose-50 dark:bg-rose-950/40 border-rose-500/30'
                    }`}>
                      <span className="text-[9.5px] uppercase font-sans font-semibold text-slate-500 dark:text-slate-400 block leading-tight">
                        Floating PnL & ROI
                      </span>
                      <div className={`font-mono font-bold text-xs mt-0.5 tabular-nums flex items-center gap-1 ${
                        isProfit ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        <span>{isProfit ? `+${Number(pos.floatingPnl ?? 0).toFixed(2)}` : Number(pos.floatingPnl ?? 0).toFixed(2)} USDT</span>
                        <span className="text-[10px] opacity-80">({isProfit ? `+${Number(pos.roiPct ?? 0)}%` : `${Number(pos.roiPct ?? 0)}%`})</span>
                      </div>
                    </div>
                  </div>

                  {/* Pairs Price Range Display (Exact Layout from User Screenshot) */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-[#060D18] border border-slate-200 dark:border-[#132034] text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Pairs</span>
                      <span className="font-extrabold text-slate-800 dark:text-white bg-slate-200/70 dark:bg-[#0D1829] px-2.5 py-0.5 rounded-lg border border-slate-300 dark:border-[#1A2E4C] tracking-wide">
                        {pos.pair.replace('/', '')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Min Price (Floor) with Red Down Arrow & Edit Button */}
                      <button
                        type="button"
                        onClick={() => handleOpenQuickBoundary(pos)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 transition cursor-pointer"
                        title="Klik untuk Edit Cepat Batas Min Price (Support)"
                      >
                        <ArrowDownRight className="w-4 h-4 text-rose-500 shrink-0 stroke-[2.5]" />
                        <span className="font-bold text-rose-500 dark:text-rose-400">
                          {pos.minPrice != null && pos.minPrice > 0 ? pos.minPrice.toFixed(8) : '0.00000000'}
                        </span>
                        <Pencil className="w-2.5 h-2.5 text-slate-400 opacity-60 ml-0.5" />
                      </button>

                      {/* Max Price (Ceiling) with Green Up Arrow & Edit Button */}
                      <button
                        type="button"
                        onClick={() => handleOpenQuickBoundary(pos)}
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/30 transition cursor-pointer"
                        title="Klik untuk Edit Cepat Batas Max Price (Resistance)"
                      >
                        <TrendingUp className="w-4 h-4 text-emerald-500 dark:text-[#00F0C8] shrink-0 stroke-[2.5]" />
                        <span className="font-bold text-emerald-600 dark:text-[#00F0C8]">
                          {pos.maxPrice != null && pos.maxPrice > 0 ? pos.maxPrice.toFixed(8) : '0.00000000'}
                        </span>
                        <Pencil className="w-2.5 h-2.5 text-slate-400 opacity-60 ml-0.5" />
                      </button>
                    </div>
                  </div>

                  {/* Real-time Boundary Protection Status Banner */}
                  {pos.maxPrice != null && pos.maxPrice > 0 && pos.price > pos.maxPrice ? (
                    <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 text-xs font-mono flex items-center justify-between flex-wrap gap-1">
                      <div className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                        <span>Harga (${typeof pos.price === 'number' ? pos.price.toFixed(2) : pos.price}) &gt; Max Price (${pos.maxPrice.toFixed(2)})</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[10px] font-extrabold border border-amber-500/30">
                        BOT ON • TIDAK BUY
                      </span>
                    </div>
                  ) : pos.minPrice != null && pos.minPrice > 0 && pos.price < pos.minPrice ? (
                    <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-700 dark:text-rose-300 text-xs font-mono flex items-center justify-between flex-wrap gap-1">
                      <div className="flex items-center gap-1.5 font-bold text-rose-600 dark:text-rose-400">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-500" />
                        <span>Harga (${typeof pos.price === 'number' ? pos.price.toFixed(2) : pos.price}) &lt; Min Price (${pos.minPrice.toFixed(2)})</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[10px] font-extrabold border border-rose-500/30">
                        BOT ON • TIDAK BUY
                      </span>
                    </div>
                  ) : null}

                  {/* Trailing progress bar */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-mono mb-1 text-slate-500 dark:text-slate-400">
                      <span>{pos.trailingInfo || `${getBotModeLabel(currentMode, language)} Multiplier Step`}</span>
                      <span>{pos.trailingProgressPct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-[#060B14] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-teal-500 to-cyan-400 rounded-full transition-all"
                        style={{ width: `${pos.trailingProgressPct}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Card Action Buttons (Bybit Ergonomic Action Dock - Responsive Grid/Flex for Mobile, Tablet & Desktop) */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-1 gap-2 border-t border-slate-100 dark:border-[#162338]">
                    {/* Left Actions */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => {
                          setSelectedDetailPos(pos);
                          setIsDetailModalOpen(true);
                        }}
                        className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#15202E] border border-slate-200 dark:border-[#1E2E44] text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-[#2A3E5C] text-xs font-sans font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                        title="Buka rincian detail eksekusi layer (Harga buy, ukuran USD, estimasi TP, Floating PnL)"
                      >
                        <Layers className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                        <span>Detail Layer ({filledLayerCount || nextLayerCount})</span>
                      </button>

                      <button
                        onClick={() => onOpenMatrixModal(pos.pair, currentMode, maxLayers, pos.botId || pos.id, pos.botName, false, pos.minPrice, pos.maxPrice, pos.pairedCoins || [pos.pair])}
                        className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#15202E] border border-slate-200 dark:border-[#1E2E44] text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-[#2A3E5C] text-xs font-sans font-semibold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                        title="Setting konfigurasi bot ini & atur koin apa saja yang dipairing"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Setting & Pairing</span>
                      </button>

                      <button
                        onClick={() => onOpenMatrixModal('BTC/USDT', 'Avarage+Grid', 20, undefined, 'GAIN Multi-Pair Bot', true, null, null, ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'])}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-[#15202E] border border-slate-200 dark:border-[#1E2E44] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white text-xs font-sans font-semibold transition flex items-center justify-center gap-1 cursor-pointer active:scale-95"
                        title="Buat bot baru dengan pairing multi-koin"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Bot</span>
                      </button>
                    </div>

                    {/* Right Actions */}
                    <div className="flex items-center gap-1.5 justify-end">
                      {onExecuteBotOrder && (
                        <button
                          disabled={executingPosId === pos.id}
                          onClick={async () => {
                            if (pos.maxPrice != null && pos.maxPrice > 0 && pos.price > pos.maxPrice) {
                              showToast(`⚠️ Batas Max Price: Harga ${pos.pair} (${pos.price}) masih di atas batas Max Price (${pos.maxPrice}). Bot dilarang buy!`);
                              return;
                            }
                            if (pos.minPrice != null && pos.minPrice > 0 && pos.price < pos.minPrice) {
                              showToast(`⚠️ Batas Min Price: Harga ${pos.pair} (${pos.price}) di bawah batas Min Price (${pos.minPrice}). Bot dilarang buy!`);
                              return;
                            }
                            setExecutingPosId(pos.id);
                            showToast(`Mengirim order ${pos.pair} ke Exchange Testnet...`);
                            const res = await onExecuteBotOrder(pos.pair, 'buy');
                            setExecutingPosId(null);
                            if (res.success) {
                              showToast(`✅ Order Terisi! ID: #${res.orderId || 'SUCCESS'}`);
                            } else {
                              showToast(`❌ Gagal: ${res.error}`);
                            }
                          }}
                          className="flex-1 sm:flex-initial px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-950 text-xs font-sans font-bold transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs active:scale-95"
                          title="Kirim order averaging layer langsung ke Exchange Testnet"
                        >
                          <Sparkles className={`w-3.5 h-3.5 ${executingPosId === pos.id ? 'animate-spin' : ''}`} />
                          <span>{executingPosId === pos.id ? 'Mengirim...' : 'Step Testnet'}</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          void onTogglePause(pos.id);
                        }}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-[#15202E] border border-slate-200 dark:border-[#1E2E44] text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition cursor-pointer active:scale-95"
                        title={pos.status === 'active' ? 'Pause Bot' : 'Resume Bot'}
                      >
                        {pos.status === 'active' ? <Pause className="w-4 h-4 text-amber-500" /> : <Play className="w-4 h-4 text-emerald-500" />}
                      </button>

                      <button
                        onClick={() => handleOpenSingleTpModal(pos)}
                        className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-xs font-sans font-semibold transition flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                        title="Eksekusi Force Take Profit & Order Jual Pasar"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Force TP</span>
                      </button>

                      {onDeleteBot && (
                        <button
                          type="button"
                          onClick={() => setBotToDelete(pos)}
                          className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition cursor-pointer active:scale-95"
                          title={`Hapus bot ${pos.pair}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Batch Control Footer Bar */}
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-[#070D17] border border-slate-200 dark:border-[#14233A] space-y-3 shadow-sm">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500 dark:text-slate-400">Batch Global Controls:</span>
              <span className="text-teal-600 dark:text-[#00F0C8] font-bold">
                {displayPositions.length} Bots Connected to {wallet.connectedExchange?.exchange || 'Exchange'} {wallet.connectedExchange?.isSandbox ? '(Testnet)' : ''}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={handleTriggerBatchTp}
                className="py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-mono font-bold hover:bg-emerald-500/25 transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98"
              >
                <Sparkles className="w-4 h-4" />
                <span>Tutup Semua Posisi ({openPositionCount})</span>
              </button>

              <button
                onClick={handleTriggerBatchPause}
                className="py-2.5 rounded-xl bg-white dark:bg-[#0E1A2D] border border-slate-300 dark:border-[#1E3456] text-slate-800 dark:text-slate-300 text-xs font-mono font-semibold hover:text-slate-950 dark:hover:text-white transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98"
              >
                <Pause className="w-4 h-4" />
                <span>Pause All ({activeCount})</span>
              </button>

              {onDeleteAllStandbyBots && (
                <button
                  type="button"
                  onClick={() => setIsConfirmDeleteAllStandbyOpen(true)}
                  disabled={inactiveCount === 0}
                  className="py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-600 dark:text-red-400 text-xs font-mono font-bold hover:bg-red-500/25 transition flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-98 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Hapus Standby ({inactiveCount})</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {noProfitWarningPos && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fadeIn"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNoProfitWarningPos(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="no-profit-warning-title"
            className="w-full max-w-sm rounded-2xl border border-amber-500/40 bg-white p-5 text-slate-900 shadow-2xl dark:bg-[#0A1220] dark:text-white"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="no-profit-warning-title" className="text-sm font-bold">{t('warningLoss')}</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Posisi {noProfitWarningPos.pair} sedang rugi. Anda tetap bisa menutupnya secara manual, tetapi kerugian akan direalisasikan.
                </p>
                <p className="mt-3 font-mono text-xs text-amber-600 dark:text-amber-400">
                  Floating PnL: {formatUsdt(Number(noProfitWarningPos.floatingPnl ?? 0))} USDT
                </p>
              </div>
              <button
                type="button"
                aria-label="Tutup peringatan"
                onClick={() => setNoProfitWarningPos(null)}
                className="-mt-1 -mr-1 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              autoFocus
              onClick={() => setNoProfitWarningPos(null)}
              className="mt-5 w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
            >
              Mengerti
            </button>
          </section>
        </div>
      )}

      {/* Confirmation Modal: Single Coin Force Take Profit */}
      {selectedSingleTpPos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-white dark:bg-[#0A1220] border border-slate-200 dark:border-[#182B48] rounded-2xl p-5 shadow-2xl space-y-4 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#162740] pb-3">
              <div className="flex items-center gap-2.5">
                <CoinLogo
                  coin={selectedSingleTpPos.pair}
                  className="w-9 h-9 rounded-xl border border-slate-200 dark:border-[#1E3558] bg-slate-100 dark:bg-[#0E1B30]"
                />
                <div>
                  <h3 className="text-sm font-bold tracking-wide flex items-center gap-1.5">
                    <span>{t('confirmation')}: {selectedSingleTpPos.pair}</span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${Number(selectedSingleTpPos.roiPct ?? 0) >= 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'}`}>
                      {Number(selectedSingleTpPos.roiPct ?? 0) >= 0 ? '+' : ''}{Number(selectedSingleTpPos.roiPct ?? 0).toFixed(2)}%
                    </span>
                  </h3>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    Eksekusi Order Jual Pasar & Kunci Keuntungan
                  </p>
                </div>
              </div>
              <button
                onClick={() => !isExecutingSingleTp && setSelectedSingleTpPos(null)}
                disabled={isExecutingSingleTp}
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-[#0F1B2D] border border-slate-200 dark:border-[#1A2C46] flex items-center justify-center text-slate-500 hover:text-slate-950 dark:hover:text-white disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Exchange Connection Banner */}
            <div className="p-3 rounded-xl border bg-teal-500/10 border-teal-500/30 text-teal-900 dark:text-teal-200 text-xs font-sans flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-teal-600 dark:text-[#00F0C8]" />
              <div className="space-y-0.5 text-[11px]">
                <p className="font-bold">{activeApiCreds?.isSandbox === false ? t('exchangeLive') : t('exchangeTestnet')}</p>
                <p className="opacity-90 leading-tight">{t('noCredentials')}</p>
              </div>
            </div>

            {/* Financial Breakdown Card */}
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#070D18] border border-slate-200 dark:border-[#152744] space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>{t('quantity')}:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {(() => {
                    const runtime = engineBots.find((bot) => bot.id === selectedSingleTpPos.id || bot.botId === selectedSingleTpPos.botId || bot.pair === selectedSingleTpPos.pair);
                    const qty = Number(runtime?.positionQty ?? selectedSingleTpPos.totalCoinQty ?? 0);
                    const coin = selectedSingleTpPos.coin || selectedSingleTpPos.pair.split('/')[0] || selectedSingleTpPos.pair;
                    return qty > 0 ? `${qty} ${coin}` : (selectedSingleTpPos.allocationQty || `0 ${coin}`);
                  })()}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>{t('marketPrice')}:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  ${Number.isFinite(Number(selectedSingleTpPos.price)) && Number(selectedSingleTpPos.price) > 0 ? Number(selectedSingleTpPos.price).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '—'}
                </span>
              </div>
              <div className="border-t border-slate-200 dark:border-[#14233D] pt-2 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300">Total Floating Gross Profit:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                  +{Number(selectedSingleTpPos.floatingPnl ?? 0).toFixed(2)} USDT
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                <span>Alokasi Net Trader (80%):</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  +{(Number(selectedSingleTpPos.floatingPnl ?? 0) * 0.8).toFixed(2)} USDT
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px]">
                <span>Potongan Gas Tank (20%):</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">
                  -{(Number(selectedSingleTpPos.floatingPnl ?? 0) * 0.2).toFixed(2)} USDT
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              {t('sellExplanation')} {Number(selectedSingleTpPos.floatingPnl ?? 0) < 0 ? t('warningLoss') : ''}
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isExecutingSingleTp}
                onClick={() => setSelectedSingleTpPos(null)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-[#0E1A2C] border border-slate-300 dark:border-[#1E3456] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#152540] transition disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isExecutingSingleTp}
                onClick={handleConfirmSingleTp}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold font-mono transition shadow-lg flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <DollarSign className={`w-3.5 h-3.5 ${isExecutingSingleTp ? 'animate-spin' : ''}`} />
                <span>
                  {isExecutingSingleTp ? t('executing') : t('sellNow')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Batch Force Take Profit */}
      {isConfirmBatchTpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-white dark:bg-[#0A1220] border border-slate-200 dark:border-[#182B48] rounded-2xl p-5 shadow-2xl space-y-4 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#162740] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-wide">Konfirmasi Tutup Semua Posisi</h3>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">Tutup semua posisi terbuka pada harga pasar terbaru</p>
                </div>
              </div>
              <button
                onClick={() => setIsConfirmBatchTpOpen(false)}
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-[#0F1B2D] border border-slate-200 dark:border-[#1A2C46] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1.5 text-xs font-mono">
              <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                <span>Posisi Terbuka:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{openPositionCount} Pasang Koin</span>
              </div>
              <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                <span>Total Floating Profit:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">+{totalProfitUsdt.toFixed(2)} USDT</span>
              </div>
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[10px]">
                <span>Alokasi Net Trader (80%):</span>
                <span>+{(totalProfitUsdt * 0.8).toFixed(2)} USDT</span>
              </div>
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[10px]">
                <span>Deduction Gas Tank (20%):</span>
                <span>-{(totalProfitUsdt * 0.2).toFixed(2)} USDT</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Tindakan ini menutup semua posisi terbuka pada harga pasar terbaru. Setelah ditutup manual, bot akan dijeda agar tidak langsung membeli kembali.
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setIsConfirmBatchTpOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-[#0E1A2C] border border-slate-300 dark:border-[#1E3456] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#152540] transition"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmBatchTp}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold font-mono transition shadow-lg flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Tutup Posisi ({openPositionCount})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Batch Pause All */}
      {isConfirmBatchPauseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-white dark:bg-[#0A1220] border border-slate-200 dark:border-[#182B48] rounded-2xl p-5 shadow-2xl space-y-4 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#162740] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500">
                  <Pause className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-wide">Konfirmasi Pause Seluruh Bot</h3>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">Standby Algorithmic Execution</p>
                </div>
              </div>
              <button
                onClick={() => setIsConfirmBatchPauseOpen(false)}
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-[#0F1B2D] border border-slate-200 dark:border-[#1A2C46] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1 text-xs font-mono">
              <div className="flex items-center justify-between text-slate-700 dark:text-slate-300">
                <span>Bot Aktif yang Ditarget:</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">{activeCount} Bot</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Order averaging yang sedang menunggu trigger tidak akan dieksekusi selama bot berstatus PAUSED.
              </p>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Apakah Anda yakin ingin menghentikan sementara seluruh bot trading aktif? Anda dapat melanjutkan kembali kapan saja dari tombol Play di kartu posisi masing-masing.
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setIsConfirmBatchPauseOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-[#0E1A2C] border border-slate-300 dark:border-[#1E3456] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#152540] transition"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmBatchPause}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold font-mono transition shadow-lg flex items-center justify-center gap-1.5"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pause Seluruh Bot</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Boundary Edit Modal (Pro Feature) */}
      {quickBoundaryEditPos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-white dark:bg-[#0A1220] border border-slate-200 dark:border-[#182B48] rounded-2xl p-5 shadow-2xl space-y-4 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#162740] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-600 dark:text-[#00F0C8]">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-wide">Edit Batas Harga Support &amp; Resistance</h3>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {quickBoundaryEditPos.pair} · Harga Live: ${typeof quickBoundaryEditPos.price === 'number' ? quickBoundaryEditPos.price.toFixed(4) : quickBoundaryEditPos.price}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setQuickBoundaryEditPos(null)}
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-[#0F1B2D] border border-slate-200 dark:border-[#1A2C46] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5 mb-1 font-bold">
                  <ArrowDownRight className="w-3.5 h-3.5 text-rose-500 stroke-[2.5]" />
                  <span>Min Price (Batas Bawah Floor):</span>
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00000000 (Kosongkan jika tanpa batas)"
                  value={editMinPrice}
                  onChange={(e) => setEditMinPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#08101D] border border-slate-300 dark:border-[#1A2C46] text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-rose-500"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Jika harga koin menembus ke bawah angka ini, bot berhenti membeli (Stop Dip Buying).
                </span>
              </div>

              <div>
                <label className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1.5 mb-1 font-bold">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500 stroke-[2.5]" />
                  <span>Max Price (Batas Atas Ceiling):</span>
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="0.00000000 (Kosongkan jika tanpa batas)"
                  value={editMaxPrice}
                  onChange={(e) => setEditMaxPrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#08101D] border border-slate-300 dark:border-[#1A2C46] text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                />
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Jika harga koin menembus ke atas angka ini, bot dilarang beli di pucuk (Anti FOMO).
                </span>
              </div>

              {/* Quick Presets for Current Price */}
              {typeof quickBoundaryEditPos.price === 'number' && (
                <div className="flex items-center gap-1.5 pt-1 text-[10px]">
                  <span className="text-slate-500">Preset Cepat:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const p = quickBoundaryEditPos.price as number;
                      setEditMinPrice((p * 0.85).toFixed(4));
                      setEditMaxPrice((p * 1.15).toFixed(4));
                    }}
                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#121E31] hover:bg-slate-200 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#1B2F4C] cursor-pointer"
                  >
                    ±15% Range
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const p = quickBoundaryEditPos.price as number;
                      setEditMinPrice((p * 0.70).toFixed(4));
                      setEditMaxPrice((p * 1.30).toFixed(4));
                    }}
                    className="px-2 py-0.5 rounded bg-slate-100 dark:bg-[#121E31] hover:bg-slate-200 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#1B2F4C] cursor-pointer"
                  >
                    ±30% Range
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditMinPrice('');
                      setEditMaxPrice('');
                    }}
                    className="px-2 py-0.5 rounded text-rose-500 hover:underline cursor-pointer ml-auto"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-[#162740]">
              <button
                type="button"
                onClick={() => setQuickBoundaryEditPos(null)}
                className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-[#0E1A2C] border border-slate-300 dark:border-[#1E3456] text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#152540] transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveQuickBoundary}
                className="flex-1 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-[#00F0C8] dark:hover:bg-[#00d8b4] text-white dark:text-slate-950 text-xs font-bold font-mono transition shadow-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Simpan Batas</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* {t('glossary')} — {viewMode === 'simple' ? t('simpleTerms') : t('technicalTerms')} (Beginner Glossary Modal) */}
      {showGlossaryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-lg bg-white dark:bg-[#0B1321] border border-slate-200 dark:border-[#1A2C46] rounded-2xl p-5 shadow-2xl space-y-4 text-slate-900 dark:text-white max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#162740] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-600 dark:text-[#00F0C8]">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-wide">{t('glossary')} — {viewMode === 'simple' ? t('simpleTerms') : t('technicalTerms')}</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Pahami konsep dasar GAIN tanpa rasa bingung</p>
                </div>
              </div>
              <button
                onClick={() => setShowGlossaryModal(false)}
                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-[#0F1B2D] border border-slate-200 dark:border-[#1A2C46] flex items-center justify-center text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs font-sans">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#080E18] border border-slate-200 dark:border-[#14233A] space-y-1">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <span className="text-base">📈</span>
                  <span className="text-[12.5px]">Floating PnL (Keuntungan/Kerugian Berjalan)</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11.5px]">
                  Nilai estimasi keuntungan yang <strong>belum direalisasikan</strong>. Jika warna merah saat pasar turun, jangan panik—itu adalah proses wajar di mana bot bersiap membeli di harga diskon agar saat harga naik sedikit saja, portofolio Anda langsung berubah hijau profit.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#080E18] border border-slate-200 dark:border-[#14233A] space-y-1">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <span className="text-base">🕸️</span>
                  <span className="text-[12.5px]">Jaring Beli Bertahap (Layer Averaging)</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11.5px]">
                  Alih-alih membeli seluruh modal sekaligus di satu harga, bot membagi modal menjadi tingkatan (layer). Setiap kali harga pasar turun beberapa persen, bot otomatis membelikan porsi kecil. Hasilnya: harga modal rata-rata (*Average Price*) Anda menjadi jauh lebih murah.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#080E18] border border-slate-200 dark:border-[#14233A] space-y-1">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <span className="text-base">🎯</span>
                  <span className="text-[12.5px]">Trailing Take Profit (TP Callback)</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11.5px]">
                  Sistem pengunci laba pintar. Ketika koin melonjak naik menembus target, bot <strong>tidak langsung menjual</strong> melainkan terus membiarkan keuntungan mengalir setinggi mungkin. Begitu harga mulai berbalik arah (misal turun 0.2%), bot langsung mengeksekusi jual untuk mengunci puncak keuntungan.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#080E18] border border-slate-200 dark:border-[#14233A] space-y-1">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <span className="text-base">🛡️</span>
                  <span className="text-[12.5px]">Pagar Pengaman (Min &amp; Max Price)</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11.5px]">
                  Pagar pembatas agar Anda tidak terjebak. <strong>Max Price</strong> melarang bot membeli saat koin berada di pucuk harga tertinggi (*Anti-FOMO*). <strong>Min Price</strong> melarang bot membeli jika koin anjlok menembus support kritis, menjaga modal tetap aman.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#080E18] border border-slate-200 dark:border-[#14233A] space-y-1">
                <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <span className="text-base">⛽</span>
                  <span className="text-[12.5px]">Dual Saldo &amp; Gas Fee GAIN (Bagi Hasil 20%)</span>
                </div>
                <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11.5px]">
                  100% modal trading USDT dan koin Anda berada di akun exchange resmi Anda (Binance/Bybit) dan tidak bisa ditarik oleh siapapun. Saldo di aplikasi GAIN adalah <strong>Gas Fee</strong> (bahan bakar bagi hasil 20%). Saldo gas hanya berkurang jika Anda <strong>benar-benar menghasilkan profit</strong>. Jika belum untung, tidak ada potongan sepeser pun.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-[#162740]">
              <button
                type="button"
                onClick={() => setShowGlossaryModal(false)}
                className="w-full py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 dark:bg-[#00F0C8] dark:hover:bg-[#00d8b4] text-white dark:text-slate-950 font-bold text-xs transition cursor-pointer"
              >
                Saya Mengerti, Tutup Kamus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete Single Bot */}
      {botToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-white dark:bg-[#0A1220] border border-slate-200 dark:border-[#182B48] rounded-2xl p-5 shadow-2xl space-y-4 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#162740] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-500">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-wide">
                    Hapus Bot Trading
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {botToDelete.pair} · {botToDelete.botName || (botToDelete.status === 'inactive' ? 'Standby' : 'Aktif')}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBotToDelete(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#080E18] border border-slate-200 dark:border-[#132034] text-xs font-sans space-y-2">
              <p className="text-slate-700 dark:text-slate-300">
                Apakah Anda yakin ingin menghapus bot <strong className="text-slate-900 dark:text-white">{botToDelete.pair}</strong> ({botToDelete.botName || 'Bot Trading'})?
              </p>
              {botToDelete.status === 'inactive' ? (
                <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[11px] font-mono">
                  ✓ Bot ini berstatus <strong>STANDBY</strong> (0 layer aktif). Menghapus bot ini aman dan tidak mempengaruhi modal floating.
                </div>
              ) : (
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[11px] font-mono">
                  ⚠️ Perhatian: Bot ini sedang berstatus <strong>{botToDelete.statusLabel || 'AKTIF'}</strong>. Pastikan Anda telah mempertimbangkan posisi terbuka sebelum menghapus.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#162740]">
              <button
                type="button"
                onClick={() => setBotToDelete(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-[#1E3456] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#121F35] text-xs font-semibold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteBot) {
                    onDeleteBot(botToDelete.id);
                    setToastMsg(`Bot ${botToDelete.pair} berhasil dihapus.`);
                    setToastType('success');
                    setTimeout(() => setToastMsg(''), 4000);
                  }
                  setBotToDelete(null);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus Bot</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete All Standby Bots */}
      {isConfirmDeleteAllStandbyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-white dark:bg-[#0A1220] border border-slate-200 dark:border-[#182B48] rounded-2xl p-5 shadow-2xl space-y-4 text-slate-900 dark:text-white">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#162740] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-500">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-wide">
                    Hapus Semua Bot Standby
                  </h3>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    Total {inactiveCount} bot standby akan dibersihkan
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmDeleteAllStandbyOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#080E18] border border-slate-200 dark:border-[#132034] text-xs font-sans space-y-2">
              <p className="text-slate-700 dark:text-slate-300">
                Apakah Anda yakin ingin menghapus semua <strong className="text-red-500 dark:text-red-400 font-mono">{inactiveCount} bot</strong> yang sedang dalam status <strong className="text-slate-900 dark:text-white">STANDBY</strong>?
              </p>
              <p className="text-slate-500 dark:text-slate-400 text-[11px]">
                Bot yang aktif / sedang berjalan tidak akan terpengaruh. Bot standby akan dihapus sepenuhnya dari portofolio Anda.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-[#162740]">
              <button
                type="button"
                onClick={() => setIsConfirmDeleteAllStandbyOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 dark:border-[#1E3456] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#121F35] text-xs font-semibold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteAllStandbyBots) {
                    onDeleteAllStandbyBots();
                    setToastMsg(`Seluruh ${inactiveCount} bot standby berhasil dihapus.`);
                    setToastType('success');
                    setTimeout(() => setToastMsg(''), 4000);
                  }
                  setIsConfirmDeleteAllStandbyOpen(false);
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus Semua ({inactiveCount})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trade Detail Modal (Image 1 Feature) */}
      <TradeDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        position={selectedDetailPos}
        onForceTakeProfit={onForceTakeProfit}
        onCloseLayer={onCloseLayer}
      />
    </div>
  );
}
