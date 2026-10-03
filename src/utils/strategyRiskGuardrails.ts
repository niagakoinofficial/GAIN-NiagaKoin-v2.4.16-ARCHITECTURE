export type RiskSeverity = 'warning' | 'blocker';

export interface StrategyRiskStep {
  amountUsdt: number;
  dropPct?: number;
}

export interface StrategyRiskInput {
  botMode: 'Avarage Only' | 'Grid Only' | 'Avarage+Grid';
  averagingLayers: number;
  gridLayers: number;
  baseAmount: number;
  baseTp: number;
  averageDownPct: number;
  gridProfitPct: number;
  tpCallbackPct: number;
  layerCallbackPct: number;
  pairedCoinsCount: number;
  availableBalanceUsdt: number;
  useMoneyManagement: boolean;
  steps: StrategyRiskStep[];
  minPrice?: number;
  maxPrice?: number;
  marketPrice?: number;
  currentUserExposureUsdt?: number;
}

export interface StrategyRiskRule {
  code: string;
  severity: RiskSeverity;
  message: string;
  value?: number;
  limit?: number;
}

export interface StrategyRiskAssessment {
  status: 'PASS' | 'WARNING' | 'BLOCKED';
  blockers: StrategyRiskRule[];
  warnings: StrategyRiskRule[];
  effectiveLayerCount: number;
  singleCoinCapitalUsdt: number;
  totalProjectedCapitalUsdt: number;
  exposureRatioPct: number;
  maxStepAmountUsdt: number;
  maxCoveragePct: number;
}

export const STRATEGY_RISK_LIMITS = {
  maxOrderUsdt: 50,
  maxBotExposureUsdt: 250,
  maxUserExposureUsdt: 500,
  hardLayerCount: 120,
  warnLayerCount: 80,
  warnPairCount: 10,
  maxPairCount: 20,
  warnCoveragePct: 80,
  hardCoveragePct: 95,
  warnAverageDownPct: 15,
  hardAverageDownPct: 25,
  warnTpPct: 10,
  hardTpPct: 20,
  warnGridTpPct: 10,
  hardGridTpPct: 20,
  warnCallbackPct: 3,
  hardCallbackPct: 5,
  warnExposureRatioPct: 80,
};

export function estimateDcaCapital(baseAmount: number, layers: number, volumeMultiplier = 1.3): number {
  let total = 0;
  let amount = baseAmount;
  for (let i = 0; i < Math.max(0, layers); i += 1) {
    total += amount;
    amount *= volumeMultiplier;
  }
  return total;
}

