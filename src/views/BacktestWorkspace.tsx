import { useMemo, useState } from 'react';
import { BarChart3, Play, Upload, RotateCcw, ArrowLeft, ShieldCheck } from 'lucide-react';
import { BACKTEST_SAMPLE_CSV, parseBacktestCsv, runBacktest, runMonteCarlo, type BacktestConfig, type BacktestResult, type MonteCarloResult } from '../services/backtestService';

interface BacktestWorkspaceProps { onBack?: () => void; }

const defaultConfig: BacktestConfig = {
  strategy: 'DCA', initialCapitalUsd: 1000, baseOrderUsd: 50, stepDeviationPct: 2,
  stepScale: 1.25, volumeMultiplier: 1.3, maxLayers: 8, takeProfitPct: 1.2,
  maxCapitalUsd: 800, useMoneyManagement: true, maxOrderUsd: 50, maxBotExposureUsd: 250, lowerPrice: 90, upperPrice: 110, gridCount: 10, gridOrderUsd: 50, maxSpreadPct: 1,
};

function money(value: number) { return `${value >= 0 ? '' : '-'}$${Math.abs(value).toFixed(2)}`; }
function pct(value: number) { return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`; }

export function BacktestWorkspace({ onBack }: BacktestWorkspaceProps) {
  const [csv, setCsv] = useState(BACKTEST_SAMPLE_CSV);
  const [config, setConfig] = useState(defaultConfig);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState('');
  const [monteCarlo, setMonteCarlo] = useState<MonteCarloResult | null>(null);
  const [mcRunning, setMcRunning] = useState(false);

  const candleCount = useMemo(() => { try { return parseBacktestCsv(csv).length; } catch { return 0; } }, [csv]);

  const run = () => {
    setError('');
    try {
      const candles = parseBacktestCsv(csv);
      setResult(runBacktest(candles, config));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'Backtest gagal dijalankan.');
    }
  };

  const updateNumber = (key: keyof BacktestConfig, value: string) => setConfig((current) => ({ ...current, [key]: Number(value) }));
  const runMonteCarloTest = () => {
    setMcRunning(true); setError('');
    try { setMonteCarlo(runMonteCarlo(parseBacktestCsv(csv), config, 300)); }
    catch (err) { setMonteCarlo(null); setError(err instanceof Error ? err.message : 'Monte Carlo gagal.'); }
    finally { setMcRunning(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#060B14] px-4 py-5 pb-28">
      <div className="max-w-6xl mx-auto space-y-4">
        <header className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-teal-600 dark:text-[#00F0C8]">
              <BarChart3 className="w-5 h-5" /><span className="text-xs font-mono font-bold">GAIN BACKTEST WORKSPACE</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1">Uji strategi tanpa menyentuh exchange</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">CSV candle diproses lokal. Tidak ada API exchange, order, cancel, atau perubahan saldo.</p>
          </div>
          {onBack && <button onClick={onBack} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1E2E44] text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2"><ArrowLeft className="w-4 h-4"/>Kembali</button>}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <section className="lg:col-span-7 p-4 rounded-2xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44]">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-sm font-bold text-slate-900 dark:text-white">Historical candles</div>
              <span className="text-[11px] font-mono text-slate-500">{candleCount} bars</span>
            </div>
            <textarea value={csv} onChange={(event) => setCsv(event.target.value)} className="w-full h-72 rounded-xl bg-slate-950 text-slate-100 border border-slate-800 p-3 font-mono text-[11px] outline-none" spellCheck={false} />
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={() => setCsv(BACKTEST_SAMPLE_CSV)} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#263956] text-xs font-bold flex items-center gap-2"><RotateCcw className="w-4 h-4"/>Contoh CSV</button>
              <label className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#263956] text-xs font-bold flex items-center gap-2 cursor-pointer"><Upload className="w-4 h-4"/>Import CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setCsv(await file.text()); }} /></label>
            </div>
          </section>

          <section className="lg:col-span-5 p-4 rounded-2xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] space-y-3">
            <div className="text-sm font-bold text-slate-900 dark:text-white">Strategy configuration</div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="col-span-2">Strategy<select value={config.strategy} onChange={(e) => setConfig((c) => ({ ...c, strategy: e.target.value as BacktestConfig['strategy'] }))} className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]"><option value="DCA">DCA</option><option value="GRID">GRID</option></select></label>
              <label>Initial capital<input value={config.initialCapitalUsd} onChange={(e) => updateNumber('initialCapitalUsd', e.target.value)} type="number" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]" /></label>
              <label>Order size<input value={config.baseOrderUsd} onChange={(e) => updateNumber('baseOrderUsd', e.target.value)} type="number" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]" /></label>
              <label>TP %<input value={config.takeProfitPct} onChange={(e) => updateNumber('takeProfitPct', e.target.value)} type="number" step="0.1" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]" /></label>
              <label>Max capital<input value={config.maxCapitalUsd} onChange={(e) => updateNumber('maxCapitalUsd', e.target.value)} type="number" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]" /></label>
              <div className="col-span-2 flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-[#243750] bg-slate-50 dark:bg-[#0B1322]">
                <div><div className="text-xs font-bold text-slate-900 dark:text-white">Money Management (MM)</div><div className="text-[10px] text-slate-500 dark:text-slate-400">ON memakai batas order/exposure/capital; OFF melepas batas platform dan tetap dibatasi modal akun.</div></div>
                <button type="button" aria-pressed={config.useMoneyManagement} onClick={() => setConfig((current) => ({ ...current, useMoneyManagement: !current.useMoneyManagement }))} className={`w-10 h-5 rounded-full relative transition ${config.useMoneyManagement ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-700'}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${config.useMoneyManagement ? 'translate-x-5' : 'translate-x-0.5'}`} /></button>
              </div>
              <label>Max order USD<input value={config.maxOrderUsd} onChange={(e) => updateNumber('maxOrderUsd', e.target.value)} disabled={!config.useMoneyManagement} type="number" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 disabled:opacity-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]" /></label>
              <label>Max bot exposure<input value={config.maxBotExposureUsd} onChange={(e) => updateNumber('maxBotExposureUsd', e.target.value)} disabled={!config.useMoneyManagement} type="number" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 disabled:opacity-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]" /></label>
              <label>Fee %<input value={config.feePct} onChange={(e) => updateNumber('feePct', e.target.value)} type="number" step="0.01" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]" /></label>
              <label>Slippage %<input value={config.slippagePct} onChange={(e) => updateNumber('slippagePct', e.target.value)} type="number" step="0.01" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]" /></label>
              {config.strategy === 'DCA' ? <>
                <label>Step deviation %<input value={config.stepDeviationPct} onChange={(e) => updateNumber('stepDeviationPct', e.target.value)} type="number" step="0.1" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]" /></label>
                <label>Step scale<input value={config.stepScale} onChange={(e) => updateNumber('stepScale', e.target.value)} type="number" step="0.05" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]" /></label>
                <label>Volume multiplier<input value={config.volumeMultiplier} onChange={(e) => updateNumber('volumeMultiplier', e.target.value)} type="number" step="0.1" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]" /></label>
                <label>Max layers<input value={config.maxLayers} onChange={(e) => updateNumber('maxLayers', e.target.value)} type="number" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]" /></label>
              </> : <>
                <label>Grid lower<input value={config.lowerPrice} onChange={(e) => updateNumber('lowerPrice', e.target.value)} type="number" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]" /></label>
                <label>Grid upper<input value={config.upperPrice} onChange={(e) => updateNumber('upperPrice', e.target.value)} type="number" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]" /></label>
                <label>Grid count<input value={config.gridCount} onChange={(e) => updateNumber('gridCount', e.target.value)} type="number" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]" /></label>
                <label>Grid order USD<input value={config.gridOrderUsd} onChange={(e) => updateNumber('gridOrderUsd', e.target.value)} type="number" className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#243750]" /></label>
              </>}
            </div>
            <div className="p-3 rounded-xl bg-teal-500/5 border border-teal-500/20 text-[11px] text-slate-600 dark:text-slate-300 flex gap-2"><ShieldCheck className="w-4 h-4 text-teal-500 shrink-0"/>Backtest berjalan lokal menggunakan candle yang Anda masukkan. Hasil bukan jaminan performa live.</div>
            <button onClick={run} className="w-full px-4 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2"><Play className="w-4 h-4 fill-current"/>Run Backtest</button>
            <button onClick={runMonteCarloTest} disabled={mcRunning} className="w-full px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300 font-black text-sm flex items-center justify-center gap-2"><BarChart3 className="w-4 h-4"/>{mcRunning ? 'Monte Carlo berjalan...' : 'Monte Carlo Stress Test (300x)'}</button>
            {error && <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-300">{error}</div>}
          </section>
        </div>

        {monteCarlo && <section className="p-4 rounded-2xl bg-white dark:bg-[#101A29] border border-amber-500/20">
          <div className="flex items-center justify-between mb-3"><div><div className="text-sm font-black text-slate-900 dark:text-white">Monte Carlo Stress Result</div><div className="text-[11px] text-slate-500">{monteCarlo.simulations} simulasi bootstrap, seed {monteCarlo.seed}</div></div><span className="text-[10px] font-mono text-amber-500">Bukan prediksi profit</span></div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[['Median ROI', pct(monteCarlo.medianRoiPct)],['P05 ROI', pct(monteCarlo.p05RoiPct)],['P95 ROI', pct(monteCarlo.p95RoiPct)],['Median Max DD', `${monteCarlo.medianMaxDrawdownPct.toFixed(2)}%`],['Worst DD P95', `${monteCarlo.worstMaxDrawdownPct.toFixed(2)}%`]].map(([label,value]) => <div key={label} className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#1A2B43]"><div className="text-[10px] uppercase text-slate-500 font-bold">{label}</div><div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{value}</div></div>)}
          </div>
          <div className="mt-3 text-xs text-slate-500">Outcome ROI positif pada {monteCarlo.positiveOutcomePct.toFixed(1)}% simulasi. Gunakan distribusi ini untuk menguji sensitivitas, bukan sebagai jaminan hasil live.</div>
        </section>}

        {result && <section className="p-4 rounded-2xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44]">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              ['Equity akhir', money(result.endingEquityUsd)], ['PnL', money(result.pnlUsd)], ['ROI', pct(result.roiPct)],
              ['Max DD', `${result.maxDrawdownPct.toFixed(2)}%`], ['Win rate', `${result.winRatePct.toFixed(2)}%`], ['Trades', String(result.trades.length)], ['Bars', String(result.bars)],
            ].map(([label, value]) => <div key={label} className="p-3 rounded-xl bg-slate-50 dark:bg-[#0B1322] border border-slate-200 dark:border-[#1A2B43]"><div className="text-[10px] uppercase text-slate-500 font-bold">{label}</div><div className="mt-1 text-sm font-black text-slate-900 dark:text-white">{value}</div></div>)}
          </div>
          <div className="mt-4 overflow-auto"><table className="w-full text-xs"><thead><tr className="text-left text-slate-500 border-b border-slate-200 dark:border-[#243750]"><th className="py-2">Time</th><th>Side</th><th>Price</th><th>Qty</th><th>Notional</th><th>Reason</th><th>PnL</th></tr></thead><tbody>{result.trades.slice(-30).map((trade, index) => <tr key={`${trade.timestamp}-${index}`} className="border-b border-slate-100 dark:border-[#14233A]"><td className="py-2 font-mono">{new Date(trade.timestamp).toLocaleString()}</td><td className="font-bold">{trade.side}</td><td>{trade.price.toFixed(4)}</td><td>{trade.quantity.toFixed(8)}</td><td>{money(trade.notional)}</td><td>{trade.reason}</td><td className={trade.pnlUsd >= 0 ? 'text-emerald-500 font-bold' : 'text-rose-500 font-bold'}>{money(trade.pnlUsd)}</td></tr>)}</tbody></table></div>
        </section>}
      </div>
    </div>
  );
}
