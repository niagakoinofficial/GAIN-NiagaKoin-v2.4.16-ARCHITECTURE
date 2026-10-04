import { lazy,

 Suspense, useState, useEffect, useRef, useMemo, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import {
  NavigationRoute,
  ExchangeName,
  TradingPosition,
  TransactionRecord,
  TradeRecord,
  ExecutedLayerDetail,
  UserWallet,
  ConnectedExchangeConfig,
  BotMode,
  AveragingStep,
  PriceAlert,
} from './types';
import { initialPositions, initialTransactions, initialWallet, SUPPORTED_COINS } from './data/appData';
import { HeaderBar } from './components/HeaderBar';
import { BottomDock } from './components/BottomDock';
import { generateDefaultLayersForPosition } from './utils/tradingPositionUtils';
import { AuthProvider, useAuth } from './context/AuthContext';
import { auth } from './firebase';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { RoleRoute } from './components/routing/ProtectedRoute';
import { AppErrorBoundary } from './components/common/AppErrorBoundary';
import {
  loadExchangePortfolio as fetchExchangePortfolio,
  loadExchangeTrades as fetchExchangeTrades,
  executeExchangeOrder as placeExchangeOrder,
  loadTickerBatch,
  LIVE_TICKER_SYMBOLS,
  type BatchTickerResponse,
} from './services/exchangeService';
import { removeBotRunner as deleteBackgroundBot, registerBotRunner as registerBackgroundBot } from './services/botService';
import { disconnectBotExchange, storeBotCredentials, getBotEngineStatus, reconcileBot, setBotStatus, pauseAllBots, forceTakeProfit } from './api/botApi';
import { activateWalletAccount as processWalletActivation } from './services/walletService';
import { queryClient } from './queryClient';
import { useUiStore } from './stores/uiStore';
import { reportClientEvent } from './services/observabilityService';
import { formatUsdt } from './utils/formatters';
import { decorateTradesWithRealizedPnl } from './utils/tradeMetrics';
import { assertProductionSafeMode, isDemoMode } from './config/appMode';
import { validateFinancialAction } from './utils/serverValidation';
import { postJson } from './api/httpClient';
import { getLicenseTierConfig } from './config/licensePromo';

import {
  subscribeToUserWallet,
  subscribeToUserPositions,
  subscribeToUserTransactions,
  subscribeToUserTradeHistory,
  fetchOlderUserTransactions,
  fetchOlderUserTrades,
  updateUserWallet,
  syncTradesFromExchangeToFirestore,
  saveConnectedExchangeToFirestore,
  setActiveExchangeInFirestore,
  disconnectSingleExchangeFromFirestore,
  syncRealPortfolioAssetsToFirestore,
  disconnectExchangeFromFirestore,
} from './repositories/userRepository';
import type { FirestorePageCursor } from './repositories/userRepository';

import { subscribeToPriceAlerts, checkPriceAlerts } from './services/priceAlertService';
import {
  NotificationToastContainer,
  AppNotification,
} from './components/common/NotificationToastContainer';
import {
  notifyLayerExecution,
  notifyTakeProfit,
  notifyPriceAlert,
  sendBrowserNotification,
  getNotificationPermission,
  requestNotificationPermission,
  NotificationPermissionState,
} from './services/notificationService';

const HomeView = lazy(() => import('./views/HomeView').then((module) => ({ default: module.HomeView })));
const WalletView = lazy(() => import('./views/WalletView').then((module) => ({ default: module.WalletView })));
const TradingPositionsView = lazy(() => import('./views/TradingPositionsView').then((module) => ({ default: module.TradingPositionsView })));
const AccountView = lazy(() => import('./views/AccountView').then((module) => ({ default: module.AccountView })));
const AdminUserManagementModal = lazy(() => import('./components/admin/AdminUserManagementModal').then((module) => ({ default: module.AdminUserManagementModal })));
const AveragingMatrixModal = lazy(() => import('./components/modals/AveragingMatrixModal').then((module) => ({ default: module.AveragingMatrixModal })));
const DepositModal = lazy(() => import('./components/modals/DepositModal').then((module) => ({ default: module.DepositModal })));
const WithdrawModal = lazy(() => import('./components/modals/WithdrawModal').then((module) => ({ default: module.WithdrawModal })));
const TransferMemberModal = lazy(() => import('./components/modals/TransferMemberModal').then((module) => ({ default: module.TransferMemberModal })));
const GasFeeModal = lazy(() => import('./components/modals/GasFeeModal').then((module) => ({ default: module.GasFeeModal })));
const ProfitShareModal = lazy(() => import('./components/modals/ProfitShareModal').then((module) => ({ default: module.ProfitShareModal })));
const ApiKeyModal = lazy(() => import('./components/modals/ApiKeyModal').then((module) => ({ default: module.ApiKeyModal })));
const ExchangeCoinsCheckerModal = lazy(() => import('./components/modals/ExchangeCoinsCheckerModal').then((module) => ({ default: module.ExchangeCoinsCheckerModal })));
const ActivationFeeModal = lazy(() => import('./components/modals/ActivationFeeModal').then((module) => ({ default: module.ActivationFeeModal })));
const Google2faModal = lazy(() => import('./components/modals/Google2faModal').then((module) => ({ default: module.Google2faModal })));
const SecurityVerificationModal = lazy(() => import('./components/modals/SecurityVerificationModal').then((module) => ({ default: module.SecurityVerificationModal })));
const GmailVerificationModal = lazy(() => import('./components/modals/GmailVerificationModal').then((module) => ({ default: module.GmailVerificationModal })));
const AuthModal = lazy(() => import('./components/modals/AuthModal').then((module) => ({ default: module.AuthModal })));
const PriceAlertModal = lazy(() => import('./components/modals/PriceAlertModal').then((module) => ({ default: module.PriceAlertModal })));
const BacktestWorkspace = lazy(() => import('./views/BacktestWorkspace').then((module) => ({ default: module.BacktestWorkspace })));

function LazyMount({ isOpen, children }: { isOpen: boolean; children: ReactNode }) {
  const [hasOpened, setHasOpened] = useState(isOpen);

  useEffect(() => {
    if (isOpen) setHasOpened(true);
  }, [isOpen]);

  return hasOpened ? children : null;
}

const ROUTE_BY_PATH: Record<string, NavigationRoute> = {
  '/': 'home',
  '/wallet': 'wallet',
  '/bot': 'bot',
  '/trading': 'trading',
  '/akun': 'akun',
  '/backtest': 'trading',
};

function pathForRoute(route: NavigationRoute): string {
  return route === 'home' ? '/' : `/${route}`;
}

function resolveQueryUpdate<T>(
  current: T | undefined,
  updater: T | ((current: T) => T),
  fallback: T
): T {
  return typeof updater === 'function'
    ? (updater as (current: T) => T)(current ?? fallback)
    : updater;
}

// Cryptographically safe or entropy-rich unique ID generator to prevent key collision across synchronous loops
const generateUniqueId = (prefix: string = 'id'): string => {
  const randomPart = Math.random().toString(36).substring(2, 9);
  return `${prefix}-${Date.now()}-${randomPart}`;
};

function AppContent() {
  assertProductionSafeMode();

  if (isDemoMode) {
    console.warn('[GAIN] Running in demo mode. This build should not be used for public production traffic.');
  }

  const navigate = useNavigate();
  const location = useLocation();
  const currentRoute = ROUTE_BY_PATH[location.pathname] || 'home';
  const handleRouteChange = (route: NavigationRoute) => navigate(pathForRoute(route));
  const [currentExchange, setCurrentExchange] = useState<ExchangeName>('Binance');
  const queryClientInstance = useQueryClient();
  const uiModals = useUiStore((state) => state.modals);
  const setUiModalOpen = useUiStore((state) => state.setModalOpen);

  const {
    currentUser,
    openLogin,
    logout,
    isAuthModalOpen,
    setIsAuthModalOpen,
    authModalMode,
    pendingSponsorId,
    isAdmin,
  } = useAuth();

  const isAuthenticatedUser = Boolean(currentUser && currentUser.uid !== 'gain-usr-demo');
  const protectAction = <T extends (...args: any[]) => any>(action: T): T => ((...args: Parameters<T>) => {
    if (!isAuthenticatedUser) {
      openLogin();
      return undefined;
    }
    return action(...args);
  }) as T;

  const userDataKey = currentUser?.uid || 'anonymous';
  const walletQueryKey = useMemo(() => ['user-data', userDataKey, 'wallet'] as const, [userDataKey]);
  const positionsQueryKey = useMemo(() => ['user-data', userDataKey, 'positions'] as const, [userDataKey]);
  const transactionsQueryKey = useMemo(() => ['user-data', userDataKey, 'transactions'] as const, [userDataKey]);
  const tradesQueryKey = useMemo(() => ['user-data', userDataKey, 'trades'] as const, [userDataKey]);
  const alertsQueryKey = useMemo(() => ['user-data', userDataKey, 'price-alerts'] as const, [userDataKey]);
  const previousUserDataKeyRef = useRef(userDataKey);

  useEffect(() => {
    const previousUserDataKey = previousUserDataKeyRef.current;
    if (previousUserDataKey !== userDataKey) {
      queryClientInstance.removeQueries({ queryKey: ['user-data', previousUserDataKey] });
      previousUserDataKeyRef.current = userDataKey;
    }
  }, [queryClientInstance, userDataKey]);

  const wallet = useQuery({ queryKey: walletQueryKey, queryFn: async () => initialWallet, initialData: initialWallet, enabled: false }).data;
  const positions = useQuery({ queryKey: positionsQueryKey, queryFn: async () => initialPositions, initialData: initialPositions, enabled: false }).data;
  const transactions = useQuery({ queryKey: transactionsQueryKey, queryFn: async () => initialTransactions, initialData: initialTransactions, enabled: false }).data;
  const tradeHistory = useQuery({ queryKey: tradesQueryKey, queryFn: async () => [] as TradeRecord[], initialData: [] as TradeRecord[], enabled: false }).data;
  const priceAlerts = useQuery({ queryKey: alertsQueryKey, queryFn: async () => [] as PriceAlert[], initialData: [] as PriceAlert[], enabled: false }).data;
  const transactionCursorRef = useRef<FirestorePageCursor | null>(null);
  const tradeCursorRef = useRef<FirestorePageCursor | null>(null);
  const hasLoadedOlderTransactionsRef = useRef(false);
  const hasLoadedOlderTradesRef = useRef(false);
  const [hasMoreTransactions, setHasMoreTransactions] = useState(false);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [hasMoreTrades, setHasMoreTrades] = useState(false);
  const [isLoadingTrades, setIsLoadingTrades] = useState(false);

  const setWallet = (updater: UserWallet | ((current: UserWallet) => UserWallet)) => {
    queryClientInstance.setQueryData<UserWallet>(walletQueryKey, (current) => resolveQueryUpdate(current, updater, initialWallet));
  };
  const setPositions = (updater: TradingPosition[] | ((current: TradingPosition[]) => TradingPosition[])) => {
    queryClientInstance.setQueryData<TradingPosition[]>(positionsQueryKey, (current) => resolveQueryUpdate(current, updater, initialPositions));
  };
  const setTransactions = (updater: TransactionRecord[] | ((current: TransactionRecord[]) => TransactionRecord[])) => {
    queryClientInstance.setQueryData<TransactionRecord[]>(transactionsQueryKey, (current) => resolveQueryUpdate(current, updater, initialTransactions));
  };
  const setTradeHistory = (updater: TradeRecord[] | ((current: TradeRecord[]) => TradeRecord[])) => {
    queryClientInstance.setQueryData<TradeRecord[]>(tradesQueryKey, (current) => resolveQueryUpdate(current, updater, []));
  };
  const setPriceAlerts = (updater: PriceAlert[] | ((current: PriceAlert[]) => PriceAlert[])) => {
    queryClientInstance.setQueryData<PriceAlert[]>(alertsQueryKey, (current) => resolveQueryUpdate(current, updater, []));
  };

  const currentExchangeIsSandbox = Boolean(
    wallet.connectedExchange?.exchange === currentExchange && wallet.connectedExchange?.isSandbox
  );
  const tickerQuery = useQuery<BatchTickerResponse>({
    queryKey: ['exchange-tickers', currentExchange, currentExchangeIsSandbox],
    queryFn: () =>
      loadTickerBatch(currentExchange.toLowerCase(), LIVE_TICKER_SYMBOLS, currentExchangeIsSandbox),
    staleTime: 10_000,
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 1,
  });
  const [liveTickerFeed, setLiveTickerFeed] = useState<{
    prices: Record<string, number>;
    receivedAt: number;
  } | null>(null);

  // Per-exchange position cache: stores positions independently per exchange so switching doesn't lose data
  const [positionsByExchange, setPositionsByExchange] = useState<Map<string, TradingPosition[]>>(new Map());

  // Source-of-truth is Firestore. Local storage is no longer used as primary application state.
  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser?.uid) return;
    if (wallet && wallet.memberId) {
      localStorage.setItem(`gain_wallet_${currentUser.uid}`, JSON.stringify(wallet));
    }
  }, [wallet, currentUser]);

  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser?.uid) return;
    if (positions) {
      localStorage.setItem(`gain_positions_${currentUser.uid}`, JSON.stringify(positions));
    }
  }, [positions, currentUser]);

  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser?.uid) return;
    if (transactions) {
      localStorage.setItem(`gain_transactions_${currentUser.uid}`, JSON.stringify(transactions));
    }
  }, [transactions, currentUser]);

  useEffect(() => {
    if (typeof window === 'undefined' || !currentUser?.uid) return;
    if (tradeHistory) {
      localStorage.setItem(`gain_trades_${currentUser.uid}`, JSON.stringify(tradeHistory));
    }
  }, [tradeHistory, currentUser]);

  // Sync Google user profile immediately to wallet state
  useEffect(() => {
    if (currentUser) {
      const googleName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Member GAIN';
      const googleEmail = currentUser.email || 'user@gainkoin.io';
      setWallet((prev) => ({
        ...prev,
        username: googleName,
        email: googleEmail,
      }));
    }
  }, [currentUser]);

  // Price Alerts State & Real-time Subscription
  const isPriceAlertModalOpen = uiModals.priceAlert;
  const setIsPriceAlertModalOpen = (isOpen: boolean) => setUiModalOpen('priceAlert', isOpen);
  const [priceAlertSymbol, setPriceAlertSymbol] = useState<string>('BTC/USDT');
  const priceAlertsRef = useRef<PriceAlert[]>([]);

  useEffect(() => {
    priceAlertsRef.current = priceAlerts;
  }, [priceAlerts]);

  useEffect(() => {
    const unsubAlerts = subscribeToPriceAlerts(currentUser?.uid, (remoteAlerts) => {
      setPriceAlerts(remoteAlerts);
    });
    return () => unsubAlerts();
  }, [currentUser]);

  // In-app notifications & browser permission state
  const [inAppNotifications, setInAppNotifications] = useState<AppNotification[]>([]);
  const [browserNotifPerm, setBrowserNotifPerm] = useState<NotificationPermissionState>('default');
  const triggeredTpMapRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    setBrowserNotifPerm(getNotificationPermission());
  }, []);

  const handleRequestBrowserPermission = async () => {
    const perm = await requestNotificationPermission();
    setBrowserNotifPerm(perm);
    if (perm === 'granted') {
      sendBrowserNotification('🔔 Notifikasi Browser GAIN Aktif!', {
        body: 'Anda akan menerima notifikasi otomatis saat harga koin mencapai target, layer averaging terisi, dan terkena Take Profit.',
      });
      addInAppNotification({
        type: 'info',
        title: 'Notifikasi Browser Diaktifkan',
        message: 'GAIN siap mengirimkan notifikasi target harga, order layer, dan take profit.',
      });
    }
  };

  const addInAppNotification = (notif: Omit<AppNotification, 'id' | 'timestamp'>) => {
    const newNotif: AppNotification = {
      ...notif,
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
    };
    setInAppNotifications((prev) => [newNotif, ...prev.filter((n) => n.id !== newNotif.id)].slice(0, 6));
    setTimeout(() => {
      setInAppNotifications((prev) => prev.filter((n) => n.id !== newNotif.id));
    }, 7000);
  };

  const handleDismissNotification = (id: string) => {
    setInAppNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'info') => {
    addInAppNotification({
      type: type === 'success' ? 'take_profit' : 'info',
      title: type === 'success' ? 'Notifikasi GAIN' : 'Pemberitahuan Sistem',
      message,
    });
  };

  const handleOpenPriceAlert = (symbol?: string) => {
    if (symbol) setPriceAlertSymbol(symbol);
    setIsPriceAlertModalOpen(true);
  };

  const currentPricesMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of positions) {
      if (typeof p.price === 'number') map[p.pair] = p.price;
    }
    for (const [pair, ticker] of Object.entries((tickerQuery.data?.tickers || {}) as Record<string, { last:number; percentage?:number; timestamp?:number }>)) {
      if (typeof ticker.last === 'number' && ticker.last > 0) map[pair] = ticker.last;
    }
    if (
      currentExchange.toLowerCase() === 'binance'
      && liveTickerFeed
      && Date.now() - liveTickerFeed.receivedAt < 20000
    ) {
      Object.assign(map, liveTickerFeed.prices);
    }
    return map;
  }, [positions, tickerQuery.dataUpdatedAt, currentExchange, liveTickerFeed]);

  // Final GAIN segmentation:
  // - Identity/member state answers WHO the user is and whether the account is usable.
  // - License state answers WHICH paid entitlements the member owns.
  // - Security elevation is requested on-demand by protected actions; it is never a
  //   dashboard/login gate.  `accountStatus` remains a backward-compatible alias for
  //   an ACTIVE license in the UI read model.
  const [isSecurityVerificationOpen, setIsSecurityVerificationOpen] = useState(false);
  const [securityVerificationReason, setSecurityVerificationReason] = useState('');

  useEffect(() => {
    const handleSecurityElevationRequired = (event: Event) => {
      if (!isAuthenticatedUser) return;
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setSecurityVerificationReason(
        detail?.message || 'Tindakan ini memerlukan verifikasi keamanan tambahan.'
      );
      setIsSecurityVerificationOpen(true);
    };

    window.addEventListener('gain:security-elevation-required', handleSecurityElevationRequired);
    return () => {
      window.removeEventListener('gain:security-elevation-required', handleSecurityElevationRequired);
    };
  }, [isAuthenticatedUser]);

  // Firestore Real-time Subscriptions
  useEffect(() => {
    const firebaseUser = auth.currentUser;

    if (!currentUser || !firebaseUser || firebaseUser.uid !== currentUser.uid) {
      return;
    }

    transactionCursorRef.current = null;
    tradeCursorRef.current = null;
    hasLoadedOlderTransactionsRef.current = false;
    hasLoadedOlderTradesRef.current = false;
    setHasMoreTransactions(false);
    setHasMoreTrades(false);

    const unsubWallet = subscribeToUserWallet(currentUser.uid, (remoteWallet) => {
      queryClientInstance.setQueryData(walletQueryKey, remoteWallet);
      if (remoteWallet.connectedExchange?.exchange) {
        setCurrentExchange(remoteWallet.connectedExchange.exchange);
      }
    });

    const unsubPositions = subscribeToUserPositions(currentUser.uid, (remotePositions) => {
      if (remotePositions.length > 0) {
        queryClientInstance.setQueryData(positionsQueryKey, remotePositions);
        localStorage.setItem(`gain_positions_${currentUser.uid}`, JSON.stringify(remotePositions));
      } else {
        const cached = localStorage.getItem(`gain_positions_${currentUser.uid}`);
        if (cached) {
          try {
            queryClientInstance.setQueryData(positionsQueryKey, JSON.parse(cached) as TradingPosition[]);
          } catch {
            queryClientInstance.setQueryData(positionsQueryKey, initialPositions);
          }
        } else {
          queryClientInstance.setQueryData(positionsQueryKey, initialPositions);
        }
      }
    });

    const unsubTransactions = subscribeToUserTransactions(
      currentUser.uid,
      (remoteTransactions) => {
        queryClientInstance.setQueryData<TransactionRecord[]>(transactionsQueryKey, (previous) => {
          if (!hasLoadedOlderTransactionsRef.current || !previous) return remoteTransactions;
          const records = new Map((previous as TransactionRecord[]).map((transaction) => [transaction.id, transaction]));
          remoteTransactions.forEach((transaction) => records.set(transaction.id, transaction));
          return Array.from(records.values()).sort((a, b) =>
            Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')
          );
        });
      },
      (cursor, hasMore) => {
        if (hasLoadedOlderTransactionsRef.current) return;
        transactionCursorRef.current = cursor;
        setHasMoreTransactions(hasMore);
      }
    );

    const unsubTrades = subscribeToUserTradeHistory(
      currentUser.uid,
      (remoteTrades) => {
        queryClientInstance.setQueryData<TradeRecord[]>(tradesQueryKey, (previous) => {
          if (!hasLoadedOlderTradesRef.current || !previous) return remoteTrades;
          const records = new Map((previous as TradeRecord[]).map((trade) => [trade.id, trade]));
          remoteTrades.forEach((trade) => records.set(trade.id, trade));
          return Array.from(records.values()).sort((a, b) => b.timestamp - a.timestamp);
        });
      },
      (cursor, hasMore) => {
        if (hasLoadedOlderTradesRef.current) return;
        tradeCursorRef.current = cursor;
        setHasMoreTrades(hasMore);
      }
    );

    return () => {
      unsubWallet();
      unsubPositions();
      unsubTransactions();
      unsubTrades();
    };
  }, [currentUser, queryClientInstance, walletQueryKey, positionsQueryKey, transactionsQueryKey, tradesQueryKey]);

  // Real-time Binance market ticker stream.
  // Testnet and production use different official Binance stream endpoints.
  // REST ticker polling remains the authoritative fallback.
  useEffect(() => {
    let isMounted = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectAttempt = 0;

    setLiveTickerFeed(null);

    const isBinance = currentExchange.toLowerCase() === 'binance';

    if (isBinance) {
      console.info('[BINANCE_CLIENT_WS_DISABLED]', {
        reason: 'backend_v2_market_data_authority',
      });

      return () => {
        isMounted = false;
      };
    }

    return () => {
      isMounted = false;
    };

    const isTestnet =
      wallet.connectedExchange?.isSandbox === true ||
      wallet.connectedExchanges?.some(
        (exchange) =>
          exchange.exchange === currentExchange && exchange.isSandbox === true
      ) === true;

    const wsBase = isTestnet
      ? 'wss://stream.testnet.binance.vision/ws'
      : 'wss://stream.binance.com:9443/ws';

    const scheduleReconnect = () => {
      if (!isMounted || reconnectTimer) return;

      const delay = Math.min(
        1000 * Math.pow(2, reconnectAttempt),
        30000
      );

      reconnectAttempt += 1;

      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        if (isMounted) connectWs();
      }, delay);
    };

    const connectWs = () => {
      if (!isMounted) return;

      try {
        const previous = ws;

        if (
          previous &&
          (previous.readyState === WebSocket.OPEN ||
            previous.readyState === WebSocket.CONNECTING)
        ) {
          return;
        }

        const streamUrl = `${wsBase}/!miniTicker@arr`;

        ws = new WebSocket(streamUrl);

        ws.onopen = () => {
          if (!isMounted) return;

          reconnectAttempt = 0;

          console.info('[BINANCE_WS_CONNECTED]', {
            sandbox: isTestnet,
            endpoint: wsBase,
          });
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;

          try {
            const payload = JSON.parse(event.data);

            // Binance may send a server shutdown notification before closing.
            if (payload?.e === 'serverShutdown') {
              console.info('[BINANCE_WS_SERVER_SHUTDOWN]', {
                sandbox: isTestnet,
              });

              try {
                if (ws?.readyState === WebSocket.OPEN) {
                  ws.close();
                }
              } catch {}

              return;
            }

            const tickers = Array.isArray(payload)
              ? payload
              : Array.isArray(payload?.data)
                ? payload.data
                : null;

            if (!tickers) return;

            const tickerMap = new Map<
              string,
              { last: number; percentage: number }
            >();

            for (const t of tickers) {
              if (
                typeof t?.s === 'string' &&
                t.s.endsWith('USDT')
              ) {
                const base = t.s.slice(0, -4);
                const standardPair = `${base}/USDT`;
                const closePrice = parseFloat(t.c);
                const openPrice = parseFloat(t.o);

                const pct =
                  openPrice > 0
                    ? ((closePrice - openPrice) / openPrice) * 100
                    : 0;

                if (closePrice > 0) {
                  tickerMap.set(standardPair, {
                    last: closePrice,
                    percentage: Number(pct.toFixed(2)),
                  });
                }
              }
            }

            if (tickerMap.size === 0) return;

            const livePrices: Record<string, number> = {};

            tickerMap.forEach((ticker, pair) => {
              livePrices[pair] = ticker.last;
            });

            setLiveTickerFeed({
              prices: livePrices,
              receivedAt: Date.now(),
            });

            setPositions((prev) =>
              prev.map((pos) => {
                const match = tickerMap.get(pos.pair);

                if (!match) return pos;

                const currentPrice = match.last;
                let floatingPnl = pos.floatingPnl;
                let roiPct = pos.roiPct;

                const allocQty = parseFloat(
                  pos.allocationQty?.replace(/[^0-9.]/g, '') || '0'
                );

                const allocUsdt = parseFloat(
                  pos.allocationUsdt?.replace(/[^0-9.]/g, '') || '0'
                );

                if (allocQty > 0 && allocUsdt > 0) {
                  const currentValue = allocQty * currentPrice;

                  floatingPnl = Number(
                    (currentValue - allocUsdt).toFixed(2)
                  );

                  roiPct = Number(
                    ((floatingPnl / allocUsdt) * 100).toFixed(2)
                  );
                }

                if (
                  (pos.status === 'active' || pos.status === 'averaging') &&
                  roiPct >= 1.5 &&
                  floatingPnl > 0
                ) {
                  const lastNotified =
                    triggeredTpMapRef.current.get(pos.id) || 0;

                  if (Date.now() - lastNotified > 60000) {
                    triggeredTpMapRef.current.set(pos.id, Date.now());

                    notifyTakeProfit({
                      pair: pos.pair,
                      coin: pos.coin,
                      profitUsdt: floatingPnl,
                      roiPct,
                      exitPrice: currentPrice,
                    });

                    addInAppNotification({
                      type: 'take_profit',
                      title: `Take Profit Tercapai: ${pos.pair}`,
                      message:
                        `Target Take Profit ${pos.pair} tercapai dengan estimasi ` +
                        `profit +$${floatingPnl.toFixed(2)} USDT ` +
                        `(+${roiPct.toFixed(2)}%). Likuidasi siap dieksekusi!`,
                      pair: pos.pair,
                      coin: pos.coin,
                      profitUsdt: floatingPnl,
                      roiPct,
                      price: currentPrice,
                    });
                  }
                }

                return {
                  ...pos,
                  price: currentPrice,
                  change24h: Number.isFinite(Number(match.percentage)) ? Number(match.percentage) : pos.change24h,
                  floatingPnl,
                  roiPct,
                };
              })
            );

            const wsPricesMap: Record<string, number> = {};

            tickerMap.forEach((value, pair) => {
              wsPricesMap[pair] = value.last;
            });

            setPriceAlerts(checkPriceAlerts(
              priceAlertsRef.current,
              wsPricesMap,
              currentUser?.uid,
              (triggeredAlert, price) => {
                const conditionWord =
                  triggeredAlert.condition === 'above'
                    ? 'naik melampaui'
                    : 'turun menembus';

                addInAppNotification({
                  type: 'price_alert',
                  title: `Target Harga: ${triggeredAlert.symbol}`,
                  message:
                    `Harga ${triggeredAlert.symbol} telah ${conditionWord} ` +
                    `target $${formatUsdt(triggeredAlert.targetPrice)} ` +
                    `(Saat ini: $${formatUsdt(price)}).`,
                  pair: triggeredAlert.symbol,
                  coin: triggeredAlert.symbol.split('/')[0],
                  price,
                });
              }
            ));
          } catch {
            // Ignore malformed WebSocket frames.
          }
        };

        ws.onerror = () => {
          // REST ticker polling remains the fallback.
          console.warn('[BINANCE_WS_ERROR]', {
            sandbox: isTestnet,
          });
        };

        ws.onclose = (event) => {
          if (!isMounted) return;

          console.warn('[BINANCE_WS_CLOSED]', {
            sandbox: isTestnet,
            code: event.code,
            reason: event.reason || 'unknown',
          });

          ws = null;
          scheduleReconnect();
        };
      } catch (error) {
        console.warn('[BINANCE_WS_CONNECT_FAILED]', {
          sandbox: isTestnet,
          message:
            error instanceof Error ? error.message : String(error),
        });

        ws = null;
        scheduleReconnect();
      }
    };

    connectWs();

    return () => {
      isMounted = false;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }

      const activeSocket = ws;
      ws = null;

      if (activeSocket) {
        try {
          activeSocket.onopen = null;
          activeSocket.onmessage = null;
          activeSocket.onerror = null;
          activeSocket.onclose = null;

          if (
            activeSocket.readyState === WebSocket.OPEN ||
            activeSocket.readyState === WebSocket.CONNECTING
          ) {
            activeSocket.close(1000, 'component cleanup');
          }
        } catch {}
      }
    };
  }, [
    currentExchange,
    wallet.connectedExchange?.isSandbox,
    currentUser?.uid,
  ]);

  useEffect(() => {
    const tickers = tickerQuery.data?.tickers as Record<string, { last:number; percentage?:number }> | undefined;
    if (!tickers) return;

    setPositions((prev) => prev.map((position) => {
      const ticker = tickers[position.pair];
      if (!ticker?.last) return position;
      return {
        ...position,
        price: ticker.last,
        change24h: Number.isFinite(Number(ticker.percentage)) ? Number(ticker.percentage) : position.change24h,
      };
    }));

    const prices: Record<string, number> = {};
    for (const [symbol, ticker] of Object.entries(tickers)) {
      if (ticker.last) prices[symbol] = ticker.last;
    }

    setPriceAlerts(checkPriceAlerts(priceAlertsRef.current, prices, currentUser?.uid, (triggeredAlert, price) => {
      showToast(
        `Price Alert: ${triggeredAlert.symbol} mencapai target $${formatUsdt(price)}!`,
        'success'
      );
    }));
  }, [tickerQuery.dataUpdatedAt, currentUser?.uid]);

  // Exchange credentials stay in memory only and must be re-entered after a page reload.
  const [activeApiCreds, setActiveApiCreds] = useState<{
    exchange: ExchangeName;
    apiKey: string;
    secret: string;
    password?: string;
    isSandbox: boolean;
  } | null>(null);

  // Connected credentials for this runtime only; persisted exchange metadata remains masked.
  const [activeApiCredsMap, setActiveApiCredsMap] = useState<
    Map<
      ExchangeName,
      {
        exchange: ExchangeName;
        apiKey: string;
        secret: string;
        password?: string;
        isSandbox: boolean;
      }
    >
  >(new Map());

  const [engineBots, setEngineBots] = useState<any[]>([]);

  const handleReconcileBot = async (botId: string) => {
    try {
      return await reconcileBot(botId);
    } finally {
      // The engine-status poll will refresh the authoritative runner state.
    }
  };

  useEffect(() => {
    if (!currentUser?.uid || !isAuthenticatedUser) { setEngineBots([]); return; }
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await getBotEngineStatus();
        if (!cancelled && Array.isArray(data.bots)) setEngineBots(data.bots);
      } catch {
        if (!cancelled) setEngineBots([]);
      }
    };
    void poll();
    const timer = window.setInterval(poll, 2000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [currentUser?.uid, isAuthenticatedUser]);

  // Remove credentials written by older app versions; secrets are never persisted client-side.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('gain_active_api_creds');
    localStorage.removeItem('gain_active_api_creds_map');
    sessionStorage.removeItem('gain_active_api_creds');
  }, []);

  // Evaluate if current user session is in Demo / Testnet mode
  const isDemoOrTestnet = Boolean(wallet.isDemoSimulation);

  // Handle Exchange API Connect Success (supports connecting multiple exchangers to 1 Google account)
  const handleConnectExchangeSuccess = async (
    exchange: ExchangeName,
    balance: number,
    isSandbox: boolean,
    apiKey = '',
    secret?: string,
    passphrase?: string,
    portfolioAssets?: Array<{
      coin: string;
      pair: string;
      total: number;
      price: number;
      change24h: number;
      valueUsdt: number;
    }>,
    totalPortfolioUsdt?: number
  ) => {
    setCurrentExchange(exchange);

    let credentialSaveResult: any = null;
    if (apiKey && secret) {
      if (currentUser && !isDemoMode) {
        credentialSaveResult = await storeBotCredentials({ exchange, apiKey, secret, password: passphrase, isSandbox });
      }
      const creds = {
        exchange,
        apiKey,
        secret,
        password: passphrase,
        isSandbox,
      };
      setActiveApiCreds(creds);
      setActiveApiCredsMap((prev) => new Map(prev).set(exchange, creds));
    }

    const existingExchangeConfig = (wallet.connectedExchanges || []).find((item) => item.exchange === exchange) || (wallet.connectedExchange?.exchange === exchange ? wallet.connectedExchange : undefined);
    const maskedKey = apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : (existingExchangeConfig?.apiKeyMasked || 'API_CONNECTED');
    const safePortfolioAssets = Array.isArray(portfolioAssets)
      ? portfolioAssets.filter((asset) => typeof asset?.coin === 'string' && asset.coin.trim().length > 0)
      : [];
    const exchangeConfig: ConnectedExchangeConfig = {
      exchange,
      isConnected: true,
      isSandbox,
      apiKeyMasked: maskedKey,
      usdtBalance: balance,
      lastSynced: new Date().toLocaleTimeString(),
      isActive: true,
      totalPortfolioUsdt,
      portfolioAssets: safePortfolioAssets,
      exchangeAccountId: credentialSaveResult?.exchangeAccountId || existingExchangeConfig?.exchangeAccountId,
      identityType: credentialSaveResult?.identityType || existingExchangeConfig?.identityType,
      identityHint: credentialSaveResult?.identityHint || existingExchangeConfig?.identityHint,
      reportedIdentityKey: credentialSaveResult?.reportedIdentityKey || existingExchangeConfig?.reportedIdentityKey,
      credentialVersion: credentialSaveResult?.credentialVersion || existingExchangeConfig?.credentialVersion || 1,
      credentialStatus: credentialSaveResult?.credentialStatus || existingExchangeConfig?.credentialStatus || 'ACTIVE',
      exchangeAccountStatus: credentialSaveResult?.exchangeAccountStatus || existingExchangeConfig?.exchangeAccountStatus || 'ACTIVE',
      portfolioSyncStatus: 'LIVE',
      portfolioAsOf: Date.now(),
      lastSyncError: undefined,
    };


    const totalAllocated = safePortfolioAssets.length > 0
      ? Number(safePortfolioAssets.reduce((sum, a) => sum + (Number(a.valueUsdt) || 0), 0).toFixed(2))
      : 0;

    const existingList =
      wallet.connectedExchanges && wallet.connectedExchanges.length > 0
        ? wallet.connectedExchanges
        : wallet.connectedExchange?.isConnected
        ? [wallet.connectedExchange]
        : [];

    const updatedList = [
      ...existingList
        .filter((e) => e.exchange !== exchange)
        .map((e) => ({ ...e, isActive: false })),
      exchangeConfig,
    ];

    setWallet((prev) => ({
      ...prev,
      allocatedAssetUsdt: totalAllocated,
      connectedExchange: exchangeConfig,
      connectedExchanges: updatedList,
      activeExchange: exchange,
    }));

    if (safePortfolioAssets.length > 0) {
      const activeCoinMap = new Map<string, (typeof safePortfolioAssets)[number]>(
        safePortfolioAssets
          .map((a) => [typeof a?.coin === 'string' ? a.coin.toUpperCase() : '', a] as const)
          .filter(([key]) => Boolean(key))
      );

      // Save current positions for the previously active exchange before overwriting
      setPositionsByExchange((prev) => {
        const next = new Map(prev);
        const prevExchange = wallet.activeExchange || currentExchange;
        if (prevExchange && prevExchange !== exchange) {
          // Only save if switching to a different exchange
          next.set(prevExchange, positions);
        }
        return next;
      });

      setPositions((prev) => {
        // Start from cached positions for this exchange if available, otherwise use current
        const basePositions = positionsByExchange.get(exchange) || prev;
        const updated = basePositions.map((pos) => {
          const matched = activeCoinMap.get(typeof pos?.coin === 'string' ? pos.coin.toUpperCase() : '');
          if (matched) {
            return {
              ...pos,
              allocationQty: `${matched.total} ${matched.coin}`,
              allocationUsdt: `~${matched.valueUsdt.toFixed(2)} USDT`,
              price: matched.price,
              change24h: matched.change24h,
              status: 'active' as const,
              statusLabel: 'HOLDING / ACTIVE',
              engine: `${exchange} Spot ${isSandbox ? '(Testnet)' : ''} · Saldo Riil`,
            };
          }
          return {
            ...pos,
            allocationQty: `0 ${pos.coin}`,
            allocationUsdt: '0.00 USDT',
            status: 'inactive' as const,
            statusLabel: 'STANDBY',
            engine: `${exchange} Spot ${isSandbox ? '(Testnet)' : ''} · Standby`,
          };
        });
        // Save updated positions for this exchange in cache
        setPositionsByExchange((prevMap) => {
          const nextMap = new Map(prevMap);
          nextMap.set(exchange, updated);
          return nextMap;
        });
        return updated;
      });
    } else {
      setPositions((prev) => {
        const updated = prev.map((pos) => ({
          ...pos,
          engine: `${exchange} Spot ${isSandbox ? '(Testnet)' : ''} · Standby Ready`,
        }));
        setPositionsByExchange((prevMap) => {
          const nextMap = new Map(prevMap);
          nextMap.set(exchange, updated);
          return nextMap;
        });
        return updated;
      });
    }

    if (currentUser) {
      await saveConnectedExchangeToFirestore(currentUser.uid, exchangeConfig);
      if (safePortfolioAssets.length > 0) {
        await syncRealPortfolioAssetsToFirestore(
          currentUser.uid,
          safePortfolioAssets,
          exchange,
          isSandbox
        );
      }
    }

    // Automatically fetch real trade history from exchange right upon connection
    if (apiKey && secret) {
      fetchExchangeTrades({
          exchange: exchange.toLowerCase(),
          apiKey,
          secret,
          password: passphrase,
          isSandbox,
          limit: 50,
      })
        .then(async (data) => {
          if (data.success && Array.isArray(data.trades)) {
            const mappedTrades: TradeRecord[] = data.trades.map((t: any) => ({
              id: t.id || `trade-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              orderId: t.orderId || t.id,
              exchange: t.exchange || exchange,
              symbol: t.symbol,
              side: t.side,
              type: t.type || 'market',
              price: Number(t.price) || 0,
              amount: Number(t.amount) || 0,
              costUsdt: Number(t.costUsdt) || (Number(t.price) || 0) * (Number(t.amount) || 0),
              fee: t.fee,
              timestamp: t.timestamp || Date.now(),
              datetime: t.datetime || new Date().toISOString(),
              status: t.status || 'filled',
              isSandbox: Boolean(t.isSandbox),
            }));
            const enrichedTrades = decorateTradesWithRealizedPnl(mappedTrades);
            setTradeHistory(enrichedTrades);
            if (currentUser) {
              await syncTradesFromExchangeToFirestore(currentUser.uid, enrichedTrades);
            }
          }
        })
        .catch((err) => console.warn('Auto fetch trades error upon API connection:', err));
    }
  };

  // Switch Active Exchange among connected exchanges
  const handleSelectActiveExchange = async (targetExchange: ExchangeName) => {
    setCurrentExchange(targetExchange);
    const creds = activeApiCredsMap.get(targetExchange);
    if (creds) {
      setActiveApiCreds(creds);
    }

    const existingList =
      wallet.connectedExchanges && wallet.connectedExchanges.length > 0
        ? wallet.connectedExchanges
        : wallet.connectedExchange?.isConnected
        ? [wallet.connectedExchange]
        : [];

    const targetConfig = existingList.find((c) => c.exchange.toLowerCase() === targetExchange.toLowerCase());

    if (targetConfig) {
      const updatedList = existingList.map((c) => ({
        ...c,
        isActive: c.exchange.toLowerCase() === targetExchange.toLowerCase(),
      }));

      setWallet((prev) => ({
        ...prev,
        connectedExchange: { ...targetConfig, isActive: true },
        connectedExchanges: updatedList,
        activeExchange: targetExchange,
      }));

      if (currentUser) {
        await setActiveExchangeInFirestore(currentUser.uid, targetExchange);
      }
    }
  };

  // Disconnect a specific exchange API or active exchange
  const handleDisconnectSingleExchange = async (targetExchange?: ExchangeName) => {
    const exToDisconnect = targetExchange || wallet.connectedExchange?.exchange || currentExchange;

    if (currentUser && !isDemoMode) {
      const result = await disconnectBotExchange(exToDisconnect);
      if (result.credentialsDeleted !== true) {
        throw new Error('Server belum mengonfirmasi penghapusan kredensial exchange.');
      }
    }

    setActiveApiCredsMap((prev) => {
      const nextMap = new Map(prev);
      nextMap.delete(exToDisconnect);
      return nextMap;
    });

    const existingList =
      wallet.connectedExchanges && wallet.connectedExchanges.length > 0
        ? wallet.connectedExchanges
        : wallet.connectedExchange?.isConnected
        ? [wallet.connectedExchange]
        : [];

    const remainingList = existingList.filter((c) => c.exchange !== exToDisconnect);
    let nextActive = remainingList.find((c) => c.isActive) || remainingList[0];

    if (nextActive) {
      nextActive = { ...nextActive, isActive: true };
      setCurrentExchange(nextActive.exchange);
      const nextCreds = activeApiCredsMap.get(nextActive.exchange) || null;
      setActiveApiCreds(nextCreds);

      setWallet((prev) => ({
        ...prev,
        connectedExchange: nextActive,
        connectedExchanges: remainingList.map((c) => ({
          ...c,
          isActive: c.exchange === nextActive.exchange,
        })),
        activeExchange: nextActive.exchange,
      }));
    } else {
      setActiveApiCreds(null);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('gain_active_api_creds');
      }
      setWallet((prev) => ({
        ...prev,
        connectedExchange: {
          isConnected: false,
          exchange: currentExchange,
          isSandbox: false,
          apiKeyMasked: '',
          usdtBalance: 0,
          lastSynced: new Date().toLocaleTimeString(),
        },
        connectedExchanges: [],
        activeExchange: undefined,
      }));

      setPositions((prev) =>
        prev.map((pos) => ({
          ...pos,
          engine: 'Exchange API · Disconnected',
          status: 'inactive',
          statusLabel: 'STANDBY',
          allocationQty: `0 ${pos.coin}`,
          allocationUsdt: '0.00 USDT',
        }))
      );
    }

    const disconnectTx: TransactionRecord = {
      id: generateUniqueId('tx-disc'),
      title: `Disconnect API ${exToDisconnect}`,
      type: 'outflow',
      status: 'Success',
      statusColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      timestamp: 'Just now',
      counterparty: 'API Revoked',
      counterpartyLabel: 'Koneksi: ',
      amount: 0,
      amountFormatted: 'Diputuskan',
      feeInfo: 'Manual Disconnect',
    };
    setTransactions((prev) => {
      const map = new Map<string, TransactionRecord>();
      [disconnectTx, ...prev].forEach((item) => {
        if (item?.id && !map.has(item.id)) map.set(item.id, item);
      });
      return Array.from(map.values());
    });

    if (currentUser) {
      await disconnectSingleExchangeFromFirestore(currentUser.uid, exToDisconnect);
    }
  };

  // Disconnect exchange API, clear memory credentials and reset positions
  const handleDisconnectExchange = async () => {
    await handleDisconnectSingleExchange();
  };

  // Dedicated function to refresh real portfolio from active exchange credentials
  const [isRefreshingExchange, setIsRefreshingExchange] = useState(false);
  const resolveConnectedExchange = () => {
    const active = wallet.connectedExchange?.isConnected
      ? wallet.connectedExchange
      : (wallet.connectedExchanges || []).find((item) => item.isActive) || (wallet.connectedExchanges || []).find((item) => item.isConnected);
    return active || null;
  };

  // Refresh portfolio memakai credential tersimpan di server; browser tidak perlu memegang secret setelah reload.
  const handleRefreshExchangePortfolio = async () => {
    const connected = resolveConnectedExchange();
    if (!connected) {
      setIsApiKeyModalOpen(true);
      return;
    }

    setIsRefreshingExchange(true);
    setWallet((prev) => prev.connectedExchange ? { ...prev, connectedExchange: { ...prev.connectedExchange, portfolioSyncStatus: 'SYNCING', lastSyncError: undefined } } : prev);
    try {
      const data = await fetchExchangePortfolio({
        exchange: connected.exchange.toLowerCase(),
        isSandbox: connected.isSandbox,
      });

      if (data.success) {
        await handleConnectExchangeSuccess(
          connected.exchange,
          data.usdtBalance ?? 0,
          connected.isSandbox,
          '',
          undefined,
          undefined,
          data.portfolioAssets,
          data.totalPortfolioUsdt
        );
      }
    } catch (error) {
      console.warn('[EXCHANGE_PORTFOLIO_REFRESH]', error);
      setWallet((prev) => prev.connectedExchange ? { ...prev, connectedExchange: { ...prev.connectedExchange, portfolioSyncStatus: prev.connectedExchange.portfolioAssets?.length ? 'STALE' : 'ERROR', lastSyncError: error instanceof Error ? error.message.slice(0, 160) : 'Portfolio sync failed' } } : prev);
    } finally {
      setIsRefreshingExchange(false);
    }
  };

  // Background polling memakai exchange metadata yang tersimpan; tidak bergantung pada secret di browser.
  useEffect(() => {
    const connected = resolveConnectedExchange();
    if (!currentUser?.uid || !connected) return;

    const refresh = async () => {
      try {
        const data = await fetchExchangePortfolio({
          exchange: connected.exchange.toLowerCase(),
          isSandbox: connected.isSandbox,
        });
        if (data.success) {
          await handleConnectExchangeSuccess(
            connected.exchange,
            data.usdtBalance ?? 0,
            connected.isSandbox,
            '',
            undefined,
            undefined,
            data.portfolioAssets,
            data.totalPortfolioUsdt
          );
        }
      } catch (error) {
        console.warn('[EXCHANGE_PORTFOLIO_POLL]', error);
        setWallet((prev) => prev.connectedExchange ? { ...prev, connectedExchange: { ...prev.connectedExchange, portfolioSyncStatus: prev.connectedExchange.portfolioAssets?.length ? 'STALE' : 'ERROR', lastSyncError: error instanceof Error ? error.message.slice(0, 160) : 'Portfolio polling failed' } } : prev);
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => window.clearInterval(interval);
  }, [currentUser?.uid, wallet.connectedExchange?.exchange, wallet.connectedExchange?.isSandbox, wallet.connectedExchange?.isConnected]);

  const [isSyncingTrades, setIsSyncingTrades] = useState(false);

  const handleSyncExchangeTrades = async () => {
    const connected = resolveConnectedExchange();
    if (!connected) {
      setIsApiKeyModalOpen(true);
      return;
    }

    setIsSyncingTrades(true);
    try {
      const data = await fetchExchangeTrades({
        exchange: connected.exchange.toLowerCase(),
        isSandbox: connected.isSandbox,
        limit: 100,
      });

      if (data.success && Array.isArray(data.trades)) {
        const mappedTrades: TradeRecord[] = data.trades.map((t: any) => ({
          id: t.id || `trade-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          orderId: t.orderId || t.id,
          exchange: t.exchange || connected.exchange,
          symbol: t.symbol,
          side: t.side,
          type: t.type || 'market',
          price: Number(t.price) || 0,
          amount: Number(t.amount) || 0,
          costUsdt: Number(t.costUsdt) || (Number(t.price) || 0) * (Number(t.amount) || 0),
          fee: t.fee,
          realizedPnl: Number.isFinite(Number(t.realizedPnl)) ? Number(t.realizedPnl) : undefined,
          pnlPercent: Number.isFinite(Number(t.pnlPercent)) ? Number(t.pnlPercent) : undefined,
          timestamp: t.timestamp || Date.now(),
          datetime: t.datetime || new Date().toISOString(),
          status: t.status || 'filled',
          isSandbox: t.isSandbox ?? connected.isSandbox,
        }));

        const enrichedTrades = decorateTradesWithRealizedPnl(mappedTrades);
        setTradeHistory((prev) => {
          const map = new Map<string, TradeRecord>();
          prev.forEach((item) => map.set(item.id, item));
          enrichedTrades.forEach((item) => map.set(item.id, item));
          return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
        });

        if (currentUser) {
          await syncTradesFromExchangeToFirestore(currentUser.uid, enrichedTrades);
        }
      }
    } catch (err) {
      console.warn('Failed to sync exchange trades:', err);
    } finally {
      setIsSyncingTrades(false);
    }
  };

  // Automatically sync real exchange trades after the connected exchange metadata loads.
  useEffect(() => {
    if (!currentUser?.uid || !wallet.connectedExchange?.isConnected) return;
    void handleSyncExchangeTrades();
    const interval = window.setInterval(() => {
      void handleSyncExchangeTrades();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [currentUser?.uid, wallet.connectedExchange?.exchange, wallet.connectedExchange?.isSandbox, wallet.connectedExchange?.isConnected]);

  const handleLoadMoreTransactions = async () => {
    if (!currentUser || !transactionCursorRef.current || isLoadingTransactions) return;
    setIsLoadingTransactions(true);
    try {
      const page = await fetchOlderUserTransactions(currentUser.uid, transactionCursorRef.current);
      transactionCursorRef.current = page.cursor;
      hasLoadedOlderTransactionsRef.current = true;
      setHasMoreTransactions(page.hasMore);
      setTransactions((previous) => {
        const records = new Map((previous as TransactionRecord[]).map((transaction) => [transaction.id, transaction]));
        page.items.forEach((transaction) => records.set(transaction.id, transaction));
        return Array.from(records.values()).sort((a, b) =>
          Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')
        );
      });
    } catch (error) {
      console.warn('[Firestore] Failed to load older transactions:', error);
    } finally {
      setIsLoadingTransactions(false);
    }
  };

  const handleLoadMoreTrades = async () => {
    if (!currentUser || !tradeCursorRef.current || isLoadingTrades) return;
    setIsLoadingTrades(true);
    try {
      const page = await fetchOlderUserTrades(currentUser.uid, tradeCursorRef.current);
      tradeCursorRef.current = page.cursor;
      hasLoadedOlderTradesRef.current = true;
      setHasMoreTrades(page.hasMore);
      setTradeHistory((previous) => {
        const records = new Map((previous as TradeRecord[]).map((trade) => [trade.id, trade]));
        page.items.forEach((trade) => records.set(trade.id, trade));
        return Array.from(records.values()).sort((a, b) => b.timestamp - a.timestamp);
      });
    } catch (error) {
      console.warn('[Firestore] Failed to load older trades:', error);
    } finally {
      setIsLoadingTrades(false);
    }
  };

  // Execute bot order on Exchange Testnet / Live
  const handleExecuteLiveBotOrder = async (
    pair: string = 'BTC/USDT',
    side: 'buy' | 'sell' = 'buy',
    amount?: number
  ) => {
    if (!activeApiCreds) {
      setIsApiKeyModalOpen(true);
      return {
        success: false,
        error: 'API Key belum tersambung di sesi aktif ini. Silakan buka modal API Key dan simpan koneksi.',
      };
    }

    // Gate: Real order execution requires active license
    if (!activeApiCreds.isSandbox && wallet.licenseStatus !== 'active') {
      setIsActivationModalOpen(true);
      return {
        success: false,
        error: 'Eksekusi order ke Bursa Riil terkunci. Akun Anda belum teraktivasi. Silakan bayar biaya aktivasi lisensi untuk trading live di pasar riil.',
      };
    }

    const coinPrice = currentPricesMap[pair];
    const coinRef = positions.find((position) => position.pair === pair);
    if (!coinPrice || !Number.isFinite(coinPrice) || coinPrice <= 0) {
      return { success: false, error: `Harga market real ${pair} belum tersedia dari exchange.` };
    }
    const targetCoin = pair.split('/')[0] || 'BTC';

    const orderAmount =
      amount ||
      (targetCoin === 'BTC'
        ? 0.001
        : targetCoin === 'ETH'
        ? 0.01
        : targetCoin === 'SOL'
        ? 0.1
        : targetCoin === 'BNB'
        ? 0.05
        : targetCoin === 'TAO'
        ? 0.05
        : targetCoin === 'XAUT'
        ? 0.01
        : targetCoin === 'ZEC'
        ? 0.5
        : targetCoin === 'HYPE'
        ? 1.0
        : targetCoin === 'LINK'
        ? 1.5
        : targetCoin === 'AVAX'
        ? 1.0
        : targetCoin === 'NEAR'
        ? 5.0
        : targetCoin === 'SUI'
        ? 10.0
        : targetCoin === 'XRP'
        ? 25.0
        : targetCoin === 'DOGE'
        ? 100.0
        : Number((25 / coinPrice).toFixed(3)));

    try {
      const data = await placeExchangeOrder({
          exchange: activeApiCreds.exchange.toLowerCase(),
          symbol: pair,
          side,
          type: 'market',
          amount: orderAmount,
          isSandbox: activeApiCreds.isSandbox,
          accountStatus: wallet.accountStatus,
      });

      if (data.success) {
        // Create Transaction audit
        const newTx: TransactionRecord = {
          id: generateUniqueId('tx-bot'),
          title: `Bot Order ${side.toUpperCase()} ${pair} [${activeApiCreds.isSandbox ? 'Testnet' : 'Live'}]`,
          type: side === 'buy' ? 'outflow' : 'inflow',
          status: 'Completed',
          statusColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          timestamp: 'Just now',
          counterparty: `${activeApiCreds.exchange} ${activeApiCreds.isSandbox ? 'Testnet' : 'Spot'}`,
          counterpartyLabel: 'Engine: ',
          amount: data.filled ? Number((data.filled * (data.price || 1)).toFixed(2)) : 35,
          amountFormatted: `${data.amount} ${pair.split('/')[0]}`,
          feeInfo: `Order #${data.orderId}`,
          txHash: `0x${data.orderId}`,
          network: `${activeApiCreds.exchange} API`,
        };

        setTransactions((prev) => {
          const map = new Map<string, TransactionRecord>();
          [newTx, ...prev].forEach((item) => {
            if (item?.id && !map.has(item.id)) map.set(item.id, item);
          });
          return Array.from(map.values());
        });

        // Calculate layer execution metrics: Buy price, USD size, estimated TP, floating PnL
        const filledPrice = Number(data.price) || coinPrice;
        const filledAmount = Number(data.filled) || orderAmount;
        const filledCost = Number((filledAmount * filledPrice).toFixed(4));
        const tpPct = 1.5;
        const estimatedTpPrice = Number((filledPrice * (1 + tpPct / 100)).toFixed(4));
        const estimatedTpUsdt = Number((filledCost * (tpPct / 100)).toFixed(4));
        const floatingPnlUsdt = Number(((coinPrice - filledPrice) * filledAmount).toFixed(4));
        const floatingPnlPct = Number((((coinPrice - filledPrice) / filledPrice) * 100).toFixed(2));
        const coinName = pair.split('/')[0];
        const nextStep = Math.min((coinRef?.maxStep || 20), (coinRef?.stepLayer || 0) + 1);

        const newExecutedLayer: ExecutedLayerDetail = {
          id: generateUniqueId('layer'),
          orderId: data.orderId || generateUniqueId('ord'),
          symbol: pair,
          coin: coinName,
          side,
          layerStep: nextStep,
          layerType: nextStep === 1 ? 'average' : 'grid',
          label: `${side.toUpperCase()} -> ${filledAmount} ${coinName}`,
          amount: filledAmount,
          costUsdt: filledCost,
          buyPrice: filledPrice,
          currentPrice: coinPrice,
          estimatedTpPrice,
          estimatedTpPct: tpPct,
          estimatedTpUsdt,
          floatingPnlUsdt,
          floatingPnlPct,
          fee: 0,
          feeAsset: coinName,
          date: new Date().toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          }),
          timestamp: Date.now(),
        };

        const newTradeRecord: TradeRecord = {
          id: data.orderId ? `order-${data.orderId}` : generateUniqueId('trade'),
          orderId: data.orderId,
          exchange: activeApiCreds.exchange,
          symbol: pair,
          side,
          type: 'market',
          price: filledPrice,
          amount: filledAmount,
          costUsdt: filledCost,
          timestamp: Date.now(),
          datetime: new Date().toISOString(),
          status: 'filled',
          strategyName: 'GAIN Layer Averaging Engine',
          layerStep: nextStep,
          isSandbox: activeApiCreds.isSandbox,
          estimatedTpPrice,
          estimatedTpPct: tpPct,
          estimatedTpUsdt,
          currentPrice: coinPrice,
          floatingPnl: floatingPnlUsdt,
          floatingPnlPercent: floatingPnlPct,
        };

        setTradeHistory((prev) => {
          const map = new Map<string, TradeRecord>();
          [newTradeRecord, ...prev].forEach((item) => {
            if (item?.id && !map.has(item.id)) map.set(item.id, item);
          });
          return Array.from(map.values());
        });

        // Update target position status to active with new executed layer
        setPositions((prev) =>
          prev.map((pos) =>
            pos.pair === pair
              ? {
                  ...pos,
                  status: 'active',
                  statusLabel: 'RUNNING',
                  stepLayer: nextStep,
                  executedLayers: [newExecutedLayer, ...(pos.executedLayers || [])],
                  allocationUsdt: `${(parseFloat(pos.allocationUsdt) + filledCost).toFixed(2)} USDT`,
                  allocationQty: `${(parseFloat(pos.allocationQty) + filledAmount).toFixed(4)} ${coinName}`,
                }
              : pos
          )
        );

        // Send browser notification & play mechanical audio cue
        notifyLayerExecution({
          pair,
          coin: coinName,
          layerStep: nextStep,
          maxStep: coinRef?.maxStep || 20,
          side,
          price: filledPrice,
          amount: filledAmount,
          costUsdt: filledCost,
          layerType: nextStep === 1 ? 'average' : 'grid',
        });

        // Add to floating in-app notification tray
        addInAppNotification({
          type: 'layer_executed',
          title: `Layer ${nextStep} Tereksekusi: ${pair}`,
          message: `Order ${side.toUpperCase()} ${filledAmount} ${coinName} @ $${formatUsdt(filledPrice)} berhasil diisi (Biaya: $${filledCost.toFixed(2)} USDT).`,
          pair,
          coin: coinName,
          price: filledPrice,
          amount: filledAmount,
          costUsdt: filledCost,
          layerStep: nextStep,
          maxStep: coinRef?.maxStep || 20,
        });


        return {
          success: true,
          orderId: data.orderId,
          message: data.message,
        };
      } else {
        return {
          success: false,
          error: data.error,
        };
      }
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Gagal menghubungi server.',
      };
    }
  };

  // Modals
  const isMatrixModalOpen = uiModals.matrix;
  const setIsMatrixModalOpen = (isOpen: boolean) => setUiModalOpen('matrix', isOpen);
  const [selectedPairForMatrix, setSelectedPairForMatrix] = useState('BTC/USDT');
  const [selectedPairsForMatrix, setSelectedPairsForMatrix] = useState<string[]>(['BTC/USDT', 'ETH/USDT', 'SOL/USDT']);
  const [selectedModeForMatrix, setSelectedModeForMatrix] = useState<BotMode>('Avarage+Grid');
  const [selectedLayersForMatrix, setSelectedLayersForMatrix] = useState<number>(10);
  const [selectedBotIdForMatrix, setSelectedBotIdForMatrix] = useState<string | null>(null);
  const [selectedBotNameForMatrix, setSelectedBotNameForMatrix] = useState<string>('');
  const [selectedMinPriceForMatrix, setSelectedMinPriceForMatrix] = useState<number | null>(null);
  const [selectedMaxPriceForMatrix, setSelectedMaxPriceForMatrix] = useState<number | null>(null);
  const [isNewBotModeForMatrix, setIsNewBotModeForMatrix] = useState<boolean>(true);

  const isDepositModalOpen = uiModals.deposit;
  const setIsDepositModalOpen = (isOpen: boolean) => setUiModalOpen('deposit', isOpen);
  const isWithdrawModalOpen = uiModals.withdraw;
  const setIsWithdrawModalOpen = (isOpen: boolean) => setUiModalOpen('withdraw', isOpen);
  const isTransferModalOpen = uiModals.transfer;
  const setIsTransferModalOpen = (isOpen: boolean) => setUiModalOpen('transfer', isOpen);
  const isGasModalOpen = uiModals.gas;
  const setIsGasModalOpen = (isOpen: boolean) => setUiModalOpen('gas', isOpen);
  const isProfitShareModalOpen = uiModals.profitShare;
  const setIsProfitShareModalOpen = (isOpen: boolean) => setUiModalOpen('profitShare', isOpen);
  const isApiKeyModalOpen = uiModals.apiKey;
  const setIsApiKeyModalOpen = (isOpen: boolean) => setUiModalOpen('apiKey', isOpen);
  const isCoinsCheckerModalOpen = uiModals.coinsChecker;
  const setIsCoinsCheckerModalOpen = (isOpen: boolean) => setUiModalOpen('coinsChecker', isOpen);
  const isActivationModalOpen = uiModals.activation;
  const setIsActivationModalOpen = (isOpen: boolean) => setUiModalOpen('activation', isOpen);
  const is2faModalOpen = uiModals.twoFactor;
  const setIs2faModalOpen = (isOpen: boolean) => setUiModalOpen('twoFactor', isOpen);

  const handleSave2fa = async (enabled: boolean, secret: string, verificationCode: string) => {
    if (!currentUser) throw new Error('Silakan login ulang.');
    const token = await currentUser.getIdToken();
    await postJson('/api/security/2fa', { enabled, secret, code: verificationCode }, undefined, token);
    setWallet((prev) => ({ ...prev, twoFactorEnabled: enabled, twoFactorSecret: undefined }));
    reportClientEvent('auth.permission.changed', { enabled });
  };

  const handleEmailVerificationSuccess = async () => {
    setWallet((prev) => ({
      ...prev,
      emailVerified: true,
    }));
  };

  // Secure Account Activation with Backend License Verification
  const handleProcessActivation = async (
    tier: 'starter_6' | 'pro_12' = 'starter_6',
    isUpgrade: boolean = false
  ) => {
    const normalizedTier = tier;
    const data = await processWalletActivation({
      userId: currentUser?.uid || wallet.memberId,
      memberId: wallet.memberId,
      tier: normalizedTier,
      isUpgrade,
      idempotencyKey: `activation-${normalizedTier}-${currentUser?.uid || wallet.memberId}`,
    });
    if (!data.success) throw new Error(data.error || 'Gagal memproses aktivasi lisensi.');
    reportClientEvent('wallet.activation.completed', { tier: normalizedTier, isUpgrade });
    // PostgreSQL activation is atomic and the server already mirrors both the
    // wallet projection and transaction history. Avoid a second client write.
    return data;
  };

  const handleDepositSuccess = async (amount: number, target: 'gas' | 'vault', txHash: string) => {
    reportClientEvent('wallet.deposit.verified', { target, network: 'BEP-20' });
    // Server-side on-chain verification already performs the atomic credit and
    // mirrors the wallet/transaction projection. Never credit locally again.
    void amount;
    void txHash;
    void target;
  };

  const handleWithdrawSuccess = async (amount: number, address: string, queueDetails?: any) => {
    reportClientEvent('wallet.withdraw.submitted', { network: 'BEP-20', status: String(queueDetails?.status || 'REVIEW') });
    void amount;
    void address;
    return queueDetails;
  };

  const handleTransferSuccess = async (recipientId: string, recipientName: string, amount: number) => {
    reportClientEvent('wallet.transfer.completed', { recipientId });
    void recipientName;
    void amount;
    return { success: true };
  };

  const handleTopUpGasSuccess = async (amount: number, bonusAmount: number = 0, isDemoRefill: boolean = false) => {
    if (isDemoRefill) {
      setWallet((prev) => ({ ...prev, gasReserve: Number((prev.gasReserve + amount + bonusAmount).toFixed(4)), nonCashGasBonus: Number(((prev.nonCashGasBonus || 0) + bonusAmount).toFixed(4)) }));
      return;
    }
    void amount;
    void bonusAmount;
  };

  // Referral rewards are generated only by authoritative backend financial events.

  const handleForceTakeProfit = async (posId: string) => {
    // Runtime engine is authoritative. Firestore positions can be stale or missing.
    const target = positions.find((p) => p.id === posId) || engineBots
      .map((bot) => ({
        id: bot.id,
        botId: bot.botId,
        pair: bot.pair,
        coin: bot.pair.split('/')[0] || bot.pair,
        price: bot.lastPrice,
        avgBuyPrice: bot.avgEntryPrice,
        totalCoinQty: bot.positionQty,
        allocationQty: `${bot.positionQty} ${bot.pair.split('/')[0] || bot.pair}`,
        floatingPnl: (Number(bot.lastPrice) - Number(bot.avgEntryPrice)) * Number(bot.positionQty),
        roiPct: Number(bot.avgEntryPrice) > 0 ? ((Number(bot.lastPrice) - Number(bot.avgEntryPrice)) / Number(bot.avgEntryPrice)) * 100 : 0,
      } as any))
      .find((p) => p.id === posId || p.botId === posId);
    if (!target) return { success: false, error: 'Posisi tidak ditemukan di engine.' };

    const pair = target.pair;
    // Multi-pair bots share botId; resolve by pair first, then runner id.
    const bot = engineBots.find((item) => item.pair === pair && (item.id === target.id || item.id === target.botId || item.botId === target.botId))
      || engineBots.find((item) => item.pair === pair);
    const botId = bot?.id || target.botId || target.id;
    const quantity = Number(bot?.positionQty ?? target.totalCoinQty ?? 0);
    if (!(quantity > 0)) return { success: false, error: `Tidak ada jumlah ${target.pair} yang bisa dijual.` };

    try {
      const result = await forceTakeProfit(botId, target.pair, quantity);
      if (!result?.success) return { success: false, error: result?.message || result?.error || 'Penjualan ditolak backend.' };
      const fillPrice = Number(result.fillPrice || target.price || 0);
      const avgEntry = Number(result.avgEntryPrice || target.avgBuyPrice || 0);
      const gross = Math.max(0, (fillPrice - avgEntry) * Number(result.filledQty || quantity));
      notifyTakeProfit({ pair: target.pair, coin: target.coin || target.pair.split('/')[0], profitUsdt: gross, roiPct: Number(result.roiPct || 0), exitPrice: fillPrice });
      return { success: true, orderId: result.orderId, isLiveExchange: result.mode === 'live', realizedPnlEstimate: gross, filled: result.filledQty, price: fillPrice };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Penutupan posisi gagal. Periksa status order exchange sebelum mencoba lagi.' };
    }
  };

  const handleTogglePause = async (posId: string) => {
    const targetPos = positions.find((p) => p.id === posId);
    if (!targetPos) return;

    const targetBotId = targetPos.botId || targetPos.id;
    const willActivate = targetPos.status !== 'active';

    if (willActivate) {
      // Calculate active bots count (unique bot configurations)
      const activeBotIds = new Set(
        positions
          .filter((p) => (p.status === 'active' || p.status === 'averaging') && (p.botId || p.id) !== targetBotId)
          .map((p) => p.botId || p.id)
      );

      const maxAllowed = isDemoOrTestnet ? 999999 : (wallet.licenseStatus === 'active' ? (wallet.maxActiveBots || 6) : 6);

      if (activeBotIds.size >= maxAllowed) {
        alert(
          `⚠️ Batas Kuota Bot Aktif Tercapai!\n\n` +
          `Saat ini Anda telah menjalankan ${activeBotIds.size} dari maksimal ${maxAllowed} bot aktif (${wallet.licenseName || 'Starter Lifetime (6 Bot)'}).\n\n` +
          `• Anda bebas menyimpan DRAFT bot tanpa batas.\n` +
          `• Untuk mengaktifkan bot ini secara bersamaan, silakan upgrade ke Paket Pro Lifetime (12 Bot Aktif - $${getLicenseTierConfig('pro_12').promoPriceUsdt} Promo Diskon 50%) atau jeda bot lain yang sedang aktif.`
        );
        setIsActivationModalOpen(true);
        return;
      }
    }

    try {
      const desiredStatus: 'active' | 'paused' = willActivate ? 'active' : 'paused';
      const result = await setBotStatus(targetBotId, desiredStatus);

      if (!result?.success) {
        throw new Error(result?.message || 'Perubahan status bot ditolak server.');
      }

      const backendStatus = result.status === 'active' ? 'active' : 'inactive';
      const backendStatusLabel = result.status === 'active' ? 'AKTIF RUNNING' : 'DRAFT / PAUSED';

      setPositions((prev) =>
        prev.map((p) => (
          p.id === posId
            ? { ...p, status: backendStatus, statusLabel: backendStatusLabel }
            : p
        ))
      );

      setEngineBots((prev) =>
        prev.map((bot) => (
          (bot.id === targetBotId || bot.botId === targetBotId)
            ? {
                ...bot,
                status: result.status,
                resumeAfterReconciliation: result.resumeAfterReconciliation === true,
                lastErrorReason: result.lastErrorReason,
              }
            : bot
        ))
      );

      showToast(
        result.status === 'active'
          ? `Bot ${targetPos.pair} berhasil dilanjutkan.`
          : `Bot ${targetPos.pair} berhasil dijeda.`,
        'success'
      );
    } catch (error: any) {
      console.error('[BOT_STATUS_CHANGE_FAILED]', {
        botId: targetBotId,
        pair: targetPos.pair,
        message: error?.message || error,
      });
      showToast(
        error?.message || `Perubahan status bot ${targetPos.pair} gagal. Status backend tidak diubah.`,
        'error'
      );
    }
  };

  const handleBatchForceTp = async () => {
    // Use backend/runtime runners first; Firestore projections may be stale or missing.
    const runtimeCandidates = engineBots.filter((bot) => Number(bot.positionQty || 0) > 0);
    if (runtimeCandidates.length > 0) {
      for (const bot of runtimeCandidates) await handleForceTakeProfit(bot.id);
      return;
    }
    for (const pos of positions.filter((item) => Number(item.totalCoinQty || 0) > 0 || Number(item.floatingPnl || 0) !== 0)) {
      await handleForceTakeProfit(pos.id);
    }
  };

  const handleBatchPauseAll = async () => {
    try {
      const result = await pauseAllBots();
      if (!result?.success) {
        throw new Error(result?.message || 'Perintah Pause All ditolak server.');
      }

      setPositions((prev) =>
        prev.map((p) => ({
          ...p,
          status: 'inactive' as const,
          statusLabel: 'PAUSED',
        }))
      );

      setEngineBots((prev) =>
        prev.map((bot) => ({
          ...bot,
          status: 'paused',
          resumeAfterReconciliation: false,
        }))
      );

      showToast('Seluruh bot berhasil dijeda oleh backend engine.', 'success');
    } catch (error: any) {
      console.error('[BOT_PAUSE_ALL_FAILED]', error);
      showToast(
        error?.message || 'Perintah Pause All gagal. Status backend tidak diubah.',
        'error'
      );
    }
  };

  const handleOpenCustomBot = (
    pair: string = 'BTC/USDT',
    mode?: BotMode,
    layers?: number,
    botId?: string | null,
    botName?: string,
    isNewBot?: boolean,
    minPrice?: number | null,
    maxPrice?: number | null,
    pairedCoins?: string[]
  ) => {
    setSelectedPairForMatrix(pair);
    if (pairedCoins && pairedCoins.length > 0) {
      setSelectedPairsForMatrix(pairedCoins);
    } else {
      const existingPos = positions.find((p) => p.id === botId || p.pair === pair);
      if (existingPos?.pairedCoins && existingPos.pairedCoins.length > 0) {
        setSelectedPairsForMatrix(existingPos.pairedCoins);
      } else {
        setSelectedPairsForMatrix([pair]);
      }
    }
    if (mode) setSelectedModeForMatrix(mode);
    if (layers) setSelectedLayersForMatrix(layers);
    setSelectedBotIdForMatrix(botId || null);
    setSelectedBotNameForMatrix(botName || '');
    setIsNewBotModeForMatrix(isNewBot ?? (!botId));
    setSelectedMinPriceForMatrix(minPrice !== undefined ? minPrice : null);
    setSelectedMaxPriceForMatrix(maxPrice !== undefined ? maxPrice : null);
    setIsMatrixModalOpen(true);
  };

  const handleDeleteBotPosition = async (posId: string) => {
    setPositions((prev) => prev.filter((p) => p.id !== posId));
    try {
      await deleteBackgroundBot(posId);
    } catch {}
  };

  const handleDeleteAllStandbyBots = async () => {
    const standbyBots = positions.filter((p) => p.status === 'inactive');
    if (standbyBots.length === 0) return;

    setPositions((prev) => prev.filter((p) => p.status !== 'inactive'));

    try {
      await Promise.allSettled(standbyBots.map((bot) => deleteBackgroundBot(bot.botId || bot.id)));
    } catch {}
  };

  const handleCloseLayerManual = async (positionId: string, layerId: string) => {
    const targetPos: any = positions.find((p) => p.id === positionId) || engineBots.find((bot) => bot.id === positionId || bot.botId === positionId);
    if (!targetPos) throw new Error('Posisi bot tidak ditemukan.');
    const layers = Array.isArray(targetPos.executedLayers) && targetPos.executedLayers.length > 0
      ? targetPos.executedLayers
      : generateDefaultLayersForPosition(targetPos as TradingPosition);
    const layerToClose = layers.find((layer: any) => layer.id === layerId);
    if (!layerToClose) throw new Error('Layer tidak ditemukan pada projection posisi terbaru.');
    const quantity = Number(layerToClose.amount);
    if (!(quantity > 0)) throw new Error('Jumlah layer tidak valid.');
    const result = await forceTakeProfit(targetPos.botId || targetPos.id, targetPos.pair, quantity, layerId);
    if (!result?.success) throw new Error(result?.error || 'Manual close layer gagal.');
    reportClientEvent('bot.manual_layer_close.completed', { pair: targetPos.pair, requestedQty: quantity, filledQty: Number(result.filledQty || 0), remainingQty: Number(result.remainingQty || 0) });
    return result;
  };

  const handleDeployBotConfiguration = async (config: {
    botId?: string;
    botName?: string;
    isNewBot?: boolean;
    executionMode: 'testnet' | 'live';
    pair: string;
    pairedCoins?: string[];
    botMode: BotMode;
    layerCount: number;
    initialEntryAmount?: number;
    timeframe?: string;
    baseAmount: number;
    baseTp: number;
    useMoneyManagement?: boolean;
    averageDownPct?: number;
    averagingLayers?: number;
    gridLayers?: number;
    uptrendFilter?: boolean;
    tpCallbackPct?: number;
    layerCallbackPct?: number;
    gridTp?: number;
    minPrice?: number;
    maxPrice?: number;
    steps?: AveragingStep[];
  }) => {
    if (config.executionMode === 'testnet'
      && (
        wallet.connectedExchange?.isConnected !== true ||
        wallet.connectedExchange?.isSandbox !== true ||
        String(wallet.connectedExchange?.exchange || '').toLowerCase() !==
          String(currentExchange || '').toLowerCase()
      )) {
      showToast('Hubungkan exchange Binance dalam mode Testnet/Sandbox terlebih dahulu.', 'error');
      return;
    }
    if (config.executionMode === 'live'
      && (!activeApiCreds?.apiKey || activeApiCreds.isSandbox || activeApiCreds.exchange !== currentExchange)) {
      showToast('Mode Live memerlukan API key Live exchange yang sedang dipilih.', 'error');
      return;
    }

    const coinsToDeploy = Array.isArray(config.pairedCoins) && config.pairedCoins.length > 0
      ? config.pairedCoins
      : [config.pair];

    const primaryBotId = config.botId && !config.isNewBot
      ? config.botId
      : `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const finalBotName = config.botName?.trim() || `GAIN Matrix Bot (${coinsToDeploy.length} Koin Terpairing)`;

    const avgL = config.averagingLayers ?? (config.botMode === 'Grid Only' ? 0 : config.botMode === 'Avarage+Grid' ? 20 : config.layerCount);
    const gridL = config.gridLayers ?? (config.botMode === 'Avarage Only' ? 0 : config.botMode === 'Avarage+Grid' ? 100 : config.layerCount);

    // Calculate active bots count excluding current primaryBotId
    const activeBotIds = new Set(
      positions
        .filter((p) => (p.status === 'active' || p.status === 'averaging') && (p.botId || p.id) !== primaryBotId)
        .map((p) => p.botId || p.id)
    );

    const maxAllowed = isDemoOrTestnet ? 999999 : (wallet.licenseStatus === 'active' ? (wallet.maxActiveBots || 6) : 6);
    const isOverQuota = activeBotIds.size >= maxAllowed;

    // Circuit Breaker Rule (Zona Kritis: Gas Fee Tank <= 5 USDT)
    // Testnet/Sandbox tidak memakai saldo Gas Tank internal untuk pengujian.
    // Circuit breaker Gas Tank tetap wajib untuk mode Live.
    const isGasCritical =
      config.executionMode === 'live' &&
      wallet.gasReserve <= 5.0;

    let initialStatus: 'active' | 'inactive' = 'active';
    let initialStatusLabel = 'AKTIF RUNNING';

    if (isGasCritical) {
      initialStatus = 'inactive';
      initialStatusLabel = 'AUTO-STANDBY (GAS KRITIS ≤ 5)';
      alert(
        `🚨 ZONA KRITIS AKTIF: Saldo Gas Fee Tank Menipis (${wallet.gasReserve.toFixed(2)} USDT ≤ 5 USDT)!\n\n` +
        `Sesuai aturan keamanan & circuit breaker GAIN:\n` +
        `• Bot baru "${finalBotName}" otomatis disimpan sebagai STANDBY (tidak diizinkan membuka layer averaging baru).\n` +
        `• Posisi floating yang sudah berjalan diberikan masa tenggang (Grace Period) 24 jam untuk menutup siklusnya secara aman.\n` +
        `• Silakan lakukan Top-Up Gas Fee Tank Anda untuk mengaktifkan bot ini kembali.`
      );
      setIsGasModalOpen(true);
    } else if (isOverQuota) {
      initialStatus = 'inactive';
      initialStatusLabel = 'DRAFT (KUOTA PENUH)';
      alert(
        `ℹ️ Bot Disimpan Sebagai DRAFT (Tanpa Batas Kuota Draft)!\n\n` +
        `Saat ini Anda telah menjalankan ${activeBotIds.size}/${maxAllowed} bot aktif (${wallet.licenseName || 'Starter Lifetime (6 Bot)'}).\n\n` +
        `Bot "${finalBotName}" berhasil dibuat dan disimpan ke daftar Bot Anda sebagai DRAFT.\n\n` +
        `• Anda bebas membuat & mengatur DRAFT bot sebanyak mungkin tanpa batas!\n` +
        `• Untuk mengaktifkan bot ini secara bersamaan, silakan upgrade ke Paket Pro Lifetime (12 Bot Aktif - $${getLicenseTierConfig('pro_12').promoPriceUsdt} Promo Diskon 50%) atau jeda bot lain yang sedang aktif.`
      );
    }

    const updatedOrNewPositions: TradingPosition[] = [];
    const initEntryAmt = config.initialEntryAmount ? Math.max(10, config.initialEntryAmount) : 10;
    const selectedTf = config.timeframe || '5m';

    for (const coinPair of coinsToDeploy) {
      const coin = coinPair.split('/')[0] || 'CRYPTO';
      const existingForBotAndCoin = positions.find((p) => p.botId === primaryBotId && p.pair === coinPair) ||
                                    positions.find((p) => p.id === primaryBotId && p.pair === coinPair) ||
                                    (!config.isNewBot ? positions.find((p) => p.pair === coinPair) : null);

      const currentPrice = existingForBotAndCoin?.price || currentPricesMap[coinPair] || 0;
      if (!currentPrice || currentPrice <= 0) {
        showToast(`Harga market real ${coinPair} belum tersedia dari exchange. Bot tidak dibuat.`, 'error');
        return;
      }
      const minPriceVal = typeof config.minPrice === 'number' ? config.minPrice : (existingForBotAndCoin?.minPrice ?? 0);
      const maxPriceVal = typeof config.maxPrice === 'number' ? config.maxPrice : (existingForBotAndCoin?.maxPrice ?? (coin === 'SOL' ? 115 : 0));
      const isAbove = maxPriceVal > 0 && currentPrice > maxPriceVal;
      const isBelow = minPriceVal > 0 && currentPrice < minPriceVal;
      const boundaryStatus = isAbove ? 'ABOVE_MAX' : isBelow ? 'BELOW_MIN' : 'IN_RANGE';

      if (existingForBotAndCoin) {
        const updated: TradingPosition = {
          ...existingForBotAndCoin,
          botId: primaryBotId,
          botName: finalBotName,
          pairedCoins: coinsToDeploy,
          botMode: config.botMode,
          maxStep: config.layerCount,
          layerQuota: `1 s/d ${config.layerCount} Layer (${config.botMode})`,
          initialEntryAmount: initEntryAmt,
          initialEntryPrice: existingForBotAndCoin.initialEntryPrice || currentPrice,
          timeframe: selectedTf,
          allocationUsdt: `${(initEntryAmt + config.baseAmount).toFixed(2)} USDT`,
          status: initialStatus,
          statusLabel: initialStatusLabel,
          engine: `${config.botMode} (${avgL > 0 ? `${avgL}L Avg` : ''}${avgL > 0 && gridL > 0 ? ' + ' : ''}${gridL > 0 ? `${gridL}L Grid` : ''}) · 1 Bot ${coinsToDeploy.length} Koin · TF ${selectedTf}`,
          uptrendFilter: config.uptrendFilter ?? true,
          tpCallbackPct: config.tpCallbackPct ?? 0.2,
          layerCallbackPct: config.layerCallbackPct ?? 0.2,
          gridTp: config.gridTp ?? 1.2,
          minPrice: minPriceVal,
          maxPrice: maxPriceVal,
          priceBoundaryStatus: boundaryStatus,
        };
        updatedOrNewPositions.push(updated);
      } else {
        const uniqueId = `pos-${coinPair.replace('/', '').toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const newPos: TradingPosition = {
          id: uniqueId,
          botId: primaryBotId,
          botName: finalBotName,
          pairedCoins: coinsToDeploy,
          pair: coinPair,
          coin,
          status: initialStatus,
          statusLabel: initialStatusLabel,
          price: currentPrice,
          change24h: 1.2,
          engine: `${config.botMode} (${avgL > 0 ? `${avgL}L Avg` : ''}${avgL > 0 && gridL > 0 ? ' + ' : ''}${gridL > 0 ? `${gridL}L Grid` : ''}) · 1 Bot ${coinsToDeploy.length} Koin · TF ${selectedTf}`,
          initialEntryAmount: initEntryAmt,
          initialEntryPrice: currentPrice,
          timeframe: selectedTf,
          allocationUsdt: `${initEntryAmt.toFixed(2)} USDT`,
          allocationQty: `${(initEntryAmt / currentPrice).toFixed(4)} ${coin}`,
          floatingPnl: 0.0,
          roiPct: 0.0,
          stepLayer: 1,
          maxStep: config.layerCount,
          layerQuota: `1 s/d ${config.layerCount} Layer`,
          tpTargetPrice: `+${config.baseTp}% Trailing`,
          tpTriggerPrice: `+${config.baseTp}%`,
          nextAveragingTrigger: `-${config.averageDownPct || 2.0}%`,
          trailingProgressPct: 10,
          trailingInfo: `${config.botMode} (${avgL}L Avg + ${gridL}L Grid) Ready · Baseline Marker $${initEntryAmt}`,
          badgeSymbol: coin.slice(0, 3).toUpperCase(),
          logoUrl: `/coins/${coin.toLowerCase()}.svg`,
          badgeBg: 'bg-teal-500/20',
          badgeColor: 'text-teal-400',
          botMode: config.botMode,
          uptrendFilter: config.uptrendFilter ?? true,
          tpCallbackPct: config.tpCallbackPct ?? 0.2,
          layerCallbackPct: config.layerCallbackPct ?? 0.2,
          gridTp: config.gridTp ?? 1.2,
          minPrice: minPriceVal,
          maxPrice: maxPriceVal,
          priceBoundaryStatus: boundaryStatus,
        };
        updatedOrNewPositions.push(newPos);
      }
    }

    // Update local positions state
    setPositions((prev) => {
      const updatedIds = new Set(updatedOrNewPositions.map((p) => p.id));
      const remaining = prev.filter((p) => !updatedIds.has(p.id));
      return [...updatedOrNewPositions, ...remaining];
    });

    // Sync with 24/7 backend background bot runner only if active
    if (initialStatus === 'active') {
      try {
        const registration = await registerBackgroundBot({
            botId: primaryBotId,
            botName: finalBotName,
            pair: coinsToDeploy[0],
            pairedCoins: coinsToDeploy,
            botMode: config.botMode,
            baseAmount: config.baseAmount,
            baseTp: config.baseTp,
            useMoneyManagement: config.useMoneyManagement ?? true,
            averagingLayers: avgL,
            gridLayers: gridL,
            uptrendFilter: config.uptrendFilter ?? true,
            tpCallbackPct: config.tpCallbackPct ?? 0.2,
            layerCallbackPct: config.layerCallbackPct ?? 0.2,
            gridTp: config.gridTp ?? 1.2,
            averageDownPct: config.averageDownPct ?? 2.0,
            minPrice: config.minPrice || 0,
            maxPrice: config.maxPrice || 0,
            steps: config.steps,
            exchange: currentExchange,
            isSandbox: config.executionMode === 'testnet',
            mode: config.executionMode,
        });
        if (registration.success !== true) throw new Error('BOT_REGISTRATION_REJECTED');
      } catch (error) {
        let cleanupConfirmed = false;
        try {
          const cleanup = await deleteBackgroundBot(primaryBotId);
          cleanupConfirmed = cleanup.success === true;
        } catch {}

        const standbyPositions = updatedOrNewPositions.map((position) => ({
          ...position,
          status: 'inactive' as const,
          statusLabel: 'STANDBY',
        }));
        const standbyIds = new Set(standbyPositions.map((position) => position.id));
        setPositions((prev) => [
          ...standbyPositions,
          ...prev.filter((position) => !standbyIds.has(position.id)),
        ]);
        const code = typeof (error as { code?: unknown })?.code === 'string'
          ? String((error as { code: string }).code)
          : 'BOT_REGISTRATION_FAILED';
        showToast(
          cleanupConfirmed
            ? `Runner bot gagal didaftarkan (${code}); posisi dikembalikan ke standby.`
            : `Runner bot gagal didaftarkan (${code}) dan pembersihan server belum terkonfirmasi. Periksa status bot sebelum mencoba lagi.`,
          'error'
        );
        setIsMatrixModalOpen(false);
        handleRouteChange('trading');
        return;
      }
    }

    setIsMatrixModalOpen(false);
    handleRouteChange('trading');
  };

  return (
    <div className="min-h-screen bg-[var(--app-background)] text-[var(--app-foreground)] font-sans selection:bg-teal-500 selection:text-white flex flex-col justify-between transition-colors duration-200">
      {/* Top Header */}
      <HeaderBar
        currentExchange={currentExchange}
        onSelectExchange={protectAction(handleSelectActiveExchange)}
        connectedExchange={wallet.connectedExchange}
        connectedExchanges={wallet.connectedExchanges}
        twoFactorEnabled={wallet.twoFactorEnabled !== false}
        onOpenApiKey={protectAction(() => setIsApiKeyModalOpen(true))}
        onDisconnectApi={protectAction(handleDisconnectExchange)}
        onOpenProfitShare={() => setIsProfitShareModalOpen(true)}
        onOpen2faModal={protectAction(() => setIs2faModalOpen(true))}
        onOpenAdmin={() => {
          reportClientEvent('admin.action.attempted', { action: 'open_management' });
          navigate('/admin', { state: { from: location.pathname } });
        }}
        onOpenPriceAlert={protectAction(() => handleOpenPriceAlert())}
        activeAlertsCount={priceAlerts.filter((a) => a.status === 'active').length}
        operationalBots={engineBots}
        onOpenTrading={() => navigate('/bot')}
      />

      {/* Main Content Area: Optimized for Mobile (w-full), Tablet (md:max-w-2xl), Laptop (lg:max-w-4xl), and Desktop (xl:max-w-5xl) */}
      <main className="w-full max-w-xl md:max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto px-3 sm:px-5 md:px-6 py-3.5 sm:py-5 flex-1 transition-all duration-200">
        <Suspense fallback={<div className="min-h-[40vh] flex items-center justify-center text-sm text-slate-500" role="status">Memuat halaman...</div>}>
          <Routes>
              <Route path="/" element={
                <HomeView
                  wallet={wallet}
                  positions={positions}
                  engineBots={engineBots}
                  onOpenDeposit={protectAction(() => setIsDepositModalOpen(true))}
                  onOpenWithdraw={protectAction(() => setIsWithdrawModalOpen(true))}
                  onOpenCustomBot={handleOpenCustomBot}
                  onOpenApiKey={protectAction(() => setIsApiKeyModalOpen(true))}
                  onNavigateTrading={() => navigate('/trading')}
                  onOpenProfitShare={() => setIsProfitShareModalOpen(true)}
                  onOpenTransfer={protectAction(() => setIsTransferModalOpen(true))}
                  onOpenPriceAlert={protectAction(handleOpenPriceAlert)}

                />
              } />
              <Route path="/wallet" element={
                <WalletView
                  wallet={wallet}
                  transactions={transactions}
                  hasMoreTransactions={hasMoreTransactions}
                  isLoadingTransactions={isLoadingTransactions}
                  onLoadMoreTransactions={handleLoadMoreTransactions}
                  positions={positions}
                  onOpenDeposit={protectAction(() => setIsDepositModalOpen(true))}
                  onOpenWithdraw={protectAction(() => setIsWithdrawModalOpen(true))}
                  onOpenTransfer={protectAction(() => setIsTransferModalOpen(true))}
                  onOpenGas={protectAction(() => setIsGasModalOpen(true))}
                  onOpenProfitShare={() => setIsProfitShareModalOpen(true)}
                  onOpenApiKey={protectAction(() => setIsApiKeyModalOpen(true))}
                  onOpenActivationModal={protectAction(() => setIsActivationModalOpen(true))}
                  onOpenCoinsChecker={protectAction(() => setIsCoinsCheckerModalOpen(true))}
                  onSelectActiveExchange={protectAction(handleSelectActiveExchange)}
                />
              } />
              <Route path="/trading" element={<Navigate to="/bot" replace />} />
              <Route path="/backtest" element={<BacktestWorkspace onBack={() => navigate('/bot')} />} />
              <Route path="/bot" element={
                <TradingPositionsView
                  positions={positions}
                  engineBots={engineBots}
                  wallet={wallet}
                  tradeHistory={tradeHistory}
                  activeApiCreds={activeApiCreds}
                  isDemoOrTestnet={isDemoOrTestnet}
                  onOpenMatrixModal={handleOpenCustomBot}
                  onDeleteBot={protectAction(handleDeleteBotPosition)}
                  onDeleteAllStandbyBots={protectAction(handleDeleteAllStandbyBots)}
                  onOpenGasModal={protectAction(() => setIsGasModalOpen(true))}
                  onOpenActivationModal={protectAction(() => setIsActivationModalOpen(true))}
                  onForceTakeProfit={protectAction(handleForceTakeProfit)}
                  onTogglePause={protectAction(handleTogglePause)}
                  onReconcileBot={protectAction(handleReconcileBot)}
                  onBatchForceTp={protectAction(handleBatchForceTp)}
                  onBatchPauseAll={protectAction(handleBatchPauseAll)}
                  onExecuteBotOrder={protectAction(handleExecuteLiveBotOrder)}
                  onCloseLayer={protectAction(handleCloseLayerManual)}
                  onSyncExchangeTrades={protectAction(handleSyncExchangeTrades)}
                  isSyncingTrades={isSyncingTrades}
                  hasMoreTrades={hasMoreTrades}
                  isLoadingMoreTrades={isLoadingTrades}
                  onLoadMoreTrades={handleLoadMoreTrades}
                  onOpenApiKeyModal={protectAction(() => setIsApiKeyModalOpen(true))}
                  onOpenPriceAlert={protectAction(handleOpenPriceAlert)}
                  onOpenBacktest={() => navigate('/backtest')}
                />
              } />
              <Route path="/akun" element={
                <AccountView
                  wallet={wallet}
                  currentExchange={currentExchange}
                  onOpenApiKey={protectAction(() => setIsApiKeyModalOpen(true))}
                  onDisconnectApi={protectAction(handleDisconnectExchange)}
                  onOpenProfitShare={() => setIsProfitShareModalOpen(true)}
                  onOpenGasModal={protectAction(() => setIsGasModalOpen(true))}
                  onOpenTransfer={protectAction(() => setIsTransferModalOpen(true))}
                  onOpenActivationModal={protectAction(() => setIsActivationModalOpen(true))}
                  onOpen2faModal={protectAction(() => setIs2faModalOpen(true))}
                  onOpenAdmin={() => {
                    reportClientEvent('admin.action.attempted', { action: 'open_management' });
                    navigate('/admin', { state: { from: location.pathname } });
                  }}
                  onSelectActiveExchange={protectAction(handleSelectActiveExchange)}
                  onDisconnectSingleExchange={protectAction(handleDisconnectSingleExchange)}
                />
              } />
              <Route path="/admin" element={
                <RoleRoute>
                  <AdminUserManagementModal
                    isOpen
                    onClose={() => navigate((location.state as { from?: string } | null)?.from || '/akun', { replace: true })}
                  />
                </RoleRoute>
              } />
              <Route path="/moonbot" element={<Navigate to="/bot" replace />} />
              <Route path="/aiotrade" element={<Navigate to="/bot" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      {/* Footer Transparency & Legal Compliance Strip */}
      <footer className="w-full max-w-7xl mx-auto px-4 pb-24 pt-4 text-center">
        <div className="p-3 sm:p-3.5 rounded-2xl bg-[#060D18]/90 border border-[#142338] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400 font-mono text-[11px] text-left">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>GAIN (Niaga Koin)</strong> adalah Penyedia Perangkat Lunak Algoritma Trading Otomatis (Trading Software Tool). Bukan pengelola investasi titip dana &amp; Tanpa Bunga/ROI Tetap (No Fixed ROI). Bagi hasil 80:20 murni saat profit riil.
            </span>
          </div>
          <button
            onClick={() => setIsProfitShareModalOpen(true)}
            className="shrink-0 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:text-white hover:bg-emerald-500/25 text-[11px] font-mono font-bold transition cursor-pointer flex items-center gap-1.5"
          >
            <span>Transparansi 80:20</span>
            <span className="text-[10px]">→</span>
          </button>
        </div>
      </footer>

      {/* Sticky Bottom Dock */}
      <BottomDock
        currentRoute={currentRoute}
        onRouteChange={handleRouteChange}
        activePositionsCount={positions.filter((p) => p.status === 'active').length}
      />

      {/* All Application Modals */}
      <Suspense fallback={null}>
      <LazyMount isOpen={isMatrixModalOpen}>
      <AveragingMatrixModal
        isOpen={isMatrixModalOpen}
        onClose={() => setIsMatrixModalOpen(false)}
        selectedPair={selectedPairForMatrix}
        selectedPairs={selectedPairsForMatrix}
        initialMode={selectedModeForMatrix}
        initialLayers={selectedLayersForMatrix}
        initialBotId={selectedBotIdForMatrix}
        initialBotName={selectedBotNameForMatrix}
        isNewBot={isNewBotModeForMatrix}
        initialMinPrice={selectedMinPriceForMatrix}
        initialMaxPrice={selectedMaxPriceForMatrix}
        initialInitialEntryAmount={
          positions.find((p) => p.id === selectedBotIdForMatrix)?.initialEntryAmount ?? 10
        }
        initialTimeframe={
          positions.find((p) => p.id === selectedBotIdForMatrix)?.timeframe ?? '5m'
        }
        currentMarketPrice={currentPricesMap[selectedPairForMatrix]}
        currentPrices={currentPricesMap}
        existingBotsForCoin={positions.filter(
          (p) => p.pair === selectedPairForMatrix || p.coin === selectedPairForMatrix.split('/')[0]
        )}
        availableBalance={
          wallet.connectedExchange?.isConnected
            ? (wallet.connectedExchange.usdtBalance ?? 0)
            : (wallet.liquidBalance || 0)
        }
        isTestnetConnected={Boolean(
          (activeApiCreds?.apiKey
            && activeApiCreds.isSandbox
            && activeApiCreds.exchange === currentExchange)
          || (wallet.connectedExchange?.isConnected
            && wallet.connectedExchange.exchange === currentExchange
            && wallet.connectedExchange.isSandbox)
        )}
        isLiveConnected={Boolean(
          (activeApiCreds?.apiKey
            && !activeApiCreds.isSandbox
            && activeApiCreds.exchange === currentExchange)
          || (wallet.connectedExchange?.isConnected
            && wallet.connectedExchange.exchange === currentExchange
            && !wallet.connectedExchange.isSandbox)
        )}
        onOpenSimulation={() => {
          setIsMatrixModalOpen(false);
          navigate('/backtest');
        }}
        onDeployBot={protectAction(handleDeployBotConfiguration)}
      />
      </LazyMount>

      <LazyMount isOpen={isDepositModalOpen}>
      <DepositModal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        onViewLedger={() => handleRouteChange('wallet')}
        onDepositSuccess={protectAction(handleDepositSuccess)}
        memberId={wallet.memberId}
        userEmail={wallet.email || currentUser?.email || ''}
        customDepositAddress={wallet.depositAddress}
      />
      </LazyMount>

      <LazyMount isOpen={isWithdrawModalOpen}>
      <WithdrawModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        availableBalance={wallet.liquidBalance}
        userSecret={wallet.twoFactorSecret}
        userEmail={wallet.email || currentUser?.email || ''}
        memberId={wallet.memberId}
        onWithdrawSuccess={protectAction(handleWithdrawSuccess)}
      />
      </LazyMount>

      <LazyMount isOpen={isTransferModalOpen}>
      <TransferMemberModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        availableBalance={wallet.liquidBalance}
        userSecret={wallet.twoFactorSecret}
        senderMemberId={wallet.memberId}
        userEmail={wallet.email || currentUser?.email || ''}
        onTransferSuccess={protectAction(handleTransferSuccess)}
      />
      </LazyMount>

      <LazyMount isOpen={is2faModalOpen}>
      <Google2faModal
        isOpen={is2faModalOpen}
        onClose={() => setIs2faModalOpen(false)}
        userEmail={wallet.email}
        username={wallet.username}
        twoFactorEnabled={wallet.twoFactorEnabled !== false}
        twoFactorSecret={wallet.twoFactorSecret}
        onSave2fa={protectAction(handleSave2fa)}
      />
      </LazyMount>

      <LazyMount isOpen={isGasModalOpen}>
      <GasFeeModal
        isOpen={isGasModalOpen}
        onClose={() => setIsGasModalOpen(false)}
        availableBalance={wallet.liquidBalance}
        currentGasReserve={wallet.gasReserve}
        userSecret={wallet.twoFactorSecret}
        memberId={wallet.memberId}
        onTopUpSuccess={protectAction(handleTopUpGasSuccess)}
        onOpenProfitShare={() => {
          setIsGasModalOpen(false);
          setIsProfitShareModalOpen(true);
        }}
        isDemoOrTestnet={isDemoOrTestnet}
      />
      </LazyMount>

      <LazyMount isOpen={isProfitShareModalOpen}>
      <ProfitShareModal
        isOpen={isProfitShareModalOpen}
        onClose={() => setIsProfitShareModalOpen(false)}
        onOpenGasModal={protectAction(() => {
          setIsProfitShareModalOpen(false);
          setIsGasModalOpen(true);
        })}
      />
      </LazyMount>

      <LazyMount isOpen={isApiKeyModalOpen}>
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        currentExchange={currentExchange}
        connectedExchange={wallet.connectedExchange}
        connectedExchanges={wallet.connectedExchanges}
        isAccountActive={wallet.licenseStatus === 'active'}
        onOpenActivationModal={protectAction(() => {
          setIsApiKeyModalOpen(false);
          setIsActivationModalOpen(true);
        })}
        onSelectActiveExchange={protectAction(handleSelectActiveExchange)}
        onDisconnectApi={protectAction(handleDisconnectSingleExchange)}
        onConnectSuccess={protectAction(handleConnectExchangeSuccess)}
      />
      </LazyMount>



      <LazyMount isOpen={isCoinsCheckerModalOpen}>
      <ExchangeCoinsCheckerModal
        isOpen={isCoinsCheckerModalOpen}
        onClose={() => setIsCoinsCheckerModalOpen(false)}
        currentExchange={currentExchange}
        activeApiCreds={activeApiCreds}
        onSelectExchange={setCurrentExchange}
      />
      </LazyMount>

      <LazyMount isOpen={isActivationModalOpen}>
      <ActivationFeeModal
        isOpen={isActivationModalOpen}
        onClose={() => setIsActivationModalOpen(false)}
        wallet={wallet}
        onProcessActivation={protectAction(handleProcessActivation)}
        onOpenDepositModal={protectAction(() => setIsDepositModalOpen(true))}
        activeBotsCount={
          new Set(
            positions
              .filter((p) => p.status === 'active' || p.status === 'averaging')
              .map((p) => p.botId || p.id)
          ).size
        }
      />
      </LazyMount>

      {/* Authentication & Registration Modal (Masuk / Registrasi Akun Baru) */}
      <LazyMount isOpen={isAuthModalOpen}>
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        defaultMode={authModalMode}
        initialSponsorId={pendingSponsorId}
      />
      </LazyMount>

      {/* On-demand security elevation. Protected APIs open this modal only when the
          requested action requires a 24-hour elevated security session. Login itself
          remains Google/Firebase authenticated and is never blocked by this modal. */}
      {isAuthenticatedUser && (
        <LazyMount isOpen={isSecurityVerificationOpen}>
          <SecurityVerificationModal
            isOpen={isSecurityVerificationOpen}
            userEmail={wallet.email || currentUser?.email || ''}
            userName={wallet.username || currentUser?.displayName || ''}
            reason={securityVerificationReason}
            onVerifySuccess={() => {
              setIsSecurityVerificationOpen(false);
              setSecurityVerificationReason('');
              showToast('Sesi keamanan aktif selama 24 jam. Ulangi tindakan yang tadi memerlukan verifikasi.', 'success');
            }}
            onClose={() => {
              setIsSecurityVerificationOpen(false);
              setSecurityVerificationReason('');
            }}
          />
        </LazyMount>
      )}

      {/* User 1/User 2 are now differentiated by license entitlement, not login gates. */}
      {/* User 2 (tanpa lisensi) tetap dapat menggunakan dashboard; User 1 (lisensi aktif)
          mendapatkan fitur berbayar setelah authorization/action checks terpenuhi. */}
      {isAuthenticatedUser && (wallet.emailVerified === false) && (
        <LazyMount isOpen>
        <GmailVerificationModal
          isOpen={true}
          userEmail={wallet.email || currentUser?.email || ''}
          userName={wallet.username || currentUser?.displayName || ''}
          onVerificationSuccess={handleEmailVerificationSuccess}
          onCancel={async () => {
            await logout();
          }}
        />
        </LazyMount>
      )}

      {/* Price Alert & Browser Notification System Modal */}
      <LazyMount isOpen={isPriceAlertModalOpen}>
      <PriceAlertModal
        isOpen={isPriceAlertModalOpen}
        onClose={() => setIsPriceAlertModalOpen(false)}
        userId={currentUser?.uid}
        alerts={priceAlerts}
        currentPrices={currentPricesMap}
        initialSymbol={priceAlertSymbol}
      />
      </LazyMount>
      </Suspense>

      {/* Floating In-App & Browser Notification Toasts Container */}
      <NotificationToastContainer
        notifications={inAppNotifications}
        onDismiss={handleDismissNotification}
        onOpenPriceAlertModal={handleOpenPriceAlert}
        browserPermission={browserNotifPerm}
        onRequestPermission={handleRequestBrowserPermission}
      />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AppErrorBoundary>
              <AppContent />
            </AppErrorBoundary>
          </BrowserRouter>
        </QueryClientProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
