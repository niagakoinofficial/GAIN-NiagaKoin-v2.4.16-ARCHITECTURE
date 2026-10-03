import { createHash, randomInt } from 'node:crypto';

export interface BotPosition {
  quantity: number;
  averageEntryPrice: number;
  realizedPnl: number;
}

export interface PendingFilledOrder {
  side: 'buy' | 'sell';
  filledQty: number;
  fillPrice: number;
}

export interface ExchangeMarketLimits {
  amount?: { min?: number; max?: number };
  cost?: { min?: number; max?: number };
}

export class BotExecutionFailure extends Error {
  readonly retryable: boolean;
  readonly reasonCode: string;

  constructor(reasonCode: string, retryable: boolean) {
    super(reasonCode);
    this.name = 'BotExecutionFailure';
    this.reasonCode = reasonCode;
    this.retryable = retryable;
  }
}

export function classifyBotExecutionError(error: unknown): BotExecutionFailure {
  if (error instanceof BotExecutionFailure) return error;
  const candidate = error as { name?: string; message?: string; code?: string; status?: number; statusCode?: number; httpCode?: number };
  const errorName = String(candidate?.name || '').toLowerCase();
  const errorCode = String(candidate?.code || '').toUpperCase();
  const message = String(candidate?.message || '').toLowerCase();
  const status = Number(candidate?.status || candidate?.statusCode || candidate?.httpCode || 0);

  if (/CREDENTIAL|LIVE_TRADING|INVALID_SYMBOL|RISK_/.test(errorCode)) return new BotExecutionFailure(errorCode, false);
  if (/insufficient.?fund|balance/.test(message) || /insufficientfunds/.test(errorName)) {
    return new BotExecutionFailure('INSUFFICIENT_BALANCE', false);
  }
  if (/invalid.?symbol|bad.?symbol|market.*not.?found/.test(message) || /badsymbol/.test(errorName)) {
    return new BotExecutionFailure('INVALID_SYMBOL', false);
  }
  if (/api.?key|signature|permission|unauthorized|authentication/.test(message) || /authentication|permissiondenied/.test(errorName) || status === 401 || status === 403) {
    return new BotExecutionFailure('EXCHANGE_AUTH_OR_PERMISSION', false);
  }
  if (/notional|minimum|precision|amount.*invalid/.test(message)) {
    return new BotExecutionFailure('EXCHANGE_MARKET_LIMIT_REJECTED', false);
  }
  const retryable = status === 408 || status === 429 || status >= 500
    || /network|timeout|rate.?limit|temporarily.?unavailable|econn|socket/.test(`${errorName} ${message}`);
  return new BotExecutionFailure(retryable ? 'EXCHANGE_TRANSIENT_FAILURE' : 'EXCHANGE_ORDER_REJECTED', retryable);
}

export function getRunnerFailureState(error: unknown, failureStreak: number, pauseThreshold: number): {
  status: 'active' | 'paused' | 'error';
  failureStreak: number;
  reasonCode: string;
} {
  const failure = classifyBotExecutionError(error);
  const nextFailureStreak = failureStreak + 1;
  const mustPauseForUncertainOrder = failure.reasonCode === 'ORDER_STATUS_UNCERTAIN'
    || failure.reasonCode === 'BOT_ORDER_STATUS_UNCERTAIN';
  return {
    status: mustPauseForUncertainOrder
      ? 'paused'
      : failure.retryable
        ? (nextFailureStreak >= pauseThreshold ? 'paused' : 'active')
        : 'error',
    failureStreak: nextFailureStreak,
    reasonCode: failure.reasonCode,
  };
}

export async function retryBotExchangeAction<T>(
  operation: () => Promise<T>,
  attempts = 3,
  wait: (attempt: number) => Promise<void> = (attempt) => new Promise((resolve) => {
    setTimeout(resolve, 400 * (2 ** (attempt - 1)) + randomInt(0, 250));
  })
): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      const failure = classifyBotExecutionError(error);
      if (!failure.retryable || attempt >= attempts) throw failure;
      await wait(attempt);
    }
  }
  throw new BotExecutionFailure('EXCHANGE_TRANSIENT_FAILURE', true);
}

