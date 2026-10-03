import React, { useEffect, useRef, useState } from 'react';
import {
  MailCheck,
  Mail,
  AlertCircle,
  ArrowRight,
  LogOut,
} from 'lucide-react';
import { auth } from '../../firebase';
import {
  sendVerificationCode,
  getVerificationCodeStatus,
  verifyEmailVerificationCode,
} from '../../api/authApi';

interface GmailVerificationModalProps {
  isOpen: boolean;
  userEmail: string;
  userName?: string;
  onVerificationSuccess: () => Promise<void> | void;
  onCancel: () => Promise<void> | void;
}


function getEmailVerificationErrorMessage(error: any, fallback: string): string {
  switch (error?.code) {
    case 'RESEND_SENDER_NOT_ALLOWED':
      return 'Kode belum dapat dikirim karena alamat pengirim email server belum diverifikasi di Resend. Hubungi administrator untuk memperbaiki RESEND_FROM/domain pengirim.';
    case 'RESEND_API_KEY_REJECTED':
      return 'Konfigurasi API email server ditolak Resend. Administrator perlu memeriksa RESEND_API_KEY.';
    case 'EMAIL_DELIVERY_NOT_CONFIGURED':
      return 'Pengiriman email server belum dikonfigurasi. Administrator perlu menetapkan RESEND_API_KEY dan RESEND_FROM.';
    case 'EMAIL_PROVIDER_RATE_LIMITED':
      return 'Provider email sedang membatasi pengiriman. Tunggu beberapa saat lalu coba lagi.';
    default:
      return error?.message || fallback;
  }
}

export function GmailVerificationModal({
  isOpen,
  userEmail,
  userName,
  onVerificationSuccess,
  onCancel,
}: GmailVerificationModalProps) {
  const [code, setCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);

  // Prevent duplicate automatic sends caused by React StrictMode
  // or repeated renders while the modal remains open.
  const autoSendStartedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      autoSendStartedRef.current = false;
      return;
    }

    if (autoSendStartedRef.current) return;

    autoSendStartedRef.current = true;

    const ensureCodeAvailable = async () => {
      setErrorMsg('');
      setIsSending(true);

      try {
        // Refresh/remount must first inspect the existing challenge.
        // It must never generate another email while the previous code is valid.
        const status = await getVerificationCodeStatus('email');
        if (status.active) {
          setCodeSent(true);
          setCountdown(Math.max(1, status.retryAfterSeconds ?? status.expiresInSeconds));
          return;
        }

        const result = await sendVerificationCode({ forceResend: false });
        setCodeSent(true);
        const retryAfter =
          typeof result?.retryAfterSeconds === 'number'
            ? result.retryAfterSeconds
            : 30;
        setCountdown(Math.max(1, retryAfter));
      } catch (err: any) {
        setErrorMsg(
          getEmailVerificationErrorMessage(err, 'Gagal memeriksa atau mengirim kode verifikasi ke email.')
        );
      } finally {
        setIsSending(false);
      }
    };

    void ensureCodeAvailable();
  }, [isOpen]);

  useEffect(() => {
    if (countdown <= 0) return;

    const timer = window.setInterval(() => {
      setCountdown((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [countdown]);

  if (!isOpen) return null;

  const handleResend = async () => {
    if (isSending || countdown > 0) return;

    setErrorMsg('');
    setIsSending(true);

    try {
      const result = await sendVerificationCode({ forceResend: true });
      setCodeSent(true);

      const retryAfter =
        typeof result?.retryAfterSeconds === 'number'
          ? result.retryAfterSeconds
          : 30;

      setCountdown(Math.max(1, retryAfter));
      setCode('');
    } catch (err: any) {
      setErrorMsg(
        getEmailVerificationErrorMessage(err, 'Gagal mengirim ulang kode verifikasi.')
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleVerify = async () => {
    setErrorMsg('');

    const clean = code.trim();

    if (!/^\d{6}$/.test(clean)) {
      setErrorMsg(
        'Masukkan 6 digit angka kode verifikasi dari email.'
      );
      return;
    }

    if (!auth.currentUser) {
      setErrorMsg('Sesi Google sudah berakhir. Silakan login ulang.');
      return;
    }

    setIsVerifying(true);

    try {
      await verifyEmailVerificationCode(clean);

      /*
       * Backend updates Firebase Auth emailVerified=true.
       * The current browser ID token can still contain the old
       * email_verified=false claim, so force-refresh it.
       */
      await auth.currentUser.getIdToken(true);
      await auth.currentUser.reload();

      /*
       * Run the parent success handler only after Firebase Auth
       * has been refreshed successfully.
       */
      await onVerificationSuccess();
    } catch (err: any) {
      setErrorMsg(
        err?.message || 'Kode verifikasi tidak valid atau sudah kedaluwarsa.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-fadeIn">
      <div className="theme-modal-shell w-full max-w-md bg-[#0F172A] border border-cyan-500/30 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-6 text-center space-y-4">

          <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 flex items-center justify-center shadow-lg shadow-cyan-500/10">
            <MailCheck className="w-7 h-7" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-white font-mono">
              Verifikasi Email Anda
            </h2>

            <p className="text-xs text-slate-400 font-sans mt-1">
              {codeSent ? 'Kode 6 digit telah dikirimkan ke:' : 'Kode verifikasi akan dikirim setelah layanan email server siap:'}
            </p>

            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-cyan-300 font-mono text-xs">
              <Mail className="w-3.5 h-3.5" />
              <span>{userEmail}</span>
            </div>
          </div>

          <div className="space-y-3 pt-2">

            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/[^0-9]/g, ''))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void handleVerify();
                }
              }}
              autoFocus
              className="w-full text-center tracking-[0.5em] text-2xl font-bold py-3 bg-slate-950 border border-slate-700 rounded-2xl text-white focus:outline-hidden focus:border-cyan-400 font-mono"
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
              className="w-full py-3 rounded-2xl text-xs font-bold font-mono bg-gradient-to-r from-cyan-500 to-teal-500 text-slate-950 hover:from-cyan-400 hover:to-teal-400 transition shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <span>
                {isVerifying ? 'Memverifikasi...' : 'Verifikasi & Selesai'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between text-xs font-mono pt-3 border-t border-slate-800/80">

            <button
              onClick={() => void handleResend()}
              disabled={isSending || countdown > 0}
              className="text-slate-400 hover:text-cyan-400 disabled:opacity-50 cursor-pointer transition"
            >
              {isSending
                ? 'Mengirim kode...'
                : countdown > 0
                  ? `Kirim ulang (${countdown}s)`
                  : 'Kirim Kode ke Gmail'}
            </button>

            <button
              onClick={() => void onCancel()}
              className="text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Batal</span>
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}
