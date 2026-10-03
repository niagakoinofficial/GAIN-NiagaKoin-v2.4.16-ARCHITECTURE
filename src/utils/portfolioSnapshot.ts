export type PortfolioAssetLike = { valueUsdt?: number | null };

export function deriveAllocatedAssetUsdt(input: {
  portfolioAssets?: PortfolioAssetLike[] | null;
  totalPortfolioUsdt?: number | null;
  usdtBalance?: number | null;
  legacyAllocatedAssetUsdt?: number | null;
}): number {
  const assets = Array.isArray(input.portfolioAssets) ? input.portfolioAssets : [];
  const assetValue = assets.reduce((sum, asset) => {
    const value = Number(asset?.valueUsdt || 0);
    return Number.isFinite(value) && value > 0 ? sum + value : sum;
  }, 0);
  if (assetValue > 0) return Number(assetValue.toFixed(2));
  const total = Number(input.totalPortfolioUsdt || 0);
  const cash = Number(input.usdtBalance || 0);
  if (total > cash && Number.isFinite(total - cash)) return Number((total - cash).toFixed(2));
  return Math.max(0, Number(input.legacyAllocatedAssetUsdt || 0));
}
