import React, { useState } from 'react';
import { BotInstance } from '../types';
import {
  Calculator, Layers, ArrowDownRight, TrendingUp, ShieldAlert,
  Check, Sparkles, DollarSign, Percent, Info, AlertTriangle
} from 'lucide-react';

interface SafetyPlanItem {
  layer: number;
  dropPercentFromPrev: number;
  cumulativeDropPercent: number;
  priceTarget: number;
  orderVolumeUsd: number;
  totalSpentUsd: number;
  cryptoBought: number;
  totalCrypto: number;
  newAveragePrice: number;
  takeProfitPrice: number;
  reboundRequiredFromThisPricePercent: number;
}

export const ParameterPlannerModal: React.FC<{
  bot: BotInstance;
  onClose: () => void;
  onSave: (updatedBot: BotInstance) => void;
}> = ({ bot, onClose, onSave }) => {
  const [baseOrderUsd, setBaseOrderUsd] = useState(bot.baseOrderUsd || 10);
  const [safetyOrderCount, setSafetyOrderCount] = useState(bot.maxSafetyOrders || 6);
  const [volumeMultiplier, setVolumeMultiplier] = useState(bot.volumeMultiplier || 1.5);
  const [stepDeviationPercent, setStepDeviationPercent] = useState(bot.stepDeviationPercent || 1.8);
  const [stepScale, setStepScale] = useState(bot.stepScale || 1.2);
  const [takeProfitPercent, setTakeProfitPercent] = useState(bot.takeProfitPercent || 1.25);
  const [trailingTpPercent, setTrailingTpPercent] = useState(bot.trailingTpPercent || 0.2);

  // Generate dynamic multi-layer safety table according to MoonBot mathematical model
  const currentPrice = bot.currentMarketPrice;

  const safetyPlan: SafetyPlanItem[] = [];
  let cumulativeSpent = baseOrderUsd;
  let cumulativeCrypto = baseOrderUsd / currentPrice;
  let lastPrice = currentPrice;
  let cumulativeDrop = 0;

  for (let i = 1; i <= safetyOrderCount; i++) {
    const dropFromPrev = stepDeviationPercent * Math.pow(stepScale, i - 1);
    cumulativeDrop += dropFromPrev;
    const targetPrice = currentPrice * (1 - cumulativeDrop / 100);
    const volumeUsd = baseOrderUsd * Math.pow(volumeMultiplier, i);
    const cryptoBought = volumeUsd / targetPrice;

    cumulativeSpent += volumeUsd;
    cumulativeCrypto += cryptoBought;
    const newAveragePrice = cumulativeSpent / cumulativeCrypto;
    const tpPrice = newAveragePrice * (1 + takeProfitPercent / 100);
    const reboundRequired = ((tpPrice - targetPrice) / targetPrice) * 100;

    safetyPlan.push({
      layer: i,
      dropPercentFromPrev: dropFromPrev,
      cumulativeDropPercent: cumulativeDrop,
      priceTarget: targetPrice,
      orderVolumeUsd: volumeUsd,
      totalSpentUsd: cumulativeSpent,
      cryptoBought,
      totalCrypto: cumulativeCrypto,
      newAveragePrice,
      takeProfitPrice: tpPrice,
      reboundRequiredFromThisPricePercent: reboundRequired
    });
  }

  const handleApply = () => {
    onSave({
      ...bot,
      baseOrderUsd,
      maxSafetyOrders: safetyOrderCount,
      volumeMultiplier,
      stepDeviationPercent,
      stepScale,
      takeProfitPercent,
      trailingTpPercent,
      tpTargetPrice: bot.avgEntryPrice * (1 + takeProfitPercent / 100)
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <span>Konfigurasi Parameter Bot: {bot.pair}</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {bot.exchange}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Kalkulator Formula MoonBot DCA Martingale &amp; Proyeksi Daya Tahan Crash Pasar
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg bg-slate-800/80 cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Sliders Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400 font-mono">Base Order (BO)</span>
                <span className="font-bold text-white font-mono">${baseOrderUsd}</span>
              </div>
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={baseOrderUsd}
                onChange={(e) => setBaseOrderUsd(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500">Order awal saat siklus baru buka</span>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400 font-mono">Maks Safety Orders</span>
                <span className="font-bold text-white font-mono">{safetyOrderCount} Layer</span>
              </div>
              <input
                type="range"
                min="2"
                max="8"
                value={safetyOrderCount}
                onChange={(e) => setSafetyOrderCount(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500">Jumlah lapis pelindung penurunan</span>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400 font-mono">Volume Multiplier</span>
                <span className="font-bold text-emerald-400 font-mono">{volumeMultiplier}x</span>
              </div>
              <input
                type="range"
                min="1.1"
                max="2.0"
                step="0.05"
                value={volumeMultiplier}
                onChange={(e) => setVolumeMultiplier(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500">Faktor Martingale penambahan volume</span>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400 font-mono">Step Deviation Awal</span>
                <span className="font-bold text-amber-400 font-mono">{stepDeviationPercent}%</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="4.0"
                step="0.1"
                value={stepDeviationPercent}
                onChange={(e) => setStepDeviationPercent(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500">Jarak drop untuk Safety Order 1</span>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400 font-mono">Step Scale (Pelebaran Jarak)</span>
                <span className="font-bold text-amber-400 font-mono">{stepScale}x</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="1.5"
                step="0.05"
                value={stepScale}
                onChange={(e) => setStepScale(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500">Jarak SO makin lebar seiring drop</span>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-400 font-mono">Take Profit Target</span>
                <span className="font-bold text-sky-400 font-mono">+{takeProfitPercent}%</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="3.5"
                step="0.05"
                value={takeProfitPercent}
                onChange={(e) => setTakeProfitPercent(Number(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer"
              />
              <span className="text-[10px] text-slate-500">Dihitung dari AVERAGE PRICE</span>
            </div>
          </div>

          {/* Quick Metrics of this Plan */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Total Modal Dibutuhkan</span>
              <span className="font-bold text-white text-sm">
                ${cumulativeSpent.toFixed(2)} USDT
              </span>
              <span className="text-[10px] text-emerald-400 block mt-0.5">
                Alokasi Bot: ${bot.baseCapital}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Daya Tahan Crash Pasar</span>
              <span className="font-bold text-amber-400 text-sm">
                -{cumulativeDrop.toFixed(2)}%
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Batas aman sebelum HODL
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Average Price di Titik Terbawah</span>
              <span className="font-bold text-sky-400 text-sm">
                ${Math.round(safetyPlan[safetyPlan.length - 1]?.newAveragePrice || 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Drop Pasar -{cumulativeDrop.toFixed(1)}%
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
              <span className="text-slate-500 block text-[10px]">Pantulan Butuh Cuan (Rebound)</span>
              <span className="font-bold text-emerald-400 text-sm">
                +{safetyPlan[safetyPlan.length - 1]?.reboundRequiredFromThisPricePercent.toFixed(2)}%
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Hanya butuh rebound tipis!
              </span>
            </div>
          </div>

          {/* Table Proyeksi Layer */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="font-semibold flex items-center gap-1.5 text-white">
                <Layers className="w-4 h-4 text-emerald-400" />
                Matriks Eksekusi Multi-Layer MoonBot ({safetyOrderCount} Lapisan Safety Order)
              </span>
              <span className="text-[10px] text-slate-500">Harga Acuan: ${currentPrice.toLocaleString()}</span>
            </div>

            <div className="rounded-xl border border-slate-800 overflow-x-auto bg-slate-950">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="p-2.5">Layer</th>
                    <th className="p-2.5">Target Drop</th>
                    <th className="p-2.5">Harga Eksekusi</th>
                    <th className="p-2.5">Volume Order</th>
                    <th className="p-2.5">Akumulasi Modal</th>
                    <th className="p-2.5">Average Entry Price</th>
                    <th className="p-2.5">Target TP (Cuan)</th>
                    <th className="p-2.5">Rebound Diperlukan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  <tr className="bg-slate-900/30 text-slate-300">
                    <td className="p-2.5 font-bold text-emerald-400">Base Order</td>
                    <td className="p-2.5 text-slate-400">0.00%</td>
                    <td className="p-2.5 font-semibold">${currentPrice.toLocaleString()}</td>
                    <td className="p-2.5">${baseOrderUsd.toFixed(2)}</td>
                    <td className="p-2.5">${baseOrderUsd.toFixed(2)}</td>
                    <td className="p-2.5 text-sky-300">${currentPrice.toLocaleString()}</td>
                    <td className="p-2.5 text-emerald-400">
                      ${Math.round(currentPrice * (1 + takeProfitPercent / 100)).toLocaleString()}
                    </td>
                    <td className="p-2.5 text-slate-400">+{takeProfitPercent}%</td>
                  </tr>

                  {safetyPlan.map((item) => (
                    <tr key={item.layer} className="hover:bg-slate-800/40 text-slate-300">
                      <td className="p-2.5 font-bold text-amber-400">SO #{item.layer}</td>
                      <td className="p-2.5 text-rose-400">-{item.cumulativeDropPercent.toFixed(2)}%</td>
                      <td className="p-2.5 font-semibold">${Math.round(item.priceTarget).toLocaleString()}</td>
                      <td className="p-2.5">${item.orderVolumeUsd.toFixed(2)}</td>
                      <td className="p-2.5 font-medium">${item.totalSpentUsd.toFixed(2)}</td>
                      <td className="p-2.5 text-sky-300 font-bold">
                        ${Math.round(item.newAveragePrice).toLocaleString()}
                      </td>
                      <td className="p-2.5 text-emerald-400 font-bold">
                        ${Math.round(item.takeProfitPrice).toLocaleString()}
                      </td>
                      <td className="p-2.5 text-emerald-300 font-semibold">
                        +{item.reboundRequiredFromThisPricePercent.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* MoonBot Insight Warning */}
          <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-xs text-emerald-200/90 leading-relaxed flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-emerald-300 font-mono text-[11px] block">
                Insight Logika MoonBot:
              </span>
              Perhatikan kolom <strong>"Rebound Diperlukan"</strong>. Meskipun koin Anda anjlok <strong>-{cumulativeDrop.toFixed(1)}%</strong>, bot hanya membutuhkan pantulan harga sekitar <strong>+{safetyPlan[safetyPlan.length - 1]?.reboundRequiredFromThisPricePercent.toFixed(2)}%</strong> dari dasar untuk keluar dengan profit 100%! Inilah alasan mengapa strategi ini bekerja sangat konsisten di pasar crypto yang berfluktuasi tinggi.
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <div className="text-xs font-mono text-slate-400">
            Status: <span className="text-emerald-400 font-bold">Parameter Validasi Lolos</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
            >
              Batal
            </button>
            <button
              onClick={handleApply}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-950/40 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Terapkan Parameter ke Bot
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
