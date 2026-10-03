import { useState } from 'react';
import { X, Shield, AlertTriangle, ArrowUpRight, CheckCircle2, Lock, ExternalLink, Zap } from 'lucide-react';
import { formatUsdt } from '../../utils/formatters';
import { requestWalletWithdrawal } from '../../services/walletService';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBalance: number;
  userSecret?: string;
  userEmail?: string;
  memberId?: string;
  onWithdrawSuccess: (amount: number, address: string, queueDetails?: any) => void;
}

export function WithdrawModal({
  isOpen,
  onClose,
  availableBalance,
  userSecret,
  userEmail,
  memberId,
  onWithdrawSuccess,
}: WithdrawModalProps) {
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('100');
  const [otp2fa, setOtp2fa] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [queueInfo, setQueueInfo] = useState<{ queueId: string; queuePosition?: number; estimatedMinutes?: number } | null>(null);
  const [autoDisburseData, setAutoDisburseData] = useState<{ txHash: string; bscScanUrl: string } | null>(null);
  const flatFee = 2.0;
  const numAmount = parseFloat(amount) || 0;
  const receivedAmount = Math.max(0, numAmount - flatFee);

  if (!isOpen) return null;

  const handleQuickPercent = (pct: number) => {
    const val = (availableBalance * pct) / 100;
    setAmount(val.toFixed(2));
  };

  const handlePasteAddress = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setAddress(text.trim());
      } else {
        setErrorMsg('Clipboard kosong. Silakan tempel alamat dompet secara manual.');
      }
    } catch {
      setErrorMsg('Akses clipboard diblokir browser. Silakan tempel (Ctrl+V) alamat dompet secara manual.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!address || address.length < 10) {
      setErrorMsg('Masukkan alamat dompet BEP-20 yang valid.');
      return;
    }

    if (numAmount < 10) {
      setErrorMsg('Minimal penarikan adalah 10 USDT.');
      return;
    }

    if (numAmount > availableBalance) {
      setErrorMsg('Saldo vault tidak mencukupi untuk penarikan ini.');
      return;
    }

    const cleanOtp = otp2fa.trim();
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setErrorMsg('Masukkan kode 6 digit Google Authenticator untuk penarikan USDT.');
      return;
    }

    setIsProcessing(true);

    try {
      const data = await requestWalletWithdrawal({
          address: address.trim(),
          amount: numAmount,
          network: 'BEP-20',
          otp2fa: cleanOtp,
          userSecret,
          memberId,
          userEmail,
      });

      if (data.success) {
        setIsProcessing(false);
        setIsSuccess(true);

        if (data.autoDisbursed && data.txHash) {
          setAutoDisburseData({
            txHash: data.txHash,
            bscScanUrl: data.bscScanUrl || `https://bscscan.com/tx/${data.txHash}`,
          });
        }

        setQueueInfo({
          queueId: data.queueId,
          queuePosition: data.queuePosition || 1,
          estimatedMinutes: data.estimatedMinutes || (data.autoDisbursed ? 1 : 10),
        });

        onWithdrawSuccess(numAmount, address, data);
        setTimeout(() => {
          setIsSuccess(false);
          setQueueInfo(null);
          setAutoDisburseData(null);
          onClose();
        }, data.autoDisbursed ? 3500 : 2500);
      } else {
        setIsProcessing(false);
        setErrorMsg(data.error || 'Gagal mengajukan penarikan.');
      }
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMsg(err?.message || 'Koneksi jaringan terputus saat menghubungi server. Silakan periksa koneksi dan coba lagi.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="theme-modal-shell relative w-full max-w-lg bg-[#080E1A] border border-[#162740] rounded-2xl shadow-2xl overflow-hidden text-slate-100 max-h-[92vh] flex flex-col">
        {/* Top Hardware Notch */}
        <div className="w-full flex justify-center pt-2 pb-1 bg-[#060B14]">
          <div className="w-16 h-1 rounded-full bg-[#18263B]"></div>
        </div>

        {/* Modal Header */}
        <div className="px-5 py-3 border-b border-[#14233A] flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-white tracking-wide">
              Withdraw USDT (BEP-20)
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Algorithmic Settlement Vault
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#0F1A2D] border border-[#1A2D4A] flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {/* Balance card */}
          <div className="p-3.5 rounded-xl bg-[#0B1527] border border-[#162740] flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-mono">
                Saldo Bebas Ditarik (Liquid Cash & Bagi Hasil)
              </span>
              <div className="text-lg font-bold font-mono text-white mt-0.5">
                {formatUsdt(availableBalance)} <span className="text-xs text-[#00F0C8]">USDT</span>
              </div>
            </div>
            <div className="text-right">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                BEP-20 • Settlement Server
              </span>
              <p className="text-[10px] text-emerald-400/80 mt-1 font-mono">Permintaan akan melalui Review</p>
            </div>
          </div>

          <div className="px-3 py-2 rounded-lg bg-[#070D17] border border-[#14233A] text-[10.5px] text-slate-300 font-sans leading-relaxed">
            💡 <strong>Program Promo & Bonus hingga 90% (Komisi Cash):</strong> Bonus Aktivasi Downline (<strong>20% CASH</strong>) dan Bagi Hasil Trading (<strong>20% CASH dari 20% Fee TP</strong>) otomatis masuk ke saldo ini dan 100% bebas di-withdraw ke dompet BEP-20 Anda kapan saja. Sedangkan <strong>Bonus Top-Up Fee Downline (10% Non-Cash)</strong> tersimpan khusus di Gas Fee Tank.
          </div>

          {/* Destination Address */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-mono text-slate-300 uppercase tracking-wider">
                Alamat Dompet Tujuan (BEP-20)
              </label>
              <button
                type="button"
                onClick={handlePasteAddress}
                className="text-[11px] text-[#00F0C8] hover:underline font-mono"
              >
                Tempel
              </button>
            </div>
            <input
              type="text"
              placeholder="0x..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09111E] border border-[#162740] font-mono text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00F0C8]"
            />
          </div>

          {/* Amount to Withdraw */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-mono text-slate-300 uppercase tracking-wider">
                Jumlah Penarikan
              </label>
              <span className="text-[11px] text-slate-400 font-mono">Min: 10 USDT</span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#09111E] border border-[#162740] font-mono text-sm text-white focus:outline-none focus:border-[#00F0C8]"
              />
              <span className="absolute right-3.5 top-2.5 text-xs font-mono font-bold text-slate-400">
                USDT
              </span>
            </div>

            {/* Quick chips */}
            <div className="grid grid-cols-5 gap-1.5 mt-2">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handleQuickPercent(pct)}
                  className="py-1 rounded-lg bg-[#0C1628] border border-[#172A46] text-[11px] font-mono text-slate-300 hover:text-[#00F0C8] hover:border-[#00F0C8]/40 transition"
                >
                  {pct}%
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleQuickPercent(100)}
                className="py-1 rounded-lg bg-[#00F0C8]/10 border border-[#00F0C8]/30 text-[11px] font-mono text-[#00F0C8] font-bold hover:bg-[#00F0C8]/20 transition"
              >
                MAX
              </button>
            </div>
          </div>

          {/* Google Authenticator / high-risk transaction verification */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-mono text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[#00F0C8]" />
                Google Authenticator (6 Digit)
              </label>
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="Kode Google Authenticator (6 digit)"
              value={otp2fa}
              onChange={(e) => setOtp2fa(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09111E] border border-[#162740] font-mono text-center tracking-widest text-sm text-white focus:outline-none focus:border-[#00F0C8]"
            />
            <p className="text-[10px] text-slate-500 font-mono mt-1">
              TOTP Google Authenticator diperlukan untuk otorisasi transaksi berisiko tinggi. Kode tidak dikirim lewat email.
            </p>
          </div>

          {/* Fee & Breakdown Box */}
          <div className="p-3.5 rounded-xl bg-[#070D17] border border-[#14233A] space-y-2 text-xs font-mono">
            <div className="flex justify-between text-slate-400">
              <span>Biaya Jaringan (Flat Fee):</span>
              <span className="text-white font-semibold">2.00 USDT</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Estimasi Durasi:</span>
              <span className="text-emerald-400 font-semibold">~1 - 3 Menit</span>
            </div>
            <div className="border-t border-[#132034] pt-2 flex justify-between items-baseline">
              <span className="text-slate-300 font-sans font-medium">Estimasi Diterima:</span>
              <span className="text-base font-bold text-[#00F0C8]">
                {formatUsdt(receivedAmount)} USDT
              </span>
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-mono flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>
                  {autoDisburseData
                    ? 'Penarikan Terkirim Instan On-Chain!'
                    : 'Penarikan Masuk Antrean Settlement!'}
                </span>
                {autoDisburseData && (
                  <span className="px-1.5 py-0.2 rounded text-[9.5px] font-mono bg-cyan-500/20 text-[#00F0C8] border border-cyan-500/30 font-bold ml-auto flex items-center gap-1">
                    <Zap className="w-3 h-3 text-[#00F0C8]" />
                    AUTO-DISBURSED
                  </span>
                )}
              </div>

              {autoDisburseData ? (
                <div className="text-[11px] text-slate-300 space-y-1.5 pt-1 border-t border-emerald-500/20">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Bukti TxID BSC:</span>
                    <a
                      href={autoDisburseData.bscScanUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-bold underline"
                    >
                      <span>Lihat di BscScan</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <div className="p-1.5 bg-[#050A12] rounded border border-[#14233A] text-[10px] text-[#00F0C8] break-all select-all font-mono">
                    {autoDisburseData.txHash}
                  </div>
                </div>
              ) : queueInfo ? (
                <div className="text-[11px] text-slate-300 space-y-0.5 pt-1 pl-6">
                  <div>ID Antrean: <strong className="text-[#00F0C8]">{queueInfo.queueId}</strong></div>
                  <div>Posisi Antrean: #{queueInfo.queuePosition} • Estimasi: ~{queueInfo.estimatedMinutes} menit</div>
                </div>
              ) : null}
            </div>
          )}

          {/* Bottom Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-[#0F1A2D] text-slate-300 hover:text-white text-xs font-semibold transition"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-5 py-2.5 rounded-xl bg-[#00F0C8] text-slate-950 text-xs font-bold glow-cyan-btn transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <ArrowUpRight className="w-4 h-4" />
              {isProcessing ? 'Memproses...' : 'Konfirmasi & Tarik Dana'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
