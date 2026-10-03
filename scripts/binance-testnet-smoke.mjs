import 'dotenv/config';
import ccxt from 'ccxt';

/**
 * Binance Testnet Smoke / E2E
 *
 * Flow:
 *   1. Validate credentials
 *   2. Find healthy Binance Testnet endpoint
 *   3. Authenticate through CCXT
 *   4. Load BTC/USDT market
 *   5. Fetch balance + ticker + order book
 *   6. Validate price filters
 *   7. Calculate valid non-marketable LIMIT BUY
 *   8. Validate LOT_SIZE / MIN_NOTIONAL / NOTIONAL
 *   9. Create order
 *  10. Verify order
 *  11. Cancel order
 *  12. Verify final cancelled status
 *
 * IMPORTANT:
 * This script only operates in Binance Sandbox/Testnet mode.
 */

const apiKey = process.env.BINANCE_TESTNET_API_KEY;
const secret = process.env.BINANCE_TESTNET_SECRET;

const endpoints = String(
  process.env.BINANCE_TESTNET_ENDPOINTS ||
    [
      'https://testnet.binance.vision',
      'https://testnet1.binance.vision',
      'https://testnet2.binance.vision',
      'https://testnet3.binance.vision',
      'https://testnet4.binance.vision',
    ].join(',')
)
  .split(',')
  .map((value) => value.trim().replace(/\/$/, ''))
  .filter(Boolean);

const placeOrders =
  process.env.BINANCE_TESTNET_PLACE_ORDERS === 'true';

const timeoutMs = Number(
  process.env.BINANCE_TESTNET_TIMEOUT_MS || 15000
);

const symbol = 'BTC/USDT';

const maxNotionalConfigured = Number(
  process.env.BINANCE_TESTNET_MAX_NOTIONAL_USDT || 10
);

const maxNotional = Math.min(
  Number.isFinite(maxNotionalConfigured) &&
    maxNotionalConfigured > 0
    ? maxNotionalConfigured
    : 10,
  10
);

/**
 * ------------------------------------------------------------
 * BASIC HELPERS
 * ------------------------------------------------------------
 */

