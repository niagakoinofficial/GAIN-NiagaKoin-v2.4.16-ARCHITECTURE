export type ExchangeCapability =
  | 'marketData'
  | 'accountRead'
  | 'ordersRead'
  | 'trading'
  | 'sandboxTrading'
  | 'publicApi';

export interface ExchangeDescriptor {
  id: string;
  name: string;
  ccxtId?: string;
  requiresPassphrase: boolean;
  hasOfficialSandbox: boolean;
  publicApi: boolean;
  authenticatedApi: boolean;
  tradingApi: boolean;
  capabilities: ExchangeCapability[];
  publicOnly?: boolean;
  publicBaseUrl?: string;
  docsUrl?: string;
  portalUrl?: string;
  certificationMode: 'FULL' | 'READ_ONLY' | 'BLOCKED_PENDING_NATIVE_API';
  quoteCurrencies: string[];
  notes?: string;
}

/**
 * Central exchange capability registry.
 *
 * IMPORTANT:
 * - A UI entry does not imply authenticated trading support.
 * - READ_ONLY means GAIN may certify market/public or account-read behavior,
 *   but must not invent order-placement capability.
 * - BLOCKED_PENDING_NATIVE_API is used when an official, sufficiently
 *   documented trading API contract has not been verified yet.
 */
