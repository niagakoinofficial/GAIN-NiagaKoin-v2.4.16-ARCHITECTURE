import React, { useState, useEffect } from 'react';
import { X, ShieldCheck, Copy, Check, QrCode, Lock, Key, AlertCircle } from 'lucide-react';
import QRCode from 'qrcode';
import { generateSecret, generateTotpUri } from '../../services/totpService';

interface Google2faModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  username?: string;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  onSave2fa: (enabled: boolean, secret: string, verificationCode: string) => Promise<void> | void;
}

export function Google2faModal({
  isOpen,
  onClose,
  userEmail = 'user@gainkoin.io',
  username = 'Member GAIN',
  twoFactorEnabled = false,
  twoFactorSecret = '',
  onSave2fa,
}: Google2faModalProps) {
  const [isEnabled, setIsEnabled] = useState(twoFactorEnabled);
  const [currentSecret, setCurrentSecret] = useState(twoFactorSecret || '');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsEnabled(twoFactorEnabled);
      const secret = twoFactorSecret || generateSecret(16);
      setCurrentSecret(secret);
      setErrorMsg('');
      setVerificationCode('');

      const uri = generateTotpUri(userEmail || username, 'GAIN Niaga Koin', secret);
      QRCode.toDataURL(uri, { margin: 1, width: 200, color: { dark: '#000000', light: '#ffffff' } })
        .then((url) => setQrDataUrl(url))
        .catch(() => {});
    }
  }, [isOpen, twoFactorEnabled, twoFactorSecret, userEmail, username]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleSave = async () => {
    setErrorMsg('');
    if (isEnabled) {
      if (!verificationCode || verificationCode.length < 6) {
        setErrorMsg('Masukkan 6 digit kode dari aplikasi Authenticator untuk verifikasi.');
        return;
      }
    }

    setIsSaving(true);
    try {
      await onSave2fa(isEnabled, currentSecret, verificationCode);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan pengaturan 2FA');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="theme-modal-shell w-full max-w-md bg-[#0F172A] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white font-mono">Google Authenticator (2FA)</h2>
              <p className="text-[11px] text-slate-400 font-sans">Proteksi Akun & Penarikan Saldo</p>
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
          {/* Status Toggle */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900 border border-slate-800">
            <div>
              <span className="font-bold text-white block">Status 2FA</span>
              <span className="text-[10px] text-slate-400">
                {isEnabled ? 'Aktif (Wajib kode saat transaksi)' : 'Nonaktif'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsEnabled(!isEnabled)}
              className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-300 ${
                isEnabled ? 'bg-amber-500 justify-end' : 'bg-slate-700 justify-start'
              }`}
            >
              <div className="w-4 h-4 rounded-full bg-white shadow-md"></div>
            </button>
          </div>

          {isEnabled && (
            <>
              {/* QR Code */}
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col items-center text-center space-y-3">
                <span className="text-[11px] text-slate-400 font-sans">
                  Pindai QR ini di aplikasi <strong>Google Authenticator</strong> atau pasang kunci rahasia:
                </span>
                {qrDataUrl ? (
                  <div className="p-2 bg-white rounded-xl shadow-md">
                    <img src={qrDataUrl} alt="2FA QR Code" className="w-36 h-36" />
                  </div>
                ) : (
                  <div className="w-36 h-36 bg-slate-800 animate-pulse rounded-xl flex items-center justify-center text-slate-500">
                    Loading QR...
                  </div>
                )}

                {/* Secret Key */}
                <div className="w-full flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <span className="text-amber-400 font-bold tracking-widest text-[11px] truncate">
                    {currentSecret}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1 text-[10px]"
                  >
                    {copiedSecret ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSecret ? 'Tersalin' : 'Salin'}</span>
                  </button>
                </div>
              </div>

              {/* Verify OTP */}
              <div>
                <label className="text-[11px] text-slate-400 block mb-1">
                  Masukkan 6 Digit Kode OTP untuk Konfirmasi:
                </label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full text-center tracking-widest text-lg font-bold py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-hidden focus:border-amber-400"
                />
              </div>
            </>
          )}

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex items-center justify-end gap-2 font-mono">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
          >
            Batal
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 hover:from-amber-400 hover:to-amber-500 transition shadow-lg shadow-amber-500/20 disabled:opacity-50"
          >
            {isSaving ? 'Menyimpan...' : 'Simpan 2FA'}
          </button>
        </div>
      </div>
    </div>
  );
}
