import { auth } from '../firebase';
import { postJson, getJson } from './httpClient';

async function token() {
  if (!auth.currentUser) throw new Error('Silakan login ulang dengan akun Google Anda.');
  return auth.currentUser.getIdToken();
}

export async function sendSecurityVerificationCode(options?: { forceResend?: boolean }) {
  return postJson<{ success: boolean; required: boolean; expiresInSeconds: number; retryAfterSeconds?: number; alreadySent?: boolean }>('/api/security/send-code', { forceResend: options?.forceResend === true }, undefined, await token());
}

export async function verifySecurityVerificationCode(code: string) {
  return postJson<{ success: boolean; verified: boolean; expiresInSeconds:number }>('/api/security/verify-code', { code }, undefined, await token());
}

export async function clearElevatedSession() {
  try { await postJson('/api/security/session-logout', {}); } catch { /* Firebase logout remains authoritative */ }
}

export async function getSecuritySessionStatus() { return getJson<{ success:boolean; elevated:boolean; expiresInSeconds:number }>('/api/security/session-status', await token()); }

// Backward-compatible source aliases for callers that still use the old login naming.
export const sendLoginVerificationCode = sendSecurityVerificationCode;
export const verifyLoginVerificationCode = verifySecurityVerificationCode;
export const getSessionElevationStatus = getSecuritySessionStatus;

export async function sendVerificationCode(_payload?: { email?: string; forceResend?: boolean }) {
  return postJson<{
    success: boolean;
    expiresInSeconds: number;
    retryAfterSeconds?: number;
    alreadySent?: boolean;
    otpCode?: string;
    error?: string;
  }>('/api/auth/send-verification-code', { forceResend: _payload?.forceResend === true }, undefined, await token());
}


export async function getVerificationCodeStatus(kind: 'email' | 'login') {
  return getJson<{
    success: boolean;
    active: boolean;
    expiresInSeconds: number;
    retryAfterSeconds?: number;
  }>(`/api/auth/verification-status?kind=${encodeURIComponent(kind)}`, await token());
}

export async function verifyEmailVerificationCode(code: string) {
  return postJson<{
    success: boolean;
    emailVerified: boolean;
  }>('/api/auth/verify-email-code', { code }, undefined, await token());
}

export const getSecurityVerificationCodeStatus = () => getVerificationCodeStatus('login');
