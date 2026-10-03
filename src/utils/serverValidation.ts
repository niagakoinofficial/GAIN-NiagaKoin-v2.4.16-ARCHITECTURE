export type FinancialAction = 'deposit' | 'withdraw' | 'transfer' | 'referral' | 'trade' | 'profile';

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateFinancialAction(action: FinancialAction, payload: Record<string, any>): ValidationResult {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, reason: 'Payload tidak valid' };
  }

  if (action === 'deposit' || action === 'withdraw' || action === 'transfer' || action === 'referral' || action === 'trade') {
    const amount = Number(payload.amount ?? payload.value ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, reason: 'Nominal harus angka positif' };
    }
  }

  const balanceKeys = [
    'amount', 'value', 'liquidBalance', 'availableCash', 'gasReserve',
    'totalInflow', 'totalOutflow', 'referralYield', 'withdrawableTradingYield',
    'allocatedAssetUsdt', 'teamTurnoverUsdt', 'totalReferralBonusUsdt',
    'activationFeeUsdt', 'tradingBonusUsdt', 'nonCashGasBonus', 'bonusAmount'
  ];

  for (const key of balanceKeys) {
    if (payload[key] === undefined || payload[key] === null || payload[key] === '') continue;
    const numericValue = Number(payload[key]);
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      return { ok: false, reason: `Field ${key} harus bernilai angka non-negatif` };
    }
  }

  if (payload.userId && typeof payload.userId !== 'string') {
    return { ok: false, reason: 'userId harus string' };
  }

  if (payload.email && typeof payload.email !== 'string') {
    return { ok: false, reason: 'email harus string' };
  }

  if (payload.role && !['user', 'admin', 'support', 'super_admin'].includes(String(payload.role))) {
    return { ok: false, reason: 'Role tidak valid' };
  }

  return { ok: true };
}
