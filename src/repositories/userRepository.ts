export {
  initUserProfile,
  subscribeToUserWallet,
  subscribeToUserPositions,
  subscribeToUserTransactions,
  subscribeToUserTradeHistory,
  fetchOlderUserTransactions,
  fetchOlderUserTrades,
  updateUserWallet,
  addTransactionToFirestore,
  addTradeRecordToFirestore,
  syncTradesFromExchangeToFirestore,
  updatePositionInFirestore,
  deletePositionFromFirestore,
  saveConnectedExchangeToFirestore,
  setActiveExchangeInFirestore,
  disconnectSingleExchangeFromFirestore,
  syncRealPortfolioAssetsToFirestore,
  disconnectExchangeFromFirestore,
} from '../services/firebaseService';

export type { FirestorePageCursor } from '../services/firebaseService';