export function assessStrategyRisk(input: StrategyRiskInput): StrategyRiskAssessment {
  const blockers: StrategyRiskRule[] = [];
  const warnings: StrategyRiskRule[] = [];
  const avgLayers = Math.max(0, Math.round(Number(input.averagingLayers) || 0));
  const gridLayers = Math.max(0, Math.round(Number(input.gridLayers) || 0));
  const effectiveLayerCount = input.botMode === 'Avarage Only' ? avgLayers : input.botMode === 'Grid Only' ? gridLayers : avgLayers + gridLayers;
  const stepsCapital = input.steps.reduce((sum, step) => sum + Math.max(0, Number(step.amountUsdt) || 0), 0);
  const estimatedDca = estimateDcaCapital(Math.max(0, Number(input.baseAmount) || 0), avgLayers);
  const estimatedGrid = Math.max(0, gridLayers) * Math.max(0, Number(input.baseAmount) || 0);
  const singleCoinCapitalUsdt = Math.max(stepsCapital, input.steps.length > 0 ? stepsCapital : (input.botMode === 'Avarage Only' ? estimatedDca : input.botMode === 'Grid Only' ? estimatedGrid : estimatedDca + estimatedGrid));
  const totalProjectedCapitalUsdt = singleCoinCapitalUsdt * Math.max(1, Math.round(Number(input.pairedCoinsCount) || 1));
  const available = Math.max(0, Number(input.availableBalanceUsdt) || 0);
  const exposureRatioPct = available > 0 ? (totalProjectedCapitalUsdt / available) * 100 : (totalProjectedCapitalUsdt > 0 ? Infinity : 0);
  const maxStepAmountUsdt = input.steps.reduce((max, step) => Math.max(max, Number(step.amountUsdt) || 0), 0);
  const maxCoveragePct = input.steps.reduce((sum, step) => sum + Math.max(0, Number(step.dropPct) || 0), 0);

  const block = (code: string, message: string, value?: number, limit?: number) => blockers.push({ code, severity: 'blocker', message, value, limit });
  const warn = (code: string, message: string, value?: number, limit?: number) => warnings.push({ code, severity: 'warning', message, value, limit });

  if (!Number.isFinite(input.baseAmount) || input.baseAmount <= 0) block('BASE_AMOUNT_INVALID', 'Modal per order harus lebih dari 0 USDT.');
  else if (input.baseAmount > STRATEGY_RISK_LIMITS.maxOrderUsdt) block('BASE_AMOUNT_LIMIT', `Modal per order melebihi batas ${STRATEGY_RISK_LIMITS.maxOrderUsdt} USDT.`, input.baseAmount, STRATEGY_RISK_LIMITS.maxOrderUsdt);

  if (input.pairedCoinsCount < 1 || input.pairedCoinsCount > STRATEGY_RISK_LIMITS.maxPairCount) block('PAIR_COUNT_LIMIT', `Jumlah pairing harus 1–${STRATEGY_RISK_LIMITS.maxPairCount}.`, input.pairedCoinsCount, STRATEGY_RISK_LIMITS.maxPairCount);
  else if (input.pairedCoinsCount > STRATEGY_RISK_LIMITS.warnPairCount) warn('PAIR_COUNT_HIGH', 'Jumlah pairing tinggi; total exposure bertambah linear terhadap jumlah koin.', input.pairedCoinsCount, STRATEGY_RISK_LIMITS.warnPairCount);

  if (effectiveLayerCount < 1 || effectiveLayerCount > STRATEGY_RISK_LIMITS.hardLayerCount) block('LAYER_COUNT_LIMIT', `Total layer harus 1–${STRATEGY_RISK_LIMITS.hardLayerCount}.`, effectiveLayerCount, STRATEGY_RISK_LIMITS.hardLayerCount);
  else if (effectiveLayerCount > STRATEGY_RISK_LIMITS.warnLayerCount) warn('LAYER_COUNT_HIGH', 'Jumlah layer tinggi; kebutuhan modal dan waktu recovery meningkat.', effectiveLayerCount, STRATEGY_RISK_LIMITS.warnLayerCount);

  // Money Management ON enforces projected-capital/exposure guardrails before deployment.
  // Money Management OFF intentionally does not turn the strategy into a different
  // strategy: it simply lets the configured layer count run without pre-reserving
  // the whole projected capital. Runtime still enforces order-size and exchange
  // execution safety, and the exchange remains the final available-balance gate.
  if (input.useMoneyManagement) {
    if (singleCoinCapitalUsdt > STRATEGY_RISK_LIMITS.maxBotExposureUsdt) block('BOT_EXPOSURE_LIMIT', `Modal terproyeksi per koin melebihi batas bot ${STRATEGY_RISK_LIMITS.maxBotExposureUsdt} USDT.`, singleCoinCapitalUsdt, STRATEGY_RISK_LIMITS.maxBotExposureUsdt);
    if (totalProjectedCapitalUsdt > STRATEGY_RISK_LIMITS.maxUserExposureUsdt) block('USER_EXPOSURE_LIMIT', `Total modal terproyeksi melebihi batas exposure pengguna ${STRATEGY_RISK_LIMITS.maxUserExposureUsdt} USDT.`, totalProjectedCapitalUsdt, STRATEGY_RISK_LIMITS.maxUserExposureUsdt);
    const currentExposure = Math.max(0, Number(input.currentUserExposureUsdt) || 0);
    if (currentExposure + totalProjectedCapitalUsdt > STRATEGY_RISK_LIMITS.maxUserExposureUsdt) block('USER_EXPOSURE_PLUS_EXISTING', 'Exposure bot baru + exposure berjalan melebihi batas pengguna.', currentExposure + totalProjectedCapitalUsdt, STRATEGY_RISK_LIMITS.maxUserExposureUsdt);

    if (totalProjectedCapitalUsdt > available) block('CAPITAL_INSUFFICIENT', 'Modal tersedia tidak cukup untuk seluruh layer dan pairing yang dipilih.', totalProjectedCapitalUsdt, available);
    else if (available > 0 && exposureRatioPct > STRATEGY_RISK_LIMITS.warnExposureRatioPct) warn('CAPITAL_UTILIZATION_HIGH', 'Utilisasi modal tinggi; sisakan buffer untuk fee, slippage, dan recovery.', exposureRatioPct, STRATEGY_RISK_LIMITS.warnExposureRatioPct);
    if (available <= 0 && totalProjectedCapitalUsdt > 0) block('CAPITAL_UNAVAILABLE', 'Saldo modal yang dapat digunakan tidak tersedia.');
  } else if (singleCoinCapitalUsdt > STRATEGY_RISK_LIMITS.maxBotExposureUsdt || totalProjectedCapitalUsdt > STRATEGY_RISK_LIMITS.maxUserExposureUsdt) {
    warn('MM_OFF_EXPOSURE_DEFERRED', 'Money Management OFF: batas modal terproyeksi tidak memblokir deploy. Layer akan berjalan sesuai konfigurasi dan dibatasi saldo aktual exchange/order limits.', totalProjectedCapitalUsdt, STRATEGY_RISK_LIMITS.maxUserExposureUsdt);
  }

  if (input.averageDownPct > STRATEGY_RISK_LIMITS.hardAverageDownPct) block('AVERAGE_DOWN_EXTREME', 'Average-down terlalu agresif untuk guardrail risiko.', input.averageDownPct, STRATEGY_RISK_LIMITS.hardAverageDownPct);
  else if (input.averageDownPct > STRATEGY_RISK_LIMITS.warnAverageDownPct) warn('AVERAGE_DOWN_HIGH', 'Average-down tinggi; drawdown potensial meningkat.', input.averageDownPct, STRATEGY_RISK_LIMITS.warnAverageDownPct);
  if (input.baseTp > STRATEGY_RISK_LIMITS.hardTpPct) block('TP_EXTREME', 'Target TP terlalu ekstrem.', input.baseTp, STRATEGY_RISK_LIMITS.hardTpPct);
  else if (input.baseTp > STRATEGY_RISK_LIMITS.warnTpPct) warn('TP_HIGH', 'Target TP tinggi; siklus dapat menunggu lebih lama.', input.baseTp, STRATEGY_RISK_LIMITS.warnTpPct);
  if (input.gridProfitPct > STRATEGY_RISK_LIMITS.hardGridTpPct) block('GRID_TP_EXTREME', 'Target profit grid terlalu ekstrem.', input.gridProfitPct, STRATEGY_RISK_LIMITS.hardGridTpPct);
  else if (input.gridProfitPct > STRATEGY_RISK_LIMITS.warnGridTpPct) warn('GRID_TP_HIGH', 'Target profit grid tinggi; level dapat tertahan lebih lama.', input.gridProfitPct, STRATEGY_RISK_LIMITS.warnGridTpPct);
  if (input.tpCallbackPct > STRATEGY_RISK_LIMITS.hardCallbackPct || input.layerCallbackPct > STRATEGY_RISK_LIMITS.hardCallbackPct) block('CALLBACK_EXTREME', `Callback tidak boleh melebihi ${STRATEGY_RISK_LIMITS.hardCallbackPct}%.`);
  else if (input.tpCallbackPct > STRATEGY_RISK_LIMITS.warnCallbackPct || input.layerCallbackPct > STRATEGY_RISK_LIMITS.warnCallbackPct) warn('CALLBACK_HIGH', 'Callback tinggi; profit lock/re-entry dapat menjadi lebih sensitif.', Math.max(input.tpCallbackPct, input.layerCallbackPct), STRATEGY_RISK_LIMITS.warnCallbackPct);

  // Coverage and generated-step sizing are part of the Money Management
  // budget model. When MM is OFF, the user explicitly opts out of these
  // platform-level capital constraints; the configured layer plan remains
  // executable and the exchange's own order filters remain the final gate.
  if (input.useMoneyManagement) {
    if (maxCoveragePct > STRATEGY_RISK_LIMITS.hardCoveragePct) block('COVERAGE_EXTREME', 'Coverage downside total terlalu lebar.', maxCoveragePct, STRATEGY_RISK_LIMITS.hardCoveragePct);
    else if (maxCoveragePct > STRATEGY_RISK_LIMITS.warnCoveragePct) warn('COVERAGE_HIGH', 'Coverage downside lebar; recovery time dan modal risk meningkat.', maxCoveragePct, STRATEGY_RISK_LIMITS.warnCoveragePct);

    if (maxStepAmountUsdt > STRATEGY_RISK_LIMITS.maxOrderUsdt) block('STEP_ORDER_LIMIT', 'Salah satu layer melebihi batas modal per order.', maxStepAmountUsdt, STRATEGY_RISK_LIMITS.maxOrderUsdt);
  } else {
    // Keep the values visible for transparency, but do not convert them into
    // deployment blockers when MM is intentionally disabled.
  }
  if (input.minPrice && input.maxPrice && input.maxPrice <= input.minPrice) block('PRICE_BOUND_INVALID', 'Max price harus lebih tinggi dari min price.');
  if (input.marketPrice && input.maxPrice && input.marketPrice > input.maxPrice) warn('MARKET_ABOVE_BOUND', 'Harga pasar saat ini di atas max price; bot belum berada di zona eksekusi.');
  if (input.marketPrice && input.minPrice && input.marketPrice < input.minPrice) warn('MARKET_BELOW_BOUND', 'Harga pasar saat ini di bawah min price; bot belum berada di zona eksekusi.');

  return {
    status: blockers.length > 0 ? 'BLOCKED' : warnings.length > 0 ? 'WARNING' : 'PASS',
    blockers, warnings, effectiveLayerCount, singleCoinCapitalUsdt, totalProjectedCapitalUsdt, exposureRatioPct, maxStepAmountUsdt, maxCoveragePct,
  };
}
