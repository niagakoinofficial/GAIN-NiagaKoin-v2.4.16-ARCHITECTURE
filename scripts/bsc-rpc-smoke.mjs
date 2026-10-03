import 'dotenv/config';

function redactRpcUrl(value) {
  if (!value) return value;

  try {
    const url = new URL(value);

    if (url.hostname.includes('nodereal.io')) {
      const parts = url.pathname.split('/').filter(Boolean);

      if (parts[0] === 'v1' && parts[1]) {
        return `${url.origin}/v1/<redacted>`;
      }
    }

    for (const key of ['apiKey', 'apikey', 'key', 'token', 'secret']) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, '<redacted>');
      }
    }

    return url.toString();
  } catch {
    return String(value)
      .replace(/\/v1\/[^/?\s]+/gi, '/v1/<redacted>')
      .replace(
        /(api[_-]?key|token|secret)=([^&\s]+)/gi,
        '$1=<redacted>'
      );
  }
}

const endpoints = String(
  process.env.BSC_RPC_URLS || process.env.BSC_RPC_URL || ''
)
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const expectedChainId = (
  process.env.BSC_EXPECTED_CHAIN_ID || '0x38'
).toLowerCase();

const usdt = (
  process.env.BSC_USDT_CONTRACT ||
  '0x55d398326f99059ff775485246999027b3197955'
).toLowerCase();

if (!endpoints.length) {
  console.error(
    JSON.stringify({
      ok: false,
      status: 'BLOCKED',
      code: 'BSC_RPC_NOT_CONFIGURED',
    })
  );

  process.exit(2);
}

async function rpc(url, method, params = []) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
    signal: AbortSignal.timeout(
      Number(process.env.NETWORK_PREFLIGHT_TIMEOUT_MS || 8000)
    ),
  });

  if (!response.ok) {
    throw new Error(`BSC_HTTP_${response.status}`);
  }

  const body = await response.json();

  if (body.error) {
    throw new Error(
      `BSC_RPC_${body.error.code}:${body.error.message}`
    );
  }

  return body.result;
}

for (const rpcUrl of endpoints) {
  try {
    const [chainId, blockNumber, code] = await Promise.all([
      rpc(rpcUrl, 'eth_chainId'),
      rpc(rpcUrl, 'eth_blockNumber'),
      rpc(rpcUrl, 'eth_getCode', [usdt, 'latest']),
    ]);

    if (String(chainId).toLowerCase() !== expectedChainId) {
      throw new Error(
        `BSC_WRONG_CHAIN:${chainId}:expected:${expectedChainId}`
      );
    }

    if (!code || code === '0x') {
      throw new Error('BSC_USDT_CONTRACT_HAS_NO_CODE');
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          status: 'PASS',
          rpcUrl: redactRpcUrl(rpcUrl),
          chainId,
          blockNumber,
          usdtContract: usdt,
          contractHasCode: true,
        },
        null,
        2
      )
    );

    process.exit(0);
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          rpcUrl: redactRpcUrl(rpcUrl),
          error: String(error?.message || error).slice(0, 300),
        },
        null,
        2
      )
    );
  }
}

process.exit(1);