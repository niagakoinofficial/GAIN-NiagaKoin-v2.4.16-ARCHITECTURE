import { create } from 'zustand';

export type UiModalName =
  | 'matrix'
  | 'deposit'
  | 'withdraw'
  | 'transfer'
  | 'gas'
  | 'profitShare'
  | 'apiKey'
  | 'simulation'
  | 'coinsChecker'
  | 'activation'
  | 'twoFactor'
  | 'priceAlert';

interface UiStore {
  modals: Record<UiModalName, boolean>;
  setModalOpen: (modal: UiModalName, isOpen: boolean) => void;
}

const initialModals: Record<UiModalName, boolean> = {
  matrix: false,
  deposit: false,
  withdraw: false,
  transfer: false,
  gas: false,
  profitShare: false,
  apiKey: false,
  simulation: false,
  coinsChecker: false,
  activation: false,
  twoFactor: false,
  priceAlert: false,
};

export const useUiStore = create<UiStore>((set) => ({
  modals: initialModals,
  setModalOpen: (modal, isOpen) => set((state) => ({
    modals: { ...state.modals, [modal]: isOpen },
  })),
}));
