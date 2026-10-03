import React, { useEffect, useState } from 'react';
import {
  Bell,
  Layers,
  TrendingUp,
  X,
  Volume2,
  VolumeX,
  ShieldCheck,
  CheckCircle2,
  ArrowUpRight,
  ExternalLink,
} from 'lucide-react';
import { CoinLogo } from './CoinLogo';
import { formatUsdt } from '../../utils/formatters';

export interface AppNotification {
  id: string;
  type: 'price_alert' | 'layer_executed' | 'take_profit' | 'info';
  title: string;
  message: string;
  pair?: string;
  coin?: string;
  price?: number;
  amount?: number;
  costUsdt?: number;
  profitUsdt?: number;
  roiPct?: number;
  layerStep?: number;
  maxStep?: number;
  timestamp: number;
}

interface NotificationToastContainerProps {
  notifications: AppNotification[];
  onDismiss: (id: string) => void;
  onOpenPriceAlertModal?: (pair?: string) => void;
  onOpenTradeDetailModal?: (pair?: string) => void;
  soundEnabled?: boolean;
  onToggleSound?: () => void;
  browserPermission?: 'granted' | 'denied' | 'default' | 'unsupported';
  onRequestPermission?: () => void;
}

export function NotificationToastContainer({
  notifications,
  onDismiss,
  onOpenPriceAlertModal,
  onOpenTradeDetailModal,
  soundEnabled = true,
  onToggleSound,
  browserPermission,
  onRequestPermission,
}: NotificationToastContainerProps) {
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);

  useEffect(() => {
    // Only prompt if default
    if (browserPermission === 'default') {
      const dismissed = sessionStorage.getItem('gain_notif_banner_dismissed');
      if (!dismissed) {
        setShowPermissionPrompt(true);
      }
    } else {
      setShowPermissionPrompt(false);
    }
  }, [browserPermission]);

  const handleDismissPermissionBanner = () => {
    setShowPermissionPrompt(false);
    sessionStorage.setItem('gain_notif_banner_dismissed', 'true');
  };

  return (
    <div className="fixed top-16 sm:top-20 right-3 sm:right-5 z-50 flex flex-col items-end gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none">
      {/* Browser Notification Permission Suggestion Banner */}
      {showPermissionPrompt && onRequestPermission && (
        <div className="w-full p-3.5 rounded-2xl bg-white/95 dark:bg-[#0F172A]/95 border border-amber-500/40 shadow-2xl backdrop-blur-md pointer-events-auto animate-fadeIn flex items-start gap-3 text-slate-900 dark:text-slate-100">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
            <Bell className="w-4 h-4 animate-bounce" />
          </div>
          <div className="flex-1 text-xs">
            <h4 className="font-bold text-slate-900 dark:text-white font-mono flex items-center gap-1.5">
              <span>Aktifkan Notifikasi Browser</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                PENTING
              </span>
            </h4>
            <p className="text-slate-600 dark:text-slate-300 text-[11px] mt-0.5 leading-snug font-sans">
              Dapatkan peringatan instan saat target harga tercapai, layer averaging terisi, dan terkena Take Profit.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={onRequestPermission}
                className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold font-mono text-[10px] transition cursor-pointer shadow-xs"
              >
                Izinkan Notifikasi
              </button>
              <button
                onClick={handleDismissPermissionBanner}
                className="px-2 py-1 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white text-[10px] font-mono transition cursor-pointer focus-visible:outline-offset-2"
              >
                Nanti
              </button>
            </div>
          </div>
          <button
            onClick={handleDismissPermissionBanner}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white p-1 focus-visible:outline-offset-2"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Floating Active Notifications */}
      {notifications.map((notif) => {
        const isTakeProfit = notif.type === 'take_profit';
        const isLayer = notif.type === 'layer_executed';
        const isPriceAlert = notif.type === 'price_alert';

        const borderColor = isTakeProfit
          ? 'border-emerald-500/50 shadow-emerald-500/10'
          : isLayer
          ? 'border-cyan-500/50 shadow-cyan-500/10'
          : 'border-amber-500/50 shadow-amber-500/10';

        const headerBg = isTakeProfit
          ? 'bg-emerald-500/10 text-emerald-400'
          : isLayer
          ? 'bg-cyan-500/10 text-cyan-400'
          : 'bg-amber-500/10 text-amber-400';

        return (
          <div
            key={notif.id}
            className={`w-full p-3.5 rounded-2xl bg-white/95 dark:bg-[#0B1320]/95 border ${borderColor} shadow-2xl backdrop-blur-md pointer-events-auto animate-slideInRight transition-all text-slate-900 dark:text-slate-100`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                {notif.coin ? (
                  <CoinLogo coin={notif.coin} size="sm" />
                ) : (
                  <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${headerBg}`}>
                    {isTakeProfit ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : isLayer ? (
                      <Layers className="w-4 h-4" />
                    ) : (
                      <Bell className="w-4 h-4" />
                    )}
                  </div>
                )}

                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-xs text-slate-900 dark:text-white font-mono">{notif.title}</span>
                    {isTakeProfit && notif.roiPct != null && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        +{notif.roiPct.toFixed(2)}%
                      </span>
                    )}
                    {isLayer && notif.layerStep != null && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                        L{notif.layerStep}{notif.maxStep ? `/${notif.maxStep}` : ''}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 font-sans leading-snug">
                    {notif.message}
                  </p>

                  {/* Context stats pill */}
                  {(notif.price || notif.profitUsdt || notif.costUsdt) && (
                    <div className="flex items-center gap-2 mt-2 text-[10px] font-mono text-slate-400">
                      {notif.price != null && (
                        <span>Harga: <strong className="text-slate-900 dark:text-white">${formatUsdt(notif.price)}</strong></span>
                      )}
                      {notif.profitUsdt != null && (
                        <span>Profit: <strong className="text-emerald-400">+${notif.profitUsdt.toFixed(2)} USDT</strong></span>
                      )}
                      {notif.costUsdt != null && (
                        <span>Biaya: <strong className="text-cyan-300">${notif.costUsdt.toFixed(2)} USDT</strong></span>
                      )}
                      <span>• {new Date(notif.timestamp).toLocaleTimeString('id-ID')}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {isPriceAlert && onOpenPriceAlertModal && notif.pair && (
                  <button
                    onClick={() => onOpenPriceAlertModal(notif.pair)}
                    className="p-1 text-slate-400 hover:text-amber-400 transition"
                    title="Buka Alert Settings"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
                {isLayer && onOpenTradeDetailModal && notif.pair && (
                  <button
                    onClick={() => onOpenTradeDetailModal(notif.pair)}
                    className="p-1 text-slate-400 hover:text-cyan-400 transition"
                    title="Lihat Detail Layer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => onDismiss(notif.id)}
                    className="p-1 text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition focus-visible:outline-offset-2"
                  title="Tutup"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
