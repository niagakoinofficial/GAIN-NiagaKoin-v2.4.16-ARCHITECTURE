import {
  processWalletActivation,
  verifyOnChainDeposit,
  submitWithdrawal,
  topUpGas,
  transferToMember,
  getGasAutoRefill as fetchGasAutoRefill,
  setGasAutoRefill as updateGasAutoRefill,
} from '../api/walletApi';

export const activateWalletAccount = processWalletActivation;
export const verifyWalletDeposit = verifyOnChainDeposit;
export const requestWalletWithdrawal = submitWithdrawal;
export const addGasReserve = topUpGas;
export const transferWalletFunds = transferToMember;

export const getGasAutoRefill = fetchGasAutoRefill;
export const setGasAutoRefill = updateGasAutoRefill;
