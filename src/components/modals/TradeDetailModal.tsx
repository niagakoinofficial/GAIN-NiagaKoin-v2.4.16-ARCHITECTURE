import React, { useState } from 'react';
import {
  X,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { TradingPosition, ExecutedLayerDetail } from '../../types';
import { formatUsdt } from '../../utils/formatters';
import { generateDefaultLayersForPosition } from '../../utils/tradingPositionUtils';
import { CoinLogo } from '../common/CoinLogo';

interface TradeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  position: TradingPosition | null;
  onForceTakeProfit?: (positionId: string) => void;
  onCloseLayer?: (positionId: string, layerId: string) => void;
}

export function TradeDetailModal({
  isOpen,
  onClose,
  position,
  onForceTakeProfit,
  onCloseLayer,
}: TradeDetailModalProps) {
  const [closingLayerId, setClosingLayerId] = useState<string | null>(null);

  if (!isOpen || !position) return null;

  const allLayers: ExecutedLayerDetail[] =
    position.executedLayers && position.executedLayers.length > 0
      ? position.executedLayers
      : generateDefaultLayersForPosition(position);
  const closedLayerIds = new Set(position.closedLayerIds || []);
  const layers = allLayers.filter((layer) => !closedLayerIds.has(layer.id));

  const isProfitable = (position.floatingPnl ?? 0) >= 0;

  const handleCloseSingleLayer = async (layerId: string) => {
    setClosingLayerId(layerId);
    try {
      if (onCloseLayer) {
        await onCloseLayer(position.id, layerId);
      }
    } finally {
      setClosingLayerId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="theme-modal-shell w-full max-w-2xl bg-[#0F172A] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <CoinLogo coin={position.coin} size="lg" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white font-mono">{position.pair}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  {position.botMode || 'Avarage+Grid'}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  position.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-300'
                }`}>
                  {position.statusLabel || position.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                Bot ID: <span className="font-mono text-slate-300">{position.botId || position.id}</span>
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

        {/* Overview Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4 bg-slate-950/40 border-b border-slate-800/80">
          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">Harga Saat Ini</span>
            <span className="text-sm font-bold text-white font-mono">${position.price?.toFixed(4) || '0.0000'}</span>
            <span className={`text-[10px] font-mono block ${position.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {position.change24h >= 0 ? '+' : ''}{position.change24h?.toFixed(2)}%
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">Floating PnL</span>
            <span className={`text-sm font-bold font-mono ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isProfitable ? '+' : ''}{position.floatingPnl != null ? `$${position.floatingPnl.toFixed(2)}` : '$0.00'}
            </span>
            <span className={`text-[10px] font-mono block ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
              ROI: {position.roiPct != null ? `${position.roiPct.toFixed(2)}%` : '0.00%'}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">Total Layer</span>
            <span className="text-sm font-bold text-amber-400 font-mono">
              Layer {position.stepLayer || layers.length} / {position.maxStep || 100}
            </span>
            <span className="text-[10px] text-slate-400 font-mono block">
              Alokasi: {position.allocationUsdt || '$0.00'}
            </span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">Target Take Profit</span>
            <span className="text-sm font-bold text-emerald-400 font-mono">
              {position.tpTargetPrice ? `$${position.tpTargetPrice}` : '+1.50%'}
            </span>
            <span className="text-[10px] text-slate-400 font-mono block truncate">
              {position.trailingInfo || 'Trailing 0.3%'}
            </span>
          </div>
        </div>

        {/* Executed Layers List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          <div className="flex items-center justify-between pb-1">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              Detail Layer averaging & Grid ({layers.length} Layer)
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">
              Matrix Engine Active
            </span>
          </div>

          {layers.map((layer) => {
            const layerPnlPositive = (layer.floatingPnlUsdt ?? 0) >= 0;
            return (
              <div
                key={layer.id}
                className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold text-[10px] font-mono flex items-center justify-center">
                      L{layer.layerStep}
                    </span>
                    <span className="text-xs font-bold text-white font-mono">{layer.label}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-slate-800 text-slate-400">
                      {layer.layerType}
                    </span>
                    {layer.isInitialEntry && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-300">
                        Base Entry
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">{layer.date}</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono pt-1 border-t border-slate-800/60">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Buy Price:</span>
                    <span className="text-slate-200 font-semibold">${layer.buyPrice.toFixed(4)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Cost / Size:</span>
                    <span className="text-slate-200 font-semibold">${layer.costUsdt.toFixed(2)} USDT</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">Est. TP:</span>
                    <span className="text-emerald-400 font-semibold">${layer.estimatedTpPrice.toFixed(4)} (+{layer.estimatedTpPct}%)</span>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2">
                    <div>
                      <span className="text-[10px] text-slate-500 block sm:text-right">PnL:</span>
                      <span className={`font-bold ${layerPnlPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {layerPnlPositive ? '+' : ''}${layer.floatingPnlUsdt.toFixed(2)}
                      </span>
                    </div>
                    {onCloseLayer && (
                      <button
                        onClick={() => handleCloseSingleLayer(layer.id)}
                        disabled={closingLayerId === layer.id}
                        className="px-2 py-1 rounded-lg text-[10px] font-bold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition cursor-pointer disabled:opacity-50"
                      >
                        {closingLayerId === layer.id ? 'Closing...' : 'Close'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Auto Stop-Loss & Dynamic Matrix Protected</span>
          </div>

          <div className="flex items-center gap-2">
            {onForceTakeProfit && (
              <button
                onClick={() => {
                  onForceTakeProfit(position.id);
                  onClose();
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold font-mono bg-gradient-to-r from-emerald-500 to-teal-500 text-white hover:from-emerald-600 hover:to-teal-600 transition shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                Force Take Profit
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold font-mono bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
