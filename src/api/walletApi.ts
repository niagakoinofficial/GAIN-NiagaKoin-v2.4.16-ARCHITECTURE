import { postJson, getJson } from './httpClient';
import { auth } from '../firebase';

async function token() {
  if (!auth.currentUser) throw new Error('Silakan login ulang.');
  return auth.currentUser.getIdToken();
}

export async function processWalletActivation(payload: Record<string, unknown>) {
  const key = String(payload.idempotencyKey || `activation-${crypto.randomUUID()}`);
  const body = { ...payload, idempotencyKey: key };
  return postJson<Record<string, any>>('/api/wallet/process-activation', body, undefined, await token(), { 'Idempotency-Key': key });
}
export async function verifyOnChainDeposit(payload: Record<string, unknown>) {
  return postJson<Record<string, any>>('/api/wallet/verify-deposit', payload, undefined, await token());
}
export async function submitWithdrawal(payload: Record<string, unknown>) {
  return postJson<Record<string, any>>('/api/wallet/submit-withdraw', payload, undefined, await token());
}
export async function topUpGas(payload: Record<string, unknown>) {
  return postJson<Record<string, any>>('/api/wallet/topup-gas', { ...payload, idempotencyKey: payload.idempotencyKey || `gas-${Date.now()}-${Math.random().toString(36).slice(2,10)}` }, undefined, await token());
}
export async function transferToMember(payload: Record<string, unknown>) {
  return postJson<Record<string, any>>('/api/member/transfer', payload, undefined, await token());
}
export async function getProfitShare() {
  return getJson<Record<string, any>>('/api/wallet/profit-share', await token());
}
export async function getGasAutoRefill() {
  return getJson<Record<string, any>>('/api/wallet/auto-refill', await token());
}
export async function setGasAutoRefill(payload: { enabled: boolean; thresholdUsdt: number; refillUsdt: number; maxDailyUsdt: number }) {
  return postJson<Record<string, any>>('/api/wallet/auto-refill', payload, undefined, await token());
}
