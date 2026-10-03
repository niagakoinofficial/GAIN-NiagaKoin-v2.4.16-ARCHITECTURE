import { useEffect, useState } from 'react';
import { X, Copy, Check, AlertTriangle, Cpu, ShieldCheck, CheckCircle2, ArrowRight } from 'lucide-react';
import { verifyWalletDeposit } from '../../services/walletService';
import QRCode from 'qrcode';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onViewLedger?: () => void;
  onDepositSuccess?: (amount: number, target: 'gas' | 'vault', txHash: string) => Promise<void> | void;
  memberId?: string;
  userEmail?: string;
  customDepositAddress?: string;
}

export function DepositModal({
  isOpen,
  onClose,
  onViewLedger,
  onDepositSuccess,
  memberId,
  userEmail,
  customDepositAddress,
}: DepositModalProps) {
  const [copied, setCopied] = useState(false);
  const [depositTarget, setDepositTarget] = useState<'gas' | 'vault'>('vault');
  const [depositAmount, setDepositAmount] = useState('50.00');
  const [txHash, setTxHash] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifySuccess, setVerifySuccess] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const depositAddress = String(customDepositAddress || '').trim();

  useEffect(() => {
    if (!isOpen || !depositAddress) { setQrDataUrl(''); return; }
    void QRCode.toDataURL(depositAddress, { margin: 1, width: 320, errorCorrectionLevel: 'M' }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
  }, [isOpen, depositAddress]);

  if (!isOpen) return null;

  const handleCopy = () => {
    if (!depositAddress) return;
    navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePasteHash = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setTxHash(text.trim());
    } catch {
      setVerifyError('Clipboard tidak dapat diakses. Tempel TxHash secara manual; GAIN tidak membuat TxHash contoh.');
    }
  };

  const handleVerifyOnChain = async () => {
    setVerifyError(null);
    setVerifySuccess(null);

    if (!depositAddress) { setVerifyError('Alamat deposit belum dikonfigurasi server. Deposit belum dapat diproses.'); return; }

    const numAmount = parseFloat(depositAmount);
    if (isNaN(numAmount) || numAmount < 10) {
      setVerifyError('Minimal deposit adalah 10 USDT.');
      return;
    }

    if (!txHash || txHash.trim().length < 10) {
      setVerifyError('Masukkan Transaction Hash (TxID) bukti transfer BSC / BEP-20.');
      return;
    }

    setIsVerifying(true);

    try {
      const data = await verifyWalletDeposit({
          txHash: txHash.trim(),
          network: 'BEP-20 (BNB Smart Chain)',
          amount: numAmount,
          target: depositTarget,
      });

      if (data.success) {
        setIsVerifying(false);
        setVerifySuccess(`Terverifikasi di Blok #${data.blockNumber} (${data.confirmations}/18 Konfirmasi Jaringan). Saldo berhasil dikreditkan ke ${depositTarget === 'gas' ? 'Gas Fee Tank' : 'Vault Liquidity'}!`);

        if (onDepositSuccess) {
          onDepositSuccess(numAmount, depositTarget, data.txHash || txHash);
        }

        setTimeout(() => {
          if (onViewLedger) onViewLedger();
          onClose();
        }, 1800);
      } else {
        setIsVerifying(false);
        setVerifyError(data.error || 'Verifikasi transaksi on-chain gagal.');
      }
    } catch (error: any) {
      setIsVerifying(false);
      setVerifyError(error.message || 'Tidak dapat memverifikasi deposit. Saldo belum dikreditkan.');
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
              Deposit USDT (BEP-20)
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Algorithmic Settlement Vault Deposit
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#0F1A2D] border border-[#1A2D4A] flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar">
          {/* Network Selection Card */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1.5 uppercase tracking-wider">
              Pilihan Jaringan (Wajib Sama)
            </label>
            <div className="p-3 rounded-xl bg-[#0B1527] border border-[#00F0C8]/40 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#F0B90B]/10 border border-[#F0B90B]/30 flex items-center justify-center text-[#F0B90B] font-bold text-xs">
                  BNB
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">BNB Smart Chain</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#00F0C8]/10 text-[#00F0C8] border border-[#00F0C8]/30 font-semibold">
                      BEP-20
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Bridge: <span className="text-amber-400 font-bold">Status ditentukan server</span>
                  </p>
                </div>
              </div>
              <span className="px-2 py-1 rounded-md text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                Server Config
              </span>
            </div>
          </div>

          {/* QR Code with Cyber Scanner Animation */}
          <div className="p-4 rounded-xl bg-[#070D17] border border-[#14233A] flex flex-col items-center justify-center">
            <div className="relative p-3 bg-white rounded-xl shadow-lg border-2 border-[#00F0C8]/40 overflow-hidden">
              {/* Animated Scanner Laser */}
              <div className="scanner-line"></div>

              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR alamat deposit USDT" className="w-40 h-40 object-contain" />
              ) : (
                <div className="w-40 h-40 flex items-center justify-center text-center text-xs text-slate-500 px-4">Alamat deposit belum dikonfigurasi server.</div>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-2 font-mono">{depositAddress ? 'Scan QR untuk setor USDT' : 'QR tidak tersedia sebelum alamat deposit dikonfigurasi'}</p>
          </div>

          {/* Deposit Address Box */}
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1.5 uppercase tracking-wider">
              Alamat Deposit
            </label>
            <div className="p-2.5 rounded-xl bg-[#09111E] border border-[#162740] flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-[#00F0C8] break-all select-all">
                {depositAddress}
              </span>
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-lg bg-[#00F0C8]/10 border border-[#00F0C8]/30 text-[#00F0C8] text-xs font-semibold hover:bg-[#00F0C8]/20 transition flex items-center gap-1.5 shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Tersalin' : 'Salin'}</span>
              </button>
            </div>
          </div>

          {/* Target Destination & Amount */}
          <div className="space-y-3 pt-1 border-t border-[#14233A]">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDepositTarget('vault')}
                className={`p-2.5 rounded-xl border text-left transition ${
                  depositTarget === 'vault'
                    ? 'bg-[#00F0C8]/10 border-[#00F0C8] text-white'
                    : 'bg-[#09111E] border-[#162740] text-slate-400 hover:text-white'
                }`}
              >
                <div className="text-[10px] font-mono text-slate-400 uppercase">Tujuan Dana</div>
                <div className="text-xs font-bold font-mono text-[#00F0C8]">Vault Liquidity</div>
              </button>

              <button
                type="button"
                onClick={() => setDepositTarget('gas')}
                className={`p-2.5 rounded-xl border text-left transition ${
                  depositTarget === 'gas'
                    ? 'bg-[#00F0C8]/10 border-[#00F0C8] text-white'
                    : 'bg-[#09111E] border-[#162740] text-slate-400 hover:text-white'
                }`}
              >
                <div className="text-[10px] font-mono text-slate-400 uppercase">Tujuan Dana</div>
                <div className="text-xs font-bold font-mono text-amber-400">Gas Fee Tank</div>
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                <span>Jumlah USDT yang Dikirim</span>
                <span className="text-slate-500">Min. 10 USDT</span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="50.00"
                  className="w-full px-3 py-2 rounded-xl bg-[#09111E] border border-[#162740] text-sm font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00F0C8]"
                />
                <span className="absolute right-3 top-2.5 text-xs font-mono font-bold text-[#00F0C8]">USDT</span>
              </div>
            </div>

            {/* On-Chain TxID / Hash input */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                <span>Transaction Hash (TxID)</span>
                <button
                  type="button"
                  onClick={handlePasteHash}
                  className="text-[10px] text-[#00F0C8] hover:underline cursor-pointer"
                >
                  Tempel TxHash
                </button>
              </div>
              <input
                type="text"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                placeholder="Contoh: 0x4a8f9c2d1b... atau hash transfer dompet Anda"
                className="w-full px-3 py-2 rounded-xl bg-[#09111E] border border-[#162740] text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-[#00F0C8]"
              />
            </div>

            {/* Verify Status Alerts */}
            {verifySuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                <span className="leading-tight">{verifySuccess}</span>
              </div>
            )}

            {verifyError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{verifyError}</span>
              </div>
            )}
          </div>

          {/* Security Notice */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Perhatian Keamanan</span>
            </div>
            <ul className="text-[11px] space-y-1 text-slate-300 pl-5 list-disc font-sans">
              <li>Minimal setoran: <strong>10 USDT</strong> (jumlah di bawah ini tidak dapat diproses).</li>
              <li>Membutuhkan <strong>18 konfirmasi blok jaringan</strong> (~45 detik).</li>
              <li>Verifikasi instan via backend settlement engine terintegrasi.</li>
            </ul>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#060B14] border-t border-[#142236] flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
            <Cpu className="w-3.5 h-3.5 text-[#00F0C8]" />
            <span>On-Chain Settlement</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isVerifying}
              className="px-3.5 py-2 rounded-xl bg-[#0F1A2D] text-slate-300 hover:text-white text-xs font-semibold transition"
            >
              Tutup
            </button>
            <button
              onClick={handleVerifyOnChain}
              disabled={isVerifying}
              className="px-4 py-2 rounded-xl bg-[#00F0C8] hover:bg-[#00d6b2] text-slate-950 text-xs font-bold glow-cyan-btn transition flex items-center gap-1.5 disabled:opacity-50"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isVerifying ? 'Memverifikasi Blok...' : 'Verifikasi On-Chain'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
