import { useState, useEffect, useMemo } from 'react';
import { BUILTIN_STRATEGY_PRESETS, deleteCustomStrategyPreset, loadCustomStrategyPresets, saveCustomStrategyPreset, type StrategyPreset } from '../../utils/strategyPresets';
import { assessStrategyRisk, STRATEGY_RISK_LIMITS, type StrategyRiskAssessment } from '../../utils/strategyRiskGuardrails';
import { assessDeploymentPreflight, type DeploymentPreflightAssessment } from '../../utils/deploymentPreflight';
import { AveragingStep, BotMode, TradingPosition } from '../../types';
import { CoinLogo } from '../common/CoinLogo';
import { SUPPORTED_COINS } from '../../data/appData';
import {
  X,
  Sparkles,
  SlidersHorizontal,
  Layers,
  Zap,
  ArrowDownRight,
  Split,
  Maximize2,
  Play,
  CheckCircle2,
  Sliders,
  Search,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  AlertTriangle,
  Info,
  DollarSign,
  Bot,
  Check,
  Plus,
  Coins
} from 'lucide-react';

interface AveragingMatrixModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedPair?: string;
  selectedPairs?: string[];
  initialMode?: BotMode;
  initialLayers?: number;
  initialBotId?: string | null;
  initialBotName?: string;
  isNewBot?: boolean;
  initialMinPrice?: number | null;
  initialMaxPrice?: number | null;
  initialInitialEntryAmount?: number;
  initialTimeframe?: string;
  currentMarketPrice?: number;
  currentPrices?: Record<string, number>;
  existingBotsForCoin?: TradingPosition[];
  allPositions?: TradingPosition[];
  availableBalance?: number;
  isTestnetConnected?: boolean;
  isLiveConnected?: boolean;
  onOpenSimulation?: () => void;
  onDeployBot?: (config: {
    botId?: string;
    botName?: string;
    isNewBot?: boolean;
    executionMode: 'testnet' | 'live';
    pair: string;
    pairedCoins: string[];
    botMode: BotMode;
    layerCount: number;
    baseAmount: number;
    baseTp: number;
    useMoneyManagement: boolean;
    averageDownPct: number;
    timeframe?: string;
    averagingLayers: number;
    gridLayers: number;
    uptrendFilter?: boolean;
    tpCallbackPct?: number;
    layerCallbackPct?: number;
    gridTp?: number;
    minPrice?: number;
    maxPrice?: number;
    steps: AveragingStep[];
  }) => void;
}