export function botRegistryKey(uid: string, runnerId: string): string {
  return `${uid}:${runnerId}`;
}

export function deriveBotRunnerId(botId: string, pair: string, multiCoin: boolean): string {
  return multiCoin ? `${botId}_${pair.replace('/', '').toLowerCase()}` : botId;
}

export function isBotOwnedByUid(bot: { uid: string }, uid: string): boolean {
  return bot.uid === uid;
}

export function selectOwnedBotEntries<T extends { uid: string }>(entries: Array<[string, T]>, uid: string): Array<[string, T]> {
  return entries.filter(([, bot]) => isBotOwnedByUid(bot, uid));
}

export function buildClientOrderId(uid: string, botId: string, runnerId: string, side: 'buy' | 'sell', sequence: number): string {
  return createHash('sha256').update(`${uid}:${botId}:${runnerId}:${side}:${sequence}`).digest('hex').slice(0, 32);
}

export function isFreshPrice(timestamp: number, now: number, maxAgeMs: number): boolean {
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp <= maxAgeMs;
}

export function validateMarketOrderLimits(amount: number, price: number, limits: ExchangeMarketLimits): string | null {
  const notional = amount * price;
  if (!Number.isFinite(amount) || amount <= 0 || amount < Number(limits.amount?.min || 0)) return 'ORDER_AMOUNT_BELOW_EXCHANGE_MINIMUM';
  if (limits.amount?.max && amount > limits.amount.max) return 'ORDER_AMOUNT_ABOVE_EXCHANGE_MAXIMUM';
  if (limits.cost?.min && notional < limits.cost.min) return 'ORDER_NOTIONAL_BELOW_EXCHANGE_MINIMUM';
  if (limits.cost?.max && notional > limits.cost.max) return 'ORDER_NOTIONAL_ABOVE_EXCHANGE_MAXIMUM';
  return null;
}

export function shouldExecuteTakeProfit(input: {
  quantity: number;
  gainPct: number;
  targetPct: number;
  peakPrice: number;
  currentPrice: number;
  callbackPct: number;
  useCallback: boolean;
}): boolean {
  if (input.quantity <= 0 || input.gainPct < input.targetPct) return false;
  if (!input.useCallback) return true;
  const pullbackPct = input.peakPrice > 0 ? ((input.peakPrice - input.currentPrice) / input.peakPrice) * 100 : 0;
  return pullbackPct >= input.callbackPct || input.gainPct >= input.targetPct + 0.8;
}

export function applyBuyFill(position: BotPosition, filledQty: number, fillPrice: number): BotPosition {
  const nextQty = position.quantity + filledQty;
  return {
    quantity: nextQty,
    averageEntryPrice: nextQty > 0
      ? ((position.quantity * position.averageEntryPrice) + (filledQty * fillPrice)) / nextQty
      : 0,
    realizedPnl: position.realizedPnl,
  };
}

export function applySellFill(position: BotPosition, filledQty: number, fillPrice: number): BotPosition {
  const soldQty = Math.min(position.quantity, filledQty);
  const quantity = Math.max(0, position.quantity - soldQty);
  return {
    quantity: quantity <= 1e-12 ? 0 : quantity,
    averageEntryPrice: quantity <= 1e-12 ? 0 : position.averageEntryPrice,
    realizedPnl: position.realizedPnl + (fillPrice - position.averageEntryPrice) * soldQty,
  };
}

export function applyRecoveredFill(position: BotPosition, order: PendingFilledOrder): BotPosition {
  return order.side === 'buy'
    ? applyBuyFill(position, order.filledQty, order.fillPrice)
    : applySellFill(position, order.filledQty, order.fillPrice);
}