import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  getDocs,
  query,
  orderBy,
  documentId,
  limit,
  startAfter,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { UserWallet, TradingPosition, TransactionRecord, TradeRecord, ConnectedExchangeConfig } from '../types';
import { initialWallet, initialPositions, initialTransactions } from '../data/appData';
import { isValidMemberId, reserveMemberId } from './memberService';
import { validateFinancialAction } from '../utils/serverValidation';
import { postJson, getJson } from '../api/httpClient';

export type FirestorePageCursor = QueryDocumentSnapshot<DocumentData>;

export interface FirestorePage<T> {
  items: T[];
  cursor: FirestorePageCursor | null;
  hasMore: boolean;
}

export const FIRESTORE_HISTORY_PAGE_SIZE = 50;

const FIRESTORE_MAINTENANCE_PAGE_SIZE = 100;

function omitUndefinedFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  ) as T;
}

async function requireMemberId(userId: string): Promise<string> {
  if (typeof window !== 'undefined') {
    try {
      const wallet = JSON.parse(localStorage.getItem(`gain_wallet_${userId}`) || 'null') as UserWallet | null;
      if (isValidMemberId(wallet?.memberId)) return wallet.memberId;
    } catch {
      // Fall through to the Firestore profile.
    }
  }

  if (!auth.currentUser || auth.currentUser.uid !== userId) {
    return '';
  }
  const profile = await getDoc(doc(db, 'users', userId));
  const memberId = profile.data()?.memberId;
  if (!isValidMemberId(memberId)) throw new Error('Member ID akun belum tersedia.');
  return memberId;
}

function isClientLedgerWriteAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return import.meta.env.DEV || host === 'localhost' || host === '127.0.0.1';
}

async function loadAllUserPositionDocuments(userId: string): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const positionsRef = collection(db, 'users', userId, 'positions');
  const documents: QueryDocumentSnapshot<DocumentData>[] = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;

  while (true) {
    const positionsQuery: Query<DocumentData> = cursor
      ? query(positionsRef, orderBy(documentId()), startAfter(cursor), limit(FIRESTORE_MAINTENANCE_PAGE_SIZE))
      : query(positionsRef, orderBy(documentId()), limit(FIRESTORE_MAINTENANCE_PAGE_SIZE));
    const snapshot = await getDocs(positionsQuery);
    documents.push(...snapshot.docs);
    if (snapshot.size < FIRESTORE_MAINTENANCE_PAGE_SIZE) return documents;
    cursor = snapshot.docs[snapshot.docs.length - 1];
  }
}

export async function initUserProfile(
  user: {
    uid: string;
    displayName?: string | null;
    email?: string | null;
    emailVerified?: boolean;
  },
  registrationData?: {
    sponsorId?: string;
    sponsorName?: string;
    desiredUsername?: string;
  }
) {
  if (!auth.currentUser || auth.currentUser.uid !== user.uid) {
    throw new Error('Sesi Firebase belum siap untuk registrasi.');
  }

  const googleEmail = user.email || 'user@gainkoin.io';
  const googleName =
    registrationData?.desiredUsername ||
    user.displayName ||
    googleEmail.split('@')[0] ||
    'Member GAIN';

  const sponsorId = registrationData?.sponsorId || '';

  // HANYA jalur registrasi yang memanggil fungsi ini.
  // Member ID + users + wallet dibuat authoritative oleh PostgreSQL backend.
  const cleanMemberId = await reserveMemberId(user.uid);

  const token = await auth.currentUser.getIdToken();

  await postJson(
    '/api/account/bootstrap',
    {
      memberId: cleanMemberId,
      username: googleName,
      sponsorId,
    },
    undefined,
    token
  );

  // LocalStorage hanya cache UI setelah backend sukses.
  // Tidak pernah digunakan untuk menentukan apakah akun terdaftar.
  const localKey = `gain_wallet_${user.uid}`;

  const newWallet: UserWallet = {
    ...initialWallet,
    username: googleName,
    email: googleEmail,
    memberId: cleanMemberId,
    depositAddress: '',
    role: 'user',
    sponsorId,
    sponsorName: registrationData?.sponsorName || '',
    accountStatus: 'non-active',
    activationFeeUsdt: 150,
    liquidBalance: 0,
    availableCash: 0,
    gasReserve: 0,
    emailVerified: user.emailVerified === true,
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(localKey, JSON.stringify(newWallet));
  }

  console.info('[GAIN_REGISTRATION_SUCCESS]', {
    uid: user.uid,
    memberId: cleanMemberId,
  });

  return {
    memberId: cleanMemberId,
  };
}


