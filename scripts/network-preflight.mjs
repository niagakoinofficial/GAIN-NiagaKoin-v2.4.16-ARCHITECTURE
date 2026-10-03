import 'dotenv/config';
import dns from 'node:dns/promises';
import net from 'node:net';

const results = [];
const timeoutMs = Number(process.env.NETWORK_PREFLIGHT_TIMEOUT_MS || 8000);

function redactRpcUrl(value) {
  if (!value) return value;
  try {
    const url = new URL(value);
    if (url.hostname.includes('nodereal.io')) {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'v1' && parts[1]) return `${url.origin}/v1/<redacted>`;
    }
    for (const key of ['apiKey', 'apikey', 'key', 'token', 'secret']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '<redacted>');
    }
    return url.toString();
  } catch {
    return String(value)
      .replace(/\/v1\/[^/?\s]+/gi, '/v1/<redacted>')
      .replace(/(api[_-]?key|token|secret)=([^&\s]+)/gi, '$1=<redacted>');
  }
}

async function withTimeout(promise, ms = timeoutMs) {
  return await Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms)),
  ]);
}

function urls(value, fallback = []) {
  return String(value || fallback.join(','))
    .split(',')
    .map((v) => v.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

async function checkDns(name) {
  const hostname = new URL(name).hostname;
  const addresses = await dns.lookup(hostname, { all: true });
  return { hostname, addresses: addresses.map((a) => a.address) };
}

async function httpJson(url, options = {}) {
  const response = await withTimeout(fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) }));
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text.slice(0, 300); }
  if (!response.ok) throw new Error(`HTTP_${response.status}:${typeof body === 'string' ? body : JSON.stringify(body)}`);
  return body;
}

async function checkBinance() {
  const endpoints = urls(process.env.BINANCE_TESTNET_ENDPOINTS, [
    'https://testnet.binance.vision',
    'https://testnet1.binance.vision',
    'https://testnet2.binance.vision',
    'https://testnet3.binance.vision',
    'https://testnet4.binance.vision',
  ]);
  const checked = [];
  for (const endpoint of endpoints) {
    const item = { endpoint: redactRpcUrl(endpoint), status: 'FAIL' };
    try {
      item.dns = await checkDns(endpoint);
      const [ping, time, info] = await Promise.all([
        httpJson(`${endpoint}/api/v3/ping`),
        httpJson(`${endpoint}/api/v3/time`),
        httpJson(`${endpoint}/api/v3/exchangeInfo?symbol=BTCUSDT`),
      ]);
      item.status = 'PASS';
      item.serverTime = time.serverTime;
      item.symbol = info.symbol;
      item.ping = ping;
      checked.push(item);
      return { endpoints: checked, selected: redactRpcUrl(endpoint) };
    } catch (error) {
      item.error = String(error?.message || error).slice(0, 300);
      checked.push(item);
    }
  }
  return { endpoints: checked, selected: null };
}

async function checkBsc() {
  const endpoints = urls(process.env.BSC_RPC_URLS || process.env.BSC_RPC_URL);
  if (!endpoints.length) return { status: 'BLOCKED', code: 'BSC_RPC_NOT_CONFIGURED' };
  const expected = (process.env.BSC_EXPECTED_CHAIN_ID || '0x38').toLowerCase();
  const usdt = (process.env.BSC_USDT_CONTRACT || '0x55d398326f99059ff775485246999027b3197955').toLowerCase();
  const checked = [];
  for (const endpoint of endpoints) {
    const item = { endpoint: redactRpcUrl(endpoint), status: 'FAIL' };
    try {
      const [chainId, blockNumber, code] = await Promise.all([
        httpJson(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) }),
        httpJson(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_blockNumber', params: [] }) }),
        httpJson(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'eth_getCode', params: [usdt, 'latest'] }) }),
      ]);
      const values = [chainId.result, blockNumber.result, code.result];
      if (String(values[0]).toLowerCase() !== expected) throw new Error(`WRONG_CHAIN:${values[0]}`);
      if (!values[2] || values[2] === '0x') throw new Error('USDT_CONTRACT_HAS_NO_CODE');
      item.status = 'PASS'; item.chainId = values[0]; item.blockNumber = values[1]; checked.push(item);
      return { endpoints: checked, selected: redactRpcUrl(endpoint) };
    } catch (error) { item.error = String(error?.message || error).slice(0, 300); checked.push(item); }
  }
  return { endpoints: checked, selected: null };
}

async function main() {
  const report = { generatedAt: new Date().toISOString(), checks: {} };
  for (const url of [process.env.BINANCE_TESTNET_ENDPOINTS?.split(',')[0] || 'https://testnet.binance.vision', (process.env.BSC_RPC_URLS || process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org').split(',')[0]]) {
    if (!url) continue;
    try { report.checks[`dns:${new URL(url).hostname}`] = { status: 'PASS', ...(await checkDns(url)) }; }
    catch (error) { report.checks[`dns:${new URL(url).hostname}`] = { status: 'FAIL', error: String(error?.message || error) }; }
  }
  report.checks.binance = await checkBinance();
  report.checks.bsc = await checkBsc();
  report.status = report.checks.binance.selected && report.checks.bsc.selected ? 'PASS' : 'BLOCKED';
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'PASS' ? 0 : 1);
}

await main();
