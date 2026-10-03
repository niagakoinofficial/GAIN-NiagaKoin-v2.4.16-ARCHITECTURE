import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveAllocatedAssetUsdt } from './portfolioSnapshot';

describe('portfolio allocation source of truth', () => {
  it('prefers exchange assets', () => {
    assert.equal(deriveAllocatedAssetUsdt({ portfolioAssets: [{ valueUsdt: 3475.28 }], totalPortfolioUsdt: 100432, usdtBalance: 96956 }), 3475.28);
  });
  it('falls back to total minus cash', () => {
    assert.equal(deriveAllocatedAssetUsdt({ totalPortfolioUsdt: 100, usdtBalance: 80, legacyAllocatedAssetUsdt: 0 }), 20);
  });
  it('uses legacy only as the final fallback', () => {
    assert.equal(deriveAllocatedAssetUsdt({ totalPortfolioUsdt: 0, usdtBalance: 0, legacyAllocatedAssetUsdt: 12.5 }), 12.5);
  });
});