export function subscribeToUserWallet(
  userId: string,
  onUpdate: (wallet: UserWallet) => void
) {
  if (!auth.currentUser || !userId || auth.currentUser.uid !== userId) return () => {};
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fetchState = async () => {
    if (disposed || !auth.currentUser) return;
    try {
      const state = await getJson<any>('/api/account/state', await auth.currentUser.getIdToken());
      const data = state.wallet || {};

      const connectedExchanges = Array.isArray(data.connectedExchanges)
        ? data.connectedExchanges
        : [];

      const serverConnectedExchange =
        data.connectedExchange && data.connectedExchange.exchange
          ? data.connectedExchange
          : connectedExchanges[0] || null;

      let localConnectedExchange: any = null;

      if (typeof window !== 'undefined' && userId) {
        try {
          const rawLocal = window.localStorage.getItem(`gain_exchange_${userId}_${serverConnectedExchange?.exchange || connectedExchanges[0]?.exchange || ''}`)
            || window.localStorage.getItem(`gain_exchange_${userId}`);
          if (rawLocal) {
            const parsedLocal = JSON.parse(rawLocal);
            if (parsedLocal && parsedLocal.exchange) {
              localConnectedExchange = parsedLocal;
            }
          }
        } catch {
          localConnectedExchange = null;
        }
      }

      const connectedExchange =
        serverConnectedExchange
          ? {
              ...localConnectedExchange,
              ...serverConnectedExchange,
              usdtBalance:
                Number(serverConnectedExchange.usdtBalance || 0) > 0
                  ? serverConnectedExchange.usdtBalance
                  : Number(localConnectedExchange?.usdtBalance || 0),
              totalPortfolioUsdt:
                Number(serverConnectedExchange.totalPortfolioUsdt || 0) > 0
                  ? serverConnectedExchange.totalPortfolioUsdt
                  : Number(localConnectedExchange?.totalPortfolioUsdt || 0),
              portfolioAssets:
                Array.isArray(serverConnectedExchange.portfolioAssets) &&
                serverConnectedExchange.portfolioAssets.length > 0
                  ? serverConnectedExchange.portfolioAssets
                  : Array.isArray(localConnectedExchange?.portfolioAssets)
                    ? localConnectedExchange.portfolioAssets
                    : undefined,
            }
          : localConnectedExchange || null;

      const syncedAllocatedAssetUsdt = connectedExchange
        ? Number((Array.isArray(connectedExchange.portfolioAssets)
            ? connectedExchange.portfolioAssets.reduce((sum: number, asset: any) => sum + Math.max(0, Number(asset?.valueUsdt || 0)), 0)
            : 0).toFixed(2))
        : 0;
      const derivedAllocatedAssetUsdt = syncedAllocatedAssetUsdt > 0
        ? syncedAllocatedAssetUsdt
        : connectedExchange
          ? Math.max(0, Number(connectedExchange.totalPortfolioUsdt || 0) - Number(connectedExchange.usdtBalance || 0))
          : 0;

      const resolvedConnectedExchanges = connectedExchange
        ? [
            connectedExchange,
            ...connectedExchanges.filter(
              (item: any) =>
                String(item?.exchange || '').toLowerCase() !==
                String(connectedExchange.exchange || '').toLowerCase()
            ),
          ]
        : connectedExchanges;

      onUpdate({

  ...initialWallet,
  emailVerified: auth.currentUser?.emailVerified === true,
  liquidBalance: Number(data.available_balance ?? 0),
        availableCash: Number(data.available_balance ?? 0),
        gasReserve: Number(data.gas_reserve ?? 0),
        totalInflow: Number(data.total_inflow ?? 0),
        totalOutflow: Number(data.total_outflow ?? 0),
        nonCashGasBonus: Number(data.non_cash_gas_bonus ?? 0),
        withdrawableTradingYield: Number(data.withdrawable_trading_yield ?? 0),
        memberId: data.member_id || initialWallet.memberId,
        email: auth.currentUser.email || initialWallet.email,
        depositAddress: data.deposit_address || initialWallet.depositAddress,
        username: initialWallet.username,
        memberStatus: (data.member_status || data.status || 'active') as any,
        licenseStatus: (data.license_status || 'NONE').toString().toLowerCase() === 'active' ? 'active' : 'none',
        licenseTier: data.license_tier || undefined,
        licenseType: data.license_type || undefined,
        licenseName: data.license_name || undefined,
        maxActiveBots: data.max_active_bots ? Number(data.max_active_bots) : undefined,
        licenseExpiresAt: data.license_expires_at || null,
        accountStatus: String(data.license_status || 'NONE').toUpperCase() === 'ACTIVE' ? 'active' : 'non-active',
        twoFactorEnabled: Boolean(data.two_factor_enabled),
        connectedExchange,
        connectedExchanges: resolvedConnectedExchanges,
        activeExchange: data.activeExchange || connectedExchange?.exchange || null,
        allocatedAssetUsdt: derivedAllocatedAssetUsdt,
      });
    } catch {
      // Keep the last UI snapshot; authoritative state remains on the server.
    }
    if (!disposed) timer = setTimeout(fetchState, 5000);
  };
  void fetchState();
  return () => { disposed = true; if (timer) clearTimeout(timer); };
}

