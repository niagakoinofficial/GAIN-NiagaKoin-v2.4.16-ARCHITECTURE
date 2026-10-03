import React, { useState } from 'react';
import {
  Activity, Play, CheckCircle2, ShieldCheck, ArrowRight,
  Terminal, Server, Clock, Zap, Database, Lock, RefreshCw
} from 'lucide-react';

interface TraceStep {
  id: string;
  timeMs: number;
  stage: string;
  actor: string;
  action: string;
  technicalDetails: string;
  payloadSnippet: string;
  status: 'SUCCESS' | 'WAITING' | 'EXECUTING';
}

// Synthetic demonstration data only. This component is not runtime telemetry.
const TRACE_STEPS_DATA: TraceStep[] = [
  {
    id: 'step_1',
    timeMs: 0,
    stage: '1. Ingestion',
    actor: 'Synthetic Market Stream',
    action: 'WebSocket Ticker Broadcast',
    technicalDetails: 'Binance broadcast update harga BTCUSDT turun ke 62,800.00 (-1.82%).',
    payloadSnippet: `{"e":"24hrTicker","s":"BTCUSDT","c":"62800.00","h":"64500.00","l":"62750.00","v":"14208.5"}`,
    status: 'SUCCESS'
  },
  {
    id: 'step_2',
    timeMs: 4,
    stage: '2. Dispatch Bus',
    actor: 'Redis Pub/Sub (Illustrative)',
    action: 'Internal Fan-out Message',
    technicalDetails: 'Tick disiarkan ke 100+ worker bot internal dalam hitungan 4 milidetik tanpa membebani koneksi exchange.',
    payloadSnippet: `PUBLISH ticker:BTCUSDT '{"symbol":"BTCUSDT","price":62800,"timestamp":1727500000004}'`,
    status: 'SUCCESS'
  },
  {
    id: 'step_3',
    timeMs: 9,
    stage: '3. Strategy Evaluation',
    actor: 'Strategy Worker (Illustrative)',
    action: 'Safety Order Step Triggered',
    technicalDetails: 'Kondisi terpenuhi: Harga turun > 1.80% dari harga beli sebelumnya ($64,000). Algoritma menghitung volume order: $15 USDT (0.00023885 BTC).',
    payloadSnippet: `{"strategy":"DCA","investorId":"usr_kharisma_88","layer":1,"buyAmountUsd":15.0,"calcPrice":62800}`,
    status: 'SUCCESS'
  },
  {
    id: 'step_4',
    timeMs: 14,
    stage: '4. Security & KMS',
    actor: 'Secret Vault (Illustrative)',
    action: 'Ephemeral AES-256 Decrypt',
    technicalDetails: 'API Secret pengguna didekripsi sementara di memori RAM server. Kunci master tidak pernah keluar dari modul KMS.',
    payloadSnippet: `crypto.createDecipheriv('aes-256-gcm', KMS_MASTER, iv).final() -> Decrypted to RAM (128-bit buffer)`,
    status: 'SUCCESS'
  },
  {
    id: 'step_5',
    timeMs: 17,
    stage: '5. Cryptographic Signing',
    actor: 'HMAC Signer (Illustrative)',
    action: 'HMAC-SHA256 Request Signature',
    technicalDetails: 'Query string bursa di-hash dengan API Secret pengguna bersama parameter timestamp sinkron.',
    payloadSnippet: `signature = crypto.createHmac('sha256', apiSecret).update(queryString).digest('hex')\n-> "4a7f0e38bc9a8d9..."`,
    status: 'SUCCESS'
  },
  {
    id: 'step_6',
    timeMs: 23,
    stage: '6. Outbound Dispatch',
    actor: 'Exchange Adapter (Illustrative)',
    action: 'Exchange order dispatch (illustrative)',
    technicalDetails: 'Request dikirim dari IP statis Moonbot yang terdaftar di IP Whitelist Binance pengguna.',
    payloadSnippet: `POST https://api.binance.com/api/v3/order\nHeaders: {"X-MBX-APIKEY": "vmPU...8kX"}\nBody: symbol=BTCUSDT&side=BUY&type=LIMIT&quantity=0.00023&price=62800`,
    status: 'SUCCESS'
  },
  {
    id: 'step_7',
    timeMs: 105,
    stage: '7. Matching Engine',
    actor: 'Exchange Matching (Illustrative)',
    action: 'Order Placed & Filled',
    technicalDetails: 'Order LIMIT cocok dengan antrian ask orderbook Binance. Status berubah menjadi FILLED.',
    payloadSnippet: `{"symbol":"BTCUSDT","orderId":98234129,"status":"FILLED","executedQty":"0.00023","cummulativeQuoteQty":"14.444"}`,
    status: 'SUCCESS'
  },
  {
    id: 'step_8',
    timeMs: 114,
    stage: '8. User Data Stream',
    actor: 'Exchange User Stream (Illustrative)',
    action: 'EXECUTION_REPORT Push',
    technicalDetails: 'Binance memberi notifikasi asinkron bahwa order telah tuntas ke server Moonbot via WebSocket.',
    payloadSnippet: `{"e":"executionReport","s":"BTCUSDT","X":"FILLED","q":"0.00023","p":"62800","Z":"14.444"}`,
    status: 'SUCCESS'
  },
  {
    id: 'step_9',
    timeMs: 124,
    stage: '9. Database Ledger',
    actor: 'PostgreSQL DB Engine',
    action: 'Reconciliation & Avg Price Update',
    technicalDetails: 'Harga rata-rata (Average Entry Price) pengguna diperbarui dari $64,000 menjadi $63,260. Target TP dihitung ulang.',
    payloadSnippet: `UPDATE bot_positions SET avg_price = 63260.50, total_spent = 24.44, layer_count = 1 WHERE id = 'pos_btc_01';`,
    status: 'SUCCESS'
  },
  {
    id: 'step_10',
    timeMs: 142,
    stage: '10. UI Telemetry (Illustrative)',
    actor: 'Frontend Web Portal',
    action: 'Live WebSocket UI Update',
    technicalDetails: 'Layar investor Kharisma1 langsung ter-update secara instan: status bot Safety Order #1 Aktif, Floating PnL ter-refresh.',
    payloadSnippet: `ws.send(JSON.stringify({ event: 'TELEMETRY_REFRESH', newAvgPrice: 63260.50, status: 'SAFETY_1_FILLED' }))`,
    status: 'SUCCESS'
  }
];

