import React, { useState, useEffect } from 'react';
import {
  X,
  LogIn,
  UserPlus,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  Bot,
  Zap,
  Users,
  ArrowRight,
  Search,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { lookupMemberInDirectory } from '../../services/memberService';
import { isDemoMode } from '../../config/appMode';
import { GainLogo } from '../common/GainLogo';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'register';
  initialSponsorId?: string;
}

export function AuthModal({
  isOpen,
  onClose,
  defaultMode = 'login',
  initialSponsorId = '',
}: AuthModalProps) {
  const {
    loginWithGoogle,
    loginDirectly,
    isLoggingIn,
    authError,
    clearAuthError,
  } = useAuth();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(defaultMode);
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [directEmail, setDirectEmail] = useState('');

  // Form states for Registration
  const [username, setUsername] = useState('');
  const [sponsorId, setSponsorId] = useState(initialSponsorId);
  const [sponsorName, setSponsorName] = useState(initialSponsorId ? 'Memverifikasi referral...' : 'Master GAIN Foundation');
  const [isVerifyingSponsor, setIsVerifyingSponsor] = useState(false);
  const [sponsorStatus, setSponsorStatus] = useState<'valid' | 'invalid' | 'default'>(initialSponsorId ? 'valid' : 'default');

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const isWildcardBindHost = currentHost === '0.0.0.0';
  const authorizedHost = isWildcardBindHost ? 'localhost' : currentHost;
  const localhostUrl = typeof window !== 'undefined'
    ? `${window.location.protocol}//localhost${window.location.port ? `:${window.location.port}` : ''}`
    : 'http://localhost:3000';

  useEffect(() => {
    setActiveTab(defaultMode);
  }, [defaultMode]);

  useEffect(() => {
    if (initialSponsorId) {
      setSponsorId(initialSponsorId);
    }
  }, [initialSponsorId]);

  const handleCopyDomain = () => {
    navigator.clipboard.writeText(currentHost);
    setCopiedDomain(true);
    setTimeout(() => setCopiedDomain(false), 2500);
  };

  const handleTabChange = (tab: 'login' | 'register') => {
    clearAuthError();
    setActiveTab(tab);
  };

  const handleClose = () => {
    clearAuthError();
    onClose();
  };

  // Live lookup referral / upline ID
  useEffect(() => {
    const trimmed = sponsorId.trim().toUpperCase();
    if (!trimmed) {
      setSponsorStatus('default');
      setSponsorName('Master GAIN Foundation');
      setIsVerifyingSponsor(false);
      return;
    }

    let isMounted = true;
    setIsVerifyingSponsor(true);
    const timer = setTimeout(async () => {
      try {
        const found = await lookupMemberInDirectory(trimmed);
        if (!isMounted) return;
        if (found) {
          setSponsorStatus('valid');
          setSponsorName(found.username);
        } else {
          setSponsorStatus('invalid');
          setSponsorName('Kode referral / ID upline tidak ditemukan di direktori');
        }
      } catch {
        if (isMounted) {
          setSponsorStatus('invalid');
          setSponsorName('Direktori referral tidak dapat diverifikasi');
        }
      } finally {
        if (isMounted) setIsVerifyingSponsor(false);
      }
    }, 400);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [sponsorId]);

  if (!isOpen) return null;

  const handleRegisterSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (sponsorStatus === 'invalid') return;

    await loginWithGoogle({
      sponsorId: sponsorId.trim().toUpperCase(),
      sponsorName,
      desiredUsername: username.trim() || undefined,
    });
  };

  const handleLoginSubmit = async () => {
    await loginWithGoogle();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="theme-modal-shell relative w-full max-w-md bg-[#0A1322] border border-[#162740] rounded-3xl p-6 sm:p-7 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow ambient background decoration */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#00F0C8]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer"
          title="Tutup"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Brand Header */}
        <div className="flex items-center gap-3 mb-5">
          <GainLogo size="lg" />
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-lg font-bold text-white tracking-wide">GAIN NIAGA KOIN</h2>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                OFFICIAL
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">100-Layer Algorithmic Matrix Engine</p>
          </div>
        </div>

        {/* Tab Switcher: Masuk vs Daftar */}
        <div className="grid grid-cols-2 p-1 bg-[#060B14] rounded-2xl border border-[#121E31] mb-5">
          <button
            type="button"
            onClick={() => handleTabChange('login')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
              activeTab === 'login'
                ? 'bg-[#00F0C8] text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>Masuk (Login)</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange('register')}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
              activeTab === 'register'
                ? 'bg-[#00F0C8] text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Daftar Akun Baru</span>
          </button>
        </div>

        {/* FIREBASE UNAUTHORIZED DOMAIN TROUBLESHOOTING ALERT */}
        {authError?.code === 'auth/unauthorized-domain' && (
          <div className="mb-5 p-4 rounded-2xl bg-gradient-to-br from-amber-950/40 to-slate-900 border border-amber-500/40 text-amber-200 text-xs font-mono space-y-3 shadow-lg">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="font-bold text-amber-300 text-xs font-mono">
                  Domain Belum Diizinkan di Firebase Console
                </h4>
                <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
                  {isWildcardBindHost
                    ? 'Aplikasi dibuka melalui alamat bind server 0.0.0.0. Buka localhost di browser; alamat 0.0.0.0 tidak perlu dan tidak sebaiknya ditambahkan ke Authorized Domains.'
                    : <>Firebase Authentication membatasi Google Sign-In hanya pada domain yang terdaftar. Pastikan hostname ini tercantum di <strong>Authorized Domains</strong> di Firebase Authentication Settings:</>}
                </p>
              </div>
            </div>

            {/* Current Hostname with Copy Button */}
            <div className="p-2.5 rounded-xl bg-[#060B14] border border-amber-500/30 flex items-center justify-between gap-2">
              <div className="overflow-hidden">
                <span className="text-[9px] text-slate-500 block uppercase">Domain Saat Ini (Salin ini):</span>
                <code className="text-[11px] text-[#00F0C8] font-bold break-all select-all font-mono">
                  {authorizedHost}
                </code>
              </div>
              <button
                type="button"
                onClick={handleCopyDomain}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer border border-amber-500/30"
              >
                {copiedDomain ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedDomain ? 'Tersalin!' : 'Salin Domain'}</span>
              </button>
            </div>

            {/* Quick 3-Step Guide */}
            <div className="text-[11px] text-slate-300 space-y-1.5 font-sans bg-black/40 p-3 rounded-xl border border-white/5">
              <p className="font-bold text-amber-400 font-mono text-[10px] uppercase">Cara Menambahkan ke Firebase Console:</p>
              <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-300 leading-relaxed">
                <li>Buka <strong>Firebase Console &rarr; Authentication &rarr; Settings &rarr; Authorized domains</strong>.</li>
                <li>{isWildcardBindHost
                  ? <>Buka aplikasi menggunakan <code className="text-[#00F0C8] bg-black/50 px-1 py-0.5 rounded font-mono">localhost</code>; jangan tambahkan <code className="text-[#00F0C8] bg-black/50 px-1 py-0.5 rounded font-mono">0.0.0.0</code>.</>
                  : <>Pastikan hostname <code className="text-[#00F0C8] bg-black/50 px-1 py-0.5 rounded font-mono">{authorizedHost}</code> tercantum; tambahkan jika belum ada.</>}</li>
                <li>Setelah disimpan, klik tombol <strong>"Coba Masuk Lagi"</strong> di bawah.</li>
              </ol>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1 font-mono">
              <a
                href={isWildcardBindHost
                  ? localhostUrl
                  : `https://console.firebase.google.com/project/${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'gain-niagakoin-prod'}/authentication/settings`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-center font-bold text-[11px] transition flex items-center justify-center gap-1.5"
              >
                <span>{isWildcardBindHost ? 'Buka aplikasi di localhost' : 'Buka Authorized Domains di Console'}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              {!isWildcardBindHost && (
                <button
                  type="button"
                  onClick={activeTab === 'login' ? handleLoginSubmit : () => handleRegisterSubmit()}
                  disabled={isLoggingIn}
                  className="py-2.5 px-3 rounded-xl bg-[#00F0C8]/20 hover:bg-[#00F0C8]/30 text-[#00F0C8] border border-[#00F0C8]/40 font-bold text-[11px] transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoggingIn ? 'animate-spin' : ''}`} />
                  <span>Coba Masuk Lagi</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Generic Auth Error */}
        {authError && authError.code !== 'auth/unauthorized-domain' && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-mono flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{authError.message}</span>
            </div>
            <button
              type="button"
              onClick={clearAuthError}
              className="text-red-400 hover:text-white text-xs underline cursor-pointer shrink-0"
            >
              Tutup
            </button>
          </div>
        )}

        {/* TAB 1: LOGIN */}
        {activeTab === 'login' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {/* User Segmentation Card */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10.5px] font-mono">
              <div className="p-3 rounded-2xl bg-[#081324] border border-[#162D4A] space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>1. User dengan Lisensi Aktif</span>
                </div>
                <p className="text-slate-300 leading-tight text-[10px]">
                  Memiliki entitlement fitur berbayar. Verifikasi keamanan 6 digit <span className="text-[#00F0C8]">hanya diminta saat tindakan tertentu memerlukannya</span>, bukan saat masuk dashboard.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-[#08101E] border border-[#14233A] space-y-1">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                  <Zap className="w-3.5 h-3.5 shrink-0" />
                  <span>2. User Tanpa Lisensi</span>
                </div>
                <p className="text-slate-300 leading-tight text-[10px]">
                  Tetap dapat masuk dashboard dan memakai fitur non-licensed. Aktivasi lisensi menjadi entitlement terpisah dari proses login.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#08101D] border border-[#14233A] space-y-2">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#00F0C8] shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-white font-mono">Autentikasi Google &amp; Keamanan Berlapis</h4>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                    Google/Firebase menjadi autentikasi identitas. Sesi keamanan 24 jam hanya dibuat saat tindakan terlindungi memerlukannya; 2FA digunakan untuk transaksi berisiko tinggi.
                  </p>
                </div>
              </div>
              <div className="pt-2 border-t border-[#121E31] flex items-center justify-between text-[10px] font-mono text-slate-400">
                <span className="flex items-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-3 h-3" /> Login Dashboard Tanpa OTP
                </span>
                <span>Security On-Demand • 24 Jam</span>
              </div>
            </div>

            {/* Google Login Action Button */}
            <button
              onClick={handleLoginSubmit}
              disabled={isLoggingIn}
              className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-bold font-mono text-sm flex items-center justify-center gap-3 transition shadow-lg hover:shadow-xl cursor-pointer disabled:opacity-50 active:scale-[0.98]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{isLoggingIn ? 'Menghubungkan Akun...' : 'Masuk dengan Akun Google'}</span>
            </button>

            {isDemoMode && (
              <div className="pt-2 border-t border-slate-800/80 dark:border-[#14233A]">
                <span className="text-[10px] text-amber-300 font-sans block mb-1.5">
                  Login demo lokal saja; sesi dan data ini tidak disinkronkan ke Firebase.
                </span>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="masukkan.email@anda.com"
                  value={directEmail}
                  onChange={(e) => setDirectEmail(e.target.value)}
                  className="flex-1 px-3 py-2 bg-[#060B14] border border-[#14233A] rounded-xl text-white font-sans text-xs focus:border-[#00F0C8] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => directEmail.trim() && loginDirectly(directEmail.trim())}
                  disabled={!directEmail.trim() || isLoggingIn}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-[#00F0C8] font-sans font-bold text-xs border border-slate-700 disabled:opacity-40 cursor-pointer"
                >
                  Demo
                </button>
              </div>
              </div>
            )}

            <div className="text-center pt-1">
              <p className="text-xs text-slate-400">
                Belum terdaftar sebagai member?{' '}
                <button
                  type="button"
                  onClick={() => handleTabChange('register')}
                  className="text-[#00F0C8] hover:underline font-semibold font-mono"
                >
                  Daftar Akun Baru &rarr;
                </button>
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: REGISTER */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-4 animate-in fade-in duration-200">
            {/* Username / Display Name */}
            <div>
              <label className="block text-[11px] font-mono text-slate-300 font-bold mb-1.5 uppercase">
                Username / Nama Panggilan (Opsional)
              </label>
              <input
                type="text"
                placeholder="Contoh: crypto_master88"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#060B14] border border-[#14233A] rounded-xl text-white font-mono text-xs focus:border-[#00F0C8] focus:outline-none transition"
              />
              <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                Jika dikosongkan, nama profil Google Anda akan digunakan otomatis.
              </span>
            </div>

            {/* Referral / Upline ID with live validation */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[11px] font-mono text-slate-300 font-bold uppercase">
                  Kode Referral / ID Upline <span className="text-slate-500">(Opsional)</span>
                </label>
                {sponsorStatus === 'valid' && (
                  <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Terverifikasi
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Kosong = Master GAIN / contoh GN-00001"
                  value={sponsorId}
                  onChange={(e) => setSponsorId(e.target.value)}
                  className={`w-full px-3.5 py-2.5 bg-[#060B14] border rounded-xl text-white font-mono text-xs uppercase tracking-wider focus:outline-none transition ${
                    sponsorStatus === 'valid'
                      ? 'border-emerald-500/50 focus:border-emerald-400'
                      : sponsorStatus === 'invalid'
                      ? 'border-red-500/50 focus:border-red-400'
                      : 'border-[#14233A] focus:border-[#00F0C8]'
                  }`}
                />
                <div className="absolute right-3 top-2.5 text-slate-400">
                  {isVerifyingSponsor ? (
                    <div className="w-4 h-4 border-2 border-slate-400 border-t-[#00F0C8] rounded-full animate-spin" />
                  ) : (
                    <Users className="w-4 h-4" />
                  )}
                </div>
              </div>

              {/* Referral / Upline Name Feedback */}
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-mono">
                {sponsorStatus === 'valid' ? (
                  <div className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 w-full flex items-center justify-between">
                    <span>Upline: {sponsorName}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  </div>
                ) : sponsorStatus === 'default' ? (
                  <div className="px-2 py-1 rounded-lg bg-slate-500/10 border border-slate-500/20 text-slate-300 w-full flex items-center justify-between">
                    <span>Upline default: Master GAIN Foundation</span>
                    <Users className="w-3.5 h-3.5 shrink-0" />
                  </div>
                ) : (
                  <div className="px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 w-full flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{sponsorName}</span>
                  </div>
                )}
              </div>
            </div>

            {/* License & Membership Note */}
            <div className="p-3 rounded-xl bg-gradient-to-br from-[#0B172B] to-[#07101E] border border-teal-500/20 space-y-1.5">
              <div className="flex items-center gap-2 text-[#00F0C8]">
                <Sparkles className="w-4 h-4" />
                <span className="text-xs font-bold font-mono">Keuntungan Registrasi Member GAIN:</span>
              </div>
              <ul className="text-[11px] text-slate-300 font-mono space-y-1 pl-4 list-disc">
                <li>Lisensi Seumur Hidup Bot Matrix 100-Layer Algoritmik</li>
                <li>Dukungan API Spot & Futures (Binance, Indodax, Tokocrypto, Bybit)</li>
                <li>Sistem Bagi Hasil Transparan (80% Member / 20% GAIN)</li>
              </ul>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoggingIn || isVerifyingSponsor || sponsorStatus === 'invalid'}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#00F0C8] to-teal-500 hover:from-[#26ffd7] hover:to-teal-400 text-slate-950 font-bold font-mono text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-[#00F0C8]/25 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
            >
              {isLoggingIn ? (
                <span>Memproses Registrasi...</span>
              ) : (
                <>
                  <span>Daftar dengan Akun Google</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="text-center pt-1">
              <p className="text-xs text-slate-400">
                Sudah memiliki akun?{' '}
                <button
                  type="button"
                  onClick={() => handleTabChange('login')}
                  className="text-[#00F0C8] hover:underline font-semibold font-mono"
                >
                  Masuk di sini &rarr;
                </button>
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
