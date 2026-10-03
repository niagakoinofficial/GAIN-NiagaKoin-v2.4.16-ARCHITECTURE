export type NavigationRoute = 'home' | 'wallet' | 'bot' | 'trading' | 'akun' | 'moonbot' | 'aiotrade';

export type { ExchangeName } from './config/exchangeRegistry';
import type { ExchangeName } from './config/exchangeRegistry';

export type BotMode = 'Avarage Only' | 'Grid Only' | 'Avarage+Grid';

export interface ExecutedLayerDetail {
  id: string;
  orderId: string;
  symbol: string;
  coin: string;
  side: 'buy' | 'sell';
  layerStep: number;
  layerType: 'average' | 'grid';
  label: string; // e.g. "BUY -> 231.32 SUI"
  amount: number; // Kuantitas koin, e.g. 231.32
  costUsdt: number; // Ukuran USD / Total nilai, e.g. 224.39426700
  buyPrice: number; // Detail buy di harga berapa, e.g. 0.97005995
  currentPrice: number; // Harga pasar saat ini, e.g. 0.9613
  estimatedTpPrice: number; // Estimasi atau TP di harga berapa, e.g. 0.9846
  estimatedTpPct: number; // % TP target, e.g. 1.5
  estimatedTpUsdt: number; // Estimasi keuntungan dalam USD saat TP
  floatingPnlUsdt: number; // Floating PnL dalam USD
  floatingPnlPct: number; // Floating PnL dalam %
  fee: number; // Biaya trading
  feeAsset: string; // Koin fee, e.g. "SUI"
  date: string; // Waktu eksekusi, e.g. "Sep 23, 2026 22:12:47"
  timestamp: number;
  isInitialEntry?: boolean; // True jika ini adalah entry pertama (marker baseline)
  status?: 'filled' | 'closed'; // Status layer
}

export interface TradingPosition {
  id: string;
  memberId?: string;
  coin: string;
  pair: string;
  botId?: string;
  botName?: string;
  botIndex?: number;
  pairedCoins?: string[];
  logoUrl?: string;
  badgeSymbol: string;
  badgeBg: string;
  badgeColor: string;
  price: number;
  change24h: number;
  engine: string;
  botMode?: BotMode;
  allocationQty: string;
  allocationUsdt: string;
  stepLayer: number;
  maxStep: number;
  layerQuota: string;
  floatingPnl: number;
  roiPct: number;
  status: 'active' | 'averaging' | 'inactive';
  statusLabel: string;
  tpTriggerPrice?: string;
  tpTargetPrice?: string;
  trailingInfo: string;
  trailingProgressPct: number;
  nextAveragingTrigger?: string;
  reserveStepsReady?: number;
  // Initial Entry & Timeframe configuration
  initialEntryAmount?: number; // Entry pertama min 10$ default (penanda jarak layer 1)
  initialEntryPrice?: number; // Harga patokan entry awal
  timeframe?: string; // Timeframe analisis & evaluasi (3m, 5m, 10m, 15m, 30m, 1h)
  // Executed layers breakdown
  executedLayers?: ExecutedLayerDetail[];
  closedLayerIds?: string[];
  avgBuyPrice?: number;
  totalCoinQty?: number;
  totalCostUsdt?: number;
  // Bot Enhancement Indicators
  uptrendFilter?: boolean;
  uptrendStatus?: 'Uptrend' | 'Bullish' | 'Sideways' | 'Downtrend';
  customUptrendConfig?: string; // Custom kriteria tren (EMA cross, RSI, threshold dll)
  tpCallbackPct?: number;
  layerCallbackPct?: number;
  gridTp?: number;
  averagingLayers?: number;
  gridLayers?: number;
  minPrice?: number | null;
  maxPrice?: number | null;
  priceBoundaryStatus?: 'IN_RANGE' | 'ABOVE_MAX' | 'BELOW_MIN';
}

