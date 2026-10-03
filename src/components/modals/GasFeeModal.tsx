import { useEffect, useState } from 'react';
import { X, Fuel, ShieldCheck, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';
import { formatUsdt } from '../../utils/formatters';
import { getGasTopupBonus } from '../../config/financialConfig';
import { addGasReserve, getGasAutoRefill, setGasAutoRefill } from '../../services/walletService';

interface GasFeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBalance: number;
  currentGasReserve: number;
  userSecret?: string;
  memberId?: string;
  onTopUpSuccess: (amount: number, bonusAmount?: number, isDemoRefill?: boolean) => void;
  onOpenProfitShare?: () => void;
  isDemoOrTestnet?: boolean;
}

export function calculateMemberTopupBonus(topupUsdt: number): { pct: number; bonus: number; tierLabel: string } {
  const result = getGasTopupBonus(topupUsdt);
  const tierLabel = result.pct > 0 ? `$${result.pct === 30 ? '500+' : result.pct === 25 ? '200 - 499' : result.pct === 20 ? '100 - 199' : '50 - 99'} (+${result.pct}% Bonus)` : '< $50 (0% Bonus)';
  return { pct: result.pct, bonus: result.bonusUsdt, tierLabel };
}

export function GasFeeModal({
  isOpen,
  onClose,
  availableBalance,
  currentGasReserve,
  userSecret,
  memberId,
  onTopUpSuccess,
  onOpenProfitShare,
  isDemoOrTestnet = false,
}: GasFeeModalProps) {
  const [amount, setAmount] = useState('50');
  const [autoRefill, setAutoRefill] = useState(false);
  const [autoRefillSaving, setAutoRefillSaving] = useState(false);
  const [otp2fa, setOtp2fa] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const numAmount = parseFloat(amount) || 0;
  const { pct: bonusPct, bonus: bonusUsdt, tierLabel } = calculateMemberTopupBonus(numAmount);
  const totalGasReceived = numAmount + bonusUsdt;
  const newGasTotal = currentGasReserve + totalGasReceived;

  // Gas Health Status Calculation (Based on 10 USDT Warning & 5 USDT Critical rules)
  const isCritical = currentGasReserve <= 5.0;
  const isWarning = currentGasReserve > 5.0 && currentGasReserve <= 10.0;
  const gasStatusText = isCritical
    ? 'Zona Kritis (≤ 5 USDT)'
    : isWarning
    ? 'Zona Waspada (≤ 10 USDT)'
    : 'Aman (> 10 USDT)';
  const gasStatusBadge = isCritical
    ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
    : isWarning
    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  const healthPercent = Math.min(100, Math.max(5, (currentGasReserve / 25) * 100));

  useEffect(() => {
    if (!isOpen || isDemoOrTestnet) return;
    void getGasAutoRefill().then((response) => setAutoRefill(Boolean(response?.config?.enabled))).catch(() => setAutoRefill(false));
  }, [isOpen, isDemoOrTestnet]);

  const handleAutoRefillToggle = async () => {
    const next = !autoRefill;
    setAutoRefillSaving(true);
    try {
      await setGasAutoRefill({ enabled: next, thresholdUsdt: 3, refillUsdt: 10, maxDailyUsdt: 50 });
      setAutoRefill(next);
    } catch (error: any) {
      setErrorMsg(error?.message || 'Konfigurasi Auto-Refill gagal disimpan.');
    } finally { setAutoRefillSaving(false); }
  };

  if (!isOpen) return null;

  const handleSetExactAmount = (val: number) => {
    setAmount(val.toString());
  };

  const handleAddAmount = (addVal: number) => {
    setAmount((prev) => {
      const current = parseFloat(prev) || 0;
      return (current + addVal).toString();
    });
  };

  const handleInstantDemoRefill = (refillAmount: number = 100) => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setIsSuccess(true);
      onTopUpSuccess(refillAmount, 0, true);
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 1000);
    }, 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (numAmount < 10) {
      setErrorMsg('Minimal alokasi gas pool adalah 10 USDT.');
      return;
    }

    if (isDemoOrTestnet) {
      // In Demo/Testnet mode, bypass balance check and 2FA requirement
      setIsProcessing(true);
      setTimeout(() => {
        setIsProcessing(false);
        setIsSuccess(true);
        onTopUpSuccess(numAmount, bonusUsdt, true);
        setTimeout(() => {
          setIsSuccess(false);
          onClose();
        }, 1200);
      }, 400);
      return;
    }

    if (numAmount > availableBalance) {
      setErrorMsg('Saldo vault tidak mencukupi untuk alokasi gas pool.');
      return;
    }

    if (otp2fa.length < 6) {
      setErrorMsg('Wajib masukkan 6 digit kode Google Authenticator 2FA.');
      return;
    }

    setIsProcessing(true);
    try {
      const data = await addGasReserve({
          amount: numAmount,
          bonusAmount: bonusUsdt,
          memberId,
          otp2fa: otp2fa.trim(),
          userSecret,
      });

      if (data.success) {
        setIsProcessing(false);
        setIsSuccess(true);
        onTopUpSuccess(numAmount, bonusUsdt);
        setTimeout(() => {
          setIsSuccess(false);
          onClose();
        }, 1400);
      } else {
        setIsProcessing(false);
        setErrorMsg(data.error || 'Gagal memproses top-up gas.');
      }
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMsg(err?.message || 'Gagal menghubungi server GAIN.');
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
            <h3 className="font-bold text-base text-white tracking-wide flex items-center gap-2">
              <Fuel className="w-4 h-4 text-amber-400" />
              <span>Top-Up Gas Fee Pool</span>
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              20% Profit-Share Reserve & Execution Fuel
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
          {/* Instant Demo / Testnet Gas Refill Card */}
          {isDemoOrTestnet && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/20 via-yellow-500/15 to-orange-500/20 border border-amber-500/40 space-y-2 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400 font-mono flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>MODE DEMO / TESTNET AKTIF</span>
                </span>
                <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  GRATIS / TANPA 2FA
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
                Anda menggunakan Mode Demo/Testnet. Anda dapat mengklik tombol di bawah untuk mengisi Gas Fee Tank secara <strong>instant dan gratis</strong> tanpa memotong saldo vault atau membutuhkan verifikasi 2FA.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleInstantDemoRefill(100)}
                  disabled={isProcessing}
                  className="flex-1 py-2 px-3 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-bold text-xs font-mono transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer disabled:opacity-50"
                >
                  <Fuel className="w-4 h-4" />
                  <span>⚡ Isi Gas Fee Demo (+100 USDT Gratis)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleInstantDemoRefill(500)}
                  disabled={isProcessing}
                  className="py-2 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs font-mono transition cursor-pointer disabled:opacity-50"
                >
                  +500 USDT
                </button>
              </div>
            </div>
          )}

          {/* Current Gas Tank & Health Bar */}
          <div className="p-4 rounded-xl bg-[#0B1527] border border-[#162740] space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-mono">Current Gas Tank</span>
                <div className="text-xl font-bold font-mono text-[#00F0C8]">
                  +{formatUsdt(currentGasReserve)} <span className="text-xs text-slate-400">USDT</span>
                </div>
              </div>
              <div className="text-right">
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono border font-semibold ${gasStatusBadge}`}>
                  {gasStatusText}
                </span>
                <p className="text-[10px] text-slate-400 font-mono mt-1">
                  {isCritical ? '24h Grace Period Aktif' : isWarning ? 'Bot Berjalan Normal' : 'Semua Bot Normal'}
                </p>
              </div>
            </div>

            {/* Health Bar */}
            <div className="w-full h-2 rounded-full bg-[#070D17] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isCritical
                    ? 'bg-rose-500'
                    : isWarning
                    ? 'bg-amber-400'
                    : 'bg-gradient-to-r from-cyan-400 to-emerald-400'
                }`}
                style={{ width: `${healthPercent}%` }}
              ></div>
            </div>

            {/* Critical Alert Warning */}
            {isCritical && (
              <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] font-mono flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  Gas ≤ 5 USDT: Bot dilarang membuka layer averaging baru. Segera top-up agar siklus averaging berjalan tanpa hambatan.
                </span>
              </div>
            )}

            {isWarning && (
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Gas ≤ 10 USDT: Peringatan saldo gas menipis. Bot tetap berjalan normal, disarankan melakukan top-up.
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
              <span>Vault Tersedia: {formatUsdt(availableBalance)} USDT</span>
              {onOpenProfitShare && (
                <button
                  type="button"
                  onClick={onOpenProfitShare}
                  className="text-emerald-400 hover:text-emerald-300 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Transparansi Bagi Hasil 80:20 (No Fixed ROI) →</span>
                </button>
              )}
            </div>
          </div>

          {/* Program Promo Member Tiered Bonus Banner */}
          <div className="p-3.5 rounded-xl bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-cyan-500/15 border border-emerald-500/35 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <span className="text-xs font-bold text-emerald-400 font-mono flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Program Promo & Bonus hingga 90%</span>
              </span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                MEMBER: BONUS HINGGA +30% NON-CASH
              </span>
            </div>
            <p className="text-[10px] text-slate-300 font-sans leading-relaxed">
              Bonus ekstra saldo Gas Tank otomatis (Non-Cash) sesuai nominal top-up fee trading Anda:
            </p>
            <div className="grid grid-cols-4 gap-1.5 text-center text-xs font-mono">
              <div
                onClick={() => handleSetExactAmount(50)}
                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                  numAmount >= 50 && numAmount < 100
                    ? 'bg-emerald-500/20 border-emerald-400 ring-1 ring-emerald-400/50'
                    : 'bg-[#081220] border-[#15253C] hover:border-slate-500'
                }`}
              >
                <span className="text-[8.5px] text-slate-400 block">$50 - $99</span>
                <span className="text-emerald-400 font-bold text-[11px] block mt-0.5">+10%</span>
              </div>
              <div
                onClick={() => handleSetExactAmount(100)}
                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                  numAmount >= 100 && numAmount < 200
                    ? 'bg-emerald-500/20 border-emerald-400 ring-1 ring-emerald-400/50'
                    : 'bg-[#081220] border-[#15253C] hover:border-slate-500'
                }`}
              >
                <span className="text-[8.5px] text-slate-400 block">$100 - $199</span>
                <span className="text-emerald-400 font-bold text-[11px] block mt-0.5">+20%</span>
              </div>
              <div
                onClick={() => handleSetExactAmount(200)}
                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                  numAmount >= 200 && numAmount < 500
                    ? 'bg-emerald-500/20 border-emerald-400 ring-1 ring-emerald-400/50'
                    : 'bg-[#081220] border-[#15253C] hover:border-slate-500'
                }`}
              >
                <span className="text-[8.5px] text-slate-400 block">$200 - $499</span>
                <span className="text-emerald-400 font-bold text-[11px] block mt-0.5">+25%</span>
              </div>
              <div
                onClick={() => handleSetExactAmount(500)}
                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                  numAmount >= 500 && numAmount <= 1000
                    ? 'bg-emerald-500/20 border-emerald-400 ring-1 ring-emerald-400/50'
                    : 'bg-[#081220] border-[#15253C] hover:border-slate-500'
                }`}
              >
                <span className="text-[8.5px] text-slate-400 block">$500 - $1000</span>
                <span className="text-emerald-400 font-bold text-[11px] block mt-0.5">+30%</span>
              </div>
            </div>
          </div>


          {/* Auto-Refill Guard Toggle */}
          <div className="p-3 rounded-xl bg-[#070D17] border border-[#14233A] flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                <Sparkles className="w-3.5 h-3.5 text-[#00F0C8]" />
                <span>Auto-Refill Threshold Protection</span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Isi otomatis 10 USDT dari vault jika gas pool &lt; 3 USDT untuk mencegah bot terhenti
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleAutoRefillToggle()} disabled={autoRefillSaving || isDemoOrTestnet}
              className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                autoRefill ? 'bg-[#00F0C8]' : 'bg-[#162740]'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-slate-950 transition-transform ${
                  autoRefill ? 'translate-x-5' : 'translate-x-0'
                }`}
              ></span>
            </button>
          </div>

          {/* Referral Gas Bonus Policy Info */}
          <div className="p-3.5 rounded-xl bg-[#071322] border border-amber-500/25 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#F0B90B] font-mono flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Bonus Referral 10% Top-Up Fee Trading</span>
              </span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                10% NON-CASH / OTOMATIS
              </span>
            </div>
            <p className="text-[11px] text-slate-300 font-sans leading-relaxed">
              Setiap kali downline Anda melakukan top-up untuk mengisi Fee Trading, Anda sebagai upline/referral mendapatkan <strong>10% Non-Cash</strong> yang langsung masuk ke penambahan saldo <strong>Fee Trading (Gas Tank)</strong> Anda (tidak bisa di-withdrawal).
            </p>
            <div className="text-[10px] text-slate-400 font-mono border-t border-[#142640] pt-1.5 flex items-center justify-between">
              <span>Bagi Hasil Trading Downline: <strong>20% CASH</strong> (Bisa di-Withdrawal)</span>
              {onOpenProfitShare && (
                <button
                  type="button"
                  onClick={onOpenProfitShare}
                  className="text-[#00F0C8] hover:underline"
                >
                  Lihat Skema Bagi Hasil →
                </button>
              )}
            </div>
          </div>

          {/* Kode Verifikasi 6 Digit */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-mono text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#00F0C8]" />
                Kode Verifikasi 6 Digit (Wajib)
              </label>
              <span className="text-[10px] text-emerald-400 font-mono">Secured</span>
            </div>
            <input
              type="text"
              maxLength={6}
              placeholder="6 Digit Kode Verifikasi (cth: 301948)"
              value={otp2fa}
              onChange={(e) => setOtp2fa(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#09111E] border border-[#162740] font-mono text-center tracking-widest text-sm text-white focus:outline-none focus:border-[#00F0C8]"
            />
          </div>

          {/* Breakdown summary */}
          <div className="p-3.5 rounded-xl bg-[#070D17] border border-[#14233A] space-y-1.5 text-xs font-mono">
            <div className="flex justify-between text-slate-400">
              <span>Sumber Dana:</span>
              <span className="text-white">Saldo GAIN ({formatUsdt(availableBalance)} USDT)</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Top-Up Pokok (Dipotong):</span>
              <span className="text-rose-400 font-semibold">-{formatUsdt(numAmount)} USDT</span>
            </div>
            {bonusPct > 0 && (
              <div className="flex justify-between text-emerald-400 font-semibold">
                <span>Bonus Promo Member ({bonusPct}% Non-Cash):</span>
                <span>+{formatUsdt(bonusUsdt)} USDT</span>
              </div>
            )}
            <div className="flex justify-between text-cyan-300 font-semibold">
              <span>Total Gas Masuk ke Tank:</span>
              <span>+{formatUsdt(totalGasReceived)} USDT</span>
            </div>
            <div className="border-t border-[#132034] pt-2 flex justify-between items-baseline">
              <span className="text-slate-300 font-sans font-medium">Estimasi Saldo Gas Baru:</span>
              <span className="text-base font-bold text-[#00F0C8]">
                +{formatUsdt(newGasTotal)} USDT
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
            <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>Gas Fee Pool Berhasil Ditambahkan!</span>
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
              <Fuel className="w-4 h-4" />
              {isProcessing ? 'Mengalokasikan...' : 'Konfirmasi & Isi Gas Fee Pool'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
