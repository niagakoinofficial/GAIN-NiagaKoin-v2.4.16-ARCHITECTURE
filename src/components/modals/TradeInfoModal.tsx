import React from 'react';
import { X, Info, Sliders, ShieldCheck, Activity, TrendingUp, DollarSign } from 'lucide-react';
import { TradingPosition } from '../../types';
import { CoinLogo } from '../common/CoinLogo';

interface TradeInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: TradingPosition | null;
  onOpenSettings?: ((position: any) => void) | ((pair: string) => void);
}

export function TradeInfoModal({
  isOpen,
  onClose,
  position,
  onOpenSettings,
}: TradeInfoModalProps) {
  if (!isOpen || !position) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="theme-modal-shell w-full max-w-lg bg-[#0F172A] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <CoinLogo coin={position.coin} size="md" />
            <div>
              <h2 className="text-base font-bold text-white font-mono">{position.pair} Info</h2>
              <p className="text-xs text-slate-400 font-sans">
                Algorithmic Execution Parameters
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs font-mono">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Bot Engine</span>
              <span className="font-bold text-white text-sm">{position.engine || 'GAIN Martingale Matrix'}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Mode</span>
              <span className="font-bold text-amber-400 text-sm">{position.botMode || 'Avarage+Grid'}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Alokasi Total</span>
              <span className="font-bold text-white text-sm">{position.allocationUsdt || '$0.00'}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block">Max Layer</span>
              <span className="font-bold text-white text-sm">{position.maxStep || 100} Layers</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="flex justify-between items-center text-slate-400">
              <span>Trailing Profit:</span>
              <span className="text-white font-semibold">{position.trailingInfo || '0.3% Dynamic'}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Layer Quota:</span>
              <span className="text-white font-semibold">{position.layerQuota || '100%'}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Status Matrix:</span>
              <span className="text-emerald-400 font-semibold">{position.statusLabel || position.status}</span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-end gap-2">
          {onOpenSettings && (
            <button
              onClick={() => {
                (onOpenSettings as any)(position.pair || position);
                onClose();
              }}
              className="px-4 py-2 rounded-xl text-xs font-bold font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 transition flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Buka Konfigurasi Matrix</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold font-mono bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