export interface BotConfiguration {
  id: string;
  botName: string;
  botMode: BotMode;
  pairedCoins: string[];
  layerCount: number;
  averagingLayers: number;
  gridLayers: number;
  initialEntryAmount?: number; // Entry pertama min 10$ default (penanda jarak layer 1)
  timeframe?: string; // Timeframe analisis: 3m, 5m, 10m, 15m, 30m, 1h
  baseAmount: number; // Ukuran per layer (min 10$ default)
  baseTp: number;
  useMoneyManagement: boolean;
  averageDownPct: number;
  uptrendFilter?: boolean;
  customUptrendConfig?: string; // Kriteria Uptrend custom
  tpCallbackPct?: number;
  layerCallbackPct?: number;
  gridTp?: number;
  minPrice?: number | null;
  maxPrice?: number | null;
  steps?: AveragingStep[];
  status?: 'active' | 'inactive';
  createdAt?: number;
}

export interface AveragingStep {
  step: number;
  dropPct: number;
  multiplier: number;
  amountUsdt: number;
  tpPct: number;
  status: 'Filled' | 'In Range' | 'Queued' | 'Safety Zone' | 'Black Swan' | 'Floor Cap';
  subGridSellPrice?: number;
  subGridProfitUsdt?: number;
  layerCallbackPct?: number;
  tpCallbackPct?: number;
  isGridLayer?: boolean;
}

export interface TransactionRecord {
  id: string;
  memberId?: string;
  sourceMemberId?: string;
  recipientMemberId?: string;
  bonusType?: string;
  title: string;
  type: 'inflow' | 'outflow' | 'gas';
  status: 'Success' | 'Completed' | 'Gas Tank' | 'Confirmed';
  statusColor: string;
  timestamp: string;
  counterparty?: string;
  counterpartyLabel?: string;
  amount: number;
  amountFormatted: string;
  feeInfo: string;
  txHash?: string;
  network?: string;
  userId?: string;
  createdAt?: string;
  sourceAction?: string;
}

