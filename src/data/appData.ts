import type { UserWallet, TradingPosition, TransactionRecord } from '../types';

// ==========================================
// Supported market catalog metadata. Prices are NEVER stored here; they come from exchange APIs.
// ==========================================
export interface SupportedCoin {
  coin: string;
  pair: string;
  name: string;
  price: number;
  change24h: number;
}

export const SUPPORTED_COINS: SupportedCoin[] = [
  { coin: 'BTC',  pair: 'BTC/USDT',  name: 'Bitcoin',       price: 0, change24h: 0  },
  { coin: 'ETH',  pair: 'ETH/USDT',  name: 'Ethereum',      price: 0, change24h: 0 },
  { coin: 'SOL',  pair: 'SOL/USDT',  name: 'Solana',        price: 0, change24h: 0  },
  { coin: 'BNB',  pair: 'BNB/USDT',  name: 'BNB',           price: 0, change24h: 0  },
  { coin: 'ZEC',  pair: 'ZEC/USDT',  name: 'Zcash',         price: 0, change24h: 0 },
  { coin: 'HYPE', pair: 'HYPE/USDT', name: 'Hyperliquid',   price: 0, change24h: 0  },
  { coin: 'LINK', pair: 'LINK/USDT', name: 'Chainlink',     price: 0, change24h: 0  },
  { coin: 'UNI',  pair: 'UNI/USDT',  name: 'Uniswap',       price: 0, change24h: 0 },
  { coin: 'NEAR', pair: 'NEAR/USDT', name: 'NEAR Protocol', price: 0, change24h: 0  },
  { coin: 'SUI',  pair: 'SUI/USDT',  name: 'Sui Network',   price: 0, change24h: 0  },
  { coin: 'XRP',  pair: 'XRP/USDT',  name: 'Ripple',        price: 0, change24h: 0  },
  { coin: 'DOGE', pair: 'DOGE/USDT', name: 'Dogecoin',      price: 0, change24h: 0 },
];

// ==========================================
// INITIAL WALLET STATE (Default for new users)
// ==========================================
export const initialWallet: UserWallet = {
  liquidBalance: 0,
  availableCash: 0,
  gasReserve: 0,
  totalInflow: 0,
  totalOutflow: 0,
  gasConsumed: 0,
  referralYield: 0,
  nonCashGasBonus: 0,
  withdrawableTradingYield: 0,
  allocatedAssetUsdt: 0,
  volume24h: 0,
  memberId: '',
  username: 'Member GAIN',
  email: '',
  accountStatus: 'non-active',
  memberStatus: 'active',
  licenseStatus: 'none',
  role: 'user',
  activationFeeUsdt: 150,
  // A newly provisioned member starts without a paid license entitlement.
  // License metadata is populated from the server after authentication.
  maxActiveBots: 0,
  tradingBonusUsdt: 0,
  depositAddress: '',
  downlineCount: 0,
  winRatePct: 0,
  sponsorId: '',
  sponsorName: '',
  directReferralsCount: 0,
  teamTurnoverUsdt: 0,
  totalReferralBonusUsdt: 0,
  twoFactorEnabled: false,
  emailVerified: false,
};

// ==========================================
// INITIAL POSITIONS (Empty by default)
// ==========================================
export const initialPositions: TradingPosition[] = [];

// ==========================================
// INITIAL TRANSACTIONS (Empty by default)
// ==========================================
export const initialTransactions: TransactionRecord[] = [];