function numberOrZero(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function getFilter(market, filterType) {
  if (!Array.isArray(market.info?.filters)) {
    return undefined;
  }

  return market.info.filters.find(
    (filter) => filter.filterType === filterType
  );
}

function summarizeOrder(order) {
  return {
    id: order.id,
    status: order.status,
    filled: numberOrZero(order.filled),
    amount: numberOrZero(order.amount),
    price: numberOrZero(order.price),
    average: numberOrZero(
      order.average || order.price
    ),
  };
}

/**
 * Round price using Binance/CCXT precision.
 */
function precisionPrice(exchange, marketSymbol, price) {
  return numberOrZero(
    exchange.priceToPrecision(
      marketSymbol,
      price
    )
  );
}

/**
 * Round amount using Binance/CCXT precision.
 */
function precisionAmount(exchange, marketSymbol, amount) {
  return numberOrZero(
    exchange.amountToPrecision(
      marketSymbol,
      amount
    )
  );
}

/**
 * ------------------------------------------------------------
 * CREDENTIAL VALIDATION
 * ------------------------------------------------------------
 */

if (!apiKey || !secret) {
  console.error(
    JSON.stringify({
      ok: false,
      status: 'BLOCKED',
      code: 'BINANCE_TESTNET_CREDENTIALS_MISSING',
    })
  );

  process.exit(2);
}

/**
 * ------------------------------------------------------------
 * ENDPOINT HEALTH CHECK
 * ------------------------------------------------------------
 */

async function endpointHealthy(endpoint) {
  try {
    const response = await fetch(
      `${endpoint}/api/v3/ping`,
      {
        signal: AbortSignal.timeout(timeoutMs),
      }
    );

    return response.ok;
  } catch {
    return false;
  }
}

let selected;

for (const endpoint of endpoints) {
  if (await endpointHealthy(endpoint)) {
    selected = endpoint;
    break;
  }
}

if (!selected) {
  console.error(
    JSON.stringify({
      ok: false,
      status: 'BLOCKED',
      code:
        'BINANCE_TESTNET_ENDPOINTS_UNREACHABLE',
      endpoints,
    })
  );

  process.exit(1);
}

/**
 * ------------------------------------------------------------
 * CCXT BINANCE SANDBOX
 * ------------------------------------------------------------
 */

const exchange = new ccxt.binance({
  apiKey,
  secret,
  enableRateLimit: true,

  options: {
    defaultType: 'spot',
    adjustForTimeDifference: true,
  },

  timeout: timeoutMs,
});

exchange.setSandboxMode(true);

/*
 * CCXT sandbox normally uses the default Binance Testnet
 * endpoint. If another healthy endpoint was selected,
 * explicitly override the API endpoints.
 */
if (
  selected !==
  'https://testnet.binance.vision'
) {
  exchange.urls.api = {
    public: selected,
    private: selected,
    sapi: selected,
  };
}

/**
 * ------------------------------------------------------------
 * MAIN TEST
 * ------------------------------------------------------------
 */

try {
  /**
   * ----------------------------------------------------------
   * LOAD MARKET
   * ----------------------------------------------------------
   */

  await exchange.loadMarkets();

  const market = exchange.market(symbol);

  if (!market) {
    throw new Error(
      `TESTNET_MARKET_NOT_FOUND:${symbol}`
    );
  }

  /**
   * ----------------------------------------------------------
   * FETCH ACCOUNT + MARKET DATA
   * ----------------------------------------------------------
   */

  const [
    balance,
    ticker,
    orderBook,
  ] = await Promise.all([
    exchange.fetchBalance(),
    exchange.fetchTicker(symbol),
    exchange.fetchOrderBook(symbol, 20),
  ]);

  const last = numberOrZero(ticker.last);

  if (last <= 0) {
    throw new Error(
      'TESTNET_TICKER_INVALID'
    );
  }

  const usdtBalance = numberOrZero(
    balance.free?.USDT
  );

  /**
   * ----------------------------------------------------------
   * AUTHENTICATED CONNECTION PASS
   * ----------------------------------------------------------
   */

  console.log(
    JSON.stringify({
      step: 'authenticated_connected',
      sandbox: true,
      endpoint: selected,
      symbol,
      last,
      usdtBalance,
      placeOrders,
    })
  );

  /**
   * ----------------------------------------------------------
   * PREFLIGHT ONLY
   * ----------------------------------------------------------
   */

  if (!placeOrders) {
    console.log(
      JSON.stringify({
        step: 'preflight_only',
        status: 'PASS',
        reason:
          'BINANCE_TESTNET_PLACE_ORDERS is not true',
      })
    );

    process.exit(0);
  }

  /**
   * ----------------------------------------------------------
   * ORDER BOOK
   * ----------------------------------------------------------
   */

  const bestBid = numberOrZero(
    orderBook.bids?.[0]?.[0]
  );

  const bestAsk = numberOrZero(
    orderBook.asks?.[0]?.[0]
  );

  if (bestBid <= 0) {
    throw new Error(
      'TESTNET_ORDERBOOK_BEST_BID_INVALID'
    );
  }

  if (bestAsk <= 0) {
    throw new Error(
      'TESTNET_ORDERBOOK_BEST_ASK_INVALID'
    );
  }

  /**
   * ----------------------------------------------------------
   * BINANCE FILTERS
   * ----------------------------------------------------------
   */

  const priceFilter = getFilter(
    market,
    'PRICE_FILTER'
  );

  const percentPriceBySideFilter =
    getFilter(
      market,
      'PERCENT_PRICE_BY_SIDE'
    );

  const lotSizeFilter = getFilter(
    market,
    'LOT_SIZE'
  );

  const notionalFilter =
    getFilter(market, 'NOTIONAL') ||
    getFilter(market, 'MIN_NOTIONAL');

  if (!priceFilter) {
    throw new Error(
      'TESTNET_PRICE_FILTER_MISSING'
    );
  }

  if (!percentPriceBySideFilter) {
    throw new Error(
      'TESTNET_PERCENT_PRICE_BY_SIDE_FILTER_MISSING'
    );
  }

  if (!lotSizeFilter) {
    throw new Error(
      'TESTNET_LOT_SIZE_FILTER_MISSING'
    );
  }

  /**
   * ----------------------------------------------------------
   * PRICE FILTER
   * ----------------------------------------------------------
   */

  const tickSize = numberOrZero(
    priceFilter.tickSize
  );

  const minPrice = numberOrZero(
    priceFilter.minPrice
  );

  const maxPrice = numberOrZero(
    priceFilter.maxPrice
  );

  if (tickSize <= 0) {
    throw new Error(
      'TESTNET_PRICE_TICK_SIZE_INVALID'
    );
  }

  /**
   * ----------------------------------------------------------
   * PERCENT_PRICE_BY_SIDE
   * ----------------------------------------------------------
   */

  const bidMultiplierDown =
    numberOrZero(
      percentPriceBySideFilter
        .bidMultiplierDown
    );

  const bidMultiplierUp =
    numberOrZero(
      percentPriceBySideFilter
        .bidMultiplierUp
    );

  const avgPriceMins =
    numberOrZero(
      percentPriceBySideFilter
        .avgPriceMins
    );

  if (
    bidMultiplierDown <= 0 ||
    bidMultiplierUp <= 0
  ) {
    throw new Error(
      'TESTNET_PERCENT_PRICE_BY_SIDE_FILTER_INVALID'
    );
  }

  /**
   * Binance provides weighted average price
   * in ticker.info.weightedAvgPrice.
   *
   * If avgPriceMins > 0, prefer weighted average.
   * Otherwise use last price.
   */

  const weightedAveragePrice =
    numberOrZero(
      ticker.info?.weightedAvgPrice
    );

  const referencePrice =
    avgPriceMins > 0 &&
    weightedAveragePrice > 0
      ? weightedAveragePrice
      : last;

  const minimumValidPrice =
    referencePrice *
    bidMultiplierDown;

  const maximumValidPrice =
    referencePrice *
    bidMultiplierUp;

  /**
   * ----------------------------------------------------------
   * CALCULATE NON-MARKETABLE LIMIT BUY
   * ----------------------------------------------------------
   *
   * We want:
   *
   *   minimumValidPrice
   *       <= limitPrice
   *       < bestBid
   *
   * This avoids intentionally crossing the market.
   */

  const safetyDistance = Math.max(
    bestBid * 0.005,
    tickSize * 10
  );

  const candidateBelowBid =
    bestBid - safetyDistance;

  if (
    candidateBelowBid <=
    minimumValidPrice
  ) {
    throw new Error(
      `TESTNET_NO_SAFE_LIMIT_PRICE:${JSON.stringify({
        bestBid,
        candidateBelowBid,
        minimumValidPrice,
        maximumValidPrice,
        referencePrice,
      })}`
    );
  }

  let rawLimitPrice = Math.max(
    minimumValidPrice +
      tickSize * 10,

    Math.min(
      candidateBelowBid,
      bestBid - tickSize
    )
  );

  /**
   * Respect PRICE_FILTER min/max.
   */

  if (
    minPrice > 0 &&
    rawLimitPrice < minPrice
  ) {
    rawLimitPrice = minPrice;
  }

  if (
    maxPrice > 0 &&
    rawLimitPrice > maxPrice
  ) {
    rawLimitPrice = maxPrice;
  }

  let limitPrice =
    precisionPrice(
      exchange,
      symbol,
      rawLimitPrice
    );

  /**
   * Precision rounding can move the value.
   * Re-adjust downward if necessary.
   */

  if (limitPrice >= bestBid) {
    limitPrice =
      precisionPrice(
        exchange,
        symbol,
        bestBid -
          tickSize * 2
      );
  }

  /**
   * Final price validation.
   */

  if (
    limitPrice <= 0 ||
    limitPrice < minimumValidPrice ||
    limitPrice > maximumValidPrice ||
    limitPrice >= bestBid
  ) {
    throw new Error(
      `TESTNET_LIMIT_PRICE_INVALID:${JSON.stringify({
        limitPrice,
        bestBid,
        bestAsk,
        minimumValidPrice,
        maximumValidPrice,
        referencePrice,
        tickSize,
      })}`
    );
  }

  if (
    minPrice > 0 &&
    limitPrice < minPrice
  ) {
    throw new Error(
      `TESTNET_PRICE_BELOW_MIN:${JSON.stringify({
        limitPrice,
        minPrice,
      })}`
    );
  }

  if (
    maxPrice > 0 &&
    limitPrice > maxPrice
  ) {
    throw new Error(
      `TESTNET_PRICE_ABOVE_MAX:${JSON.stringify({
        limitPrice,
        maxPrice,
      })}`
    );
  }

  /**
   * ----------------------------------------------------------
   * ORDER SIZE FILTERS
   * ----------------------------------------------------------
   */

  const marketMinimumCost =
    numberOrZero(
      market.limits?.cost?.min
    );

  const filterMinimumCost =
    numberOrZero(
      notionalFilter?.minNotional
    );

  const minimumCost = Math.max(
    marketMinimumCost,
    filterMinimumCost
  );

  const marketMinimumAmount =
    numberOrZero(
      market.limits?.amount?.min
    );

  const filterMinimumAmount =
    numberOrZero(
      lotSizeFilter?.minQty
    );

  const minimumAmount = Math.max(
    marketMinimumAmount,
    filterMinimumAmount
  );

  const maximumAmount =
    numberOrZero(
      lotSizeFilter?.maxQty
    );

  const stepSize =
    numberOrZero(
      lotSizeFilter?.stepSize
    );

  if (stepSize <= 0) {
    throw new Error(
      'TESTNET_LOT_SIZE_STEP_INVALID'
    );
  }

  /**
   * ----------------------------------------------------------
   * CALCULATE AMOUNT
   * ----------------------------------------------------------
   *
   * Start above the minimum notional.
   *
   * 10% safety margin is intentional because
   * amountToPrecision() can round downward.
   */

  const targetCost = Math.max(
    minimumCost * 1.10,
    1
  );

  let amount =
    targetCost / limitPrice;

  if (minimumAmount > 0) {
    amount = Math.max(
      amount,
      minimumAmount
    );
  }

  /**
   * Initial precision normalization.
   */

  amount = precisionAmount(
    exchange,
    symbol,
    amount
  );

  let notional =
    amount * limitPrice;

  /**
   * ----------------------------------------------------------
   * FIX MIN_NOTIONAL AFTER ROUNDING
   * ----------------------------------------------------------
   *
   * Example:
   *
   * targetCost = 5.50
   * calculated amount -> 0.000066
   * exchange precision -> 0.00006
   *
   * 0.00006 * 83199.91
   * = 4.9919946
   *
   * Binance rejects this.
   *
   * Therefore increment quantity by LOT_SIZE step
   * until actual notional >= minimumCost.
   */

  let adjustmentCount = 0;
  const maxAdjustments = 100;

  while (
    notional < minimumCost &&
    adjustmentCount < maxAdjustments
  ) {
    amount = precisionAmount(
      exchange,
      symbol,
      amount + stepSize
    );

    notional =
      amount * limitPrice;

    adjustmentCount += 1;
  }

  /**
   * ----------------------------------------------------------
   * FINAL AMOUNT VALIDATION
   * ----------------------------------------------------------
   */

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      `TESTNET_AMOUNT_INVALID:${JSON.stringify({
        amount,
        minimumAmount,
        stepSize,
      })}`
    );
  }

  if (
    amount < minimumAmount
  ) {
    throw new Error(
      `TESTNET_AMOUNT_BELOW_MIN:${JSON.stringify({
        amount,
        minimumAmount,
      })}`
    );
  }

  if (
    maximumAmount > 0 &&
    amount > maximumAmount
  ) {
    throw new Error(
      `TESTNET_AMOUNT_ABOVE_MAX:${JSON.stringify({
        amount,
        maximumAmount,
      })}`
    );
  }

  /**
   * Recalculate notional one final time.
   */

  notional =
    amount * limitPrice;

  if (
    !Number.isFinite(notional) ||
    notional < minimumCost
  ) {
    throw new Error(
      `TESTNET_MIN_NOTIONAL_AFTER_ROUNDING:${JSON.stringify({
        amount,
        limitPrice,
        notional,
        minimumCost,
        minimumAmount,
        stepSize,
        adjustmentCount,
      })}`
    );
  }

  /**
   * Never allow test order above configured cap.
   */

  if (
    notional > maxNotional
  ) {
    throw new Error(
      `TESTNET_MAX_NOTIONAL_EXCEEDED:${JSON.stringify({
        amount,
        limitPrice,
        notional,
        maxNotional,
      })}`
    );
  }

  /**
   * ----------------------------------------------------------
   * PREFLIGHT RESULT
   * ----------------------------------------------------------
   */

  console.log(
    JSON.stringify({
      step: 'order_preflight',
      status: 'PASS',
      sandbox: true,
      symbol,
      bestBid,
      bestAsk,
      referencePrice,
      avgPriceMins,
      bidMultiplierDown,
      bidMultiplierUp,
      minimumValidPrice,
      maximumValidPrice,
      tickSize,
      minimumCost,
      minimumAmount,
      stepSize,
      limitPrice,
      amount,
      notional,
      adjustmentCount,
    })
  );

  /**
   * ----------------------------------------------------------
   * CREATE LIMIT BUY
   * ----------------------------------------------------------
   */

  const order =
    await exchange.createOrder(
      symbol,
      'limit',
      'buy',
      amount,
      limitPrice,
      {
        timeInForce: 'GTC',
      }
    );

  console.log(
    JSON.stringify({
      step: 'order_created',
      status: 'PASS',
      sandbox: true,
      ...summarizeOrder(order),
      requestedPrice: limitPrice,
      requestedAmount: amount,
    })
  );

  /**
   * ----------------------------------------------------------
   * FETCH ORDER BEFORE CANCEL
   * ----------------------------------------------------------
   */

  const confirmed =
    await exchange.fetchOrder(
      order.id,
      symbol
    );

  const statusBeforeCancel =
    String(
      confirmed.status || ''
    ).toLowerCase();

  console.log(
    JSON.stringify({
      step: 'order_verified_before_cancel',
      status: statusBeforeCancel,
      sandbox: true,
      ...summarizeOrder(confirmed),
    })
  );

  /**
   * It must not have filled unexpectedly.
   */

  if (
    ['closed', 'filled'].includes(
      statusBeforeCancel
    )
  ) {
    throw new Error(
      'TESTNET_ORDER_FILLED_UNEXPECTEDLY'
    );
  }

  /**
   * ----------------------------------------------------------
   * CANCEL
   * ----------------------------------------------------------
   */

  const cancelled =
    await exchange.cancelOrder(
      order.id,
      symbol
    );

  /**
   * ----------------------------------------------------------
   * FINAL FETCH
   * ----------------------------------------------------------
   */

  const final =
    await exchange.fetchOrder(
      order.id,
      symbol
    );

  const finalStatus =
    String(
      final.status || ''
    ).toLowerCase();

  console.log(
    JSON.stringify({
      step: 'order_cancelled',
      status: finalStatus,
      sandbox: true,
      ...summarizeOrder(final),
      cancelResponseStatus:
        cancelled.status,
    })
  );

  /**
   * ----------------------------------------------------------
   * CANCEL VERIFICATION
   * ----------------------------------------------------------
   */

  if (
    ![
      'canceled',
      'cancelled',
    ].includes(finalStatus)
  ) {
    throw new Error(
      `TESTNET_CANCEL_UNCONFIRMED:${finalStatus}`
    );
  }

  /**
   * ----------------------------------------------------------
   * COMPLETE
   * ----------------------------------------------------------
   */

  console.log(
    JSON.stringify({
      step:
        'order_cancel_e2e_complete',
      status: 'PASS',
      sandbox: true,
      endpoint: selected,
      symbol,
      orderId: order.id,
    })
  );
} catch (error) {
  console.error(
    JSON.stringify({
      step: 'failed',
      status: 'FAIL',
      sandbox: true,
      endpoint: selected,
      error: String(
        error?.message || error
      ).slice(0, 500),
    })
  );

  process.exitCode = 1;
} finally {
  /**
   * Clear credentials from the CCXT instance.
   */
  exchange.apiKey = '';
  exchange.secret = '';
}