export function AveragingMatrixModal({
  isOpen,
  onClose,
  selectedPair = 'BTC/USDT',
  selectedPairs,
  initialMode = 'Avarage+Grid',
  initialLayers = 10,
  initialBotId = null,
  initialBotName = '',
  isNewBot = false,
  initialMinPrice = null,
  initialMaxPrice = null,
  initialTimeframe = '5m',
  currentMarketPrice,
  currentPrices = {},
  existingBotsForCoin = [],
  allPositions = [],
  availableBalance = 70.0,
  isTestnetConnected = false,
  isLiveConnected = false,
  onOpenSimulation,
  onDeployBot,
}: AveragingMatrixModalProps) {
  // =========================================================================
  // 1. BOT SETTINGS FIRST (Bot Identity & General Strategy)
  // =========================================================================
  const [activeBotId, setActiveBotId] = useState<string | null>(initialBotId || null);
  const [isCreatingNewBot, setIsCreatingNewBot] = useState<boolean>(isNewBot ?? (!initialBotId));
  const [botNameInput, setBotNameInput] = useState<string>(initialBotName || '');
  const [botMode, setBotMode] = useState<BotMode>(initialMode);
  const [executionMode, setExecutionMode] = useState<'testnet' | 'live'>('testnet');
  const TIMEFRAME_OPTIONS = [
    { value: '3m', label: '3 menit' },
    { value: '5m', label: '5 menit' },
    { value: '10m', label: '10 menit' },
    { value: '15m', label: '15 menit' },
    { value: '30m', label: '30 menit' },
    { value: '1h', label: '1 jam' },
  ] as const;
  const [timeframe, setTimeframe] = useState<string>(initialTimeframe || '5m');

  // =========================================================================
  // 2. MULTI-COIN PAIRING SELECTION (1 Bot Bisa Dengan Banyak Koin)
  // =========================================================================
  const [pairedCoins, setPairedCoins] = useState<string[]>(() => {
    if (selectedPairs && selectedPairs.length > 0) return selectedPairs;
    if (selectedPair) return [selectedPair];
    return ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];
  });

  // Active preview pair for calculation & formula table
  const [previewPair, setPreviewPair] = useState<string>(selectedPair || 'BTC/USDT');

  // Min & Max Price Boundaries (Floor & Ceiling protection)
  const [minPrice, setMinPrice] = useState<string>('0.00000000');
  const [maxPrice, setMaxPrice] = useState<string>('0.00000000');

  // Money Management Toggle (ON / OFF)
  const [useMoneyManagement, setUseMoneyManagement] = useState<boolean>(true);

  // Layers: start at the smallest safe defaults; user can increase manually.
  const DEFAULT_AVERAGING_LAYERS = 1;
  const DEFAULT_GRID_LAYERS = 5;
  const [averagingLayers, setAveragingLayers] = useState<number>(DEFAULT_AVERAGING_LAYERS);
  const [gridLayers, setGridLayers] = useState<number>(DEFAULT_GRID_LAYERS);

  // Strategy Conditions & Callbacks
  const [uptrendFilter, setUptrendFilter] = useState<boolean>(true);
  const [tpCallbackPct, setTpCallbackPct] = useState<string>('0.20');
  const [layerCallbackPct, setLayerCallbackPct] = useState<string>('0.20');
  const [averageDownPct, setAverageDownPct] = useState<string>('2.00');
  const [baseAmount, setBaseAmount] = useState('10.00');
  const [baseTp, setBaseTp] = useState('1.50');
  const [gridProfitPct, setGridProfitPct] = useState('1.20');
  const [savedToast, setSavedToast] = useState(false);
  const [filterQuery, setFilterQuery] = useState('');
  const [steps, setSteps] = useState<AveragingStep[]>([]);
  const [mobileTab, setMobileTab] = useState<'bot_config' | 'coin_pairing' | 'matrix_table'>('bot_config');
  const [customPresets, setCustomPresets] = useState<StrategyPreset[]>(() => loadCustomStrategyPresets(typeof window !== 'undefined' ? window.localStorage : undefined));
  const [presetToast, setPresetToast] = useState('');

  // Initialize or re-sync when modal opens
  useEffect(() => {
    if (isOpen) {
      setExecutionMode(isTestnetConnected ? 'testnet' : (isLiveConnected ? 'live' : 'testnet'));
      // Setup paired coins
      if (selectedPairs && selectedPairs.length > 0) {
        setPairedCoins(selectedPairs);
        setPreviewPair(selectedPairs[0]);
      } else if (selectedPair) {
        setPairedCoins([selectedPair]);
        setPreviewPair(selectedPair);
      }

      setActiveBotId(initialBotId || null);

      if (initialBotId) {
        setIsCreatingNewBot(isNewBot ?? false);
        setBotNameInput(initialBotName || 'Bot Algoritmik GAIN');
      } else {
        setIsCreatingNewBot(true);
        const randomNum = Math.floor(Math.random() * 900 + 100);
        setBotNameInput(initialBotName || `GAIN Matrix Bot #${randomNum} (${initialMode})`);
      }

      if (initialMinPrice != null && initialMinPrice >= 0) {
        setMinPrice(initialMinPrice.toFixed(8));
      } else {
        setMinPrice('0.00000000');
      }

      if (initialMaxPrice != null && initialMaxPrice > 0) {
        setMaxPrice(initialMaxPrice.toFixed(8));
      } else if (selectedPair && selectedPair.includes('SOL')) {
        setMaxPrice('115.00000000');
      } else {
        setMaxPrice('0.00000000');
      }

      setBotMode(initialMode);
      setTimeframe(['3m', '5m', '10m', '15m', '30m', '1h'].includes(initialTimeframe || '') ? String(initialTimeframe) : '5m');
    }
  }, [isOpen, selectedPair, selectedPairs, initialBotId, initialBotName, isNewBot, initialMinPrice, initialMaxPrice, initialMode, initialTimeframe]);

  // Calculate total layer count depending on mode
  const effectiveLayerCount = useMemo(() => {
    if (botMode === 'Avarage Only') return Math.min(20, Math.max(1, averagingLayers));
    if (botMode === 'Grid Only') return Math.min(100, Math.max(1, gridLayers));
    return Math.min(120, averagingLayers + gridLayers);
  }, [botMode, averagingLayers, gridLayers]);

  // Market price for preview pair
  const coinSymbol = (previewPair || 'BTC').split('/')[0];
  const marketPrice = useMemo(() => {
    const pairPrice = Number(currentPrices[previewPair]);
    if (Number.isFinite(pairPrice) && pairPrice > 0) return pairPrice;
    if (typeof currentMarketPrice === 'number' && currentMarketPrice > 0 && previewPair === selectedPair) return currentMarketPrice;
    const fromSupported = SUPPORTED_COINS.find((c) => c.coin === coinSymbol || c.pair === previewPair)?.price;
    return typeof fromSupported === 'number' && fromSupported > 0 ? fromSupported : 0;
  }, [currentMarketPrice, currentPrices, previewPair, selectedPair, coinSymbol]);

  const minPriceNum = parseFloat(minPrice) || 0;
  const maxPriceNum = parseFloat(maxPrice) || 0;
  const isAboveMax = maxPriceNum > 0 && marketPrice > maxPriceNum;
  const isBelowMin = minPriceNum > 0 && marketPrice < minPriceNum;

  // Formula generator
  const generateSteps = (
    mode: BotMode,
    avgCount: number,
    grdCount: number,
    base: number,
    avgDown: number,
    tp: number,
    gridTp: number,
    tpCb: number = 0.20,
    layerCb: number = 0.20
  ): AveragingStep[] => {
    const generated: AveragingStep[] = [];

    if (mode === 'Avarage Only') {
      const totalL = Math.min(20, Math.max(1, avgCount));
      for (let i = 1; i <= totalL; i++) {
        const drop = i === 1 ? avgDown : (i <= 5 ? avgDown : avgDown + (i - 5) * 0.2);
        const mult = i === 1 ? 1.0 : parseFloat((1.0 + (i - 1) * 0.15).toFixed(2));
        const amt = parseFloat((base * mult).toFixed(2));
        generated.push({
          step: i,
          dropPct: parseFloat(drop.toFixed(2)),
          multiplier: mult,
          amountUsdt: amt,
          tpPct: tp,
          status: i === 1 ? 'Filled' : i <= 3 ? 'In Range' : 'Queued',
          layerCallbackPct: layerCb,
          tpCallbackPct: tpCb,
          isGridLayer: false,
        });
      }
    } else if (mode === 'Grid Only') {
      const totalL = Math.min(100, Math.max(1, grdCount));
      for (let i = 1; i <= totalL; i++) {
        const drop = parseFloat((0.8 + (i * 0.05)).toFixed(2));
        const mult = 1.0;
        const amt = base;
        const gridProfitUsdt = parseFloat((amt * (gridTp / 100)).toFixed(2));
        generated.push({
          step: i,
          dropPct: drop,
          multiplier: mult,
          amountUsdt: amt,
          tpPct: gridTp,
          status: i === 1 ? 'Filled' : i <= 5 ? 'In Range' : 'Queued',
          subGridProfitUsdt: gridProfitUsdt,
          isGridLayer: true,
        });
      }
    } else {
      // Avarage+Grid: 20L Avg + 100L Grid = 120L
      const avgPart = Math.min(20, Math.max(1, avgCount));
      const gridPart = Math.min(100, Math.max(1, grdCount));

      for (let i = 1; i <= avgPart; i++) {
        const drop = i === 1 ? avgDown : (i <= 5 ? avgDown : avgDown + (i - 5) * 0.15);
        const mult = i === 1 ? 1.0 : parseFloat((1.0 + (i - 1) * 0.12).toFixed(2));
        const amt = parseFloat((base * mult).toFixed(2));
        generated.push({
          step: i,
          dropPct: parseFloat(drop.toFixed(2)),
          multiplier: mult,
          amountUsdt: amt,
          tpPct: tp,
          status: i === 1 ? 'Filled' : i <= 3 ? 'In Range' : 'Queued',
          layerCallbackPct: layerCb,
          tpCallbackPct: tpCb,
          isGridLayer: false,
        });
      }

      for (let j = 1; j <= gridPart; j++) {
        const stepNum = avgPart + j;
        const drop = parseFloat((0.9 + (j * 0.04)).toFixed(2));
        const amt = base;
        const gridProfitUsdt = parseFloat((amt * (gridTp / 100)).toFixed(2));
        generated.push({
          step: stepNum,
          dropPct: drop,
          multiplier: 1.0,
          amountUsdt: amt,
          tpPct: gridTp,
          status: 'Queued',
          subGridProfitUsdt: gridProfitUsdt,
          isGridLayer: true,
        });
      }
    }

    return generated;
  };

  // Initialize steps
  useEffect(() => {
    if (isOpen) {
      const bNum = parseFloat(baseAmount) || 10;
      const avgDNum = parseFloat(averageDownPct) || 2.0;
      const tpNum = parseFloat(baseTp) || 1.5;
      const gridTpNum = parseFloat(gridProfitPct) || 1.2;
      const tpCb = parseFloat(tpCallbackPct) || 0.2;
      const layerCb = parseFloat(layerCallbackPct) || 0.2;

      const creatingNewBot = isNewBot ?? !initialBotId;
      let initAvg = creatingNewBot ? DEFAULT_AVERAGING_LAYERS : Math.min(20, Math.max(1, averagingLayers || DEFAULT_AVERAGING_LAYERS));
      let initGrid = creatingNewBot ? DEFAULT_GRID_LAYERS : Math.min(100, Math.max(1, gridLayers || DEFAULT_GRID_LAYERS));
      if (initialMode === 'Avarage Only') {
        initAvg = Math.min(20, Math.max(1, initialLayers ?? (creatingNewBot ? DEFAULT_AVERAGING_LAYERS : averagingLayers || DEFAULT_AVERAGING_LAYERS)));
        initGrid = 0;
      } else if (initialMode === 'Grid Only') {
        initGrid = Math.min(100, Math.max(1, initialLayers ?? (creatingNewBot ? DEFAULT_GRID_LAYERS : gridLayers || DEFAULT_GRID_LAYERS)));
        initAvg = 0;
      }

      setAveragingLayers(initAvg);
      setGridLayers(initGrid);
      setSteps(generateSteps(initialMode, initAvg, initGrid, bNum, avgDNum, tpNum, gridTpNum, tpCb, layerCb));
    }
  }, [isOpen, initialMode]);

  const triggerRegenerate = (
    newMode: BotMode,
    newAvg: number,
    newGrd: number,
    newBase: number,
    newAvgD: number,
    newTp: number,
    newGridTp: number,
    newTpCb: number = parseFloat(tpCallbackPct) || 0.2,
    newLayerCb: number = parseFloat(layerCallbackPct) || 0.2
  ) => {
    setSteps(generateSteps(newMode, newAvg, newGrd, newBase, newAvgD, newTp, newGridTp, newTpCb, newLayerCb));
  };

  const handleModeChange = (newMode: BotMode) => {
    setBotMode(newMode);
    let nextAvg = averagingLayers;
    let nextGrid = gridLayers;

    if (newMode === 'Avarage+Grid') {
      nextAvg = Math.min(20, Math.max(1, averagingLayers || DEFAULT_AVERAGING_LAYERS));
      nextGrid = Math.min(100, Math.max(1, gridLayers || DEFAULT_GRID_LAYERS));
      setAveragingLayers(nextAvg);
      setGridLayers(nextGrid);
    } else if (newMode === 'Avarage Only') {
      nextAvg = Math.min(20, Math.max(1, averagingLayers || DEFAULT_AVERAGING_LAYERS));
      nextGrid = 0;
      setAveragingLayers(nextAvg);
    } else if (newMode === 'Grid Only') {
      nextAvg = 0;
      nextGrid = Math.min(100, Math.max(1, gridLayers || DEFAULT_GRID_LAYERS));
      setGridLayers(nextGrid);
    }

    const bNum = parseFloat(baseAmount) || 10;
    const avgDNum = parseFloat(averageDownPct) || 2.0;
    const tpNum = parseFloat(baseTp) || 1.5;
    const gridTpNum = parseFloat(gridProfitPct) || 1.2;
    const tpCb = parseFloat(tpCallbackPct) || 0.2;
    const layerCb = parseFloat(layerCallbackPct) || 0.2;
    triggerRegenerate(newMode, nextAvg, nextGrid, bNum, avgDNum, tpNum, gridTpNum, tpCb, layerCb);
  };

  const handleAveragingLayersChange = (count: number) => {
    const clamped = Math.min(20, Math.max(1, count));
    setAveragingLayers(clamped);
    const bNum = parseFloat(baseAmount) || 10;
    const avgDNum = parseFloat(averageDownPct) || 2.0;
    const tpNum = parseFloat(baseTp) || 1.5;
    const gridTpNum = parseFloat(gridProfitPct) || 1.2;
    const tpCb = parseFloat(tpCallbackPct) || 0.2;
    const layerCb = parseFloat(layerCallbackPct) || 0.2;
    triggerRegenerate(botMode, clamped, gridLayers, bNum, avgDNum, tpNum, gridTpNum, tpCb, layerCb);
  };

  const handleGridLayersChange = (count: number) => {
    const clamped = Math.min(100, Math.max(1, count));
    setGridLayers(clamped);
    const bNum = parseFloat(baseAmount) || 10;
    const avgDNum = parseFloat(averageDownPct) || 2.0;
    const tpNum = parseFloat(baseTp) || 1.5;
    const gridTpNum = parseFloat(gridProfitPct) || 1.2;
    const tpCb = parseFloat(tpCallbackPct) || 0.2;
    const layerCb = parseFloat(layerCallbackPct) || 0.2;
    triggerRegenerate(botMode, averagingLayers, clamped, bNum, avgDNum, tpNum, gridTpNum, tpCb, layerCb);
  };

  const applyStrategyPreset = (preset: StrategyPreset) => {
    setBotMode(preset.botMode);
    setAveragingLayers(preset.averagingLayers);
    setGridLayers(preset.gridLayers);
    setBaseAmount(preset.baseAmount.toFixed(2));
    setBaseTp(preset.baseTp.toFixed(2));
    setAverageDownPct(preset.averageDownPct.toFixed(2));
    setGridProfitPct(preset.gridProfitPct.toFixed(2));
    setTpCallbackPct(preset.tpCallbackPct.toFixed(2));
    setLayerCallbackPct(preset.layerCallbackPct.toFixed(2));
    setUptrendFilter(preset.uptrendFilter);
    setUseMoneyManagement(preset.useMoneyManagement);
    triggerRegenerate(preset.botMode, preset.averagingLayers, preset.gridLayers, preset.baseAmount, preset.averageDownPct, preset.baseTp, preset.gridProfitPct, preset.tpCallbackPct, preset.layerCallbackPct);
    setPresetToast(`Preset \"${preset.name}\" diterapkan`);
    window.setTimeout(() => setPresetToast(''), 1500);
  };

  const saveCurrentAsPreset = () => {
    const name = window.prompt('Nama preset strategi baru:', `Custom ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`)?.trim();
    if (!name) return;
    const preset: StrategyPreset = {
      id: `custom-${Date.now()}`,
      name,
      description: 'Preset strategi buatan pengguna.',
      botMode,
      averagingLayers,
      gridLayers,
      baseAmount: parseFloat(baseAmount) || 10,
      baseTp: parseFloat(baseTp) || 1.5,
      averageDownPct: parseFloat(averageDownPct) || 2,
      gridProfitPct: parseFloat(gridProfitPct) || 1.2,
      tpCallbackPct: parseFloat(tpCallbackPct) || 0.2,
      layerCallbackPct: parseFloat(layerCallbackPct) || 0.2,
      uptrendFilter,
      useMoneyManagement,
    };
    setCustomPresets(saveCustomStrategyPreset(window.localStorage, preset));
    setPresetToast('Preset tersimpan di browser');
    window.setTimeout(() => setPresetToast(''), 1500);
  };

  const removeCustomPreset = (id: string) => {
    setCustomPresets(deleteCustomStrategyPreset(window.localStorage, id));
  };

  const handleAverageDownPctChange = (val: string) => {
    setAverageDownPct(val);
    const avgDNum = parseFloat(val) || 2.0;
    const bNum = parseFloat(baseAmount) || 10;
    const tpNum = parseFloat(baseTp) || 1.5;
    const gridTpNum = parseFloat(gridProfitPct) || 1.2;
    const tpCb = parseFloat(tpCallbackPct) || 0.2;
    const layerCb = parseFloat(layerCallbackPct) || 0.2;
    triggerRegenerate(botMode, averagingLayers, gridLayers, bNum, avgDNum, tpNum, gridTpNum, tpCb, layerCb);
  };

  const handleUpdateStep = (index: number, field: keyof AveragingStep, value: number) => {
    setSteps((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      if (field === 'multiplier') {
        const numBase = parseFloat(baseAmount) || 10;
        const newAmt = parseFloat((numBase * value).toFixed(2));
        copy[index].amountUsdt = newAmt;
        const gTp = parseFloat(gridProfitPct) || 1.2;
        copy[index].subGridProfitUsdt = parseFloat((newAmt * (gTp / 100)).toFixed(2));
      }
      return copy;
    });
  };

  // Coin Pairing Handlers (Toggle, Select All, Top 3, Reset)
  const handleTogglePair = (pairToToggle: string) => {
    setPairedCoins((prev) => {
      if (prev.includes(pairToToggle)) {
        if (prev.length <= 1) {
          // Keep at least one coin
          return prev;
        }
        const updated = prev.filter((p) => p !== pairToToggle);
        if (previewPair === pairToToggle) {
          setPreviewPair(updated[0] || 'BTC/USDT');
        }
        return updated;
      } else {
        const updated = [...prev, pairToToggle];
        return updated;
      }
    });
  };

  const handleSelectAllCoins = () => {
    const all = SUPPORTED_COINS.map((c) => c.pair);
    setPairedCoins(all);
    if (!previewPair) setPreviewPair('BTC/USDT');
  };

  const handleSelectTop3 = () => {
    setPairedCoins(['BTC/USDT', 'ETH/USDT', 'SOL/USDT']);
    setPreviewPair('BTC/USDT');
  };

  const handleSelectVolatile = () => {
    setPairedCoins(['SOL/USDT', 'DOGE/USDT', 'SUI/USDT', 'HYPE/USDT']);
    setPreviewPair('SOL/USDT');
  };

  const handleResetPairs = () => {
    setPairedCoins(['BTC/USDT']);
    setPreviewPair('BTC/USDT');
  };

  // Capital calculations per coin and total for all paired coins
  const singleCoinCapital = useMemo(() => {
    return steps.reduce((sum, s) => sum + s.amountUsdt, 0);
  }, [steps]);

  const totalRequiredCapitalAllCoins = useMemo(() => {
    return singleCoinCapital * Math.max(1, pairedCoins.length);
  }, [singleCoinCapital, pairedCoins.length]);

  const maxDipCoverage = useMemo(() => {
    return steps.reduce((sum, s) => sum + s.dropPct, 0);
  }, [steps]);

  const projectedCycleProfit = useMemo(() => {
    if (botMode === 'Grid Only') {
      const perCoin = steps.reduce((sum, s) => sum + (s.subGridProfitUsdt || s.amountUsdt * 0.012), 0);
      return perCoin * pairedCoins.length;
    } else if (botMode === 'Avarage Only') {
      const tp = parseFloat(baseTp) || 1.5;
      const perCoin = singleCoinCapital * (tp / 100);
      return perCoin * pairedCoins.length;
    } else {
      const subGridEst = steps.slice(averagingLayers).reduce((sum, s) => sum + (s.subGridProfitUsdt || 0), 0) * 0.5;
      const tp = parseFloat(baseTp) || 1.5;
      const wholeEst = singleCoinCapital * (tp / 100);
      return (wholeEst + subGridEst) * pairedCoins.length;
    }
  }, [steps, botMode, baseTp, singleCoinCapital, averagingLayers, pairedCoins.length]);

  // Money Management Check
  const currentModalNum = Math.max(0, Number(availableBalance) || 0);
  const strategyRisk: StrategyRiskAssessment = useMemo(() => assessStrategyRisk({
    botMode,
    averagingLayers,
    gridLayers,
    baseAmount: parseFloat(baseAmount) || 0,
    baseTp: parseFloat(baseTp) || 0,
    averageDownPct: parseFloat(averageDownPct) || 0,
    gridProfitPct: parseFloat(gridProfitPct) || 0,
    tpCallbackPct: parseFloat(tpCallbackPct) || 0,
    layerCallbackPct: parseFloat(layerCallbackPct) || 0,
    pairedCoinsCount: pairedCoins.length,
    availableBalanceUsdt: currentModalNum,
    useMoneyManagement,
    steps,
    minPrice: minPriceNum,
    maxPrice: maxPriceNum,
    marketPrice,
  }), [botMode, averagingLayers, gridLayers, baseAmount, baseTp, averageDownPct, gridProfitPct, tpCallbackPct, layerCallbackPct, pairedCoins.length, currentModalNum, useMoneyManagement, steps, minPriceNum, maxPriceNum, marketPrice]);
  const deploymentPreflight: DeploymentPreflightAssessment = useMemo(() => assessDeploymentPreflight({
    botName: botNameInput,
    executionMode,
    pairedCoinsCount: pairedCoins.length,
    marketPrice,
    minPrice: minPriceNum,
    maxPrice: maxPriceNum,
    isTestnetConnected,
    isLiveConnected,
    strategyRisk,
  }), [botNameInput, executionMode, pairedCoins.length, marketPrice, minPriceNum, maxPriceNum, isTestnetConnected, isLiveConnected, strategyRisk]);
  const isRiskBlocked = deploymentPreflight.status === 'BLOCKED';

  // Handle Save / Deploy Bot to All Paired Coins
  const handleSave = () => {
    if (deploymentPreflight.status === 'BLOCKED') return;
    if (pairedCoins.length === 0) return;

    setSavedToast(true);
    if (onDeployBot) {
      const primaryPair = pairedCoins[0] || 'BTC/USDT';
      const defaultName = botNameInput.trim() || `GAIN Matrix Bot (${pairedCoins.length} Koin Terpairing)`;

      onDeployBot({
        botId: isCreatingNewBot ? undefined : (activeBotId || undefined),
        botName: defaultName,
        isNewBot: isCreatingNewBot,
        executionMode,
        pair: primaryPair,
        pairedCoins, // All coins selected for this 1 bot!
        botMode,
        layerCount: effectiveLayerCount,
        baseAmount: parseFloat(baseAmount) || 10,
        baseTp: parseFloat(baseTp) || 1.5,
        useMoneyManagement,
        averageDownPct: parseFloat(averageDownPct) || 2.0,
        timeframe,
        averagingLayers,
        gridLayers,
        uptrendFilter,
        tpCallbackPct: parseFloat(tpCallbackPct) || 0.2,
        layerCallbackPct: parseFloat(layerCallbackPct) || 0.2,
        gridTp: parseFloat(gridProfitPct) || 1.2,
        minPrice: minPriceNum,
        maxPrice: maxPriceNum,
        steps,
      });
    }

    setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 1200);
  };

  // Filtered steps for table
  const filteredSteps = useMemo(() => {
    return steps.filter((s) => {
      if (!filterQuery) return true;
      return (
        s.step.toString().includes(filterQuery) ||
        s.status.toLowerCase().includes(filterQuery.toLowerCase())
      );
    });
  }, [steps, filterQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg md:max-w-3xl lg:max-w-6xl xl:max-w-7xl h-[94vh] sm:h-[90vh] lg:h-[88vh] max-h-[920px] flex flex-col bg-white dark:bg-[#080E1A] border border-slate-200 dark:border-[#17273F] rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden text-slate-900 dark:text-slate-100">

        {/* Top Hardware Accent Notch */}
        <div className="w-full flex justify-center pt-1.5 pb-1 bg-slate-100 dark:bg-[#060B14]">
          <div className="w-14 h-1 rounded-full bg-slate-300 dark:bg-[#18263B]"></div>
        </div>

        {/* Modal Header */}
        <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-slate-200 dark:border-[#14233A] bg-slate-50 dark:bg-[#09111E] flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-teal-500/10 dark:bg-[#00F0C8]/10 border border-teal-500/30 dark:border-[#00F0C8]/30 flex items-center justify-center text-teal-600 dark:text-[#00F0C8] shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white font-mono flex items-center gap-1.5">
                  <span>Setting Bot & Pairing Multi-Koin</span>
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#00F0C8]/15 text-teal-700 dark:text-[#00F0C8] border border-[#00F0C8]/30">
                  {effectiveLayerCount} Layer
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 border border-indigo-500/30 flex items-center gap-1">
                  <Coins className="w-3 h-3" />
                  <span>{pairedCoins.length} Koin Dipairing</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                1 Bot untuk Banyak Koin • Setting parameter bot terlebih dahulu, baru pilih koin pairing
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-200 dark:hover:bg-[#14233A] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile Tab Switcher (3 Tabs) */}
        <div className="lg:hidden flex border-b border-slate-200 dark:border-[#14233A] bg-slate-100 dark:bg-[#070D18] p-1 shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setMobileTab('bot_config')}
            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              mobileTab === 'bot_config'
                ? 'bg-white dark:bg-[#0E1B2E] text-teal-700 dark:text-[#00F0C8] shadow-xs border border-slate-200 dark:border-[#1C3354]'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>1. Setting Bot</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('coin_pairing')}
            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              mobileTab === 'coin_pairing'
                ? 'bg-white dark:bg-[#0E1B2E] text-teal-700 dark:text-[#00F0C8] shadow-xs border border-slate-200 dark:border-[#1C3354]'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>2. Pilih Koin ({pairedCoins.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('matrix_table')}
            className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
              mobileTab === 'matrix_table'
                ? 'bg-white dark:bg-[#0E1B2E] text-teal-700 dark:text-[#00F0C8] shadow-xs border border-slate-200 dark:border-[#1C3354]'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>3. Tabel ({effectiveLayerCount}L)</span>
          </button>
        </div>

        {/* Workstation Body */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">

          {/* PANEL KIRI: STEP 1 (Setting Bot) & STEP 2 (Pilih Koin Pairing) */}
          <div
            className={`flex-col lg:flex lg:w-[470px] xl:w-[500px] shrink-0 border-r border-slate-200 dark:border-[#14233A] bg-slate-50/50 dark:bg-[#060B14]/40 overflow-y-auto custom-scrollbar p-3 sm:p-4 space-y-4 ${
              mobileTab === 'bot_config' || mobileTab === 'coin_pairing' ? 'flex flex-1' : 'hidden'
            }`}
          >
            {/* STEP 1: SETTING BOT DULU */}
            <div className={`p-3.5 rounded-2xl bg-white dark:bg-[#091220] border border-slate-200 dark:border-[#162740] space-y-3 shadow-xs ${
              mobileTab === 'coin_pairing' ? 'hidden sm:block' : 'block'
            }`}>
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#132339] pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-teal-500/10 text-teal-600 dark:text-[#00F0C8] flex items-center justify-center font-bold text-xs">
                    1
                  </div>
                  <span className="text-xs font-bold font-mono text-slate-900 dark:text-white uppercase tracking-wider">
                    Setting Bot & Strategi
                  </span>
                </div>
                <span className="text-[10px] font-mono text-teal-600 dark:text-[#00F0C8] font-bold">
                  LANGKAH 1
                </span>
              </div>

              {/* Bot Identity Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block font-semibold">
                  Nama Bot Trading:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={botNameInput}
                    onChange={(e) => setBotNameInput(e.target.value)}
                    placeholder="Contoh: GAIN Matrix Hybrid Pro #1"
                    className="w-full text-xs font-mono font-bold bg-slate-50 dark:bg-[#0C1525] border border-slate-300 dark:border-[#1A2E4C] rounded-xl px-3 py-2 text-slate-900 dark:text-white focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>


              {/* Strategy Presets */}
              <div className="p-3 rounded-xl bg-indigo-500/5 dark:bg-[#0A1222] border border-indigo-500/20 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold font-mono text-slate-900 dark:text-white">Strategy Presets</div>
                    <div className="text-[9px] text-slate-500 dark:text-slate-400">Preset hanya mengisi form; belum menjalankan bot.</div>
                  </div>
                  <button type="button" onClick={saveCurrentAsPreset} className="px-2 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 cursor-pointer">Simpan</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  {BUILTIN_STRATEGY_PRESETS.map((preset) => (
                    <button key={preset.id} type="button" onClick={() => applyStrategyPreset(preset)} className="text-left rounded-lg border border-slate-200 dark:border-[#1A2E4C] bg-white dark:bg-[#0C1525] px-2.5 py-2 hover:border-indigo-400 transition cursor-pointer">
                      <span className="block text-[10px] font-bold font-mono text-slate-900 dark:text-white">{preset.name}</span>
                      <span className="block text-[9px] mt-0.5 text-slate-500 dark:text-slate-400 line-clamp-2">{preset.description}</span>
                    </button>
                  ))}
                </div>
                {customPresets.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    {customPresets.map((preset) => (
                      <div key={preset.id} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-[#1A2E4C] px-2.5 py-1.5">
                        <button type="button" onClick={() => applyStrategyPreset(preset)} className="flex-1 text-left text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate cursor-pointer">{preset.name}</button>
                        <button type="button" aria-label={`Hapus preset ${preset.name}`} onClick={() => removeCustomPreset(preset.id)} className="text-[10px] text-slate-400 hover:text-rose-500 cursor-pointer">Hapus</button>
                      </div>
                    ))}
                  </div>
                )}
                {presetToast && <div className="text-[10px] font-mono text-indigo-600 dark:text-indigo-300">{presetToast}</div>}
              </div>

              {/* Mode Bot Selection (3 Modes) */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block font-semibold">
                  Pilih Mode Bot:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleModeChange('Avarage Only')}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      botMode === 'Avarage Only'
                        ? 'bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-400 font-bold shadow-xs'
                        : 'bg-slate-50 dark:bg-[#0C1525] border-slate-200 dark:border-[#162740] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <ArrowDownRight className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-[11px] font-bold font-sans truncate">Averager</span>
                    </div>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-0.5 font-mono">
                      1-20 Layer
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleModeChange('Grid Only')}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      botMode === 'Grid Only'
                        ? 'bg-cyan-500/15 border-cyan-500 text-cyan-700 dark:text-cyan-400 font-bold shadow-xs'
                        : 'bg-slate-50 dark:bg-[#0C1525] border-slate-200 dark:border-[#162740] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <Split className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                      <span className="text-[11px] font-bold font-sans truncate">Grid Only</span>
                    </div>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-0.5 font-mono">
                      5 default · 1-100 Layer
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleModeChange('Avarage+Grid')}
                    className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                      botMode === 'Avarage+Grid'
                        ? 'bg-teal-500/15 border-teal-500 text-teal-800 dark:text-[#00F0C8] font-bold shadow-xs'
                        : 'bg-slate-50 dark:bg-[#0C1525] border-slate-200 dark:border-[#162740] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <Maximize2 className="w-3.5 h-3.5 text-teal-600 dark:text-[#00F0C8] shrink-0" />
                      <span className="text-[11px] font-bold font-sans truncate">Avg+Grid</span>
                    </div>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 block mt-0.5 font-mono">
                      1L + 5L (6L awal)
                    </span>
                  </button>
                </div>
              </div>

              {/* Timeframe */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono text-slate-500 dark:text-slate-400 block font-semibold">
                  Timeframe Analisis &amp; Evaluasi:
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5" role="group" aria-label="Timeframe analisis bot">
                  {TIMEFRAME_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={timeframe === option.value}
                      onClick={() => setTimeframe(option.value)}
                      className={`rounded-lg border px-2 py-1.5 text-[10px] font-mono font-bold transition cursor-pointer ${
                        timeframe === option.value
                          ? 'border-teal-500 bg-teal-500/15 text-teal-700 dark:text-teal-300'
                          : 'border-slate-200 bg-white text-slate-600 dark:border-[#1A2E4C] dark:bg-[#0C1525] dark:text-slate-400'
                      }`}
                    >
                      <span className="block">{option.value}</span>
                      <span className="block text-[8px] opacity-70">{option.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[9px] text-slate-500 font-mono">Dipakai sebagai sumber candle tertutup (closed candle) untuk sinyal bot. Default 5m.</p>
              </div>

              {/* Layer Controls depending on mode */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#070D18] border border-slate-200 dark:border-[#14233A] space-y-3">
                {(botMode === 'Avarage+Grid' || botMode === 'Avarage Only') && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-amber-500" />
                        <span>Layer Averaging (1 s/d 20 Layer):</span>
                      </label>
                      <span className="text-xs font-mono font-bold text-amber-500">{averagingLayers} Layer</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="20"
                      step="1"
                      value={averagingLayers}
                      onChange={(e) => handleAveragingLayersChange(parseInt(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-200 dark:bg-[#121F35] rounded-lg"
                    />
                    <div className="flex flex-wrap gap-1">
                      {[1, 2, 3, 5, 10, 15, 20].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => handleAveragingLayersChange(n)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                            averagingLayers === n ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-200 dark:bg-[#0E1A2C] text-slate-400'
                          }`}
                        >
                          {n}L
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(botMode === 'Avarage+Grid' || botMode === 'Grid Only') && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-200/40 dark:border-[#14233A]">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold font-mono text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Split className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Layer Grid (1 s/d 100 Layer):</span>
                      </label>
                      <span className="text-xs font-mono font-bold text-cyan-400">{gridLayers} Layer</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="100"
                      step="1"
                      value={gridLayers}
                      onChange={(e) => handleGridLayersChange(parseInt(e.target.value))}
                      className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-200 dark:bg-[#121F35] rounded-lg"
                    />
                    <div className="flex flex-wrap gap-1">
                      {[5, 10, 20, 35, 50, 75, 100].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => handleGridLayersChange(n)}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition cursor-pointer ${
                            gridLayers === n ? 'bg-cyan-500 text-slate-950 font-bold' : 'bg-slate-200 dark:bg-[#0E1A2C] text-slate-400'
                          }`}
                        >
                          {n}L
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bot Strategy Core Parameters */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <label className="text-[10px] text-slate-400 block font-semibold">Base Order (USDT):</label>
                  <input
                    type="number"
                    min="5"
                    step="5"
                    value={baseAmount}
                    onChange={(e) => {
                      setBaseAmount(e.target.value);
                      const bNum = parseFloat(e.target.value) || 10;
                      triggerRegenerate(botMode, averagingLayers, gridLayers, bNum, parseFloat(averageDownPct) || 2.0, parseFloat(baseTp) || 1.5, parseFloat(gridProfitPct) || 1.2);
                    }}
                    className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0C1525] border border-slate-300 dark:border-[#1A2E4C] text-xs font-bold text-slate-900 dark:text-white focus:outline-none"
                  />
                  <span className="text-[9px] text-slate-500 block mt-0.5">Per order koin</span>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block font-semibold">Whole TP (%):</label>
                  <input
                    type="number"
                    step="0.1"
                    value={baseTp}
                    onChange={(e) => {
                      setBaseTp(e.target.value);
                      const tpNum = parseFloat(e.target.value) || 1.5;
                      triggerRegenerate(botMode, averagingLayers, gridLayers, parseFloat(baseAmount) || 10, parseFloat(averageDownPct) || 2.0, tpNum, parseFloat(gridProfitPct) || 1.2);
                    }}
                    className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0C1525] border border-slate-300 dark:border-[#1A2E4C] text-xs font-bold text-amber-500 focus:outline-none"
                  />
                  <span className="text-[9px] text-slate-500 block mt-0.5">Target profit</span>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block font-semibold">TP Callback (%):</label>
                  <input
                    type="number"
                    step="0.05"
                    value={tpCallbackPct}
                    onChange={(e) => setTpCallbackPct(e.target.value)}
                    className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0C1525] border border-slate-300 dark:border-[#1A2E4C] text-xs font-bold text-teal-600 dark:text-[#00F0C8] focus:outline-none"
                  />
                  <span className="text-[9px] text-slate-500 block mt-0.5">Trailing callback</span>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block font-semibold">Layer Callback (%):</label>
                  <input
                    type="number"
                    step="0.05"
                    value={layerCallbackPct}
                    onChange={(e) => setLayerCallbackPct(e.target.value)}
                    className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-[#0C1525] border border-slate-300 dark:border-[#1A2E4C] text-xs font-bold text-teal-600 dark:text-[#00F0C8] focus:outline-none"
                  />
                  <span className="text-[9px] text-slate-500 block mt-0.5">Rebound pantulan</span>
                </div>
              </div>

              {/* Uptrend & MM Toggles */}
              <div className="pt-2 border-t border-slate-100 dark:border-[#132339] space-y-2">
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-[#070D18] border border-slate-200 dark:border-[#152338]">
                  <div>
                    <span className="text-xs font-mono font-bold text-slate-900 dark:text-white block">
                      Filter Uptrend Bullish
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Hanya akumulasi saat market uptrend
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUptrendFilter(!uptrendFilter)}
                    className={`w-10 h-5.5 rounded-full transition-colors relative cursor-pointer ${
                      uptrendFilter ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                        uptrendFilter ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-[#070D18] border border-slate-200 dark:border-[#152338]">
                  <div>
                    <span className="text-xs font-mono font-bold text-slate-900 dark:text-white block">
                      Money Management (MM)
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {useMoneyManagement ? 'Validasi saldo & exposure ketat' : 'Layer tetap berjalan sesuai konfigurasi; saldo exchange menjadi batas aktual'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUseMoneyManagement(!useMoneyManagement)}
                    className={`w-10 h-5.5 rounded-full transition-colors relative cursor-pointer ${
                      useMoneyManagement ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                        useMoneyManagement ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-[#152338] dark:bg-[#070D18]">
                <label className="mb-2 block text-[10px] font-mono font-bold uppercase text-slate-500 dark:text-slate-400">
                  Mode Eksekusi
                </label>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="Mode eksekusi bot">
                  <button
                    type="button"
                    aria-pressed={executionMode === 'testnet'}
                    onClick={() => setExecutionMode('testnet')}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${executionMode === 'testnet'
                      ? 'border-teal-500 bg-teal-500/15 text-teal-700 dark:text-teal-300'
                      : 'border-slate-200 bg-white text-slate-600 dark:border-[#1A2E4C] dark:bg-[#0C1525] dark:text-slate-400'}`}
                  >
                    Testnet
                  </button>
                  <button
                    type="button"
                    aria-pressed={executionMode === 'live'}
                    disabled={!isLiveConnected}
                    onClick={() => setExecutionMode('live')}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${executionMode === 'live'
                      ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'border-slate-200 bg-white text-slate-600 dark:border-[#1A2E4C] dark:bg-[#0C1525] dark:text-slate-400'}`}
                  >
                    Live Testnet
                  </button>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {executionMode === 'testnet'
                    ? 'Order nyata ke API Testnet/Sandbox exchange. Tidak ada fill simulasi.'
                    : 'Order nyata ke API Live exchange. Server LIVE_TRADING_ENABLED dan lisensi live tetap harus aktif.'}
                  {executionMode === 'testnet' && !isTestnetConnected && ' Hubungkan API exchange dalam mode Testnet untuk menjalankan bot.'}
                  {executionMode === 'live' && !isLiveConnected && ' Hubungkan API exchange Live untuk menjalankan bot.'}
                </p>
              </div>
            </div>

            {/* STEP 2: PILIH KOIN APA SAJA YG MAU DIPAIRING DI BOT TERSEBUT */}
            <div className={`p-3.5 rounded-2xl bg-white dark:bg-[#091220] border-2 border-teal-500/40 dark:border-[#00F0C8]/40 space-y-3 shadow-md ${
              mobileTab === 'bot_config' ? 'hidden sm:block' : 'block'
            }`}>
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#132339] pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-teal-500 text-slate-950 flex items-center justify-center font-bold text-xs">
                    2
                  </div>
                  <div>
                    <span className="text-xs font-bold font-mono text-slate-900 dark:text-white uppercase tracking-wider block">
                      Pilih Koin Yang Dipairing ke Bot Ini
                    </span>
                    <span className="text-[10px] text-teal-600 dark:text-[#00F0C8] font-mono">
                      1 Bot → Multi-Koin Pairing
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-700 dark:text-[#00F0C8] font-mono font-bold text-xs border border-teal-500/30">
                  {pairedCoins.length} Terpilih
                </span>
              </div>

              {/* Quick action helper buttons */}
              <div className="flex items-center justify-between flex-wrap gap-1 text-[10px] font-mono">
                <span className="text-slate-400">Pilih Cepat:</span>
                <div className="flex items-center gap-1 flex-wrap">
                  <button
                    type="button"
                    onClick={handleSelectAllCoins}
                    className="px-2 py-1 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 text-teal-700 dark:text-[#00F0C8] font-bold border border-teal-500/30 cursor-pointer"
                  >
                    Semua (12 Koin)
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectTop3}
                    className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#0E1A2D] hover:bg-slate-200 dark:hover:bg-[#142640] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#182C47] cursor-pointer"
                  >
                    Top 3 (BTC, ETH, SOL)
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectVolatile}
                    className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-[#0E1A2D] hover:bg-slate-200 dark:hover:bg-[#142640] text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-[#182C47] cursor-pointer"
                  >
                    Volatil
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPairs}
                    className="px-2 py-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </div>

              {/* 12 Coins Interactive Selection Checklist */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                {SUPPORTED_COINS.map((c, idx) => {
                  const isChecked = pairedCoins.includes(c.pair);
                  return (
                    <button
                      key={`${c.pair}-${idx}`}
                      type="button"
                      onClick={() => handleTogglePair(c.pair)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isChecked
                          ? 'bg-teal-500/10 dark:bg-teal-500/20 border-teal-500 text-slate-900 dark:text-white font-bold shadow-xs ring-1 ring-teal-500/50'
                          : 'bg-slate-50 dark:bg-[#0A1322] border-slate-200 dark:border-[#14243C] text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-[#1E3658]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <CoinLogo coin={c.coin} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-mono font-bold truncate">{c.coin}</span>
                          </div>
                          {(() => {
                            const livePrice = Number(currentPrices[c.pair]);
                            const catalogPrice = Number(c.price);
                            const displayPrice = Number.isFinite(livePrice) && livePrice > 0
                              ? livePrice
                              : Number.isFinite(catalogPrice) && catalogPrice > 0
                                ? catalogPrice
                                : 0;

                            return displayPrice > 0 ? (
                              <span className="text-[10px] font-mono text-slate-400 block truncate" title="Harga market live dari exchange">
                                ${displayPrice >= 1000 ? displayPrice.toLocaleString(undefined, { maximumFractionDigits: 2 }) : displayPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-amber-500 block truncate" title="Menunggu market ticker dari exchange">
                                Memuat harga…
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                        isChecked
                          ? 'bg-teal-500 border-teal-500 text-slate-950 font-black'
                          : 'border-slate-300 dark:border-[#1C3252] bg-white dark:bg-[#070D18]'
                      }`}>
                        {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Pairing Summary & Exposure Banner */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#060D18] border border-slate-200 dark:border-[#152338] space-y-1.5 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase text-slate-400 font-bold">Koin yang Dipairing ke Bot:</span>
                  <span className="text-teal-600 dark:text-[#00F0C8] font-bold">{pairedCoins.length} Pair Koin</span>
                </div>
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {pairedCoins.map((pair, idx) => (
                    <span
                      key={`${pair}-${idx}`}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-500/15 text-teal-800 dark:text-[#00F0C8] border border-teal-500/30"
                    >
                      {pair.replace('/USDT', '')}
                    </span>
                  ))}
                </div>
                <div className="pt-2 border-t border-slate-200/50 dark:border-[#121E31] flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">Estimasi Kebutuhan Modal:</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    ${(singleCoinCapital * pairedCoins.length).toFixed(1)} USDT Total
                  </span>
                </div>
              </div>
            </div>

            {/* Strategy Risk Guardrails */}
            <div className={`p-3 rounded-xl border ${strategyRisk.status === 'BLOCKED' ? 'bg-rose-500/10 border-rose-500/40' : strategyRisk.status === 'WARNING' ? 'bg-amber-500/10 border-amber-500/40' : 'bg-emerald-500/5 border-emerald-500/30'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {strategyRisk.status === 'BLOCKED' ? <ShieldAlert className="w-4 h-4 text-rose-400" /> : <ShieldCheck className="w-4 h-4 text-emerald-400" />}
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-wider">Strategy Risk Guardrails</div>
                    <div className="text-[9px] text-slate-500 dark:text-slate-400">{useMoneyManagement ? 'Validasi modal, exposure, layer, dan parameter ekstrem sebelum deploy.' : 'MM OFF: batas modal/exposure GAIN dilepas; layer mengikuti konfigurasi dan saldo exchange.'}</div>
                  </div>
                </div>
                <span className={`text-[9px] font-mono font-bold ${strategyRisk.status === 'BLOCKED' ? 'text-rose-400' : strategyRisk.status === 'WARNING' ? 'text-amber-400' : 'text-emerald-400'}`}>{strategyRisk.status}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2 text-[9px] font-mono">
                <div className="rounded-lg bg-black/5 dark:bg-white/5 p-2">Modal/proj.: <strong>${strategyRisk.totalProjectedCapitalUsdt.toFixed(2)}</strong></div>
                <div className="rounded-lg bg-black/5 dark:bg-white/5 p-2">Limit bot: <strong>${STRATEGY_RISK_LIMITS.maxBotExposureUsdt.toFixed(2)}</strong></div>
                <div className="rounded-lg bg-black/5 dark:bg-white/5 p-2">Layers: <strong>{strategyRisk.effectiveLayerCount}</strong></div>
                <div className="rounded-lg bg-black/5 dark:bg-white/5 p-2">Coverage: <strong>-{strategyRisk.maxCoveragePct.toFixed(1)}%</strong></div>
              </div>
              {strategyRisk.blockers.slice(0, 3).map((rule) => (
                <div key={rule.code} className="mt-2 text-[9px] text-rose-400 flex items-start gap-1.5"><AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /><span>{rule.message}</span></div>
              ))}
              {strategyRisk.blockers.length === 0 && strategyRisk.warnings.slice(0, 3).map((rule) => (
                <div key={rule.code} className="mt-2 text-[9px] text-amber-400 flex items-start gap-1.5"><Info className="w-3 h-3 shrink-0 mt-0.5" /><span>{rule.message}</span></div>
              ))}
            </div>

            {/* Desktop Action Buttons */}
            <div className="hidden lg:block space-y-2 pt-2 border-t border-slate-200 dark:border-[#14233A]">
              {savedToast && (
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs font-mono flex items-center gap-2 justify-center animate-fadeIn">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>Bot Berhasil Diterapkan ke {pairedCoins.length} Koin Terpilih!</span>
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={isRiskBlocked}
                className={`w-full py-3 rounded-xl font-bold text-xs font-mono tracking-wide transition active:scale-98 flex items-center justify-center gap-2 shadow-md ${
                  isRiskBlocked
                    ? 'bg-slate-800 text-slate-500 border border-red-500/30 cursor-not-allowed'
                    : 'bg-[#00F0C8] hover:bg-[#00d8b4] text-slate-950 glow-cyan-btn cursor-pointer'
                }`}
              >
                <Sparkles className="w-4 h-4 fill-current" />
                <span>
                  {strategyRisk.status === 'BLOCKED'
                    ? 'Guardrail memblokir Deploy — Perbaiki Konfigurasi'
                    : strategyRisk.status === 'WARNING'
                      ? `Simpan & Jalankan Bot (${pairedCoins.length} Koin) — Ada Warning`
                      : `Simpan & Jalankan Bot (${pairedCoins.length} Koin Terpairing) →`}
                </span>
              </button>

              <button
                onClick={() => {
                  if (onOpenSimulation) onOpenSimulation();
                }}
                className="w-full py-2 rounded-xl bg-white dark:bg-[#0C1628] border border-slate-300 dark:border-[#1A2E4C] text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:border-teal-500 transition text-xs font-mono font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Monte Carlo Stress Test & Simulasi</span>
              </button>
            </div>
          </div>

          {/* PANEL KANAN: Tabel Interaktif Matrix & Preview Kalkulasi */}
          <div
            className={`flex-1 flex-col min-w-0 bg-white dark:bg-[#080E1A] overflow-hidden ${
              mobileTab === 'matrix_table' ? 'flex' : 'hidden lg:flex'
            }`}
          >
            {/* Table Control Header */}
            <div className="px-3 sm:px-4 py-2.5 bg-slate-50 dark:bg-[#09111E] border-b border-slate-200 dark:border-[#14233A] flex flex-wrap items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-[#00F0C8]" />
                  Tabel Matrix Formula Bot
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-teal-500/10 text-teal-700 dark:text-[#00F0C8] border border-teal-500/30 font-bold">
                  {filteredSteps.length} Layer ({botMode})
                </span>
              </div>

              {/* Preview Coin Selector for Table */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-400">Preview Koin:</span>
                <select
                  value={previewPair}
                  onChange={(e) => setPreviewPair(e.target.value)}
                  className="px-2 py-1 rounded-lg text-xs font-mono font-bold bg-white dark:bg-[#0C1525] border border-slate-300 dark:border-[#182942] text-slate-900 dark:text-white focus:outline-none"
                >
                  {pairedCoins.map((pair, idx) => (
                    <option key={`${pair}-${idx}`} value={pair}>
                      {pair}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Price Ceiling & Floor Status Banner */}
            <div className="px-3 py-2 bg-slate-100/70 dark:bg-[#070D18] border-b border-slate-200 dark:border-[#142236] flex items-center justify-between text-xs font-mono">
              <div className="flex items-center gap-3">
                <span>Harga Pasar ({previewPair}): <strong>${marketPrice.toLocaleString()}</strong></span>
                {maxPriceNum > 0 && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    isAboveMax ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                  }`}>
                    Max Price: ${maxPriceNum.toFixed(2)} ({isAboveMax ? 'TIDAK BUY' : 'BOLEH BUY'})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari layer..."
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  className="px-2 py-0.5 rounded bg-white dark:bg-[#0A1322] border border-slate-300 dark:border-[#162740] text-[11px] text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Scrollable Table */}
            <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar p-2 sm:p-3 min-h-0">
              <table className="w-full text-left text-xs font-mono border-collapse min-w-[560px]">
                <thead className="sticky top-0 bg-slate-100 dark:bg-[#0B1527] z-10 shadow-xs">
                  <tr className="border-b border-slate-200 dark:border-[#142236] text-[10px] uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                    <th className="py-2.5 px-2.5 font-bold">Layer</th>
                    <th className="py-2.5 px-2 font-bold">Drop Interval (%)</th>
                    <th className="py-2.5 px-2 font-bold">Pengganda (x)</th>
                    <th className="py-2.5 px-2 font-bold">Modal Step (USDT)</th>
                    <th className="py-2.5 px-2 font-bold">Target TP / Callback</th>
                    <th className="py-2.5 px-2.5 font-bold text-right">Tipe / Logika Eksekusi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#101A2B]">
                  {filteredSteps.map((s, idx) => {
                    const isAvgLayer = botMode === 'Avarage+Grid' ? s.step <= averagingLayers : botMode === 'Avarage Only';

                    return (
                      <tr key={s.step} className="hover:bg-slate-50 dark:hover:bg-[#0C1628] transition-colors">
                        <td className="py-2 px-2.5 font-bold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                isAvgLayer ? 'bg-amber-400' : 'bg-cyan-400'
                              }`}
                            />
                            <span>#{s.step < 10 ? `0${s.step}` : s.step}</span>
                            <span className="text-[9px] text-slate-500">
                              {isAvgLayer ? '(DCA)' : '(Grid)'}
                            </span>
                          </div>
                        </td>

                        <td className="py-2 px-2">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                step="0.1"
                                value={s.dropPct}
                                onChange={(e) => handleUpdateStep(idx, 'dropPct', parseFloat(e.target.value) || 0)}
                                className="w-14 px-1.5 py-0.5 rounded text-[11px] bg-slate-100 dark:bg-[#0C1525] border border-slate-300 dark:border-[#182942] text-slate-800 dark:text-slate-200 font-mono focus:outline-none"
                              />
                              <span className="text-[10px] text-slate-500">%</span>
                            </div>
                            {isAvgLayer && (
                              <span className="text-[9px] text-amber-500/80 font-mono">
                                Callback: +{s.layerCallbackPct || layerCallbackPct}%
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-2 px-2">
                          <div className="flex items-center gap-0.5">
                            <input
                              type="number"
                              step="0.05"
                              value={s.multiplier}
                              onChange={(e) => handleUpdateStep(idx, 'multiplier', parseFloat(e.target.value) || 0)}
                              className="w-12 px-1.5 py-0.5 rounded text-[11px] bg-slate-100 dark:bg-[#0C1525] border border-slate-300 dark:border-[#182942] text-slate-800 dark:text-slate-200 font-mono focus:outline-none"
                            />
                            <span className="text-[10px] text-slate-500">x</span>
                          </div>
                        </td>

                        <td className="py-2 px-2 font-bold text-teal-600 dark:text-[#00F0C8]">
                          ${s.amountUsdt.toFixed(2)}
                        </td>

                        <td className="py-2 px-2">
                          {isAvgLayer ? (
                            <div className="text-[11px] font-mono leading-tight">
                              <span className="text-amber-500 font-semibold block">
                                +{s.tpPct}% Whole TP
                              </span>
                              <span className="text-[9px] text-slate-400 block">
                                Trailing CB: {s.tpCallbackPct || tpCallbackPct}%
                              </span>
                            </div>
                          ) : (
                            <div className="text-[11px] font-mono leading-tight">
                              <span className="text-cyan-500 font-bold block">
                                +${s.subGridProfitUsdt?.toFixed(2)}
                              </span>
                              <span className="text-[9px] text-slate-400 block">
                                TP Grid: +{gridProfitPct}%
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="py-2 px-2.5 text-right">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                            isAvgLayer ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20' : 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20'
                          }`}>
                            {isAvgLayer ? 'Averaging (Rebound CB)' : 'Sub-Grid Scalp'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div className="px-3 sm:px-4 py-2.5 bg-slate-50 dark:bg-[#070D17] border-t border-slate-200 dark:border-[#14233A] flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-500 gap-2 shrink-0">
              <span className="flex items-center gap-1">
                <span>Coverage Downside:</span>
                <span className="text-teal-600 dark:text-[#00F0C8] font-bold">{maxDipCoverage.toFixed(1)}%</span>
              </span>
              <div className="flex items-center gap-3">
                <span>Per Koin: <strong>${singleCoinCapital.toFixed(2)} USDT</strong></span>
                <span className="font-bold text-teal-600 dark:text-[#00F0C8]">
                  Total {pairedCoins.length} Koin: ${totalRequiredCapitalAllCoins.toFixed(2)} USDT
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Deployment Preflight */}
        <div className="px-3 sm:px-4 py-2.5 border-t border-slate-200 dark:border-[#14233A] bg-slate-50 dark:bg-[#070D17] shrink-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className={deploymentPreflight.status === 'READY' ? 'w-4 h-4 text-emerald-400' : deploymentPreflight.status === 'WARNING' ? 'w-4 h-4 text-amber-400' : 'w-4 h-4 text-red-400'} />
              <span className="text-[11px] font-bold font-mono">Deployment Preflight</span>
            </div>
            <span className={"px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border " + (deploymentPreflight.status === 'READY' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : deploymentPreflight.status === 'WARNING' ? 'text-amber-300 bg-amber-500/10 border-amber-500/20' : 'text-red-300 bg-red-500/10 border-red-500/20')}>
              {deploymentPreflight.status}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5">
            {deploymentPreflight.checks.map((check) => (
              <div key={check.code} title={check.detail} className={"rounded-lg border px-2 py-1.5 font-mono text-[9px] " + (check.status === 'PASS' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300' : check.status === 'WARNING' ? 'border-amber-500/20 bg-amber-500/5 text-amber-300' : 'border-red-500/20 bg-red-500/5 text-red-300')}>
                <div className="truncate font-bold">{check.label}</div>
                <div className="opacity-80">{check.status}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile Sticky Bottom Bar */}
        <div className="lg:hidden p-3 bg-slate-50 dark:bg-[#060B14] border-t border-slate-200 dark:border-[#142236] space-y-2 shrink-0">
          <div className="flex items-center justify-between text-xs font-mono px-0.5">
            <span className="text-slate-500">
              {pairedCoins.length} Koin Dipairing
            </span>
            <span className="text-slate-500">
              Modal: <strong className={strategyRisk.status === 'BLOCKED' ? 'text-red-400' : strategyRisk.status === 'WARNING' ? 'text-amber-400' : 'text-slate-900 dark:text-white'}>${totalRequiredCapitalAllCoins.toFixed(1)}</strong>
            </span>
            <span className="text-slate-500">
              Est: <strong className="text-emerald-500">+${projectedCycleProfit.toFixed(1)}</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                if (onOpenSimulation) onOpenSimulation();
              }}
              className="py-2.5 px-2 rounded-xl bg-slate-100 dark:bg-[#0E1A2D] border border-slate-200 dark:border-[#1E3456] text-slate-800 dark:text-slate-200 text-xs font-mono font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Simulasi</span>
            </button>
            <button
              onClick={handleSave}
              disabled={isRiskBlocked}
              className={`py-2.5 px-2 rounded-xl font-bold text-xs font-mono tracking-wide transition active:scale-98 flex items-center justify-center gap-1.5 shadow-md ${
                isRiskBlocked
                  ? 'bg-slate-800 text-slate-500 border border-red-500/30 cursor-not-allowed'
                  : 'bg-[#00F0C8] text-slate-950 glow-cyan-btn cursor-pointer'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 fill-current" />
              <span>{deploymentPreflight.status === 'BLOCKED' ? 'Perbaiki Preflight' : deploymentPreflight.status === 'WARNING' ? `Jalankan (${pairedCoins.length}) — Warning` : `Jalankan (${pairedCoins.length} Koin)`}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
