import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, PlayCircle, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { ExchangeName } from '../../config/exchangeRegistry';
import { getExchangeDescriptor } from '../../config/exchangeRegistry';
import {
  getExchangeCertificationLatest,
  runExchangeCertificationStage,
  type ExchangeCertificationStage,
  type ExchangeCertificationStageResponse,
} from '../../api/exchangeApi';

interface Props {
  exchange: ExchangeName;
  isSandbox?: boolean;
}

const STAGES: Array<{ id: ExchangeCertificationStage; label: string; description: string }> = [
  { id: 'authenticated_readonly', label: '1. Auth Read-Only', description: 'Market + balance + open orders. Tidak mengirim order.' },
  { id: 'sandbox_demo_order', label: '2. Sandbox/Demo Order', description: 'Limit order mikro, query, lalu cancel.' },
  { id: 'micro_live_order', label: '3. Micro-Live Order', description: 'Live sangat terbatas; memerlukan 2FA + konfirmasi eksplisit.' },
  { id: 'reconcile', label: '4. Reconciliation', description: 'Query kembali order certification dan cocokkan status.' },
  { id: 'recovery', label: '5. Recovery', description: 'Buat client baru dan verifikasi order setelah restart boundary.' },
];

function statusBadge(status?: string) {
  if (!status) return <span className="text-slate-500">Belum dijalankan</span>;
  if (status === 'PASS') return <span className="text-emerald-300">PASS</span>;
  if (status === 'WARNING') return <span className="text-amber-300">WARNING</span>;
  return <span className="text-rose-300">{status}</span>;
}

export default function ExchangeCertificationPanel({ exchange, isSandbox = true }: Props) {
  const descriptor = useMemo(() => getExchangeDescriptor(exchange), [exchange]);
  const [busy, setBusy] = useState<ExchangeCertificationStage | null>(null);
  const [latest, setLatest] = useState<Record<string, any>>({});
  const [result, setResult] = useState<ExchangeCertificationStageResponse | null>(null);
  const [otp2fa, setOtp2fa] = useState('');
  const [liveArmed, setLiveArmed] = useState(false);
  const [notice, setNotice] = useState('');

  const refresh = async () => {
    try {
      const data = await getExchangeCertificationLatest(exchange);
      setLatest(data.stages || {});
    } catch (error) {
      setNotice(String((error as any)?.message || 'Status certification belum tersedia.'));
    }
  };

  useEffect(() => { void refresh(); }, [exchange]);

  const run = async (stage: ExchangeCertificationStage) => {
    setBusy(stage);
    setNotice('');
    setResult(null);
    try {
      const confirmation = stage === 'micro_live_order' ? 'I_UNDERSTAND_MICRO_LIVE_CERTIFICATION:' + exchange.toUpperCase() : undefined;
      const data = await runExchangeCertificationStage(exchange, stage, { confirmation, otp2fa: stage === 'micro_live_order' ? otp2fa : undefined });
      setResult(data);
      await refresh();
      if (stage === 'micro_live_order') {
        setOtp2fa('');
        setLiveArmed(false);
      }
    } catch (error) {
      setNotice(String((error as any)?.message || 'Certification gagal.'));
    } finally {
      setBusy(null);
    }
  };

  if (!descriptor) return null;
  const sandboxEligible = Boolean(descriptor.tradingApi && descriptor.hasOfficialSandbox && isSandbox);
  const liveEligible = Boolean(descriptor.tradingApi && !descriptor.publicOnly && descriptor.certificationMode === 'FULL');

  return (
    <div className="mt-4 rounded-2xl border border-cyan-500/20 bg-[#07101c] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldCheck className="w-4 h-4 text-cyan-300" />
            Exchange Certification Lab
          </div>
          <div className="text-[10px] text-slate-400 mt-1">
            Urutan wajib: authenticated → sandbox/demo → micro-live → reconciliation → recovery.
          </div>
        </div>
        <button type="button" onClick={() => void refresh()} className="p-2 rounded-lg border border-[#18304a] text-slate-300 hover:text-white">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2">
        {STAGES.map((stage) => {
          const row = latest[stage.id];
          const blocked = (stage.id === 'sandbox_demo_order' && !sandboxEligible)
            || (stage.id === 'micro_live_order' && (!liveEligible || !liveArmed));
          const requiresOtp = stage.id === 'micro_live_order';
          return (
            <div key={stage.id} className="rounded-xl border border-[#17304b] bg-[#091423] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-mono text-slate-100">{stage.label}</div>
                  <div className="text-[10px] text-slate-500 mt-1">{stage.description}</div>
                  <div className="text-[10px] mt-1">Status: {statusBadge(row?.status)}</div>
                </div>
                <button
                  type="button"
                  disabled={Boolean(busy) || blocked}
                  onClick={() => void run(stage.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-200 text-[10px] font-mono disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy === stage.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                  Run
                </button>
              </div>
              {requiresOtp && (
                <div className="mt-3 space-y-2">
                  <label className="flex items-center gap-2 text-[10px] text-amber-200">
                    <input type="checkbox" checked={liveArmed} onChange={(e) => setLiveArmed(e.target.checked)} />
                    Saya sengaja mengaktifkan tahap micro-live untuk {exchange}.
                  </label>
                  <input
                    value={otp2fa}
                    onChange={(e) => setOtp2fa(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Kode Google Authenticator"
                    inputMode="numeric"
                    className="w-full px-3 py-2 rounded-lg bg-[#050b13] border border-[#18304a] text-white text-xs font-mono"
                  />
                  <div className="text-[9px] text-slate-500">Micro-live tetap diblokir server kecuali administrator mengaktifkan gate environment.</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {descriptor.certificationMode !== 'FULL' && (
        <div className="flex items-start gap-2 text-[10px] text-amber-200 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
          <TriangleAlert className="w-4 h-4 shrink-0" />
          <span>Exchange ini belum berstatus FULL. GAIN tidak mengarang jalur order yang belum terverifikasi.</span>
        </div>
      )}

      {result && (
        <div className={`rounded-lg p-3 text-[10px] font-mono ${result.status === 'PASS' ? 'bg-emerald-400/5 border border-emerald-400/20 text-emerald-200' : 'bg-rose-400/5 border border-rose-400/20 text-rose-200'}`}>
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {result.stage} — {result.status}
          </div>
          <pre className="mt-2 whitespace-pre-wrap break-words text-[9px] text-slate-300">{JSON.stringify(result.result || {}, null, 2)}</pre>
        </div>
      )}
      {notice && <div className="text-[10px] text-rose-300">{notice}</div>}
    </div>
  );
}
