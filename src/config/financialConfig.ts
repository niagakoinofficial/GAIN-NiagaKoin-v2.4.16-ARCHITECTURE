export const FINANCIAL_CONFIG = {
  version: 1,
  effectiveFrom: '2026-10-02T00:00:00.000Z',
  referral: {
    activationCashPct: 20,
    tradingFeeCashPct: 20,
    topupGasNonCashPct: 10,
  },
  gasTopupPromo: [
    { minUsdt: 500, bonusPct: 30 },
    { minUsdt: 200, bonusPct: 25 },
    { minUsdt: 100, bonusPct: 20 },
    { minUsdt: 50, bonusPct: 10 },
  ],
  withdrawal: {
    network: 'BEP-20',
    feeUsdt: 2,
    minUsdt: 10,
  },
  autoRefill: {
    defaultEnabled: false,
    thresholdUsdt: 3,
    refillUsdt: 10,
    maxDailyUsdt: 50,
  },
} as const;

export function getGasTopupBonus(amount: number): { pct: number; bonusUsdt: number } {
  const tier = FINANCIAL_CONFIG.gasTopupPromo.find((item) => amount >= item.minUsdt);
  if (!tier) return { pct: 0, bonusUsdt: 0 };
  return { pct: tier.bonusPct, bonusUsdt: Number((amount * tier.bonusPct / 100).toFixed(10)) };
}
