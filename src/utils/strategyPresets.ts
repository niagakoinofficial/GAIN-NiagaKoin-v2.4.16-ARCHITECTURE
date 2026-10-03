import type { BotMode } from '../types';

export interface StrategyPreset {
  id: string;
  name: string;
  description: string;
  botMode: BotMode;
  averagingLayers: number;
  gridLayers: number;
  baseAmount: number;
  baseTp: number;
  averageDownPct: number;
  gridProfitPct: number;
  tpCallbackPct: number;
  layerCallbackPct: number;
  uptrendFilter: boolean;
  useMoneyManagement: boolean;
}

export const BUILTIN_STRATEGY_PRESETS: readonly StrategyPreset[] = [
  {
    id: 'balanced-dca',
    name: 'Balanced DCA',
    description: 'Averaging moderat dengan MM dan filter uptrend aktif.',
    botMode: 'Avarage Only',
    averagingLayers: 10,
    gridLayers: 20,
    baseAmount: 10,
    baseTp: 1.5,
    averageDownPct: 2,
    gridProfitPct: 1.2,
    tpCallbackPct: 0.2,
    layerCallbackPct: 0.2,
    uptrendFilter: true,
    useMoneyManagement: true,
  },
  {
    id: 'range-grid',
    name: 'Range Grid',
    description: 'Grid untuk pasar range dengan jumlah layer terkendali.',
    botMode: 'Grid Only',
    averagingLayers: 5,
    gridLayers: 20,
    baseAmount: 10,
    baseTp: 1.2,
    averageDownPct: 2,
    gridProfitPct: 1.2,
    tpCallbackPct: 0.2,
    layerCallbackPct: 0.2,
    uptrendFilter: false,
    useMoneyManagement: true,
  },
  {
    id: 'hybrid-control',
    name: 'Hybrid Control',
    description: 'Averaging + Grid konservatif dengan batas modal dan callback aktif.',
    botMode: 'Avarage+Grid',
    averagingLayers: 8,
    gridLayers: 10,
    baseAmount: 5,
    baseTp: 1.5,
    averageDownPct: 2,
    gridProfitPct: 1.2,
    tpCallbackPct: 0.2,
    layerCallbackPct: 0.2,
    uptrendFilter: true,
    useMoneyManagement: true,
  },
];

export const STRATEGY_PRESETS_STORAGE_KEY = 'gain.strategy.presets.v1';

export function sanitizeStrategyPreset(input: Partial<StrategyPreset>, fallback: StrategyPreset = BUILTIN_STRATEGY_PRESETS[0]): StrategyPreset {
  const botMode: BotMode = input.botMode === 'Grid Only' || input.botMode === 'Avarage Only' || input.botMode === 'Avarage+Grid'
    ? input.botMode
    : fallback.botMode;
  return {
    id: String(input.id || fallback.id),
    name: String(input.name || fallback.name).slice(0, 48),
    description: String(input.description || fallback.description).slice(0, 120),
    botMode,
    averagingLayers: Math.min(20, Math.max(1, Math.round(Number(input.averagingLayers ?? fallback.averagingLayers)))),
    gridLayers: Math.min(100, Math.max(1, Math.round(Number(input.gridLayers ?? fallback.gridLayers)))),
    baseAmount: Math.max(5, Number(input.baseAmount ?? fallback.baseAmount)),
    baseTp: Math.max(0.1, Number(input.baseTp ?? fallback.baseTp)),
    averageDownPct: Math.max(0.1, Number(input.averageDownPct ?? fallback.averageDownPct)),
    gridProfitPct: Math.max(0.1, Number(input.gridProfitPct ?? fallback.gridProfitPct)),
    tpCallbackPct: Math.max(0, Number(input.tpCallbackPct ?? fallback.tpCallbackPct)),
    layerCallbackPct: Math.max(0, Number(input.layerCallbackPct ?? fallback.layerCallbackPct)),
    uptrendFilter: Boolean(input.uptrendFilter ?? fallback.uptrendFilter),
    useMoneyManagement: Boolean(input.useMoneyManagement ?? fallback.useMoneyManagement),
  };
}

export function loadCustomStrategyPresets(storage: Storage | undefined): StrategyPreset[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STRATEGY_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => sanitizeStrategyPreset(item as Partial<StrategyPreset>)).filter((item) => !BUILTIN_STRATEGY_PRESETS.some((preset) => preset.id === item.id));
  } catch {
    return [];
  }
}

export function saveCustomStrategyPreset(storage: Storage | undefined, preset: StrategyPreset): StrategyPreset[] {
  if (!storage) return [];
  const existing = loadCustomStrategyPresets(storage);
  const next = [...existing.filter((item) => item.id !== preset.id), sanitizeStrategyPreset(preset)];
  storage.setItem(STRATEGY_PRESETS_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function deleteCustomStrategyPreset(storage: Storage | undefined, id: string): StrategyPreset[] {
  if (!storage) return [];
  const next = loadCustomStrategyPresets(storage).filter((item) => item.id !== id);
  storage.setItem(STRATEGY_PRESETS_STORAGE_KEY, JSON.stringify(next));
  return next;
}
