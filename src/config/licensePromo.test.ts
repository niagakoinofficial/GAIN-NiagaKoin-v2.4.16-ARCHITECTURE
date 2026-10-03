import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getLicenseTierConfig, getReferralActivationBonus, LICENSE_PROMO_CONFIG } from './licensePromo';

describe('license promo config', () => {
  it('keeps the 50% + 40% campaign semantics', () => {
    assert.equal(LICENSE_PROMO_CONFIG.promo.discountPct, 50);
    assert.equal(LICENSE_PROMO_CONFIG.promo.tradingFeeBonusPct, 40);
    assert.equal(LICENSE_PROMO_CONFIG.promo.headlinePct, 90);
  });
  it('derives tier values from one source of truth', () => {
    assert.deepEqual({ ...getLicenseTierConfig('starter_6') }, { ...getLicenseTierConfig('starter_6'), normalPriceUsdt: 300, promoPriceUsdt: 150, maxActiveBots: 6, gasBonusUsdt: 60 });
    assert.deepEqual({ ...getLicenseTierConfig('pro_12') }, { ...getLicenseTierConfig('pro_12'), normalPriceUsdt: 500, promoPriceUsdt: 250, maxActiveBots: 12, gasBonusUsdt: 100 });
  });
  it('derives sponsor activation bonus from the configured percentage', () => {
    assert.equal(getReferralActivationBonus(150), 30);
    assert.equal(getReferralActivationBonus(250), 50);
  });
});