export const ExecutionPipelineTrace: React.FC = () => {
  // IMPORTANT: this UI visualizes a synthetic reference flow. It must never be
  // presented as measured production latency or proof that every stage exists.
  const [activeStep, setActiveStep] = useState<number>(0);
  const [isRunningAll, setIsRunningAll] = useState<boolean>(false);

  const handlePlayPipeline = () => {
    setIsRunningAll(true);
    setActiveStep(0);

    TRACE_STEPS_DATA.forEach((_, idx) => {
      setTimeout(() => {
        setActiveStep(idx);
        if (idx === TRACE_STEPS_DATA.length - 1) {
          setIsRunningAll(false);
        }
      }, idx * 600);
    });
  };

  const current = TRACE_STEPS_DATA[activeStep];

  return (
    <>
      <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-mono text-amber-300">
        DEMO ARSITEKTUR — data dan latency di bawah adalah sintetis, bukan telemetry runtime produksi.
      </div>
      <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 space-y-6">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
                <Zap className="w-5 h-5" />
              </span>
              <h3 className="text-xl font-bold text-white tracking-tight">
                Demo Arsitektur Pipeline (Bukan Telemetri Runtime)
              </h3>
            </div>
            <p className="text-sm text-slate-400">
              Contoh arsitektur statis untuk dokumentasi. Data dan durasi di bawah bukan bukti runtime produksi.
            </p>
          </div>

          <button
            onClick={handlePlayPipeline}
            disabled={isRunningAll}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs transition shadow-lg shadow-indigo-950/40 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-white" />
            {isRunningAll ? 'Tracing Running...' : 'Putar Demo Arsitektur'}
          </button>
        </div>

        {/* Stepper Grid Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-1.5 p-2 rounded-xl bg-slate-950/70 border border-slate-800">
          {TRACE_STEPS_DATA.map((step, idx) => {
            const isCurrent = activeStep === idx;
            const isDone = activeStep > idx;
            return (
              <button
                key={step.id}
                onClick={() => setActiveStep(idx)}
                className={`p-2 rounded-lg text-left transition-all cursor-pointer border ${
                  isCurrent
                    ? 'border-indigo-500 bg-indigo-950/40 text-indigo-300 shadow-md ring-1 ring-indigo-400'
                    : isDone
                    ? 'border-slate-800 bg-slate-900/80 text-slate-300 hover:bg-slate-800'
                    : 'border-transparent bg-slate-950 text-slate-500 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="font-bold">#{idx + 1}</span>
                  <span className="text-[9px] text-slate-400">{step.timeMs}ms</span>
                </div>
                <div className="text-[11px] font-medium truncate mt-0.5">{step.stage.split('. ')[1]}</div>
              </button>
            );
          })}
        </div>

        {/* Active Step Visual Details */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Detail Card */}
          <div className="lg:col-span-6 space-y-4">
            <div className="p-5 rounded-xl border border-indigo-500/30 bg-slate-950/60 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
                  {current.stage}
                </span>
                <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  Elapsed: <strong className="text-white">T+{current.timeMs} ms</strong>
                </span>
              </div>

              <div>
                <h4 className="text-lg font-bold text-white">{current.action}</h4>
                <p className="text-xs text-indigo-300/80 font-mono mt-0.5">Komponen: {current.actor}</p>
              </div>

              <div className="p-3.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-300 leading-relaxed">
                {current.technicalDetails}
              </div>

              <div className="flex items-center gap-4 text-xs font-mono text-slate-400 pt-2 border-t border-slate-800/80">
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" /> Zero Network Drop
                </span>
                <span className="flex items-center gap-1 text-slate-300">
                  <ShieldCheck className="w-4 h-4 text-sky-400" /> Non-Custodial Scoped
                </span>
              </div>
            </div>
          </div>

          {/* Right: Technical Wire Payload & Code */}
          <div className="lg:col-span-6 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-emerald-400" />
                Wire Payload / Internal Execution Log
              </span>
              <span className="text-[10px] text-slate-500">Live Buffer</span>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden font-mono text-xs">
              <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-slate-400 text-[11px]">
                <span>actor: {current.actor.toLowerCase().replace(/\s+/g, '_')}</span>
                <span className="text-emerald-400 font-bold">200 OK</span>
              </div>
              <pre className="p-4 text-emerald-300/90 overflow-x-auto whitespace-pre-wrap leading-relaxed text-[11px]">
                <code>{current.payloadSnippet}</code>
              </pre>
            </div>

            <div className="text-[11px] text-slate-400 p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/60 leading-normal">
              ℹ️ <strong>Catatan:</strong> durasi 142 ms adalah angka contoh sintetis untuk demonstrasi UI, bukan hasil pengukuran runtime.
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};