export interface WalletLedgerEntry {
  id: string;
  userId: string;
  memberId?: string;
  type: 'inflow' | 'outflow' | 'transfer' | 'gas' | 'adjustment';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  transactionId?: string;
  sourceAction: string;
  actor: 'user' | 'system' | 'admin';
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface ConnectedExchangeConfig {
  exchange: ExchangeName;
  isConnected: boolean;
  isSandbox: boolean;
  apiKeyMasked: string;
  usdtBalance: number;
  lastSynced: string;
  portfolioAsOf?: number;
  portfolioSyncStatus?: 'LIVE' | 'STALE' | 'SYNCING' | 'ERROR';
  lastSyncError?: string;
  isActive?: boolean;
  totalPortfolioUsdt?: number;
  portfolioAssets?: Array<{
    coin: string;
    pair: string;
    total: number;
    price: number;
    change24h: number;
    valueUsdt: number;
  }>;
  updatedAt?: string;
  exchangeAccountId?: string;
  identityType?: 'exchange_reported' | 'credential_fingerprint';
  identityHint?: string;
  reportedIdentityKey?: string;
  credentialVersion?: number;
  credentialStatus?: string;
  exchangeAccountStatus?: string;
}

export interface EncryptedExchangeCredential {
  iv: string;
  ciphertext: string;
  tag: string;
}

export interface EncryptedExchangeVault {
  exchange: ExchangeName;
  isSandbox: boolean;
  apiKey: EncryptedExchangeCredential;
  secret: EncryptedExchangeCredential;
  password?: EncryptedExchangeCredential;
  updatedAt: string;
}

export interface NetworkMember {
  id: string;
  memberId: string;
  name: string;
  emailMasked: string;
  sponsorId: string;
  joinDate: string;
  accountStatus: 'active' | 'non-active';
  memberStatus?: 'active' | 'suspended' | 'closed';
  licenseStatus?: 'none' | 'active' | 'suspended' | 'expired';
  botStatus?: 'ACTIVE' | 'STANDBY';
  exchangeConnected?: string;
  totalTurnoverUsdt?: number;
  bonusYieldUsdt?: number;
  isDemoSimulation?: boolean;
}

export interface UserWallet {
  liquidBalance: number; // Saldo Wallet GAIN (Gas Fee & Biaya Aktivasi)
  availableCash: number;
  gasReserve: number;
  totalInflow: number;
  totalOutflow: number;
  gasConsumed: number;
  referralYield: number; // Akumulasi bagi hasil trading referral / upline
  nonCashGasBonus?: number; // 10% Non-Cash dari topup fee trading downline (masuk ke gas fee upline, no withdrawal)
  withdrawableTradingYield?: number; // 20% Cash dari 20% fee manajemen trading downline (bisa di-withdrawal)
  allocatedAssetUsdt: number;
  volume24h: number;
  memberId: string;
  username: string;
  vipTier?: string; // Optional for backward compatibility.
  // Backward-compatible UI alias: active means an ACTIVE license exists.
  accountStatus: 'active' | 'non-active';
  // Architecture v2.4.16: member identity and license entitlement are separate.
  memberStatus?: 'active' | 'suspended' | 'closed';
  licenseStatus?: 'none' | 'active' | 'suspended' | 'expired';
  licenseExpiresAt?: string | null;
  role?: 'user' | 'admin';
  activationFeeUsdt?: number;
  licenseTier?: 'starter_6' | 'pro_12';
  licenseType?: 'lifetime';
  licenseName?: string;
  maxActiveBots?: number;
  tradingBonusUsdt?: number;
  email: string;
  depositAddress?: string; // Dedicated BEP-20 deposit address for this user
  downlineCount?: number;
  winRatePct?: number;
  connectedExchange?: ConnectedExchangeConfig; // Currently active exchange
  connectedExchanges?: ConnectedExchangeConfig[]; // Multi-exchangers connected to this user/Google account
  activeExchange?: ExchangeName;
  sponsorId?: string;
  sponsorName?: string;
  directReferralsCount?: number;
  teamTurnoverUsdt?: number;
  totalReferralBonusUsdt?: number;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  emailVerified?: boolean;
  emailVerificationCode?: string;
  isDemoSimulation?: boolean;
  encryptedExchangeCreds?: Record<string, EncryptedExchangeVault>;
}

export interface BotSettingsConfig {
  pair: string;
  botMode: BotMode;
  useMoneyManagement: boolean;
  averagingLayers: number; // 1 s/d 20 layer (Averager & Hybrid)
  gridLayers: number; // 1 s/d 100 layer (Grid & Hybrid)
  averageDownPercent: number; // default 2%
  baseAmount: number;
  baseTp: number; // Take Profit (%)
  availableExchangeBalance: number;
  uptrendFilter?: boolean; // Filter konfirmasi tren Uptrend
  tpCallbackPct?: number; // Trailing Take Profit Callback (%)
  layerCallbackPct?: number; // Callback tiap layer averaging (%)
  gridTp?: number; // Take Profit Grid (%)
}

export interface TradeRecord {
  id: string;
  memberId?: string;
  orderId?: string;
  exchange: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: string;
  price: number;
  amount: number;
  costUsdt: number;
  fee?: {
    cost: number;
    currency: string;
  };
  realizedPnl?: number;
  pnlPercent?: number;
  timestamp: number;
  datetime: string;
  status: 'filled' | 'closed' | 'open' | 'canceled';
  strategyName?: string;
  layerStep?: number;
  layerType?: 'average' | 'grid';
  estimatedTpPrice?: number;
  estimatedTpPct?: number;
  estimatedTpUsdt?: number;
  currentPrice?: number;
  floatingPnl?: number;
  floatingPnlPercent?: number;
  isSandbox?: boolean;
}

export interface PriceAlert {
  id: string;
  userId?: string;
  symbol: string; // e.g. "BTC/USDT"
  coin: string; // e.g. "BTC"
  targetPrice: number;
  condition: 'above' | 'below'; // 'above' = price >= target, 'below' = price <= target
  initialPrice: number;
  status: 'active' | 'triggered' | 'disabled';
  createdAt: number;
  triggeredAt?: number;
  triggeredPrice?: number;
  note?: string;
  isRepeating?: boolean;
  notificationSent?: boolean;
}

// ==========================================
// MOONBOT ARCHITECTURAL MODELS & ENGINE TYPES
// ==========================================
export type StrategyType = 'dca_martingale' | 'dynamic_grid' | 'trailing_tp' | 'rsi_bollinger';

export interface ArchitectureNode {
  id: string;
  title: string;
  subtitle: string;
  category: 'client' | 'gateway' | 'engine' | 'security' | 'storage' | 'exchange';
  latency: string;
  techStack: string[];
  summary: string;
  description: string;
  keyResponsibilities: string[];
  codeSample: {
    language: string;
    filename: string;
    code: string;
  };
  failureHandling: string;
}

export interface SimulationStep {
  step: number;
  time: string;
  price: number;
  action: 'BUY_BASE' | 'BUY_SAFETY' | 'SELL_TAKE_PROFIT' | 'HOLD' | 'TRAILING_TRIGGER' | 'TRAILING_SELL';
  details: string;
  orderVolumeUsd: number;
  totalInvestedUsd: number;
  holdingCrypto: number;
  averagePrice: number;
  currentValueUsd: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPercent: number;
  realizedPnlUsd: number;
  safetyOrderIndex?: number;
}

export interface SimulationParams {
  baseOrderUsd: number;
  safetyOrderCount: number;
  stepScale: number; // e.g. 1.2x
  volumeMultiplier: number; // e.g. 1.5x
  stepDeviationPercent: number; // e.g. 1.8%
  takeProfitPercent: number; // e.g. 1.25%
  trailingTpPercent: number; // e.g. 0.2%
  scenario: 'sideways' | 'bull_run' | 'flash_crash_recovery' | 'continuous_bear';
}

export interface LiveOrderRecord {
  id: string;
  botId: string;
  pair: string;
  type: 'BASE_BUY' | 'SAFETY_BUY' | 'TAKE_PROFIT_SELL' | 'TRAILING_SELL';
  price: number;
  volumeUsd: number;
  cryptoAmount: number;
  timestamp: string;
  layer?: number;
  profitUsd?: number;
  gasDeductedUsd?: number;
  status: 'FILLED' | 'PENDING' | 'CANCELLED';
}

export interface BotInstance {
  id: string;
  pair: string;
  exchange: 'Binance' | 'Tokocrypto' | 'Bybit';
  strategy: 'DCA Multi-Layer' | 'Dynamic Grid';
  status: 'ACTIVE' | 'WAITING_TRIGGER' | 'SAFETY_ENGAGED' | 'PAUSED';
  baseCapital: number;
  currentAllocated: number;
  floatingPnl: number;
  floatingPnlPercent: number;
  totalRealizedProfit: number;
  cyclesCompleted: number;
  activeSafetyOrders: number;
  maxSafetyOrders: number;
  avgEntryPrice: number;
  currentMarketPrice: number;
  tpTargetPrice: number;
  lastTradeTime: string;
  baseOrderUsd: number;
  volumeMultiplier: number;
  stepDeviationPercent: number;
  stepScale: number;
  takeProfitPercent: number;
  trailingTpPercent: number;
  totalCryptoHolding: number;
}

export interface GasTransaction {
  id: string;
  type: 'DEPOSIT' | 'PROFIT_SHARE_DEDUCTION';
  amountGas: number;
  amountUsd: number;
  relatedBotPair?: string;
  realizedTradeProfit?: number;
  timestamp: string;
  txHash?: string;
  description: string;
}
