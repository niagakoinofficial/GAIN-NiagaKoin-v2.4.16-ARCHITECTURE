import React, { useState, useEffect } from 'react';
import {
  X,
  Bell,
  BellRing,
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  RotateCcw,
  Volume2,
  ShieldCheck,
  Search,
  ExternalLink,
  Layers,
} from 'lucide-react';
import { PriceAlert } from '../../types';
import { SUPPORTED_COINS } from '../../data/appData';
import { CoinLogo } from '../common/CoinLogo';
import { formatUsdt, formatPercent } from '../../utils/formatters';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendBrowserNotification,
  playAlertChime,
  notifyLayerExecution,
  notifyTakeProfit,
  notifyPriceAlert,
  NotificationPermissionState,
} from '../../services/notificationService';
import {
  savePriceAlert,
  deletePriceAlert,
  updatePriceAlert,
} from '../../services/priceAlertService';

interface PriceAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
  alerts: PriceAlert[];
  currentPrices: Record<string, number>;
  initialSymbol?: string;
}

export function PriceAlertModal({
  isOpen,
  onClose,
  userId,
  alerts,
  currentPrices,
  initialSymbol,
}: PriceAlertModalProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'list' | 'trading' | 'history'>('create');
  const [permission, setPermission] = useState<NotificationPermissionState>('default');

  // Form states
  const [selectedPair, setSelectedPair] = useState<string>(initialSymbol || 'BTC/USDT');
  const [condition, setCondition] = useState<'above' | 'below'>('above');
  const [targetPriceInput, setTargetPriceInput] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [isRepeating, setIsRepeating] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [searchCoinQuery, setSearchCoinQuery] = useState<string>('');
  const [showCoinDropdown, setShowCoinDropdown] = useState<boolean>(false);

  // Sync initial symbol if provided
  useEffect(() => {
    if (initialSymbol) {
      setSelectedPair(initialSymbol);
    }
  }, [initialSymbol]);

  // Check notification permission on mount
  useEffect(() => {
    if (isOpen) {
      setPermission(getNotificationPermission());
    }
  }, [isOpen]);

  // Current market price of selected coin
  const livePrice = currentPrices[selectedPair] ||
    SUPPORTED_COINS.find((c) => c.pair === selectedPair)?.price || 0;

  // Initialize target price input with a reasonable default (+2% or -2%)
  useEffect(() => {
    if (livePrice > 0 && !targetPriceInput) {
      const defaultTarget = condition === 'above' ? livePrice * 1.02 : livePrice * 0.98;
      setTargetPriceInput(defaultTarget >= 1 ? defaultTarget.toFixed(2) : defaultTarget.toFixed(6));
    }
  }, [livePrice, condition]);

  if (!isOpen) return null;

  const handleRequestPermission = async () => {
    const perm = await requestNotificationPermission();
    setPermission(perm);
    if (perm === 'granted') {
      sendBrowserNotification('🔔 Notifikasi Browser GAIN Aktif!', {
        body: 'Anda akan menerima notifikasi otomatis saat harga koin mencapai target, layer averaging terisi, dan terkena Take Profit.',
      });
      playAlertChime('alert');
    }
  };

  const handleTestNotification = () => {
    notifyPriceAlert(selectedPair, condition, parseFloat(targetPriceInput) || livePrice, livePrice);
    if (permission !== 'granted') {
      handleRequestPermission();
    }
  };

  const handleTestLayer = () => {
    if (!(livePrice > 0)) { setOperationError('Harga market belum tersedia untuk test notification.'); return; }
    notifyLayerExecution({
      pair: selectedPair,
      coin: selectedPair.split('/')[0],
      layerStep: 2,
      maxStep: 20,
      side: 'BUY',
      price: livePrice,
      amount: Number((50 / livePrice).toFixed(4)),
      costUsdt: 50,
      layerType: 'grid',
    });
    if (permission !== 'granted') {
      handleRequestPermission();
    }
  };

  const handleTestTp = () => {
    if (!(livePrice > 0)) { setOperationError('Harga market belum tersedia untuk test notification.'); return; }
    notifyTakeProfit({
      pair: selectedPair,
      coin: selectedPair.split('/')[0],
      profitUsdt: 12.50,
      roiPct: 2.50,
      exitPrice: livePrice * 1.025,
    });
    if (permission !== 'granted') {
      handleRequestPermission();
    }
  };

  const handleSelectPreset = (percentDelta: number) => {
    if (livePrice <= 0) return;
    const newTarget = livePrice * (1 + percentDelta / 100);
    setCondition(percentDelta >= 0 ? 'above' : 'below');
    setTargetPriceInput(newTarget >= 1 ? newTarget.toFixed(2) : newTarget.toFixed(6));
  };

  const handleSelectCoin = (pair: string) => {
    setSelectedPair(pair);
    setShowCoinDropdown(false);
    const newPrice = currentPrices[pair] || SUPPORTED_COINS.find((c) => c.pair === pair)?.price || 0;
    if (newPrice > 0) {
      const defaultTarget = condition === 'above' ? newPrice * 1.02 : newPrice * 0.98;
      setTargetPriceInput(defaultTarget >= 1 ? defaultTarget.toFixed(2) : defaultTarget.toFixed(6));
    }
  };

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetPriceNum = parseFloat(targetPriceInput);
    if (!livePrice || livePrice <= 0) { setOperationError('Harga market belum tersedia. Price Alert belum dapat dipasang.'); return; }
    if (!targetPriceNum || targetPriceNum <= 0) return;

    setIsSubmitting(true);
    setOperationError(null);
    try {
      const cleanCoin = selectedPair.split('/')[0];
      const newAlert: PriceAlert = {
        id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        symbol: selectedPair,
        coin: cleanCoin,
        targetPrice: targetPriceNum,
        condition,
        initialPrice: livePrice,
        status: 'active',
        createdAt: Date.now(),
        note: note.trim() || undefined,
        isRepeating,
        notificationSent: false,
      };

      await savePriceAlert(userId, newAlert);

      // If browser permission is not yet granted, prompt user
      if (permission === 'default') {
        await handleRequestPermission();
      }

      setSuccessToast(`Alert untuk ${selectedPair} sebesar $${formatUsdt(targetPriceNum)} berhasil dipasang!`);
      setTimeout(() => setSuccessToast(null), 3000);
      setActiveTab('list');
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'Gagal menyimpan Price Alert ke Firestore.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (alertId: string) => {
    setOperationError(null);
    try {
      await deletePriceAlert(userId, alertId);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'Gagal menghapus Price Alert dari Firestore.');
    }
  };

  const handleToggleStatus = async (alert: PriceAlert) => {
    const nextStatus = alert.status === 'active' ? 'disabled' : 'active';
    setOperationError(null);
    try {
      await updatePriceAlert(userId, alert.id, {
        status: nextStatus,
        notificationSent: false,
      });
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'Gagal memperbarui Price Alert di Firestore.');
    }
  };

  const handleReactivate = async (alert: PriceAlert) => {
    setOperationError(null);
    try {
      await updatePriceAlert(userId, alert.id, {
        status: 'active',
        notificationSent: false,
        initialPrice: currentPrices[alert.symbol] || alert.initialPrice,
      });
      setSuccessToast(`Alert ${alert.symbol} diaktifkan kembali!`);
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : 'Gagal memperbarui Price Alert di Firestore.');
    }
  };

  // Filtered lists
  const activeAlerts = alerts.filter((a) => a.status === 'active' || a.status === 'disabled');
  const triggeredAlerts = alerts.filter((a) => a.status === 'triggered');

  // Filtered coins for dropdown
  const filteredCoins = SUPPORTED_COINS.filter((c) =>
    c.coin.toLowerCase().includes(searchCoinQuery.toLowerCase()) ||
    c.name.toLowerCase().includes(searchCoinQuery.toLowerCase()) ||
    c.pair.toLowerCase().includes(searchCoinQuery.toLowerCase())
  );

  // Calculate distance
  const targetNum = parseFloat(targetPriceInput) || 0;
  const priceDistance = targetNum > 0 && livePrice > 0 ? targetNum - livePrice : 0;
  const percentDistance = livePrice > 0 ? (priceDistance / livePrice) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-[#0B1320] border border-slate-200 dark:border-[#1E2E44] rounded-2xl shadow-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-[#162338] flex items-center justify-between bg-slate-50/70 dark:bg-[#0E1829]/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-slate-900 dark:text-white font-sans">
                  Price Alert &amp; Notifikasi Browser
                </h3>
                  <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[10px] leading-relaxed text-amber-300">
                    Mode saat ini: <strong>alert browser saat aplikasi aktif</strong>. Jika browser ditutup atau perangkat tidur, pemicu notifikasi dapat tertunda.
                  </div>
                {activeAlerts.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                    {activeAlerts.filter((a) => a.status === 'active').length} Aktif
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                Kirim notifikasi otomatis ke desktop/ponsel saat koin mencapai harga target.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Permission Banner */}
        <div className="px-4 sm:px-5 py-2.5 bg-slate-100/70 dark:bg-[#0C1525] border-b border-slate-200 dark:border-[#162338] flex items-center justify-between flex-wrap gap-2 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${permission === 'granted' ? 'bg-emerald-500' : 'bg-amber-500 animate-ping'}`} />
            <span className="font-sans text-[11px] text-slate-700 dark:text-slate-300">
              {permission === 'granted' ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ Izin Notifikasi Browser Aktif (Suara &amp; Pop-up Desktop)
                </span>
              ) : permission === 'denied' ? (
                <span className="text-rose-600 dark:text-rose-400 font-medium">
                  ⚠️ Izin Notifikasi Diblokir oleh browser. Notifikasi in-app &amp; suara tetap aktif.
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-300 font-medium">
                  Izin Notifikasi Belum Diaktifkan di Browser ini.
                </span>
              )}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {permission !== 'granted' && permission !== 'unsupported' && (
              <button
                type="button"
                onClick={handleRequestPermission}
                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[10.5px] transition cursor-pointer font-sans shadow-xs"
              >
                Aktifkan Notifikasi
              </button>
            )}
            <button
              type="button"
              onClick={handleTestNotification}
              className="px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10.5px] font-sans flex items-center gap-1 transition cursor-pointer"
              title="Coba bunyi & kirim pop-up tes"
            >
              <Volume2 className="w-3 h-3" />
              <span>Tes Notifikasi</span>
            </button>
          </div>
        </div>

        {/* Success Toast */}
        {successToast && (
          <div className="mx-4 sm:mx-5 mt-3 p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-sans flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="font-medium">{successToast}</span>
          </div>
        )}
        {operationError && (
          <div className="mx-4 sm:mx-5 mt-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-sans flex items-center gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="font-medium">{operationError}</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="px-4 sm:px-5 pt-3 border-b border-slate-100 dark:border-[#162338] flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`pb-2.5 px-3 text-xs font-sans font-medium border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'create'
                ? 'border-amber-500 text-amber-600 dark:text-[#F0B90B] font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Pasang Alert Baru</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`pb-2.5 px-3 text-xs font-sans font-medium border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'list'
                ? 'border-amber-500 text-amber-600 dark:text-[#F0B90B] font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Daftar Alert ({activeAlerts.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('trading')}
            className={`pb-2.5 px-3 text-xs font-sans font-medium border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'trading'
                ? 'border-amber-500 text-amber-600 dark:text-[#F0B90B] font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Notifikasi Bot & Trading</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 px-3 text-xs font-sans font-medium border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'history'
                ? 'border-amber-500 text-amber-600 dark:text-[#F0B90B] font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Riwayat Tercapai ({triggeredAlerts.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scrollbar space-y-4">

          {/* TAB 1: CREATE ALERT */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateAlert} className="space-y-4">

              {/* Coin Selector with Live Price */}
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-bold text-slate-700 dark:text-slate-300 block">
                  Pilih Koin / Pasangan Pasar:
                </label>

                <div className="relative">
                  <div
                    onClick={() => setShowCoinDropdown(!showCoinDropdown)}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-[#0C1524] border border-slate-200 dark:border-[#1A2A40] flex items-center justify-between cursor-pointer hover:border-amber-500/50 transition"
                  >
                    <div className="flex items-center gap-2.5">
                      <CoinLogo coin={selectedPair} size="sm" />
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white font-mono text-xs flex items-center gap-1.5">
                          <span>{selectedPair}</span>
                          <span className="text-[10px] text-slate-400 font-sans font-normal">
                            ({SUPPORTED_COINS.find((c) => c.pair === selectedPair)?.name || 'Crypto'})
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                          Harga Terkini: <strong className="text-emerald-600 dark:text-emerald-400 font-bold">${formatUsdt(livePrice)}</strong>
                        </div>
                      </div>
                    </div>

                    <span className="text-xs font-sans text-amber-600 dark:text-amber-400 font-medium">
                      Ganti Koin ▾
                    </span>
                  </div>

                  {/* Dropdown menu */}
                  {showCoinDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white dark:bg-[#0E1A2B] border border-slate-200 dark:border-[#1E2E44] rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1">
                      <div className="p-2 border-b border-slate-100 dark:border-[#162338]">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Cari BTC, ETH, SOL, XRP..."
                            value={searchCoinQuery}
                            onChange={(e) => setSearchCoinQuery(e.target.value)}
                            className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-[#080E18] border border-slate-200 dark:border-[#1A2A40] text-slate-900 dark:text-white font-sans focus:outline-none focus:border-amber-500"
                          />
                        </div>
                      </div>

                      <div className="max-h-52 overflow-y-auto custom-scrollbar p-1">
                        {filteredCoins.map((coin, coinIndex) => {
                          const cPrice = currentPrices[coin.pair] || coin.price;
                          return (
                            <div
                              key={`${coin.pair}-${coin.coin || "asset"}-${coinIndex}`}
                              onClick={() => handleSelectCoin(coin.pair)}
                              className={`p-2 rounded-lg flex items-center justify-between cursor-pointer text-xs font-mono transition ${
                                selectedPair === coin.pair
                                  ? 'bg-amber-500/15 text-amber-600 dark:text-[#F0B90B] font-bold'
                                  : 'hover:bg-slate-100 dark:hover:bg-[#142236] text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <CoinLogo coin={coin.coin} size="xs" />
                                <div>
                                  <div className="font-bold">{coin.pair}</div>
                                  <div className="text-[10px] text-slate-400 font-sans">{coin.name}</div>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold">${formatUsdt(cPrice)}</div>
                                <div className={`text-[10px] ${coin.change24h >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                  {formatPercent(coin.change24h)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Condition (Above vs Below) */}
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-bold text-slate-700 dark:text-slate-300 block">
                  Kondisi Pemicu Alert:
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCondition('above');
                      if (livePrice > 0) {
                        const target = livePrice * 1.02;
                        setTargetPriceInput(target >= 1 ? target.toFixed(2) : target.toFixed(6));
                      }
                    }}
                    className={`p-3 rounded-xl border flex items-center gap-2.5 transition text-left cursor-pointer ${
                      condition === 'above'
                        ? 'bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-400 font-bold'
                        : 'bg-slate-50 dark:bg-[#0C1524] border-slate-200 dark:border-[#1A2A40] text-slate-700 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      condition === 'above' ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                    }`}>
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-sans font-bold">Harga Naik (≥ Target)</div>
                      <div className="text-[10px] text-slate-500 font-sans mt-0.5">Bunyikan saat naik melampaui harga target</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCondition('below');
                      if (livePrice > 0) {
                        const target = livePrice * 0.98;
                        setTargetPriceInput(target >= 1 ? target.toFixed(2) : target.toFixed(6));
                      }
                    }}
                    className={`p-3 rounded-xl border flex items-center gap-2.5 transition text-left cursor-pointer ${
                      condition === 'below'
                        ? 'bg-rose-500/10 border-rose-500 text-rose-700 dark:text-rose-400 font-bold'
                        : 'bg-slate-50 dark:bg-[#0C1524] border-slate-200 dark:border-[#1A2A40] text-slate-700 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      condition === 'below' ? 'bg-rose-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                    }`}>
                      <TrendingDown className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-sans font-bold">Harga Turun (≤ Target)</div>
                      <div className="text-[10px] text-slate-500 font-sans mt-0.5">Bunyikan saat turun menembus harga target</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Target Price Input & Quick Presets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-sans font-bold text-slate-700 dark:text-slate-300">
                    Target Harga (USDT):
                  </label>
                  {targetNum > 0 && (
                    <span className={`text-[11px] font-mono font-bold ${percentDistance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {percentDistance >= 0 ? `+${percentDistance.toFixed(2)}%` : `${percentDistance.toFixed(2)}%`} dari harga live (${formatUsdt(priceDistance > 0 ? priceDistance : -priceDistance)})
                    </span>
                  )}
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-slate-400 font-mono text-sm">$</span>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="Contoh: 69500.00"
                    value={targetPriceInput}
                    onChange={(e) => setTargetPriceInput(e.target.value)}
                    className="w-full pl-8 pr-16 py-2.5 text-base font-mono font-bold rounded-xl bg-slate-50 dark:bg-[#0C1524] border border-slate-200 dark:border-[#1A2A40] text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                  <span className="absolute right-3.5 top-3 text-slate-400 font-mono text-xs">USDT</span>
                </div>

                {/* Quick Presets */}
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans block">
                    Preset Cepat Persentase:
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      { label: '+1%', val: 1 },
                      { label: '+2%', val: 2 },
                      { label: '+5%', val: 5 },
                      { label: '+10%', val: 10 },
                      { label: '-1%', val: -1 },
                      { label: '-2%', val: -2 },
                      { label: '-5%', val: -5 },
                      { label: '-10%', val: -10 },
                    ].map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => handleSelectPreset(p.val)}
                        className={`px-2 py-1 rounded-lg text-[10.5px] font-mono font-semibold border transition cursor-pointer ${
                          p.val > 0
                            ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Note / Label (Optional) */}
              <div className="space-y-1">
                <label className="text-xs font-sans font-bold text-slate-700 dark:text-slate-300">
                  Catatan Pengingat (Opsional):
                </label>
                <input
                  type="text"
                  maxLength={100}
                  placeholder="Contoh: Waktunya Take Profit manual / Cek Averaging"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#0C1524] border border-slate-200 dark:border-[#1A2A40] text-slate-900 dark:text-white font-sans focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Repeating Option */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0C1524] border border-slate-200 dark:border-[#1A2A40] flex items-center justify-between">
                <div>
                  <span className="text-xs font-sans font-bold text-slate-900 dark:text-white block">
                    Mode Alert Berulang
                  </span>
                  <span className="text-[10.5px] text-slate-500 dark:text-slate-400 font-sans block mt-0.5">
                    {isRepeating
                      ? 'Alert tetap aktif dan akan membunyikan notifikasi setiap harga kembali menyentuh target.'
                      : 'Alert sekali pakai (otomatis dinonaktifkan setelah berbunyi pertama kali).'}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={isRepeating}
                  onChange={(e) => setIsRepeating(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-400 cursor-pointer"
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || targetNum <= 0}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-sans font-extrabold text-sm shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <BellRing className="w-4 h-4" />
                  <span>{isSubmitting ? 'Menyimpan Alert...' : `Pasang Price Alert ${selectedPair}`}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: ACTIVE ALERTS LIST */}
          {activeTab === 'list' && (
            <div className="space-y-3">
              {activeAlerts.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs font-sans space-y-2">
                  <Bell className="w-8 h-8 text-slate-400 mx-auto opacity-50" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Belum ada Price Alert aktif</p>
                  <p className="text-[11px] text-slate-500">
                    Klik tab &quot;Pasang Alert Baru&quot; di atas untuk mulai memasang target harga koin.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('create')}
                    className="mt-2 px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs cursor-pointer inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Pasang Alert Sekarang
                  </button>
                </div>
              ) : (
                activeAlerts.map((alert) => {
                  const cPrice = currentPrices[alert.symbol] || alert.initialPrice;
                  const distance = alert.targetPrice - cPrice;
                  const pctDistance = cPrice > 0 ? ((alert.targetPrice - cPrice) / cPrice) * 100 : 0;
                  const isClose = Math.abs(pctDistance) <= 1.0;

                  return (
                    <div
                      key={alert.id}
                      className={`p-3.5 rounded-xl border transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                        alert.status === 'disabled'
                          ? 'bg-slate-50/50 dark:bg-[#0A101C]/50 border-slate-200/50 dark:border-[#142034] opacity-60'
                          : isClose
                          ? 'bg-amber-500/10 border-amber-500/40 shadow-xs'
                          : 'bg-slate-50 dark:bg-[#0C1524] border-slate-200 dark:border-[#1A2A40]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <CoinLogo coin={alert.coin} size="sm" />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs font-mono text-slate-900 dark:text-white">
                              {alert.symbol}
                            </span>
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-sans font-bold flex items-center gap-1 ${
                              alert.condition === 'above'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                            }`}>
                              {alert.condition === 'above' ? (
                                <>
                                  <TrendingUp className="w-3 h-3" />
                                  <span>Naik &ge; ${formatUsdt(alert.targetPrice)}</span>
                                </>
                              ) : (
                                <>
                                  <TrendingDown className="w-3 h-3" />
                                  <span>Turun &le; ${formatUsdt(alert.targetPrice)}</span>
                                </>
                              )}
                            </span>
                            {alert.isRepeating && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-sans bg-blue-500/10 text-blue-500 border border-blue-500/20">
                                Berulang
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-500 font-mono mt-1 flex items-center gap-2 flex-wrap">
                            <span>Live: <strong className="text-slate-800 dark:text-slate-200 font-bold">${formatUsdt(cPrice)}</strong></span>
                            <span>•</span>
                            <span className={isClose ? 'text-amber-600 dark:text-amber-400 font-bold animate-pulse' : 'text-slate-400'}>
                              Jarak: {pctDistance >= 0 ? `+${pctDistance.toFixed(2)}%` : `${pctDistance.toFixed(2)}%`}
                            </span>
                          </div>

                          {alert.note && (
                            <p className="text-[10px] text-slate-400 italic font-sans mt-0.5">
                              &ldquo;{alert.note}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(alert)}
                          className={`px-2.5 py-1 rounded-lg text-[10.5px] font-sans font-bold transition cursor-pointer ${
                            alert.status === 'active'
                              ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300'
                              : 'bg-emerald-500 text-white hover:bg-emerald-600'
                          }`}
                        >
                          {alert.status === 'active' ? 'Jeda' : 'Aktifkan'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(alert.id)}
                          className="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 flex items-center justify-center transition cursor-pointer"
                          title="Hapus Alert"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: TRADING & BOT NOTIFICATIONS (Layer Execution & Take Profit) */}
          {activeTab === 'trading' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                  <BellRing className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-amber-600 dark:text-amber-400 font-mono">
                    Sistem Notifikasi Otomatis Bot GAIN
                  </h4>
                  <p className="text-[11.5px] text-slate-600 dark:text-slate-300 font-sans mt-0.5 leading-relaxed">
                    Sistem secara instan membunyikan audio chime dan mengirimkan notifikasi sistem browser ke perangkat Anda ketika bot kuantitatif mengeksekusi order layer averaging/grid maupun saat posisi aset menyentuh target Take Profit.
                  </p>
                </div>
              </div>

              {/* Status Browser Permission */}
              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0C1524] border border-slate-200 dark:border-[#1A2A40] flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block font-sans">
                    Izin Notifikasi Browser:
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    Status saat ini: <strong className={permission === 'granted' ? 'text-emerald-500' : 'text-amber-500'}>
                      {permission === 'granted' ? 'DIIZINKAN (AKTIF)' : permission === 'denied' ? 'DIBLOKIR BROWSER' : 'PERLU PERSETUJUAN'}
                    </strong>
                  </span>
                </div>
                {permission !== 'granted' && (
                  <button
                    type="button"
                    onClick={handleRequestPermission}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold font-mono transition shadow-xs cursor-pointer"
                  >
                    Izinkan Notifikasi
                  </button>
                )}
              </div>

              {/* Feature 1: Layer Execution Alerts */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0C1524] border border-slate-200 dark:border-[#1A2A40] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                        Notifikasi Layer Tereksekusi (Averaging & Grid)
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                        Pemberitahuan setiap kali bot membuka order pengisian layer baru
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-mono">
                    AKTIF
                  </span>
                </div>

                <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono bg-white dark:bg-[#080E18] p-2.5 rounded-xl border border-slate-200 dark:border-[#162338]">
                  Format pesan: &ldquo;🤖 Layer 2/20 Tereksekusi: BTC/USDT — Order BUY 0.0005 BTC @ $94,500.00 (Biaya: $50.00 USDT)&rdquo;
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleTestLayer}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Uji Notifikasi Layer</span>
                  </button>
                </div>
              </div>

              {/* Feature 2: Take Profit Alerts */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#0C1524] border border-slate-200 dark:border-[#1A2A40] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                        Notifikasi Terkena Take Profit (TP)
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                        Pemberitahuan otomatis dengan arpeggio kemenangan saat profit terealisasi
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-mono">
                    AKTIF
                  </span>
                </div>

                <div className="text-[11px] text-slate-600 dark:text-slate-400 font-mono bg-white dark:bg-[#080E18] p-2.5 rounded-xl border border-slate-200 dark:border-[#162338]">
                  Format pesan: &ldquo;🎉 Take Profit Tercapai: BTC/USDT (+2.50%)! — Profit +$12.50 USDT direalisasikan ke saldo kas.&rdquo;
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleTestTp}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Uji Notifikasi Take Profit</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: TRIGGERED HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              {triggeredAlerts.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs font-sans space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-slate-400 mx-auto opacity-50" />
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Belum ada alert yang tercapai</p>
                  <p className="text-[11px] text-slate-500">
                    Ketika target harga tercapai, riwayat dan harga saat picu akan tercatat di sini.
                  </p>
                </div>
              ) : (
                triggeredAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0C1524] border border-slate-200 dark:border-[#1A2A40] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white font-mono flex items-center gap-2">
                          <span>{alert.symbol}</span>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans font-bold">
                            Tercapai di ${formatUsdt(alert.triggeredPrice || alert.targetPrice)}
                          </span>
                        </div>
                        <div className="text-[10.5px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                          Target: ${formatUsdt(alert.targetPrice)} ({alert.condition === 'above' ? 'Naik melampaui' : 'Turun menembus'}) • {alert.triggeredAt ? new Date(alert.triggeredAt).toLocaleString('id-ID') : 'Baru saja'}
                        </div>
                        {alert.note && (
                          <div className="text-[10px] text-slate-400 italic mt-0.5">
                            &ldquo;{alert.note}&rdquo;
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleReactivate(alert)}
                        className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 text-[10.5px] font-sans font-bold transition flex items-center gap-1 cursor-pointer"
                        title="Pasang ulang target ini"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Aktifkan Lagi</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDelete(alert.id)}
                        className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-400 hover:text-rose-500 flex items-center justify-center transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-slate-100 dark:border-[#162338] bg-slate-50/70 dark:bg-[#0E1829]/70 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-sans shrink-0">
          <span className="flex items-center gap-1.5 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Pemeriksaan harga sub-detik via Binance Public WebSocket.</span>
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
}