export function subscribeToUserPositions(
  userId: string,
  onUpdate: (positions: TradingPosition[]) => void
) {
  if (!auth.currentUser || !userId || userId.startsWith('usr-') || auth.currentUser.uid !== userId) {
    return () => {};
  }
  const path = `users/${userId}/positions`;
  return onSnapshot(
    collection(db, 'users', userId, 'positions'),
    (snap) => {
      const list: TradingPosition[] = [];
      snap.forEach((docSnap) => {
        list.push(docSnap.data() as TradingPosition);
      });
      if (list.length > 0) {
        onUpdate(list);
      }
    },
    (error) => {
      if (!auth.currentUser) return;
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeToUserTransactions(
  userId: string,
  onUpdate: (transactions: TransactionRecord[]) => void,
  onPageInfo?: (cursor: FirestorePageCursor | null, hasMore: boolean) => void
) {
  if (!auth.currentUser || !userId || userId.startsWith('usr-') || auth.currentUser.uid !== userId) {
    return () => {};
  }
  const path = `users/${userId}/transactions`;
  const transactionsQuery = query(
    collection(db, 'users', userId, 'transactions'),
    orderBy('createdAt', 'desc'),
    limit(FIRESTORE_HISTORY_PAGE_SIZE)
  );
  return onSnapshot(
    transactionsQuery,
    (snap) => {
      const list: TransactionRecord[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() as TransactionRecord;
        // Auto-purge and filter legacy exchange API sync audit entries from wallet ledger
        if (
          docSnap.id.startsWith('tx-ex-') ||
          docSnap.id.startsWith('tx-dc-') ||
          data.title?.includes('Sinkronisasi API') ||
          data.title?.includes('Pemutusan Sambungan')
        ) {
          return;
        }
        list.push(data);
      });
      onUpdate(list);
      onPageInfo?.(snap.docs.at(-1) || null, snap.size === FIRESTORE_HISTORY_PAGE_SIZE);
    },
    (error) => {
      if (!auth.currentUser) return;
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function fetchOlderUserTransactions(
  userId: string,
  cursor: FirestorePageCursor,
  pageSize = FIRESTORE_HISTORY_PAGE_SIZE
): Promise<FirestorePage<TransactionRecord>> {
  if (!auth.currentUser || auth.currentUser.uid !== userId) {
    return { items: [], cursor: null, hasMore: false };
  }

  const transactionsQuery = query(
    collection(db, 'users', userId, 'transactions'),
    orderBy('createdAt', 'desc'),
    startAfter(cursor),
    limit(pageSize)
  );
  const snap = await getDocs(transactionsQuery);
  const items = snap.docs
    .filter((docSnap) => {
      const data = docSnap.data() as TransactionRecord;
      return !docSnap.id.startsWith('tx-ex-')
        && !docSnap.id.startsWith('tx-dc-')
        && !data.title?.includes('Sinkronisasi API')
        && !data.title?.includes('Pemutusan Sambungan');
    })
    .map((docSnap) => docSnap.data() as TransactionRecord);

  return {
    items,
    cursor: snap.docs.at(-1) || null,
    hasMore: snap.size === pageSize,
  };
}

export async function updateUserWallet(userId: string, partial: Partial<UserWallet>) {
  if (!auth.currentUser || auth.currentUser.uid !== userId) return;
  const key = `gain_wallet_${userId}`;
  if (typeof window !== 'undefined') {
    let current: Partial<UserWallet> = {};
    try { current = JSON.parse(localStorage.getItem(key) || '{}'); } catch {}
    localStorage.setItem(key, JSON.stringify({ ...current, ...partial }));
  }
  const safe: Record<string, unknown> = {};
  for (const field of ['username', 'preferences'] as const) if (field in partial) safe[field] = (partial as any)[field];
  if (Object.keys(safe).length) {
    const token = await auth.currentUser.getIdToken();
    await postJson('/api/account/profile', safe, undefined, token).catch(() => {});
  }
}

export async function addTransactionToFirestore(userId: string, tx: TransactionRecord) {
  if (!auth.currentUser || auth.currentUser.uid !== userId) return;
  if (typeof window !== 'undefined') {
    const key = `gain_transactions_${userId}`;
    let current: TransactionRecord[] = [];
    try { current = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
    localStorage.setItem(key, JSON.stringify([tx, ...current.filter((item) => item.id !== tx.id)].slice(0, 100)));
  }
}

export async function updatePositionInFirestore(userId: string, pos: TradingPosition) {
  if (!auth.currentUser || auth.currentUser.uid !== userId) return;
  if (typeof window !== 'undefined') {
    const key = `gain_positions_${userId}`;
    let list: TradingPosition[] = [];
    try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
    const idx = list.findIndex((p) => p.id === pos.id);
    if (idx >= 0) list[idx] = pos; else list.push(pos);
    localStorage.setItem(key, JSON.stringify(list));
  }
}

export async function deletePositionFromFirestore(userId: string, posId: string) {
  if (!auth.currentUser || auth.currentUser.uid !== userId) return;
  if (typeof window !== 'undefined') {
    const key = `gain_positions_${userId}`;
    let list: TradingPosition[] = [];
    try { list = JSON.parse(localStorage.getItem(key) || '[]'); } catch {}
    localStorage.setItem(key, JSON.stringify(list.filter((p) => p.id !== posId)));
  }
}

export function subscribeToUserTradeHistory(
  userId: string,
  onUpdate: (trades: TradeRecord[]) => void,
  onPageInfo?: (cursor: FirestorePageCursor | null, hasMore: boolean) => void
) {
  if (!auth.currentUser || !userId || userId.startsWith('usr-') || auth.currentUser.uid !== userId) {
    return () => {};
  }
  const path = `users/${userId}/trade_history`;
  const tradesQuery = query(
    collection(db, 'users', userId, 'trade_history'),
    orderBy('timestamp', 'desc'),
    limit(FIRESTORE_HISTORY_PAGE_SIZE)
  );
  return onSnapshot(
    tradesQuery,
    (snap) => {
      const map = new Map<string, TradeRecord>();
      snap.forEach((docSnap) => {
        const data = docSnap.data() as TradeRecord;
        const id = data.id || docSnap.id;
        map.set(id, { ...data, id });
      });
      // Sort newest trades first
      const list = Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      onUpdate(list);
      onPageInfo?.(snap.docs.at(-1) || null, snap.size === FIRESTORE_HISTORY_PAGE_SIZE);
    },
    (error) => {
      if (!auth.currentUser) return;
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function fetchOlderUserTrades(
  userId: string,
  cursor: FirestorePageCursor,
  pageSize = FIRESTORE_HISTORY_PAGE_SIZE
): Promise<FirestorePage<TradeRecord>> {
  if (!auth.currentUser || auth.currentUser.uid !== userId) {
    return { items: [], cursor: null, hasMore: false };
  }

  const tradesQuery = query(
    collection(db, 'users', userId, 'trade_history'),
    orderBy('timestamp', 'desc'),
    startAfter(cursor),
    limit(pageSize)
  );
  const snap = await getDocs(tradesQuery);
  const items = snap.docs.map((docSnap) => {
    const trade = docSnap.data() as TradeRecord;
    return { ...trade, id: trade.id || docSnap.id };
  });

  return {
    items,
    cursor: snap.docs.at(-1) || null,
    hasMore: snap.size === pageSize,
  };
}

export async function saveConnectedExchangeToFirestore(userId: string, config: ConnectedExchangeConfig) {
  if (!auth.currentUser || auth.currentUser.uid !== userId) return;
  if (typeof window !== 'undefined') localStorage.setItem(`gain_exchange_${userId}_${config.exchange}`, JSON.stringify(config));
    localStorage.setItem(`gain_exchange_${userId}`, JSON.stringify(config));
}

export async function setActiveExchangeInFirestore(userId: string, exchange: string) {
  if (!auth.currentUser || auth.currentUser.uid !== userId) return;
  if (typeof window !== 'undefined') localStorage.setItem(`gain_active_exchange_${userId}`, exchange);
}

export async function disconnectSingleExchangeFromFirestore(userId: string, exchange: string) {
  if (!auth.currentUser || auth.currentUser.uid !== userId) return;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(`gain_exchange_${userId}_${exchange}`);
    localStorage.removeItem(`gain_portfolio_${userId}_${exchange}`);
  }
}

export async function disconnectExchangeFromFirestore(userId: string) {
  if (!auth.currentUser || auth.currentUser.uid !== userId) return;
  if (typeof window !== 'undefined') localStorage.removeItem(`gain_exchange_${userId}`);
}

export async function syncRealPortfolioAssetsToFirestore(userId: string, portfolioAssets: Array<Record<string, unknown>>, exchangeName: string, isSandbox: boolean) {
  if (!auth.currentUser || auth.currentUser.uid !== userId) return;
  if (typeof window !== 'undefined') {
    const snapshot = JSON.stringify({ portfolioAssets, exchangeName, isSandbox, updatedAt: Date.now() });
    localStorage.setItem(`gain_portfolio_${userId}_${exchangeName}`, snapshot);
    // Legacy fallback retained for older sessions.
    localStorage.setItem(`gain_portfolio_${userId}`, snapshot);
  }
}

export async function addTradeRecordToFirestore(userId: string, trade: TradeRecord) {
  if (!auth.currentUser || auth.currentUser.uid !== userId) return;
  if (typeof window !== 'undefined') {
    const key=`gain_trade_history_${userId}`; let current: TradeRecord[]=[];
    try { current=JSON.parse(localStorage.getItem(key)||'[]'); } catch {}
    localStorage.setItem(key, JSON.stringify([trade,...current.filter((t)=>t.id!==trade.id)].slice(0,200)));
  }
}

export async function syncTradesFromExchangeToFirestore(userId: string, trades: TradeRecord[]) {
  if (!auth.currentUser || auth.currentUser.uid !== userId) return;
  if (typeof window !== 'undefined') localStorage.setItem(`gain_trade_history_${userId}`, JSON.stringify(trades.slice(0,200)));
}
