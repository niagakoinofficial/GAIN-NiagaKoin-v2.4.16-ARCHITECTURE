import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldCheck,
  Search,
  ExternalLink,
  Layers,
  ArrowRight,
  RefreshCw,
  Zap,
  Radio,
  SlidersHorizontal,
  Play,
  Check,
  Loader2,
} from 'lucide-react';
import { CoinLogo } from '../common/CoinLogo';
import { ExchangeName } from '../../types';
import { loadExchangeMarkets } from '../../services/exchangeService';
import { getExchangeNames } from '../../config/exchangeRegistry';

export interface LiveMarketItem {
  symbol: string;
  id: string;
  base: string;
  quote: string;
  active: boolean;
  spot: boolean;
  limits?: {
    amount?: { min?: number; max?: number };
    cost?: { min?: number; max?: number };
    price?: { min?: number; max?: number };
  };
  precision?: {
    amount?: number;
    price?: number;
  };
  info?: {
    status?: string;
  };
}

export interface ExchangeCoinsCheckerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentExchange?: ExchangeName;
  activeApiCreds?: {
    exchange: string;
    apiKey: string;
    secret: string;
    password?: string;
    isSandbox: boolean;
  } | null;
  onSelectExchange?: (ex: ExchangeName) => void;
}

export interface CoinExchangeStatus {
  symbol: string;
  name: string;
  pair: string;
  exchanges: Partial<Record<ExchangeName, {
    supported: boolean;
    type: 'SPOT_USDT' | 'SPOT_BIDR' | 'UNSUPPORTED';
    volume24h: string;
    status: 'OPTIMAL' | 'NORMAL' | 'LIMITED';
  }>>;
}

// Fallback baseline matrix for the 12 default coins across major exchanges
export const COIN_EXCHANGE_COMPATIBILITY: CoinExchangeStatus[] = [
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    pair: 'BTC/USDT',
    exchanges: {
      Binance: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bitget: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      OKX: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Tokocrypto: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bybit: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Indodax: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
    },
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    pair: 'ETH/USDT',
    exchanges: {
      Binance: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bitget: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      OKX: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Tokocrypto: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bybit: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Indodax: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
    },
  },
  {
    symbol: 'BNB',
    name: 'BNB Chain',
    pair: 'BNB/USDT',
    exchanges: {
      Binance: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bitget: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      OKX: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Tokocrypto: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bybit: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Indodax: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
    },
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    pair: 'SOL/USDT',
    exchanges: {
      Binance: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bitget: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      OKX: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Tokocrypto: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bybit: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Indodax: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
    },
  },
  {
    symbol: 'HYPE',
    name: 'Hyperliquid',
    pair: 'HYPE/USDT',
    exchanges: {
      Binance: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bitget: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      OKX: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Tokocrypto: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'NORMAL' },
      Bybit: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Indodax: { supported: false, type: 'UNSUPPORTED', volume24h: 'N/A', status: 'LIMITED' },
    },
  },
  {
    symbol: 'LINK',
    name: 'Chainlink',
    pair: 'LINK/USDT',
    exchanges: {
      Binance: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bitget: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      OKX: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Tokocrypto: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bybit: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Indodax: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'NORMAL' },
    },
  },
  {
    symbol: 'UNI',
    name: 'Uniswap',
    pair: 'UNI/USDT',
    exchanges: {
      Binance: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bitget: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      OKX: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Tokocrypto: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bybit: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Indodax: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'NORMAL' },
    },
  },
  {
    symbol: 'NEAR',
    name: 'NEAR Protocol',
    pair: 'NEAR/USDT',
    exchanges: {
      Binance: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bitget: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      OKX: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Tokocrypto: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bybit: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Indodax: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'NORMAL' },
    },
  },
  {
    symbol: 'XRP',
    name: 'Ripple XRP',
    pair: 'XRP/USDT',
    exchanges: {
      Binance: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bitget: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      OKX: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Tokocrypto: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bybit: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Indodax: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
    },
  },
  {
    symbol: 'SUI',
    name: 'Sui Network',
    pair: 'SUI/USDT',
    exchanges: {
      Binance: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bitget: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      OKX: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Tokocrypto: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bybit: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Indodax: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'NORMAL' },
    },
  },
  {
    symbol: 'ZEC',
    name: 'Zcash',
    pair: 'ZEC/USDT',
    exchanges: {
      Binance: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bitget: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      OKX: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Tokocrypto: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bybit: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Indodax: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
    },
  },
  {
    symbol: 'DOGE',
    name: 'Dogecoin',
    pair: 'DOGE/USDT',
    exchanges: {
      Binance: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bitget: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      OKX: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Tokocrypto: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Bybit: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
      Indodax: { supported: true, type: 'SPOT_USDT', volume24h: 'N/A', status: 'OPTIMAL' },
    },
  },
];

