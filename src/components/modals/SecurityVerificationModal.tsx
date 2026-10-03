import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Mail, ShieldCheck, X } from 'lucide-react';
import {
  getSecuritySessionStatus,
  getSecurityVerificationCodeStatus,
  sendSecurityVerificationCode,
  verifySecurityVerificationCode,
} from '../../api/authApi';

interface SecurityVerificationModalProps {
  isOpen: boolean;
  userEmail: string;
  userName?: string;
  reason?: string;
  onVerifySuccess: () => void;
  onClose: () => void;
}

function getSecurityErrorMessage(error: any, fallback: string): string {
  switch (error?.code) {
    case 'RESEND_SENDER_NOT_ALLOWED':
      return 'Kode belum dapat dikirim karena alamat pengirim email server belum diverifikasi di Resend.';
    case 'RESEND_API_KEY_REJECTED':
      return 'Konfigurasi API email server ditolak Resend. Periksa RESEND_API_KEY.';
    case 'EMAIL_DELIVERY_NOT_CONFIGURED':
      return 'Pengiriman email server belum dikonfigurasi. Periksa RESEND_API_KEY dan RESEND_FROM.';
    case 'EMAIL_PROVIDER_RATE_LIMITED':
    case 'SECURITY_CODE_RATE_LIMITED':
      return 'Provider email sedang membatasi pengiriman. Tunggu beberapa saat lalu coba lagi.';
    case 'SECURITY_CODE_INVALID':
      return 'Kode keamanan salah. Periksa email terbaru dan masukkan kode yang masih berlaku.';
    case 'SECURITY_CODE_EXPIRED':
      return 'Kode keamanan sudah kedaluwarsa. Kirim kode baru.';
    default:
      return error?.message || fallback;
  }
}

export function SecurityVerificationModal({
  isOpen,
  userEmail,
  userName,
  reason,
  onVerifySuccess,
  onClose,
}: SecurityVerificationModalProps) {
  const [code, setCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);
  const autoSendStartedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      autoSendStartedRef.current = false;
      setCode('');
      setErrorMsg('');
      setCodeSent(false);
      setCountdown(0);
      return;
    }

    if (autoSendStartedRef.current) return;
    autoSendStartedRef.current = true;

    void getSecuritySessionStatus()
      .then(async (session) => {
        if (session.elevated) {
          onVerifySuccess();
          return;
        }

        const status = await getSecurityVerificationCodeStatus();
        if (status.active) {
          setCodeSent(true);
          setCountdown(Math.max(0, status.retryAfterSeconds ?? 0));
          return;
        }

        const result = await sendSecurityVerificationCode();
        setCodeSent(result.required);
        setCountdown(result.retryAfterSeconds ?? 60);
      })
      .catch((error: any) => {
        setErrorMsg(getSecurityErrorMessage(error, 'Kode keamanan sesi gagal dikirim.'));
        autoSendStartedRef.current = false;
      });
  }, [isOpen, onVerifySuccess]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  if (!isOpen) return null;

  const handleResend = async () => {
    if (countdown > 0) return;
    setErrorMsg('');
    try {
      const result = await sendSecurityVerificationCode({ forceResend: true });
      setCodeSent(result.required);
      setCountdown(result.retryAfterSeconds ?? 60);
    } catch (error: any) {
      setErrorMsg(getSecurityErrorMessage(error, 'Kode keamanan sesi gagal dikirim.'));
    }
  };

  const handleVerify = async () => {
    setErrorMsg('');
    const clean = code.trim();
    if (!/^\d{6}$/.test(clean)) {
      setErrorMsg('Masukkan 6 digit angka kode keamanan.');
      return;
    }

    setIsVerifying(true);
    try {
      const result = await verifySecurityVerificationCode(clean);
      if (!result?.verified) throw new Error('Verifikasi keamanan belum berhasil.');

      let session = await getSecuritySessionStatus();
      for (let attempt = 1; !session.elevated && attempt <= 3; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        session = await getSecuritySessionStatus();
      }
      if (!session.elevated) throw new Error('Sesi keamanan belum aktif. Silakan coba verifikasi lagi.');
      onVerifySuccess();
    } catch (error: any) {
      setErrorMsg(getSecurityErrorMessage(error, 'Kode keamanan tidak valid.'));
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="theme-modal-shell w-full max-w-md bg-[#0F172A] border border-amber-500/30 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white font-mono">Verifikasi Keamanan</h2>
                <p className="text-[11px] text-slate-400 font-sans mt-1">Bukan kode login. Hanya untuk tindakan yang membutuhkan keamanan tambahan.</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="text-slate-500 hover:text-white" aria-label="Tutup">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3.5 space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider font-mono text-amber-400">Security Session</p>
            <p className="text-xs text-slate-200 font-sans">
              {reason || 'Tindakan ini memerlukan verifikasi keamanan tambahan.'}
            </p>
            {userName ? <p className="text-[10px] text-slate-500 font-sans">Akun: {userName}</p> : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-slate-300 font-sans">
              <Mail className="w-4 h-4 text-amber-400" />
              <span>Kode 6 digit dikirim ke <strong className="text-amber-300">{userEmail}</strong></span>
            </div>

            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ''))}
              onKeyDown={(event) => event.key === 'Enter' && void handleVerify()}
              autoFocus
              className="w-full text-center tracking-[0.5em] text-2xl font-bold py-3 bg-slate-950 border border-slate-700 rounded-2xl text-white focus:outline-hidden focus:border-amber-400 font-mono"
            />

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-center gap-2 font-sans">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              onClick={() => void handleVerify()}
              disabled={isVerifying || !codeSent || code.length !== 6}
              className="w-full py-3 rounded-2xl text-xs font-bold font-mono bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 hover:from-amber-400 hover:to-amber-500 transition shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <span>{isVerifying ? 'Memverifikasi...' : 'Verifikasi & Lanjutkan'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between text-xs font-mono pt-3 border-t border-slate-800/80">
            <button
              onClick={() => void handleResend()}
              disabled={countdown > 0}
              className="text-slate-400 hover:text-amber-400 disabled:opacity-50 cursor-pointer transition"
            >
              {countdown > 0 ? `Kirim ulang (${countdown}s)` : 'Kirim ulang kode'}
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer transition">Nanti</button>
          </div>
        </div>
      </div>
    </div>
  );
}
