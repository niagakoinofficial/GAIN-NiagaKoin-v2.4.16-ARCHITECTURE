/**
 * GAIN TOTP (Time-Based One-Time Password) Service
 * Implements RFC 6238 TOTP verification and key generation.
 */

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret(length: number = 16): string {
  let secret = '';
  const cryptoObj = typeof window !== 'undefined' && window.crypto ? window.crypto : null;
  if (cryptoObj && cryptoObj.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      secret += BASE32_CHARS.charAt(bytes[i] % 32);
    }
  } else {
    for (let i = 0; i < length; i++) {
      secret += BASE32_CHARS.charAt(Math.floor(Math.random() * 32));
    }
  }
  return secret;
}

export function generateTotpUri(account: string, issuer: string, secret: string): string {
  const encAccount = encodeURIComponent(account);
  const encIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${encIssuer}:${encAccount}?secret=${secret}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
}

function base32ToBytes(base32: string): Uint8Array {
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_CHARS.indexOf(clean.charAt(i));
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

// Client code never decides whether a financial TOTP is valid. Verification is performed
// by the authenticated server against the encrypted secret stored in the financial database.
export function generateCurrentTotp(_secret?: string): string {
  return '';
}

export function verifyTotp(_token: string, _secret?: string, _window: number = 1): boolean {
  return false;
}
