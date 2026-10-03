import { useState } from 'react';
import { UserWallet, ExchangeName } from '../types';
import {
  User,
  ShieldCheck,
  Key,
  Copy,
  Check,
  Share2,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Lock,
  Database,
  LogIn,
  LogOut,
  Monitor,
  Sun,
  Moon,
  Unlink,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { NetworkReferralSection } from '../components/account/NetworkReferralSection';
import { formatUsdt } from '../utils/formatters';

interface AccountViewProps {
  wallet: UserWallet;
  currentExchange: ExchangeName;
  onOpenApiKey: () => void;
  onDisconnectApi?: () => void;
  onOpenProfitShare: () => void;
  onOpenGasModal: () => void;
  onOpenTransfer?: () => void;
  onOpenActivationModal?: () => void;
  onOpen2faModal?: () => void;
  onOpenAdmin?: () => void;
  onSelectActiveExchange?: (exchange: ExchangeName) => void;
  onDisconnectSingleExchange?: (exchange: ExchangeName) => void;
}

export function AccountView({
  wallet,
  currentExchange,
  onOpenApiKey,
  onDisconnectApi,
  onOpenProfitShare,
  onOpenGasModal,
  onOpenTransfer,
  onOpenActivationModal,
  onOpen2faModal,
  onOpenAdmin,
  onSelectActiveExchange,
  onDisconnectSingleExchange,
}: AccountViewProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [confirmDisconnectApi, setConfirmDisconnectApi] = useState(false);
  const { currentUser, loginWithGoogle, logout, firebaseConnectionStatus, isLoggingIn, isAdmin, openLogin, openRegister, retryUserProfileSync } = useAuth();
  const { theme, themePreference, setTheme } = useTheme();
  const [isSyncingMemberId, setIsSyncingMemberId] = useState(false);
  const [memberIdSyncFailed, setMemberIdSyncFailed] = useState(false);

  const referralLink = `https://gainkoin.io/register?ref=${wallet.memberId}`;

  const copyReferral = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const copyMemberId = () => {
    if (!wallet.memberId) return;
    navigator.clipboard.writeText(wallet.memberId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleMemberIdAction = async () => {
    if (wallet.memberId) {
      copyMemberId();
      return;
    }
    setIsSyncingMemberId(true);
    setMemberIdSyncFailed(false);
    try {
      await retryUserProfileSync();
    } catch (error) {
      setMemberIdSyncFailed(true);
      console.error('Member ID profile sync failed:', error);
    } finally {
      setIsSyncingMemberId(false);
    }
  };

  const isAccountActive = wallet.licenseStatus === 'active';

  return (
    <div className="space-y-4 pb-20">
      {/* Profile Card */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] shadow-xs transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-800 dark:text-slate-100 font-bold text-lg font-mono overflow-hidden">
              {currentUser?.photoURL ? (
                <img src={currentUser.photoURL} alt="User Avatar" className="w-full h-full object-cover" />
              ) : (
                wallet.username[0].toUpperCase()
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-base text-slate-900 dark:text-white font-sans">{currentUser?.displayName || wallet.username}</h3>
                <button
                  onClick={onOpenActivationModal}
                  className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold border transition cursor-pointer flex items-center gap-1 ${
                    isAccountActive
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200'
                  }`}
                  title="Klik untuk melihat status lisensi"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isAccountActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  <span>{isAccountActive ? 'LICENSE: ACTIVE' : 'LICENSE: NONE'}</span>
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">{currentUser?.email || wallet.email}</p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 font-sans block">Member ID:</span>
            <button
              onClick={handleMemberIdAction}
              title={wallet.memberId ? 'Salin Member ID' : 'Coba sinkronkan Member ID dari Firebase'}
              className="mt-0.5 font-mono text-xs font-bold text-slate-800 dark:text-slate-200 hover:text-emerald-500 dark:hover:text-emerald-400 hover:underline flex items-center gap-1"
            >
              <span>{wallet.memberId || (isSyncingMemberId ? 'Menyiapkan...' : memberIdSyncFailed ? 'Gagal, coba lagi' : 'Belum tersinkron')}</span>
              {copiedId ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-slate-400" />}
            </button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-[#1E2E44] text-xs font-mono text-center">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-sans font-medium block">Active Downline</span>
            <span className="text-slate-900 dark:text-white font-bold block mt-0.5 font-mono tabular-nums">
              {wallet.downlineCount && wallet.downlineCount > 0 ? `${wallet.downlineCount} Member` : '0 Member'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-sans font-medium block">Matrix Spillover</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold block mt-0.5 font-mono tabular-nums">
              +{formatUsdt(wallet.referralYield ?? 0)} USDT
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-sans font-medium block">Bot Performance</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold block mt-0.5 font-mono tabular-nums">
              {wallet.winRatePct && wallet.winRatePct > 0 ? `${wallet.winRatePct.toFixed(1)}% Win` : 'Siap Trading'}
            </span>
          </div>
        </div>
      </div>

      {/* Super Admin User Management Banner (Exclusive for cuanteknologi01@gmail.com) */}
      {isAdmin && onOpenAdmin && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white font-sans">Pusat Kelola Semua User (Admin Vault)</h4>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                  SUPER ADMIN
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-sans mt-0.5">
                Kelola status lisensi seluruh member (Active/Non-Active), kredit saldo kas, gas tank, dan tambah member.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenAdmin}
            className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-sans text-xs font-bold transition shadow-xs flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <span>Buka Panel Admin</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Firebase Cloud Sync & Authentication Section */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] space-y-3 shadow-xs transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900 dark:text-white font-sans">Firebase Firestore Cloud Sync</h4>
              <p className="text-[10px] text-slate-400 font-sans">
                {firebaseConnectionStatus === 'connected'
                  ? 'Terkoneksi ke Database Cloud Firestore'
                  : firebaseConnectionStatus === 'checking'
                    ? 'Memeriksa koneksi Firestore...'
                    : 'Firestore tidak terhubung. Periksa konfigurasi Firebase dan Console browser.'}
              </p>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${firebaseConnectionStatus === 'connected' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20' : firebaseConnectionStatus === 'checking' ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-500/20'}`}>
            {firebaseConnectionStatus === 'connected' ? 'ONLINE' : firebaseConnectionStatus === 'checking' ? 'CHECKING' : 'ERROR'}
          </span>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-[#1E2E44] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {currentUser ? (
              <>
                <div className="w-9 h-9 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-500/30 flex items-center justify-center text-xs font-bold text-amber-500 dark:text-[#F0B90B] overflow-hidden shrink-0">
                  {currentUser.photoURL ? (
                    <img src={currentUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span>{(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}</span>
                  )}
                </div>
                <div className="text-xs font-sans">
                  <span className="text-slate-900 dark:text-white font-semibold block leading-tight">
                    {currentUser.displayName || 'Pengguna GAIN'}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-slate-400 text-[10px] block truncate max-w-[160px] font-mono">
                      {currentUser.email}
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-sans font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-0.5">
                      <Check className="w-2.5 h-2.5" /> Gmail Verified
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-xs font-sans">
                <span className="text-slate-400 text-[10px] block">Status Otentikasi:</span>
                <span className="text-slate-600 dark:text-slate-300 font-semibold">Mode Tamu (Lokal)</span>
              </div>
            )}
          </div>

          {currentUser ? (
            <button
              onClick={() => logout()}
              className="px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition text-xs font-sans font-semibold flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              title="Keluar dari sesi akun Google"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar Akun Google</span>
            </button>
          ) : (
            <button
              onClick={openLogin}
              disabled={isLoggingIn}
              className="px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-amber-500 dark:bg-amber-400 dark:hover:bg-[#00D0AD] disabled:opacity-60 text-white dark:text-slate-950 transition text-xs font-sans font-semibold flex items-center justify-center gap-1.5 shadow-xs cursor-pointer shrink-0"
            >
              {isLoggingIn ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white dark:border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                  <span>Menghubungkan...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Masuk / Daftar</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Comprehensive Network, Referral & Member ID Section */}
      <NetworkReferralSection
        wallet={wallet}
        userId={currentUser?.uid}
        onOpenTransfer={onOpenTransfer}
        onOpenProfitShare={onOpenProfitShare}
        onOpenActivationModal={onOpenActivationModal}
      />

      {/* Theme Preference Card (Dark / Terang) */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] shadow-xs space-y-3 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-500" />}
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white tracking-wide font-sans">Tema Tampilan Aplikasi</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-sans">
                Pilih mode visual yang nyaman bagi mata Anda saat memantau bot
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-sans font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-[#F0B90B] border border-amber-500/30">
            {themePreference === 'system' ? `Mengikuti sistem (${theme === 'dark' ? 'gelap' : 'terang'})` : theme === 'dark' ? 'Mode Gelap Aktif' : 'Mode Terang Aktif'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-sans text-xs">
          <button
            onClick={() => setTheme('dark')}
            className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition cursor-pointer ${
              theme === 'dark'
                ? 'bg-slate-900 border-amber-500 text-white shadow-xs'
                : 'bg-slate-50 dark:bg-[#0A101A] border-slate-200 dark:border-[#1E2E44] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-indigo-400">
              <Moon className="w-4 h-4" />
            </div>
            <div className="text-center">
              <span className={`font-bold text-xs block ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Mode Gelap</span>
              <span className="text-[9.5px] text-slate-500 dark:text-slate-400">Latar dan permukaan gelap</span>
            </div>
          </button>

          <button
            onClick={() => setTheme('light')}
            className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition cursor-pointer ${
              theme === 'light'
                ? 'bg-amber-50/80 border-amber-500 text-teal-950 shadow-xs'
                : 'bg-slate-50 dark:bg-[#0A101A] border-slate-200 dark:border-[#1E2E44] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Sun className="w-4 h-4" />
            </div>
            <div className="text-center">
              <span className="font-bold text-xs block text-slate-900">Mode Terang</span>
              <span className="text-[9.5px] text-slate-500">Latar dan permukaan terang</span>
            </div>
          </button>

          <button
            onClick={() => setTheme('system')}
            aria-pressed={themePreference === 'system'}
            className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition cursor-pointer focus-visible:outline-offset-2 ${
              themePreference === 'system'
                ? 'bg-teal-50 border-teal-600 text-teal-950 shadow-xs dark:bg-teal-950/40 dark:border-teal-400 dark:text-teal-100'
                : 'bg-slate-50 dark:bg-[#0A101A] border-slate-200 dark:border-[#1E2E44] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-teal-700 dark:text-teal-300">
              <Monitor className="w-4 h-4" />
            </div>
            <div className="text-center">
              <span className="font-bold text-xs block">Sistem</span>
              <span className="text-[9.5px] text-slate-500 dark:text-slate-400">Ikuti preferensi perangkat</span>
            </div>
          </button>
        </div>
      </div>

      {/* Settings Navigation List */}
      <div className="space-y-2">
        {/* Multi-Exchange API Card */}
        {(() => {
          const connectedList =
            wallet.connectedExchanges && wallet.connectedExchanges.length > 0
              ? wallet.connectedExchanges
              : wallet.connectedExchange?.isConnected
              ? [wallet.connectedExchange]
              : [];
          const activeExName = wallet.connectedExchange?.exchange || currentExchange;

          return (
            <div className="p-3.5 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] space-y-3 shadow-xs transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      connectedList.length > 0
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    <Key className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-xs text-slate-900 dark:text-white font-sans">
                        Koneksi Multi-Exchange (1 Akun Google)
                      </span>
                      {connectedList.length > 0 ? (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-sans font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                          {connectedList.length} Bursa Terhubung (Aktif: {activeExName})
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-sans font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                          Belum Terhubung
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                      Dukung koneksi multi-bursa simultan: Reku, Binance, Bybit, Bitget, OKX, Tokocrypto, Indodax.
                    </p>
                  </div>
                </div>

                <button
                  onClick={onOpenApiKey}
                  className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-teal-900/50 text-amber-600 dark:text-[#F0B90B] border border-amber-500/30 text-xs font-sans font-semibold transition cursor-pointer shrink-0"
                >
                  {connectedList.length > 0 ? '+ Tambah Bursa' : 'Hubungkan'}
                </button>
              </div>

              {/* Connected list cards */}
              {connectedList.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-[#1E2E44]">
                  {connectedList.map((item) => {
                    const isItemActive = item.exchange === activeExName;
                    return (
                      <div
                        key={item.exchange}
                        className={`p-2.5 rounded-xl border text-xs font-mono flex items-center justify-between ${
                          isItemActive
                            ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-500/40'
                            : 'bg-slate-50 dark:bg-[#0A101A] border-slate-200 dark:border-[#162740]'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                isItemActive ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            />
                            <span className="font-bold text-slate-900 dark:text-white truncate">
                              {item.exchange}
                            </span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {item.isSandbox ? 'Demo' : 'Live'}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                            {formatUsdt(item.usdtBalance)} USDT • {item.apiKeyMasked}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {!isItemActive && onSelectActiveExchange && (
                            <button
                              type="button"
                              onClick={() => onSelectActiveExchange(item.exchange)}
                              className="px-2 py-1 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px] font-sans font-semibold hover:bg-amber-500/25 cursor-pointer"
                            >
                              Jadikan Aktif
                            </button>
                          )}
                          {isItemActive && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold px-1.5 font-sans">
                              ✓ Aktif
                            </span>
                          )}
                          {onDisconnectSingleExchange && (
                            <button
                              type="button"
                              onClick={() => onDisconnectSingleExchange(item.exchange)}
                              className="p-1 text-slate-400 hover:text-red-500 transition cursor-pointer"
                              title={`Putuskan API ${item.exchange}`}
                            >
                              <Unlink className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* 20% Profit Share Info */}
        <div
          onClick={onOpenProfitShare}
          className="p-3.5 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] hover:border-emerald-500/40 transition flex items-center justify-between cursor-pointer shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-xs text-slate-900 dark:text-white font-sans">Rincian Bagi Hasil 20% & Gas Pool</span>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                80% Net Trader • 20% Platform (80% Manajemen : 20% Referral Upline Cash)
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </div>

        {/* Security 2FA */}
        <div
          onClick={onOpen2faModal}
          className="p-3.5 rounded-xl bg-white dark:bg-[#101A29] border border-slate-200 dark:border-[#1E2E44] hover:border-emerald-500/40 transition flex items-center justify-between cursor-pointer group shadow-xs"
        >
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition ${
              wallet.twoFactorEnabled === true
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
            }`}>
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-slate-900 dark:text-white font-sans">
                  Google 2FA Authenticator
                </span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] font-sans font-semibold border ${
                  wallet.twoFactorEnabled === true
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                }`}>
                  {wallet.twoFactorEnabled === true ? 'Aktif' : 'Non-Aktif'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-sans mt-0.5">
                2FA dipakai untuk tindakan finansial berisiko tinggi seperti trading live, withdrawal, dan transfer sesuai kebijakan keamanan server
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs font-sans font-semibold text-amber-500 dark:text-[#F0B90B] opacity-0 group-hover:opacity-100 transition">
              Kelola 2FA
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition" />
          </div>
        </div>
      </div>
    </div>
  );
}