export function ExchangeCoinsCheckerModal({
  isOpen,
  onClose,
  currentExchange = 'Bitget',
  activeApiCreds,
  onSelectExchange,
}: ExchangeCoinsCheckerModalProps) {
  const [selectedEx, setSelectedEx] = useState<ExchangeName>(currentExchange);
  const [viewMode, setViewMode] = useState<'default12' | 'allMarkets'>('default12');
  const [search, setSearch] = useState('');

  // Live CCXT fetchMarkets state
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);
  const [rawMarkets, setRawMarkets] = useState<LiveMarketItem[]>([]);
  const [liveMarketsMap, setLiveMarketsMap] = useState<Map<string, LiveMarketItem>>(new Map());
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  // Single coin order execution test state
  const [testingCoin, setTestingCoin] = useState<string | null>(null);
  const [coinTestResults, setCoinTestResults] = useState<Record<string, { success: boolean; orderId: string; price: number; message: string }>>({});

  // Comprehensive 12 coins test execution report
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [allExecutionReport, setAllExecutionReport] = useState<{
    totalVerified: number;
    executableCount: number;
    allExecutable: boolean;
    ordersSubmitted: number;
    environment: 'TESTNET' | 'LIVE';
    summary: string;
    results: Array<{
      symbol: string;
      executable: boolean;
      executionStatus: string;
      isLiveConnected: boolean;
      price?: number;
      timestamp?: number;
      latencyMs: number;
      note: string;
    }>;
  } | null>(null);

  const handleTestSingleCoin = async (coinSymbol: string, pair: string) => {
    setTestingCoin(coinSymbol);
    try {
      const started = performance.now();
      const response = await loadExchangeMarkets({ exchange: selectedEx, isSandbox: activeApiCreds?.isSandbox ?? true });
      const markets = Array.isArray((response as any)?.markets) ? (response as any).markets : [];
      const market = markets.find((m: any) => String(m.symbol || '').toUpperCase() === pair.toUpperCase());
      setCoinTestResults((prev) => ({
        ...prev,
        [coinSymbol]: market
          ? { success: true, orderId: '-', price: Number(market.last || 0), message: 'Market tersedia. Tidak ada order yang dikirim; pemeriksaan ini read-only.' }
          : { success: false, orderId: '-', price: 0, message: `Pair ${pair} tidak ditemukan pada market live.` },
      }));
      setLatencyMs(Math.round(performance.now() - started));
    } catch (err: any) {
      setCoinTestResults((prev) => ({
        ...prev,
        [coinSymbol]: { success: false, orderId: '-', price: 0, message: err?.message || 'Gagal membaca market live.' },
      }));
    } finally {
      setTestingCoin(null);
    }
  };

  const handleTestAllCoins = async () => {
    setIsTestingAll(true);
    try {
      const response = await loadExchangeMarkets({ exchange: selectedEx, isSandbox: activeApiCreds?.isSandbox ?? true, forceRefresh: true });
      const markets = Array.isArray((response as any)?.markets) ? (response as any).markets : [];
      const defaultCoins = COIN_EXCHANGE_COMPATIBILITY.map((c) => c.pair.toUpperCase());
      const supported = defaultCoins.filter((pair) => markets.some((m: any) => String(m.symbol || '').toUpperCase() === pair));
      setAllExecutionReport({
        totalVerified: defaultCoins.length,
        executableCount: supported.length,
        allExecutable: supported.length === defaultCoins.length,
        ordersSubmitted: 0,
        environment: activeApiCreds?.isSandbox ? 'TESTNET' : 'LIVE',
        summary: `Read-only market check: ${supported.length}/${defaultCoins.length} pair tersedia. Tidak ada order yang dikirim.`,
        results: defaultCoins.map((pair) => ({ symbol: pair, executable: supported.includes(pair), executionStatus: supported.includes(pair) ? 'MARKET_AVAILABLE' : 'NOT_FOUND', isLiveConnected: Boolean(activeApiCreds), price: undefined, timestamp: Date.now(), latencyMs: Number((response as any)?.latencyMs || 0), note: 'Read-only market metadata check.' })),
      });
    } catch (err) {
      console.error('Failed to check all coin markets', err);
    } finally {
      setIsTestingAll(false);
    }
  };

  const exchanges: ExchangeName[] = getExchangeNames();

  const isCurrentExAuth = useMemo(() => {
    return Boolean(
      activeApiCreds &&
      activeApiCreds.exchange.toLowerCase() === selectedEx.toLowerCase() &&
      activeApiCreds.apiKey
    );
  }, [activeApiCreds, selectedEx]);

  // Fetch Live Markets function
  const fetchLiveMarkets = useCallback(async (ex: ExchangeName, force = false) => {
    setIsLoadingMarkets(true);
    setFetchError(null);

    try {
      const isAuth = Boolean(
        activeApiCreds &&
        activeApiCreds.exchange.toLowerCase() === ex.toLowerCase() &&
        activeApiCreds.apiKey
      );

      let data: Record<string, any>;
      if (isAuth && activeApiCreds) {
        // Secure POST: Pass sensitive credentials in the JSON body, preventing query string leaks (CWE-598)
        data = await loadExchangeMarkets({
            exchange: ex.toLowerCase(),
            isSandbox: Boolean(activeApiCreds?.isSandbox),
            forceRefresh: Boolean(force),
            apiKey: activeApiCreds.apiKey,
            secret: activeApiCreds.secret,
            password: activeApiCreds.password,
        });
      } else {
        data = await loadExchangeMarkets({
          exchange: ex.toLowerCase(),
          isSandbox: false,
          forceRefresh: force,
        });
      }

      if (data.success && Array.isArray(data.markets)) {
        setRawMarkets(data.markets);
        const map = new Map<string, LiveMarketItem>();

        data.markets.forEach((m: LiveMarketItem) => {
          if (m.symbol) {
            const sym = m.symbol.toUpperCase();
            map.set(sym, m);
            // Handle variants like BTC/USDT:USDT -> BTC/USDT
            const cleanSym = sym.split(':')[0];
            map.set(cleanSym, m);
            // Also index by base currency with quote e.g. BTCUSDT -> BTC/USDT
            if (m.base && m.quote) {
              map.set(`${m.base}/${m.quote}`.toUpperCase(), m);
            }
          }
        });

        setLiveMarketsMap(map);
        setLatencyMs(data.latencyMs ?? null);
        setLastFetchedAt(
          new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        );
        setIsLiveConnected(true);
      } else {
        setFetchError(data.error || 'Gagal memuat pasar dari exchange.');
        setIsLiveConnected(false);
      }
    } catch (err: any) {
      setFetchError(err.message || 'Koneksi ke backend exchange gagal.');
      setIsLiveConnected(false);
    } finally {
      setIsLoadingMarkets(false);
    }
  }, [activeApiCreds]);

  // Automatically fetch live markets when modal opens or selected exchange changes
  useEffect(() => {
    if (isOpen) {
      fetchLiveMarkets(selectedEx);
    }
  }, [isOpen, selectedEx, fetchLiveMarkets]);

  if (!isOpen) return null;

  // Filtered 12 Default Coins
  const filteredDefaultCoins = COIN_EXCHANGE_COMPATIBILITY.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.pair.toLowerCase().includes(q);
  });

  // Calculate supported count dynamically from live CCXT fetchMarkets if available, otherwise baseline table
  const dynamicSupportedCount = isLiveConnected && liveMarketsMap.size > 0
    ? filteredDefaultCoins.filter((c) => {
        const live = liveMarketsMap.get(c.pair.toUpperCase()) || liveMarketsMap.get(`${c.symbol}/USDT`.toUpperCase());
        return Boolean(live && live.active);
      }).length
    : null;

  // Filtered All Markets
  const filteredAllMarkets = rawMarkets.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.symbol.toLowerCase().includes(q) ||
      m.base.toLowerCase().includes(q) ||
      m.quote.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white dark:bg-[#080E1B] border border-slate-200 dark:border-[#162740] rounded-2xl shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-[#14233A] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-600 dark:text-[#00F0C8]">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white font-mono">
                  Pemeriksa Pasangan Koin Exchanger Live
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-teal-500/15 text-teal-700 dark:text-[#00F0C8] border border-teal-500/30">
                  <Zap className="w-3 h-3" />
                  <span>CCXT Live</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                Verifikasi real-time via <code className="text-teal-600 dark:text-[#00F0C8]">exchange.fetchMarkets()</code>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#14233A] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Exchange Selector & Verification Bar */}
        <div className="p-4 bg-slate-50 dark:bg-[#050A14] border-b border-slate-200 dark:border-[#14233A] space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">Pilih Bursa:</span>
              {isCurrentExAuth ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  <span>Akun Terotentikasi {activeApiCreds?.isSandbox ? '(Testnet)' : '(Live)'}</span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 dark:text-slate-400 bg-slate-200 dark:bg-[#0F1B2D] px-2 py-0.5 rounded">
                  <Radio className="w-3 h-3 text-slate-400" />
                  <span>Pasar Publik CCXT</span>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {latencyMs !== null && (
                <span className="text-[10px] font-mono text-slate-400">
                  Latency: <strong className="text-slate-600 dark:text-slate-200">{latencyMs}ms</strong>
                </span>
              )}
              <button
                onClick={() => fetchLiveMarkets(selectedEx, true)}
                disabled={isLoadingMarkets}
                className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-[#0E1A2C] border border-slate-300 dark:border-[#1A2E4C] text-[11px] font-mono text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
                title="Panggil ulang exchange.fetchMarkets() secara live"
              >
                <RefreshCw className={`w-3 h-3 ${isLoadingMarkets ? 'animate-spin text-teal-500' : ''}`} />
                <span>{isLoadingMarkets ? 'Memeriksa...' : 'Periksa Live'}</span>
              </button>
            </div>
          </div>

          {/* Exchange Buttons */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 font-mono text-xs">
            {exchanges.map((ex) => {
              const isSelected = selectedEx === ex;
              const hasKey = activeApiCreds && activeApiCreds.exchange.toLowerCase() === ex.toLowerCase();
              return (
                <button
                  key={ex}
                  onClick={() => {
                    setSelectedEx(ex);
                    if (onSelectExchange) onSelectExchange(ex);
                  }}
                  className={`py-2 px-2 rounded-xl text-center font-bold text-xs transition border cursor-pointer relative ${
                    isSelected
                      ? 'bg-teal-500/15 border-teal-500 dark:border-[#00F0C8] text-teal-700 dark:text-[#00F0C8] shadow-sm'
                      : 'bg-white dark:bg-[#0A1322] border-slate-200 dark:border-[#14233A] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 dark:hover:border-[#1E3658]'
                  }`}
                >
                  <span>{ex}</span>
                  {hasKey && (
                    <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#0A1322]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Mode Switcher & Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-200 dark:bg-[#0B1526] border border-slate-300 dark:border-[#162740] self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setViewMode('default12')}
                className={`px-3 py-1 rounded-md text-[11px] font-mono font-semibold transition ${
                  viewMode === 'default12'
                    ? 'bg-white dark:bg-[#14243C] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                12 Koin Utama GAIN ({dynamicSupportedCount === null ? 'Live belum tersedia' : `${dynamicSupportedCount}/12`})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('allMarkets')}
                className={`px-3 py-1 rounded-md text-[11px] font-mono font-semibold transition ${
                  viewMode === 'allMarkets'
                    ? 'bg-white dark:bg-[#14243C] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                Semua Pasar Spot {rawMarkets.length > 0 ? `(${rawMarkets.length})` : ''}
              </button>
            </div>

            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari simbol (BTC, ETH, SOL)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1 rounded-lg bg-white dark:bg-[#0A1322] border border-slate-200 dark:border-[#14233A] text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>
        </div>

        {/* Live Status Sub-banner */}
        {fetchError ? (
          <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-mono flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" />
              <span>{fetchError}. Tidak ada data live yang digunakan sebagai fallback.</span>
            </div>
            <button
              onClick={() => fetchLiveMarkets(selectedEx, true)}
              className="underline text-[11px] font-bold hover:text-amber-900 dark:hover:text-white"
            >
              Coba Ulang
            </button>
          </div>
        ) : isLiveConnected ? (
          <div className="px-4 py-1.5 bg-emerald-500/5 dark:bg-[#06141F] border-b border-slate-200 dark:border-[#102438] text-[11px] font-mono text-slate-600 dark:text-slate-400 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                Live feed: Terdeteksi <strong className="text-emerald-600 dark:text-emerald-400">{rawMarkets.length} pasangan pasar aktif</strong> di {selectedEx}.
              </span>
            </div>
            {lastFetchedAt && <span className="text-[10px] text-slate-500">Update: {lastFetchedAt}</span>}
          </div>
        ) : null}

        {/* Coins Table / List View */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 divide-y divide-slate-100 dark:divide-[#101D30]">
          {viewMode === 'default12' ? (
            filteredDefaultCoins.map((coin, coinIndex) => {
              const liveMarket =
                liveMarketsMap.get(coin.pair.toUpperCase()) ||
                liveMarketsMap.get(`${coin.symbol}/USDT`.toUpperCase());

              const isLiveActive = Boolean(liveMarket && liveMarket.active);
              const isSupported = isLiveConnected ? Boolean(liveMarket && liveMarket.active) : false;

              const minOrderAmount = liveMarket?.limits?.amount?.min;
              const minCostUsdt = liveMarket?.limits?.cost?.min;
              const priceDecimals = liveMarket?.precision?.price;

              return (
                <div
                  key={`${coin.symbol}-${coinIndex}`}
                  className="pt-2.5 first:pt-0 flex items-center justify-between gap-3 text-xs font-mono"
                >
                  <div className="flex items-center gap-2.5">
                    <CoinLogo
                      coin={coin.symbol}
                      className="w-9 h-9 rounded-xl border border-slate-200 dark:border-[#182C48] bg-slate-100 dark:bg-[#0E1B2E]"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 dark:text-white text-xs">{coin.pair}</span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400">({coin.name})</span>
                        {isLiveConnected && liveMarket && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-teal-500/10 text-teal-700 dark:text-[#00F0C8] border border-teal-500/20 font-bold">
                            Live ID: {liveMarket.id}
                          </span>
                        )}
                      </div>

                      <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                        {liveMarket?.limits ? (
                          <>
                            {minOrderAmount !== undefined && (
                              <span>Min Qty: <strong className="text-slate-700 dark:text-slate-300">{minOrderAmount}</strong></span>
                            )}
                            {minCostUsdt !== undefined && (
                              <span>Min Biaya: <strong className="text-slate-700 dark:text-slate-300">${minCostUsdt}</strong></span>
                            )}
                            {priceDecimals !== undefined && (
                              <span>Presisi: <strong className="text-slate-700 dark:text-slate-300">{priceDecimals} desimal</strong></span>
                            )}
                          </>
                        ) : (
                          <span>Volume 24h: <span className="text-slate-700 dark:text-slate-300">Live data unavailable</span></span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 flex items-center gap-2">
                    <div>
                      {isSupported ? (
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 ${
                          isLiveActive || !isLiveConnected
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                        }`}>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{isLiveConnected ? (isLiveActive ? 'SPOT AKTIF' : 'SPOT DITANGGUHKAN') : 'SPOT SIAP'}</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          <span>TIDAK TERSEDIA</span>
                        </span>
                      )}
                      <span className="text-[9px] text-slate-500 block mt-0.5">
                        {isSupported ? 'Order Spot CCXT Valid' : 'Pilih Bursa Lain (Binance/Bitget)'}
                      </span>
                    </div>

                    {/* Read-only market verification */}
                    <div className="flex flex-col items-end">
                      <button
                        type="button"
                        onClick={() => handleTestSingleCoin(coin.symbol, coin.pair)}
                        disabled={testingCoin === coin.symbol}
                        className="px-2 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-700 dark:text-[#00F0C8] text-[10px] font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                        title="Periksa pair secara read-only; tidak mengirim order"
                      >
                        {testingCoin === coin.symbol ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Menguji...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-2.5 h-2.5 fill-current" />
                            <span>Periksa Pair</span>
                          </>
                        )}
                      </button>
                      {coinTestResults[coin.symbol] && (
                        <span className={`text-[9px] mt-0.5 font-bold ${coinTestResults[coin.symbol].success ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {coinTestResults[coin.symbol].success ? `✓ Market OK` : '✗ Gagal'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            filteredAllMarkets.slice(0, 100).map((market) => (
              <div
                key={market.symbol}
                className="pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs font-mono"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-[#0E1B2E] border border-slate-200 dark:border-[#182C48] flex items-center justify-center font-bold text-teal-600 dark:text-[#00F0C8] text-[10px] shrink-0">
                    {market.base?.slice(0, 3) || 'COIN'}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span>{market.symbol}</span>
                      <span className="text-[10px] text-slate-400">({market.id})</span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Base: {market.base} • Quote: {market.quote}
                      {market.limits?.cost?.min && ` • Min Cost: $${market.limits.cost.min}`}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                    market.active
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                  }`}>
                    <CheckCircle2 className="w-3 h-3" />
                    <span>{market.active ? 'TRADING AKTIF' : 'SUSPENDED'}</span>
                  </span>
                </div>
              </div>
            ))
          )}

          {viewMode === 'allMarkets' && filteredAllMarkets.length > 100 && (
            <div className="p-3 text-center text-xs font-mono text-slate-500">
              Menampilkan 100 dari {filteredAllMarkets.length} pasangan pasar. Gunakan pencarian untuk menyaring simbol spesifik.
            </div>
          )}
        </div>

        {/* 12 Coins Execution Test Audit Drawer / Banner */}
        {allExecutionReport && (
          <div className="p-4 bg-emerald-500/5 dark:bg-[#071726] border-t border-emerald-500/20 space-y-2 text-xs font-mono max-h-56 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Verifikasi Market Nyata: {allExecutionReport.executableCount} / {allExecutionReport.totalVerified} Pair Siap</span>
              </div>
              <button
                onClick={() => setAllExecutionReport(null)}
                className="text-[10px] text-slate-400 hover:text-slate-200"
              >
                Tutup Laporan
              </button>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-300">
              {allExecutionReport.summary}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
              {allExecutionReport.results.map((r) => (
                <div key={r.symbol} className="p-2 rounded bg-white dark:bg-[#0B172A] border border-slate-200 dark:border-[#192A45]">
                  <div className="flex items-center justify-between">
                    <strong className="text-slate-900 dark:text-white">{r.symbol}</strong>
                    <span className="text-[9px] text-emerald-500 font-bold">✓ {r.executionStatus}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Price: ${r.price?.toLocaleString() || '-'} • {r.latencyMs}ms
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-[#050A14] border-t border-slate-200 dark:border-[#14233A] flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
          <div className="flex items-center gap-2">
            <button
              onClick={handleTestAllCoins}
              disabled={isTestingAll}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              {isTestingAll ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sedang Memverifikasi Market 12 Koin...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Verifikasi Market Semua 12 Koin</span>
                </>
              )}
            </button>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-400 dark:bg-[#00F0C8] dark:hover:bg-[#00d8b4] text-slate-950 font-bold text-xs transition cursor-pointer"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
