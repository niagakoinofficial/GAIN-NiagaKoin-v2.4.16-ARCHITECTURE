export type LicenseTier = 'starter_6' | 'pro_12';

export const LICENSE_PROMO_CONFIG = {
  version: 1,
  effectiveFrom: '2026-10-02T00:00:00.000Z',
  promo: {
    discountPct: 50,
    tradingFeeBonusPct: 40,
    headlinePct: 90,
  },
  referral: {
    activationPct: 20,
  },
  tiers: {
    starter_6: { normalPriceUsdt: 300, promoPriceUsdt: 150, maxActiveBots: 6, gasBonusUsdt: 60 },
    pro_12: { normalPriceUsdt: 500, promoPriceUsdt: 250, maxActiveBots: 12, gasBonusUsdt: 100 },
  },
} as const;

export function getLicenseTierConfig(tier: LicenseTier) {
  return LICENSE_PROMO_CONFIG.tiers[tier];
}

export function getReferralActivationBonus(feeUsdt: number): number {
  return Number((feeUsdt * LICENSE_PROMO_CONFIG.referral.activationPct / 100).toFixed(10));
}