export const EXCHANGE_REGISTRY = [
  {
    id: 'binance', name: 'Binance', ccxtId: 'binance', requiresPassphrase: false,
    hasOfficialSandbox: true, publicApi: true, authenticatedApi: true, tradingApi: true,
    capabilities: ['marketData', 'accountRead', 'ordersRead', 'trading', 'sandboxTrading', 'publicApi'],
    docsUrl: 'https://binance-docs.github.io/apidocs/spot/en/',
    portalUrl: 'https://testnet.binance.vision', certificationMode: 'FULL', quoteCurrencies: ['USDT', 'USDC'],
  },
  {
    id: 'bitget', name: 'Bitget', ccxtId: 'bitget', requiresPassphrase: true,
    hasOfficialSandbox: true, publicApi: true, authenticatedApi: true, tradingApi: true,
    capabilities: ['marketData', 'accountRead', 'ordersRead', 'trading', 'sandboxTrading', 'publicApi'],
    docsUrl: 'https://www.bitget.com/api-doc/common/intro', portalUrl: 'https://www.bitget.com',
    certificationMode: 'FULL', quoteCurrencies: ['USDT', 'USDC'],
    notes: 'Demo trading uses a dedicated demo API key and paptrading=1 on REST/WebSocket.'
  },
  {
    id: 'okx', name: 'OKX', ccxtId: 'okx', requiresPassphrase: true,
    hasOfficialSandbox: true, publicApi: true, authenticatedApi: true, tradingApi: true,
    capabilities: ['marketData', 'accountRead', 'ordersRead', 'trading', 'sandboxTrading', 'publicApi'],
    docsUrl: 'https://www.okx.com/docs-v5/en/', portalUrl: 'https://www.okx.com',
    certificationMode: 'FULL', quoteCurrencies: ['USDT', 'USDC'],
  },
  {
    id: 'bybit', name: 'Bybit', ccxtId: 'bybit', requiresPassphrase: false,
    hasOfficialSandbox: true, publicApi: true, authenticatedApi: true, tradingApi: true,
    capabilities: ['marketData', 'accountRead', 'ordersRead', 'trading', 'sandboxTrading', 'publicApi'],
    docsUrl: 'https://bybit-exchange.github.io/docs/v5/intro', portalUrl: 'https://testnet.bybit.com',
    certificationMode: 'FULL', quoteCurrencies: ['USDT', 'USDC'],
  },
  {
    id: 'coinbase', name: 'Coinbase', ccxtId: 'coinbase', requiresPassphrase: false,
    hasOfficialSandbox: false, publicApi: true, authenticatedApi: true, tradingApi: true,
    capabilities: ['marketData', 'accountRead', 'ordersRead', 'trading', 'publicApi'],
    docsUrl: 'https://docs.cdp.coinbase.com/',
    portalUrl: 'https://www.coinbase.com', certificationMode: 'READ_ONLY', quoteCurrencies: ['USD', 'USDC'],
    notes: 'Sandbox coverage differs by API product; keep certification read-only until a matching sandbox order path is verified.'
  },
  {
    id: 'kraken', name: 'Kraken', ccxtId: 'kraken', requiresPassphrase: false,
    hasOfficialSandbox: false, publicApi: true, authenticatedApi: true, tradingApi: true,
    capabilities: ['marketData', 'accountRead', 'ordersRead', 'trading', 'publicApi'],
    docsUrl: 'https://docs.kraken.com/rest/', portalUrl: 'https://www.kraken.com',
    certificationMode: 'READ_ONLY', quoteCurrencies: ['USD', 'USDT', 'USDC'],
    notes: 'Read-only certification first; live-order certification requires a separate explicit gate.'
  },
  {
    id: 'indodax', name: 'Indodax', ccxtId: 'indodax', requiresPassphrase: false,
    hasOfficialSandbox: false, publicApi: true, authenticatedApi: true, tradingApi: true,
    capabilities: ['marketData', 'accountRead', 'ordersRead', 'trading', 'publicApi'],
    docsUrl: 'https://publicapi.dev/indodax-api', portalUrl: 'https://indodax.com',
    certificationMode: 'READ_ONLY', quoteCurrencies: ['IDR', 'USDT'],
    notes: 'No public testnet assumption; production trading is blocked from automatic certification until explicit live micro-order approval.'
  },
  {
    id: 'tokocrypto', name: 'Tokocrypto', ccxtId: 'tokocrypto', requiresPassphrase: false,
    hasOfficialSandbox: false, publicApi: true, authenticatedApi: true, tradingApi: true,
    capabilities: ['marketData', 'accountRead', 'ordersRead', 'trading', 'publicApi'],
    docsUrl: 'https://www.tokocrypto.com/', portalUrl: 'https://www.tokocrypto.com',
    certificationMode: 'READ_ONLY', quoteCurrencies: ['USDT', 'USDC', 'IDR'],
    notes: 'Test with read-only first; do not substitute Binance credentials for Tokocrypto credentials.'
  },
  {
    id: 'bittime', name: 'Bittime', ccxtId: 'bittime', requiresPassphrase: false,
    hasOfficialSandbox: false, publicApi: true, authenticatedApi: true, tradingApi: true,
    capabilities: ['marketData', 'accountRead', 'ordersRead', 'trading', 'publicApi'],
    docsUrl: 'https://bittime-docs.github.io/', portalUrl: 'https://www.bittime.com', certificationMode: 'READ_ONLY', quoteCurrencies: ['IDR', 'USDT'],
    notes: 'Native API verification required before enabling automated trading.'
  },
  {
    id: 'pintupro', name: 'Pintu Pro', ccxtId: undefined, requiresPassphrase: false,
    hasOfficialSandbox: false, publicApi: false, authenticatedApi: false, tradingApi: false,
    capabilities: [], publicOnly: true, docsUrl: 'https://github.com/pintu-crypto/pintu-api-sample-go',
    portalUrl: 'https://pintu.co.id/pro', certificationMode: 'BLOCKED_PENDING_NATIVE_API', quoteCurrencies: ['IDR', 'USDT'],
    notes: 'Pintu Pro UAT/production API contract is not sufficiently verified here; GAIN does not fabricate endpoints.'
  },
  {
    id: 'reku', name: 'Reku', ccxtId: undefined, requiresPassphrase: false,
    hasOfficialSandbox: false, publicApi: true, authenticatedApi: false, tradingApi: false,
    capabilities: ['marketData', 'publicApi'], publicOnly: true, publicBaseUrl: 'https://api.reku.id/v2',
    docsUrl: 'https://reku.id/en/help', portalUrl: 'https://reku.id',
    certificationMode: 'READ_ONLY', quoteCurrencies: ['IDR'],
    notes: 'Official public market-data endpoints are documented; authenticated order API was not verified here, so GAIN remains read-only.'
  },
  {
    id: 'triv', name: 'Triv', ccxtId: undefined, requiresPassphrase: false,
    hasOfficialSandbox: false, publicApi: false, authenticatedApi: false, tradingApi: false,
    capabilities: [], publicOnly: true, docsUrl: 'https://triv.co.id/en', portalUrl: 'https://triv.co.id',
    certificationMode: 'BLOCKED_PENDING_NATIVE_API', quoteCurrencies: ['IDR', 'USDT'],
    notes: 'Official public market pages are visible, but a sufficiently documented public trading API contract was not verified; no fake adapter is provided.'
  },
] as const satisfies readonly ExchangeDescriptor[];

export type ExchangeId = typeof EXCHANGE_REGISTRY[number]['id'];
export type ExchangeName = typeof EXCHANGE_REGISTRY[number]['name'];

export function getExchangeDescriptor(idOrName: string): ExchangeDescriptor | undefined {
  const key = String(idOrName || '').trim().toLowerCase();
  return EXCHANGE_REGISTRY.find((item) => item.id === key || item.name.toLowerCase() === key);
}

export function getExchangeIds(): string[] {
  return EXCHANGE_REGISTRY.map((item) => item.id);
}

export function getExchangeNames(): ExchangeName[] {
  return EXCHANGE_REGISTRY.map((item) => item.name);
}

export function isTradingExchange(idOrName: string): boolean {
  return Boolean(getExchangeDescriptor(idOrName)?.tradingApi);
}
