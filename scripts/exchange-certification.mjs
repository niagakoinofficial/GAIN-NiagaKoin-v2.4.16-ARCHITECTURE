#!/usr/bin/env node

const checks = [];
const now = () => Date.now();
let environmentNetworkBlocked = false;
let environmentNetworkReason = '';

async function httpJson(name, url, options = {}) {
  const startedAt = now();
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        accept: 'application/json',
        'user-agent': 'GAIN-NiagaKoin-Exchange-Certification/2.0',
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(Number(process.env.EXCHANGE_CERT_TIMEOUT_MS || 10000)),
    });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch {}
    if (!response.ok) {
      checks.push({ exchange: name, status: 'FAIL', httpStatus: response.status, latencyMs: now() - startedAt, error: String(payload?.msg || text).slice(0, 240) });
      return null;
    }
    checks.push({ exchange: name, status: 'PASS', httpStatus: response.status, latencyMs: now() - startedAt });
    return payload;
  } catch (error) {
    checks.push({ exchange: name, status: 'FAIL', latencyMs: now() - startedAt, error: String(error?.message || error).slice(0, 240) });
    return null;
  }
}

async function preflightNetwork() {
  try {
    const response = await fetch('https://example.com', {
      headers: { 'user-agent': 'GAIN-NiagaKoin-Exchange-Certification/2.0' },
      signal: AbortSignal.timeout(Number(process.env.EXCHANGE_CERT_TIMEOUT_MS || 10000)),
    });
    if (!response.ok) throw new Error(`network preflight HTTP ${response.status}`);
    return true;
  } catch (error) {
    environmentNetworkBlocked = true;
    environmentNetworkReason = String(error?.message || error);
    return false;
  }
}

async function certify() {
  const networkReady = await preflightNetwork();
  if (!networkReady) {
    for (const exchange of ['binance','okx','bybit','bitget','coinbase','kraken','indodax','reku','reku-bidask']) {
      checks.push({ exchange, status: 'BLOCKED_ENVIRONMENT', reason: 'Public internet preflight failed in the current runtime.', error: environmentNetworkReason.slice(0, 240) });
    }
  } else {
  await httpJson('binance', 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
  await httpJson('okx', 'https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT');
  await httpJson('bybit', 'https://api.bybit.com/v5/market/tickers?category=spot&symbol=BTCUSDT');
  await httpJson('bitget', 'https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT');
  await httpJson('coinbase', 'https://api.coinbase.com/v2/prices/BTC-USD/spot');
  await httpJson('kraken', 'https://api.kraken.com/0/public/Ticker?pair=XBTUSD');
  await httpJson('indodax', 'https://indodax.com/api/btc_idr/ticker');
  await httpJson('reku', 'https://api.reku.id/v2/price');
  await httpJson('reku-bidask', 'https://api.reku.id/v2/bidask');
  }

  checks.push({
    exchange: 'triv',
    status: 'BLOCKED_PENDING_NATIVE_API',
    latencyMs: 0,
    reason: 'Official public market pages are discoverable, but a sufficiently documented public/native trading API was not verified. GAIN does not scrape the UI or invent an endpoint.',
  });

  return {
    generatedAt: new Date().toISOString(),
    mode: 'PUBLIC_READ_ONLY',
    noOrdersSubmitted: true,
    checks,
    environmentNetworkBlocked,
    environmentNetworkReason: environmentNetworkBlocked ? environmentNetworkReason.slice(0, 240) : undefined,
    summary: {
      pass: checks.filter((x) => x.status === 'PASS').length,
      fail: checks.filter((x) => x.status === 'FAIL').length,
      blocked: checks.filter((x) => String(x.status).startsWith('BLOCKED')).length,
    },
  };
}

const result = await certify();
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.summary.fail > 0 ? 1 : 0;
