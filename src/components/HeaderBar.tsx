import { useState, useRef, useEffect } from 'react';
import { ExchangeName } from '../types';
import {
  ChevronDown,
  ShieldCheck,
  Check,
  Database,
  LogIn,
  LogOut,
  Sun,
  Moon,
  Key,
  Unlink,
  Sparkles,
  User as UserIcon,
  Bell,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { APP_LANGUAGES, useLanguage } from '../context/LanguageContext';
import { GainLogo } from './common/GainLogo';
import { formatUsdt } from '../utils/formatters';
import { NotificationCenter } from './NotificationCenter';
import { APP_VERSION } from '../config/appVersion';
import { getExchangeNames } from '../config/exchangeRegistry';
import type { OperationalBotSnapshot } from '../utils/operationalNotifications';

interface HeaderBarProps {
  currentExchange: ExchangeName;
  onSelectExchange: (exchange: ExchangeName) => void;
  connectedExchange?: import('../types').ConnectedExchangeConfig;
  connectedExchanges?: import('../types').ConnectedExchangeConfig[];
  twoFactorEnabled?: boolean;
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  onOpenProfitShare?: () => void;
  onOpenApiKey?: () => void;
  onDisconnectApi?: () => void;
  onOpen2faModal?: () => void;
  onOpenAdmin?: () => void;
  onOpenPriceAlert?: () => void;
  activeAlertsCount?: number;
  operationalBots?: OperationalBotSnapshot[];
  onOpenTrading?: () => void;
}

export function HeaderBar({
  currentExchange,
  onSelectExchange,
  connectedExchange,
  connectedExchanges,
  twoFactorEnabled = true,
  title,
  subtitle,
  showBack,
  onBack,
  onOpenProfitShare,
  onOpenApiKey,
  onDisconnectApi,
  onOpen2faModal,
  onOpenAdmin,
  onOpenPriceAlert,
  activeAlertsCount,
  operationalBots = [],
  onOpenTrading,
}: HeaderBarProps) {
  const [exchangeDropdownOpen, setExchangeDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const {
    currentUser,
    loginWithGoogle,
    logout,
    firebaseConnectionStatus,
    isLoggingIn,
    isAdmin,
    openLogin,
  } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const exchanges: ExchangeName[] = getExchangeNames();

  const userMenuRef = useRef<HTMLDivElement>(null);
  const exchangeMenuRef = useRef<HTMLDivElement>(null);

  const activeConnectedList =
    connectedExchanges && connectedExchanges.length > 0
      ? connectedExchanges
      : connectedExchange?.isConnected
      ? [connectedExchange]
      : [];
  const connectedMap = new Map(activeConnectedList.map((c) => [c.exchange, c]));

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
      if (exchangeMenuRef.current && !exchangeMenuRef.current.contains(event.target as Node)) {
        setExchangeDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
    <header className="px-2.5 sm:px-6 py-2.5 sm:py-3 border-b border-slate-200 dark:border-[#1A2638] bg-white/95 dark:bg-[#0B0F17]/95 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between transition-colors">
      {/* Left: Brand or Back */}
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
        {showBack ? (
          <button
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#111C2E] border border-slate-200 dark:border-[#1E2E44] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-amber-400 transition-colors shrink-0"
            title="Kembali"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M15 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" />
            </svg>
          </button>
        ) : (
          <GainLogo size="sm" />
        )}

        <div className="truncate">
          {title ? (
            <div className="truncate">
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white tracking-tight truncate">{title}</h2>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] text-[8px] sm:text-[9px] font-bold text-slate-500 dark:text-slate-400 font-mono shrink-0">v{APP_VERSION}</span>
              </div>
              {subtitle && <p className="text-[9.5px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-sans truncate">{subtitle}</p>}
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold tracking-tight text-sm sm:text-base text-slate-900 dark:text-white font-sans">GAIN</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
              </div>
              <div className="flex items-center gap-1.5">
                <p className="text-[9px] sm:text-[10px] tracking-wide text-slate-500 dark:text-slate-400 font-mono font-medium hidden xs:block sm:block">
                  Niaga Koin • Algorithmic Vault
                </p>
                <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] text-[8px] sm:text-[9px] font-bold text-slate-500 dark:text-slate-400 font-mono">v{APP_VERSION}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: Exchange Selector & Firebase Cloud Sync & Vault */}
      <div className="flex items-center gap-1 sm:gap-2 relative shrink-0">
        {/* Firebase Cloud Sync Badge */}
        <div
          title={firebaseConnectionStatus === 'connected'
            ? 'Firebase Firestore Cloud Database Connected'
            : firebaseConnectionStatus === 'checking'
              ? 'Checking Firestore connection...'
              : 'Firestore connection failed. Check Firebase configuration and browser console.'}
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-[#101A29] border border-slate-200 dark:border-[#1A283D] text-[10.5px] text-slate-600 dark:text-slate-300"
        >
          <Database className={`w-3 h-3 ${firebaseConnectionStatus === 'connected' ? 'text-sky-500 dark:text-sky-400' : firebaseConnectionStatus === 'checking' ? 'text-slate-400 animate-spin' : 'text-rose-500'}`} />
          <span className="hidden md:inline font-medium">Firestore</span>
          <span className={`w-1.5 h-1.5 rounded-full ${firebaseConnectionStatus === 'connected' ? 'bg-emerald-500' : firebaseConnectionStatus === 'checking' ? 'bg-slate-400' : 'bg-rose-500'}`}></span>
        </div>

        {/* User Account / Google Sign In */}
        {currentUser ? (
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              title={`Logged in as ${currentUser.displayName || currentUser.email}`}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200 overflow-hidden hover:ring-2 hover:ring-slate-400/40 transition cursor-pointer"
            >
              {currentUser.photoURL ? (
                <img src={currentUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span>{(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}</span>
              )}
            </button>

            {/* User Dropdown Menu */}
            {userMenuOpen && (
              <>
                {/* Backdrop on mobile to prevent accidental touches and allow easy tap-out */}
                <div
                  className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-40 sm:hidden animate-fadeIn"
                  onClick={() => setUserMenuOpen(false)}
                />

                <div className="fixed inset-x-3 top-14 max-w-sm mx-auto sm:max-w-none sm:mx-0 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-72 bg-white dark:bg-[#09111E] border border-slate-200 dark:border-[#162942] rounded-2xl shadow-2xl p-3.5 z-50 overflow-hidden font-mono text-xs animate-in fade-in-50 zoom-in-95 text-slate-900 dark:text-white">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-slate-200 dark:border-[#142236]">
                    <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0 overflow-hidden">
                      {currentUser.photoURL ? (
                        <img src={currentUser.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span>{(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}</span>
                      )}
                    </div>
                    <div className="overflow-hidden min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white text-xs truncate">
                        {currentUser.displayName || 'Pengguna GAIN'}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{currentUser.email}</p>
                    </div>
                  </div>

                  {/* Account Status */}
                  <div className="py-2.5 space-y-1.5 text-[10.5px]">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Google Auth:</span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3 text-slate-500 dark:text-slate-400" /> Terhubung
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Gmail Verified:</span>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3 text-slate-500 dark:text-slate-400" /> Terverifikasi
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Google 2FA:</span>
                      <span className={`font-semibold flex items-center gap-1 ${
                        twoFactorEnabled
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}>
                        <ShieldCheck className="w-3 h-3" />
                        {twoFactorEnabled ? 'Aktif' : 'Non-Aktif'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                      <span>Sesi Keamanan:</span>
                      <span className="text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1 font-mono text-[10px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500"></span>
                        Verifikasi on-demand • 24 jam
                      </span>
                    </div>

                    {connectedExchange?.isConnected ? (
                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-[#0E1B2E] border border-slate-200 dark:border-[#182F4D] space-y-1.5 mt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 dark:text-slate-400">API Exchange:</span>
                          <span className="text-slate-900 dark:text-white font-bold">
                            {connectedExchange.exchange} {connectedExchange.isSandbox ? '(Testnet)' : ''}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span>Saldo Kas:</span>
                          <span className="text-slate-900 dark:text-white font-semibold font-mono">
                            {formatUsdt(connectedExchange.usdtBalance)} USDT
                          </span>
                        </div>
                        {onDisconnectApi && (
                          <button
                            type="button"
                            onClick={() => {
                              setUserMenuOpen(false);
                              onDisconnectApi();
                            }}
                            className="w-full mt-1 px-2 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-rose-600 dark:text-red-400 border border-rose-200 dark:border-red-500/20 transition flex items-center justify-center gap-1.5 font-sans text-[11px] font-semibold cursor-pointer"
                          >
                            <Unlink className="w-3 h-3" />
                            <span>Putuskan API {connectedExchange.exchange}</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 pt-1">
                        <span>API Exchange:</span>
                        <span className="text-amber-600 dark:text-amber-400 font-medium">Belum Terhubung</span>
                      </div>
                    )}
                  </div>

                  {/* Admin Vault Action in Dropdown */}
                  {isAdmin && onOpenAdmin && (
                    <div className="pt-1 pb-1 border-t border-slate-200 dark:border-[#142236]">
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          onOpenAdmin();
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition flex items-center justify-center gap-2 font-mono text-xs font-bold cursor-pointer"
                      >
                        <ShieldCheck className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                        <span>{t('admin')}: {language === 'id' ? 'Kelola Semua User' : 'Manage All Users'}</span>
                      </button>
                    </div>
                  )}

                  {/* Google Log Out Action */}
                  <div className="pt-2 border-t border-slate-200 dark:border-[#142236]">
                    <button
                      type="button"
                      onClick={async () => {
                        setUserMenuOpen(false);
                        await logout();
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-red-500/15 dark:hover:bg-red-500/25 text-rose-600 dark:text-red-400 border border-rose-200 dark:border-red-500/30 transition flex items-center justify-center gap-2 font-sans text-xs font-bold cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Keluar dari Akun Google</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={openLogin}
            disabled={isLoggingIn}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-sans font-semibold transition cursor-pointer shadow-sm disabled:opacity-60"
            title="Masuk atau Daftar Akun Baru"
          >
            {isLoggingIn ? (
              <>
                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span className="hidden sm:inline">Menghubungkan...</span>
              </>
            ) : (
              <>
                <LogIn className="w-3.5 h-3.5" />
                <span>Masuk / Daftar</span>
              </>
            )}
          </button>
        )}

        {/* Top-level Admin Vault quick button */}
        {currentUser && isAdmin && onOpenAdmin && (
          <button
            onClick={onOpenAdmin}
            className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-500/15 border border-purple-500/40 text-purple-600 dark:text-purple-400 text-xs font-mono font-bold hover:bg-purple-500/25 transition cursor-pointer shadow-xs"
            title="Pusat Manajemen Semua User"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400" />
            <span>{t('admin')}</span>
          </button>
        )}

        <div className="relative" ref={exchangeMenuRef}>
          <button
            type="button"
            onClick={() => setExchangeDropdownOpen(!exchangeDropdownOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 dark:border-[#1E2E44] bg-slate-100 dark:bg-[#111C2E] text-slate-800 dark:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600 text-xs font-semibold transition-all cursor-pointer shadow-xs"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                connectedMap.has(currentExchange)
                  ? 'bg-emerald-500 shadow-xs'
                  : 'bg-slate-400'
              }`}
            ></span>
            <span className="truncate">
              {currentExchange}
              <span className="hidden sm:inline text-slate-500 dark:text-slate-400 font-normal">
                {connectedMap.get(currentExchange)
                  ? connectedMap.get(currentExchange)?.isSandbox
                    ? ' (Testnet)'
                    : ' (Live)'
                  : ''}
              </span>
            </span>
            {activeConnectedList.length > 1 && (
              <span className="hidden xs:inline-block px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/30">
                {activeConnectedList.length} Exchanger
              </span>
            )}
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 shrink-0 ${exchangeDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Exchange Dropdown Menu */}
          {exchangeDropdownOpen && (
            <>
              {/* Backdrop on mobile */}
              <div
                className="fixed inset-0 bg-slate-950/40 backdrop-blur-xs z-40 sm:hidden animate-fadeIn"
                onClick={() => setExchangeDropdownOpen(false)}
              />

              <div className="fixed inset-x-4 top-14 max-w-xs mx-auto sm:max-w-none sm:mx-0 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-60 bg-white dark:bg-[#09111E] border border-slate-200 dark:border-[#162942] rounded-2xl shadow-2xl p-1.5 z-50 overflow-hidden font-sans text-xs animate-in fade-in-50 zoom-in-95">
                <div className="px-2.5 py-1.5 text-[10px] text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-[#142236] uppercase tracking-wider font-semibold flex items-center justify-between">
                  <span>Pilih Exchange Aktif</span>
                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-mono">
                    {activeConnectedList.length} Terhubung
                  </span>
                </div>
                {exchanges.map((ex) => {
                  const conn = connectedMap.get(ex);
                  const isCurrent = currentExchange === ex;
                  return (
                    <button
                      key={ex}
                      onClick={() => {
                        onSelectExchange(ex);
                        setExchangeDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#111F33] hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            conn ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                        <span className="truncate">{ex}</span>
                        {conn && (
                          <span className="text-[9.5px] text-slate-500 dark:text-slate-400 font-mono">
                            {formatUsdt(conn.usdtBalance)} USDT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {conn && (
                          <span
                            className={`px-1 py-0.2 rounded text-[8.5px] font-mono border ${
                              conn.isSandbox
                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                            }`}
                          >
                            {conn.isSandbox ? 'Testnet' : 'Live'}
                          </span>
                        )}
                        {isCurrent && <Check className="w-3.5 h-3.5 text-slate-700 dark:text-slate-300" />}
                      </div>
                    </button>
                  );
                })}

              {/* Exchange Quick Actions: Open API Modal or Disconnect API */}
              <div className="pt-1 mt-1 border-t border-slate-100 dark:border-[#142236] space-y-1">
                {onOpenApiKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setExchangeDropdownOpen(false);
                      onOpenApiKey();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-amber-600 dark:text-[#F0B90B] hover:bg-amber-50 dark:hover:bg-amber-500/10 text-[11px] font-semibold transition text-left cursor-pointer"
                  >
                    <Key className="w-3.5 h-3.5" />
                    <span>+ Hubungkan Exchanger Baru...</span>
                  </button>
                )}

                {connectedExchange?.isConnected && onDisconnectApi && (
                  <button
                    type="button"
                    onClick={() => {
                      setExchangeDropdownOpen(false);
                      onDisconnectApi();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-[11px] transition text-left cursor-pointer"
                  >
                    <Unlink className="w-3.5 h-3.5 text-rose-500" />
                    <span>Putuskan API {connectedExchange.exchange}</span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
        </div>

        {/* Transparency 80:20 & Non-Ponzi Badge */}
        <button
          onClick={onOpenProfitShare}
          className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 text-[11px] font-mono transition cursor-pointer"
          title="Transparansi Bagi Hasil 80:20 (Bukan Ponzi / No Fixed ROI)"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-semibold">Bagi Hasil 80:20 • Pure Profit Sharing</span>
        </button>

        {/* Operational Notification Center */}
        {currentUser && (
          <NotificationCenter
            bots={operationalBots}
            activePriceAlertsCount={activeAlertsCount}
            onOpenTrading={onOpenTrading}
          />
        )}

        {/* Price Alert Bell */}
        {onOpenPriceAlert && (
          <button
            onClick={onOpenPriceAlert}
            className="relative w-9 h-9 rounded-full bg-slate-100 dark:bg-[#111C2E] border border-slate-200 dark:border-[#1E2E44] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-amber-500 hover:border-amber-400/40 transition cursor-pointer"
            title="Price Alert & Notifikasi Target Harga Koin"
            aria-label="Price Alert"
          >
            <Bell className="w-4 h-4 text-amber-500" />
            {activeAlertsCount && activeAlertsCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-amber-500 text-slate-950 font-bold text-[9.5px] flex items-center justify-center leading-none shadow-xs font-mono">
                {activeAlertsCount}
              </span>
            ) : null}
          </button>
        )}

        {/* Security / Settlement Vault Info */}
        <button
          onClick={onOpenProfitShare}
          className="w-9 h-9 rounded-full bg-slate-100 dark:bg-[#111C2E] border border-slate-200 dark:border-[#1E2E44] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400 hover:border-emerald-400/40 transition cursor-pointer"
          title="Transparansi Sistem Bagi Hasil 80:20 & Legal Kepatuhan"
        >
          <ShieldCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
        </button>

        {/* Global Language Selector: Indonesian + five major world-language options */}
        <label className="hidden sm:flex items-center gap-1.5 h-9 px-2 rounded-full bg-slate-100 dark:bg-[#111C2E] border border-slate-200 dark:border-[#1E2E44] text-[10px] text-slate-600 dark:text-slate-300">
          <span className="text-xs">{APP_LANGUAGES.find((item) => item.id === language)?.flag || '🌐'}</span>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as typeof language)}
            className="bg-transparent outline-none font-semibold cursor-pointer max-w-[88px]"
            aria-label={t('language')}
          >
            {APP_LANGUAGES.map((item) => (
              <option key={item.id} value={item.id}>{item.nativeLabel}</option>
            ))}
          </select>
        </label>

        {/* Theme Mode Toggle (Dark / Terang) */}
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-full bg-slate-100 dark:bg-[#111C2E] border border-slate-200 dark:border-[#1E2E44] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-amber-500 hover:border-amber-400/40 transition cursor-pointer"
          title={theme === 'dark' ? 'Ganti ke Mode Terang' : 'Ganti ke Mode Gelap'}
          aria-label="Toggle dark and light mode"
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400 hover:rotate-45 transition-transform" />
          ) : (
            <Moon className="w-4 h-4 text-indigo-600 hover:-rotate-12 transition-transform" />
          )}
        </button>
      </div>
    </header>
    </>
  );
}
