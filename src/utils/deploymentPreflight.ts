import type { StrategyRiskAssessment } from './strategyRiskGuardrails';

export type DeploymentPreflightStatus = 'READY' | 'WARNING' | 'BLOCKED';

export interface DeploymentPreflightInput {
  botName: string;
  executionMode: 'testnet' | 'live';
  pairedCoinsCount: number;
  marketPrice: number;
  minPrice?: number;
  maxPrice?: number;
  isTestnetConnected: boolean;
  isLiveConnected: boolean;
  strategyRisk: StrategyRiskAssessment;
}

export interface DeploymentPreflightCheck {
  code: string;
  label: string;
  status: 'PASS' | 'WARNING' | 'BLOCKED';
  detail: string;
}

export interface DeploymentPreflightAssessment {
  status: DeploymentPreflightStatus;
  checks: DeploymentPreflightCheck[];
}

export function assessDeploymentPreflight(input: DeploymentPreflightInput): DeploymentPreflightAssessment {
  const checks: DeploymentPreflightCheck[] = [];
  const add = (check: DeploymentPreflightCheck) => checks.push(check);

  add({
    code: 'BOT_NAME',
    label: 'Nama bot',
    status: input.botName.trim() ? 'PASS' : 'BLOCKED',
    detail: input.botName.trim() ? 'Nama bot siap disimpan.' : 'Nama bot wajib diisi.',
  });

  add({
    code: 'PAIRING',
    label: 'Pairing',
    status: input.pairedCoinsCount > 0 ? 'PASS' : 'BLOCKED',
    detail: input.pairedCoinsCount > 0 ? `${input.pairedCoinsCount} pair dipilih.` : 'Minimal 1 pair harus dipilih.',
  });

  const exchangeConnected = input.executionMode === 'testnet' ? input.isTestnetConnected : input.isLiveConnected;
  add({
    code: 'EXCHANGE_CONNECTION',
    label: input.executionMode === 'testnet' ? 'Exchange Testnet' : 'Exchange Live',
    status: exchangeConnected ? 'PASS' : 'BLOCKED',
    detail: exchangeConnected
      ? `Koneksi ${input.executionMode === 'testnet' ? 'Testnet/Sandbox' : 'Live'} tersedia.`
      : `Hubungkan exchange dalam mode ${input.executionMode === 'testnet' ? 'Testnet/Sandbox' : 'Live'} terlebih dahulu.`,
  });

  add({
    code: 'MARKET_PRICE',
    label: 'Harga market',
    status: Number.isFinite(input.marketPrice) && input.marketPrice > 0 ? 'PASS' : 'BLOCKED',
    detail: Number.isFinite(input.marketPrice) && input.marketPrice > 0 ? 'Harga market tersedia.' : 'Harga market valid belum tersedia.',
  });

  const hasBounds = (input.minPrice || 0) > 0 || (input.maxPrice || 0) > 0;
  const boundsValid = !hasBounds || ((input.minPrice || 0) <= 0 || (input.maxPrice || 0) <= 0 || (input.maxPrice || 0) > (input.minPrice || 0));
  add({
    code: 'PRICE_BOUNDS',
    label: 'Price boundary',
    status: boundsValid ? 'PASS' : 'BLOCKED',
    detail: boundsValid ? 'Batas harga konsisten.' : 'Max price harus lebih tinggi dari min price.',
  });

  add({
    code: 'RISK',
    label: 'Strategy Risk Guardrails',
    status: input.strategyRisk.status === 'BLOCKED' ? 'BLOCKED' : input.strategyRisk.status === 'WARNING' ? 'WARNING' : 'PASS',
    detail: input.strategyRisk.status === 'BLOCKED'
      ? `${input.strategyRisk.blockers.length} blocker harus diperbaiki.`
      : input.strategyRisk.status === 'WARNING'
        ? `${input.strategyRisk.warnings.length} warning konfigurasi.`
        : 'Tidak ada blocker guardrail.',
  });

  const blocked = checks.some((check) => check.status === 'BLOCKED');
  const warning = checks.some((check) => check.status === 'WARNING');
  return {
    status: blocked ? 'BLOCKED' : warning ? 'WARNING' : 'READY',
    checks,
  };
}
