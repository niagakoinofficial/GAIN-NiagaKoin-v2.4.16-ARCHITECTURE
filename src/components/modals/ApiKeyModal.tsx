import { useState } from 'react';
import {
  X,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Lock,
  ExternalLink,
  RefreshCw,
  Zap,
  Check,
  Copy,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Unlink,
  Sparkles,
  BookOpen,
  ArrowUpRight,
  Info,
  Layers,
  FlaskConical,
} from 'lucide-react';
import { ExchangeName } from '../../types';
import { getExchangeDescriptor, getExchangeNames } from '../../config/exchangeRegistry';
import { verifyExchangeConnection, certifyExchangeApi } from '../../services/exchangeService';
import { getExchangeCredentialHistory } from '../../api/botApi';
import ExchangeCertificationPanel from '../common/ExchangeCertificationPanel';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentExchange: ExchangeName;
  connectedExchange?: import('../../types').ConnectedExchangeConfig;
  connectedExchanges?: import('../../types').ConnectedExchangeConfig[];
  isAccountActive?: boolean;
  onOpenActivationModal?: () => void;
  onSelectActiveExchange?: (exchange: ExchangeName) => void;
  onDisconnectApi?: ((exchange?: ExchangeName) => void) | (() => void);
  onConnectSuccess?: (
    exchange: ExchangeName,
    balance: number,
    isSandbox: boolean,
    apiKey: string,
    secret?: string,
    passphrase?: string,
    portfolioAssets?: Array<{
      coin: string;
      pair: string;
      total: number;
      price: number;
      change24h: number;
      valueUsdt: number;
    }>,
    totalPortfolioUsdt?: number
  ) => void | Promise<void>;
}

interface TestnetGuideInfo {
  exchange: ExchangeName;
  portalUrl: string;
  portalName: string;
  badge: string;
  hasOfficialTestnet: boolean;
  instructions: string[];
  faucetInfo: string;
  recommendationNote?: string;
}

const TESTNET_GUIDES: Record<string, TestnetGuideInfo> = {
  Binance: {
    exchange: 'Binance',
    portalUrl: 'https://testnet.binance.vision',
    portalName: 'Binance Spot Test Network',
    badge: 'Spot Testnet Resmi (Sangat Direkomendasikan)',
    hasOfficialTestnet: true,
    instructions: [
      'Buka portal resmi Binance Spot Testnet (testnet.binance.vision).',
      'Klik tombol "Log In with GitHub" untuk login instan tanpa perlu verifikasi KTP/KYC.',
      'Klik tombol "Generate HMAC_SHA256 Key" dan beri label (contoh: GAIN-Spot-Bot).',
      'Salin API Key dan Secret Key yang tampil ke dalam form di bawah.',
      'Gunakan saldo Testnet yang diterbitkan oleh portal resmi exchange; GAIN tidak membuat saldo atau akun simulasi sendiri.',
    ],
    faucetInfo: 'Faucet otomatis terisi 1,000 USDT saat generate key, siap langsung diuji.',
  },
  Bybit: {
    exchange: 'Bybit',
    portalUrl: 'https://testnet.bybit.com',
    portalName: 'Bybit Testnet Unified Trading Portal',
    badge: 'API V5 Modern & Faucet Mandiri',
    hasOfficialTestnet: true,
    instructions: [
      'Akses portal khusus Bybit Testnet di testnet.bybit.com dan buat akun baru (terpisah dari mainnet).',
      'Masuk ke menu Profil -> "API Management" -> Klik tombol "Create New Key".',
      'Pilih tipe "System-generated API Keys", centang izin "Read-Write" dan "Spot Trading".',
      'Pastikan opsi "Withdrawal" TIDAK dicentang demi keamanan.',
      'Salin API Key dan API Secret ke form GAIN, lalu klaim saldo simulasi gratis pada menu Assets Bybit Testnet.',
    ],
    faucetInfo: 'Dapat mengklaim saldo dummy USDT berkala di menu Assets -> Claim Test Coins.',
  },
  Bitget: {
    exchange: 'Bitget',
    portalUrl: 'https://www.bitget.com',
    portalName: 'Bitget Testnet / Sandbox Trading',
    badge: 'Testnet / Sandbox dengan Passphrase',
    hasOfficialTestnet: true,
    instructions: [
      'Login ke akun Bitget Anda di bitget.com.',
      'Arahkan ke ikon Profil -> pilih menu "API Management" -> "Create API Key".',
      'Wajib membuat "Passphrase API" (ingat kata sandi ini karena dibutuhkan untuk verifikasi di GAIN).',
      'Centang izin "Read-Write" dan "Spot Trading".',
      'Pilih Testnet di GAIN agar request diarahkan ke endpoint Testnet/Sandbox exchange.',
    ],
    faucetInfo: 'Gunakan lingkungan Testnet/Sandbox resmi exchange; GAIN hanya meneruskan order dan membaca hasilnya.',
  },
  OKX: {
    exchange: 'OKX',
    portalUrl: 'https://www.okx.com',
    portalName: 'OKX Testnet / Sandbox Trading',
    badge: 'Sandbox Header V5',
    hasOfficialTestnet: true,
    instructions: [
      'Login ke portal OKX di okx.com, klik avatar profil dan aktifkan "Demo Trading" (Simulated Trading).',
      'Buka menu API Keys -> pilih "Create V5 API Key".',
      'Tentukan Passphrase API khusus untuk koneksi bot.',
      'Beri izin hak akses "Read" dan "Trade" (Spot).',
      'GAIN secara otomatis menyematkan header "x-simulated-trading: 1" untuk mengeksekusi order demo tanpa risiko.',
    ],
    faucetInfo: 'OKX menyediakan saldo demo ratusan ribu USDT di dashboard Simulated Trading.',
  },
  Tokocrypto: {
    exchange: 'Tokocrypto',
    portalUrl: 'https://www.tokocrypto.com',
    portalName: 'Tokocrypto API',
    badge: 'Read-only first • Native API',
    hasOfficialTestnet: false,
    instructions: [
      'Mulai dengan public market-data dan authenticated read-only API Tokocrypto.',
      'Gunakan credential Tokocrypto sendiri; jangan pernah menggunakan credential Binance untuk akun Tokocrypto.',
      'Jika nanti mengaktifkan trading, permission harus minimum dan withdrawal harus OFF.',
      'Live order certification dilakukan terpisah setelah read-only certification PASS.',
    ],
    faucetInfo: 'Tidak diasumsikan ada public testnet untuk Tokocrypto; gunakan read-only dahulu.',
    recommendationNote: 'GAIN tidak menyamakan Tokocrypto dengan Binance Testnet; adapter dan credential tetap spesifik exchange.',
  },
  Indodax: {
    exchange: 'Indodax',
    portalUrl: 'https://testnet.bybit.com',
    portalName: 'Rekomendasi Alternatif: Bybit/Binance Testnet',
    badge: 'Tidak Menyediakan Public Testnet',
    hasOfficialTestnet: false,
    instructions: [
      'Bursa Indodax saat ini TIDAK menyediakan portal public testnet resmi untuk pengembang.',
      'Untuk pengujian bot otomatis spot tanpa risiko, sangat disarankan menggunakan Testnet Binance atau Bybit.',
      'Jika ingin langsung menggunakan Indodax, gunakan "Mode Live" dengan batas modal awal kecil (small order).',
    ],
    faucetInfo: 'Indodax tidak memiliki faucet demo.',
    recommendationNote: 'Gunakan Binance Testnet atau Bybit Testnet untuk menguji algoritma averaging & grid, kemudian beralih ke Indodax Mainnet.',
  },
  Reku: {
    exchange: 'Reku',
    portalUrl: 'https://reku.id',
    portalName: 'Reku Public Market API',
    badge: 'Read-only API Certification',
    hasOfficialTestnet: false,
    instructions: [
      'GAIN dapat menguji endpoint market-data publik Reku tanpa API Key.',
      'Certification membaca price feed publik dan menampilkan status/latency.',
      'Belum ada adapter authenticated order yang diaktifkan oleh GAIN; tidak ada order yang dikirim.',
    ],
    faucetInfo: 'Tidak ada sandbox order pada jalur ini; gunakan Binance/OKX/Bybit/Bitget Demo untuk order testing.',
    recommendationNote: 'Reku saat ini masuk READ_ONLY sampai kontrak authenticated trading API diverifikasi.',
  },
  Bittime: {
    exchange: 'Bittime',
    portalUrl: 'https://bittime.com',
    portalName: 'Bittime API',
    badge: 'Read-only first • Native API',
    hasOfficialTestnet: false,
    instructions: [
      'Gunakan API publik Bittime untuk connectivity, server time, dan exchangeInfo terlebih dahulu.',
      'Untuk account/order testing, buat API key Bittime dengan permission minimum yang diperlukan.',
      'Jangan berikan permission withdrawal kepada GAIN.',
      'Production order certification baru dilakukan setelah read-only certification PASS dan gate live-micro-order disetujui.',
    ],
    faucetInfo: 'Bittime tidak diasumsikan memiliki public testnet; gunakan read-only terlebih dahulu.',
    recommendationNote: 'Dokumentasi Bittime menyediakan ping, server time, exchangeInfo, order, query, dan cancel; GAIN memisahkan read-only certification dari live order certification.',
  },
  'Pintu Pro': {
    exchange: 'Pintu Pro',
    portalUrl: 'https://pintu.co.id/pro',
    portalName: 'Pintu Pro',
    badge: 'Native API Contract Pending Verification',
    hasOfficialTestnet: false,
    instructions: [
      'Pintu Pro saat ini hanya ditampilkan sebagai entry registry/certification target.',
      'GAIN tidak meminta credential dan tidak mengarang endpoint API tanpa kontrak native yang terverifikasi.',
      'UAT/production API baru dapat diaktifkan setelah dokumentasi endpoint resmi tersedia dan diuji.',
    ],
    faucetInfo: 'Tidak ada order test yang dijalankan pada status BLOCKED_PENDING_NATIVE_API.',
    recommendationNote: 'Status sengaja BLOCKED sampai kontrak API native dapat diverifikasi.',
  },
  Coinbase: {
    exchange: 'Coinbase',
    portalUrl: 'https://www.coinbase.com',
    portalName: 'Coinbase Advanced Trade API',
    badge: 'Read-only certification first',
    hasOfficialTestnet: false,
    instructions: [
      'Gunakan API credential sesuai produk Advanced Trade yang diaktifkan pada akun.',
      'Mulai dengan market/account read-only certification.',
      'Jangan berikan withdrawal permission.',
      'Order certification production membutuhkan explicit live micro-order gate.',
    ],
    faucetInfo: 'Sandbox coverage berbeda menurut API product; GAIN menjaga Coinbase dalam READ_ONLY sampai order sandbox yang tepat diverifikasi.',
  },
  Kraken: {
    exchange: 'Kraken',
    portalUrl: 'https://www.kraken.com',
    portalName: 'Kraken API',
    badge: 'Read-only certification first',
    hasOfficialTestnet: false,
    instructions: [
      'Buat API key Kraken dengan permission minimum yang diperlukan untuk data/account.',
      'Mulai dari read-only certification.',
      'Jangan berikan permission withdrawal kepada GAIN.',
      'Live order certification membutuhkan explicit micro-order approval.',
    ],
    faucetInfo: 'Tidak diasumsikan tersedia public testnet untuk spot order; read-only menjadi tahap awal.',
  },
  Triv: {
    exchange: 'Triv',
    portalUrl: 'https://triv.co.id',
    portalName: 'TRIV API Certification',
    badge: 'Native API Verification Required',
    hasOfficialTestnet: false,
    instructions: [
      'GAIN memverifikasi apakah kontrak API publik/authenticated tersedia sebelum mengaktifkan adapter.',
      'Halaman market publik TRIV tidak dianggap sebagai API trading yang terverifikasi.',
      'Tidak ada credential yang disimpan dan tidak ada order yang dikirim sampai API resmi terdokumentasi.',
    ],
    faucetInfo: 'Order certification TRIV diblokir sampai native API resmi dapat diverifikasi.',
    recommendationNote: 'Status saat ini BLOCKED_PENDING_NATIVE_API — GAIN sengaja tidak mengarang endpoint.',
  },
};

const ALL_EXCHANGES: ExchangeName[] = getExchangeNames();

export function ApiKeyModal({
  isOpen,
  onClose,
  currentExchange: initialExchange,
  connectedExchange,
  onDisconnectApi,
  onConnectSuccess,
}: ApiKeyModalProps) {
  const [exchange, setExchange] = useState<ExchangeName>(initialExchange || 'Binance');
  // Mode switcher: 'live' or 'testnet'
  const [connectionMode, setConnectionMode] = useState<'live' | 'testnet'>(
    connectedExchange?.isSandbox ? 'testnet' : 'testnet'
  );
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);

  // Guide accordion state
  const [isGuideOpen, setIsGuideOpen] = useState(true);
  const [selectedGuideEx, setSelectedGuideEx] = useState<ExchangeName>(initialExchange || 'Binance');

  const [isLoading, setIsLoading] = useState(false);
  const [isApplyingConnection, setIsApplyingConnection] = useState(false);
  const [credentialHistory, setCredentialHistory] = useState<Array<{ action: string; new_version?: number; previous_version?: number; created_at?: string; sandbox?: boolean }>>([]);
  const [connectionPopup, setConnectionPopup] = useState<{
    success: boolean;
    title: string;
    message: string;
  } | null>(null);
  const [loadingStep, setLoadingStep] = useState('Memverifikasi Signature...');
  const [showSpeedTip, setShowSpeedTip] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    usdtAvailable?: number;
    totalPortfolioUsdt?: number;
    portfolioAssets?: Array<{
      coin: string;
      pair: string;
      total: number;
      price: number;
      change24h: number;
      valueUsdt: number;
    }>;
    error?: string;
  } | null>(null);

  const [copiedIp, setCopiedIp] = useState(false);

  if (!isOpen) return null;

  const isSandbox = connectionMode === 'testnet';
  const exchangeDescriptor = getExchangeDescriptor(exchange);
  const isPublicOnly = Boolean(exchangeDescriptor?.publicOnly);
  const certificationBlocked = exchangeDescriptor?.certificationMode === 'BLOCKED_PENDING_NATIVE_API';
  const requiresPassphrase = exchangeDescriptor?.requiresPassphrase ?? (exchange === 'Bitget' || exchange === 'OKX');
  const currentGuide = TESTNET_GUIDES[selectedGuideEx] || TESTNET_GUIDES.Binance;

  const handleCopyIp = () => {
    navigator.clipboard.writeText('142.250.180.14, 172.217.16.206');
    setCopiedIp(true);
    setTimeout(() => setCopiedIp(false), 2000);
  };



  const handleDisconnect = () => {
    if (onDisconnectApi) {
      onDisconnectApi();
      setDisconnectConfirm(false);
      setApiKey('');
      setApiSecret('');
      setPassphrase('');
      setTestResult({
        success: true,
        message: 'Koneksi API berhasil diputuskan. Kredensial telah dihapus dari sistem.',
      });
    }
  };

  const handleTestConnection = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const cleanApiKey = apiKey.trim().replace(/[\u200B-\u200D\uFEFF\r\n\t]/g, '');
    const cleanSecret = apiSecret.trim().replace(/[\u200B-\u200D\uFEFF\r\n\t]/g, '');
    const cleanPassphrase = passphrase.trim().replace(/[\u200B-\u200D\uFEFF\r\n\t]/g, '');

    if (isPublicOnly) {
      setIsLoading(true);
      setLoadingStep(`Menjalankan certification API publik ${exchange}...`);
      setTestResult(null);
      setConnectionPopup(null);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      try {
        const data = await certifyExchangeApi(exchange.toLowerCase(), controller.signal);
        setTestResult({
          success: Boolean(data.success),
          message: data.success ? `${exchange} public API certification PASS` : `${exchange} certification BLOCKED`,
          latencyMs: data.latencyMs,
          usdtAvailable: data.sample && data.sample.quoteCurrency === 'USDT' ? undefined : undefined,
          totalPortfolioUsdt: undefined,
          error: data.success ? data.note : data.note || 'Native API belum terverifikasi.',
        });
        setConnectionPopup({
          success: Boolean(data.success),
          title: data.success ? `Certification ${exchange} PASS` : `Certification ${exchange} BLOCKED`,
          message: data.note || (data.success ? 'Read-only certification berhasil.' : 'Native API belum terverifikasi.'),
        });
      } catch (err: any) {
        const message = err?.name === 'AbortError' ? 'Certification timeout.' : String(err?.message || 'Gagal menjalankan certification.');
        setTestResult({ success: false, message: 'Certification gagal', error: message });
      } finally {
        clearTimeout(timeoutId);
        setIsLoading(false);
      }
      return;
    }

    if (!cleanApiKey || !cleanSecret) {
      const message = 'Lengkapi API Key dan Secret Key terlebih dahulu.';
      setTestResult({
        success: false,
        message,
        error: 'API Key dan Secret Key tidak boleh kosong.',
      });
      setConnectionPopup({ success: false, title: 'Koneksi API gagal', message });
      return;
    }

    if (requiresPassphrase && !cleanPassphrase) {
      const message = `Exchange ${exchange} memerlukan Passphrase API.`;
      setTestResult({
        success: false,
        message,
        error: 'Passphrase wajib diisi untuk Bitget dan OKX.',
      });
      setConnectionPopup({ success: false, title: 'Koneksi API gagal', message });
      return;
    }

    setIsLoading(true);
    setLoadingStep(
      isSandbox
        ? 'Menghubungkan ke Testnet/Sandbox Environment...'
        : 'Mengirim Signature HMAC-SHA256 ke Mainnet...'
    );
    setTestResult(null);
    setConnectionPopup(null);

    const stepTimer1 = setTimeout(() => {
      setLoadingStep('Bursa Memvalidasi Signature & Hak Akses Spot...');
    }, 1200);

    const stepTimer2 = setTimeout(() => {
      setLoadingStep('Membaca Saldo & Valuasi Portofolio Multi-Aset...');
    }, 2800);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 18000);

    try {
      const data = await verifyExchangeConnection({
          exchange: exchange.toLowerCase(),
          apiKey: cleanApiKey,
          secret: cleanSecret,
          password: cleanPassphrase || undefined,
          isSandbox,
        }, controller.signal);

      clearTimeout(timeoutId);

      if (data.success) {
        setTestResult({
          success: true,
          message: data.message,
          latencyMs: data.latencyMs,
          usdtAvailable: data.usdtAvailable,
          totalPortfolioUsdt: data.totalPortfolioUsdt,
          portfolioAssets: data.portfolioAssets,
        });
      } else {
        const message = data.error || 'Gagal terhubung ke exchange.';
        setTestResult({
          success: false,
          message: 'Koneksi API Gagal Terverifikasi',
          error: message,
          latencyMs: data.latencyMs,
        });
        setConnectionPopup({
          success: false,
          title: `Koneksi ${isSandbox ? 'Demo' : 'Live'} gagal`,
          message,
        });
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        const message = 'Bursa tidak merespons dalam 18 detik. Periksa mode Demo/Live dan koneksi internet.';
        setTestResult({
          success: false,
          message: 'Waktu Verifikasi Timeout (18 detik)',
          error: message,
        });
        setConnectionPopup({
          success: false,
          title: `Koneksi ${isSandbox ? 'Demo' : 'Live'} gagal`,
          message,
        });
      } else {
        const message = err.message || 'Network error.';
        setTestResult({
          success: false,
          message: 'Gagal menghubungi server proxy GAIN.',
          error: message,
        });
        setConnectionPopup({
          success: false,
          title: `Koneksi ${isSandbox ? 'Demo' : 'Live'} gagal`,
          message,
        });
      }
    } finally {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const loadCredentialHistory = async () => {
    try {
      const result = await getExchangeCredentialHistory(exchange.toLowerCase());
      if (Array.isArray(result.history)) setCredentialHistory(result.history);
    } catch {
      setCredentialHistory([]);
    }
  };

  const handleApplyConnection = async () => {
    if (!testResult?.success) return;
    if (!onConnectSuccess) {
      setConnectionPopup({
        success: false,
        title: 'Koneksi belum tersimpan',
        message: 'Aksi simpan koneksi belum tersedia. Silakan coba lagi.',
      });
      return;
    }

    setIsApplyingConnection(true);
    try {
      await onConnectSuccess(
        exchange,
        testResult.usdtAvailable ?? 0,
        isSandbox,
        apiKey,
        apiSecret,
        passphrase,
        testResult.portfolioAssets,
        testResult.totalPortfolioUsdt
      );
      await loadCredentialHistory();
      setConnectionPopup({
        success: true,
        title: 'Exchange berhasil dihubungkan',
        message: `${exchange} berhasil diverifikasi dan disinkronkan dalam mode ${isSandbox ? 'Demo' : 'Live'}.`,
      });
    } catch (error: any) {
      setConnectionPopup({
        success: false,
        title: 'Gagal menyimpan koneksi',
        message: error?.message || `Kredensial terverifikasi, tetapi sinkronisasi mode ${isSandbox ? 'Demo' : 'Live'} gagal.`,
      });
    } finally {
      setIsApplyingConnection(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="theme-modal-shell relative w-full max-w-xl bg-[#080E1A] border border-[#162740] rounded-2xl shadow-2xl overflow-hidden text-slate-100 max-h-[94vh] flex flex-col">
        {/* Top Hardware Notch */}
        <div className="w-full flex justify-center pt-2 pb-1 bg-[#060B14]">
          <div className="w-16 h-1 rounded-full bg-[#18263B]"></div>
        </div>

        {/* Modal Header */}
        <div className="px-5 py-3 border-b border-[#14233A] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00F0C8]/10 text-[#00F0C8] flex items-center justify-center border border-[#00F0C8]/20">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white tracking-wide flex items-center gap-2">
                <span>Koneksi API Exchanger</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${
                    connectionMode === 'testnet'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  {isPublicOnly ? (certificationBlocked ? 'Certification Blocked' : 'Read-only API') : (connectionMode === 'testnet' ? 'Testnet / Demo' : 'Live Real Spot')}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Trading Bot Non-Kustodian • Dana Tersimpan Aman di Bursa Anda
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[#0F1A2D] border border-[#1A2D4A] flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleTestConnection} className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {/* MODE SWITCHER: Live vs Testnet/Demo */}
          {!isPublicOnly && <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1.5 uppercase tracking-wider">
              Pilih Lingkungan Akun (Mode Operasi)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setConnectionMode('testnet');
                  setTestResult(null);
                  setConnectionPopup(null);
                }}
                className={`p-3 rounded-xl border transition text-left cursor-pointer flex items-start gap-2.5 ${
                  connectionMode === 'testnet'
                    ? 'bg-gradient-to-br from-amber-500/15 to-amber-950/20 border-amber-400/50 shadow-sm shadow-amber-500/10'
                    : 'bg-[#09111E] border-[#162740] hover:border-slate-700 text-slate-400'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    connectionMode === 'testnet'
                      ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`font-bold text-xs ${
                        connectionMode === 'testnet' ? 'text-amber-200' : 'text-slate-300'
                      }`}
                    >
                      Testnet / Sandbox
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-amber-400/20 text-amber-300 font-semibold">
                      Bebas Risiko
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                    Order nyata dikirim ke endpoint Testnet/Sandbox exchange yang terhubung; tidak ada simulator internal GAIN.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setConnectionMode('live');
                  setTestResult(null);
                  setConnectionPopup(null);
                }}
                className={`p-3 rounded-xl border transition text-left cursor-pointer flex items-start gap-2.5 ${
                  connectionMode === 'live'
                    ? 'bg-gradient-to-br from-[#00F0C8]/15 to-cyan-950/20 border-[#00F0C8]/60 shadow-sm shadow-[#00F0C8]/10'
                    : 'bg-[#09111E] border-[#162740] hover:border-slate-700 text-slate-400'
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    connectionMode === 'live'
                      ? 'bg-[#00F0C8]/20 text-[#00F0C8] border border-[#00F0C8]/40'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`font-bold text-xs ${
                        connectionMode === 'live' ? 'text-[#00F0C8]' : 'text-slate-300'
                      }`}
                    >
                      Akun Riil (Live Spot)
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-400/20 text-emerald-300 font-semibold">
                      Live Real
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                    Koneksi bursa live untuk eksekusi order spot nyata dengan saldo aset asli Anda.
                  </p>
                </div>
              </button>
            </div>
          </div>}

          {/* Active Connected API Status Banner */}
          {connectedExchange?.isConnected && (
            <div className="p-3.5 rounded-xl bg-[#091626] border border-[#163352] space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs text-white">
                        API {connectedExchange.exchange} Terhubung
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-mono border ${
                          connectedExchange.isSandbox
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        }`}
                      >
                        {connectedExchange.isSandbox ? 'Testnet / Demo' : 'Live Spot'}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-400 font-mono mt-0.5">
                      Key: {connectedExchange.apiKeyMasked} • Saldo: {connectedExchange.usdtBalance.toFixed(2)} USDT
                    </p>
                    {connectedExchange.identityHint && (
                      <p className="text-[9.5px] text-slate-500 font-mono mt-0.5">
                        Exchange Account: {connectedExchange.identityHint} · Credential v{connectedExchange.credentialVersion || 1} · {connectedExchange.credentialStatus || 'ACTIVE'}
                      </p>
                    )}
                  </div>
                </div>

                {!disconnectConfirm ? (
                  <button
                    type="button"
                    onClick={() => setDisconnectConfirm(true)}
                    className="px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Putuskan API</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition cursor-pointer shadow-sm animate-pulse"
                    >
                      Ya, Putuskan
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisconnectConfirm(false)}
                      className="px-2 py-1.5 rounded-lg bg-[#0F1A2D] text-slate-300 text-xs hover:text-white cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {connectedExchange?.isConnected && (
            <div className="p-3 rounded-xl bg-[#07111E] border border-[#132A43] space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Riwayat Credential API</span>
                <button type="button" onClick={() => void loadCredentialHistory()} className="text-[10px] text-cyan-400 hover:text-cyan-300 font-mono">Refresh</button>
              </div>
              {credentialHistory.length === 0 ? (
                <p className="text-[10px] text-slate-500 font-mono">Belum ada riwayat rotasi credential pada sesi ini.</p>
              ) : (
                <div className="space-y-1.5 max-h-28 overflow-auto">
                  {credentialHistory.slice(0, 5).map((item, index) => (
                    <div key={`${item.created_at || index}-${item.new_version || index}`} className="flex items-center justify-between gap-2 text-[10px] font-mono">
                      <span className="text-slate-300">{item.action === 'ROTATED' ? 'API diganti' : item.action === 'RECONNECTED' ? 'API tersambung kembali' : 'API terhubung'} · v{item.new_version || 1}</span>
                      <span className="text-slate-500">{item.created_at ? new Date(item.created_at).toLocaleString() : '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Exchange Switcher (All 6 Top Exchanges) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                Pilih Target Bursa Kripto
              </label>
              <span className="text-[10px] text-[#00F0C8] font-mono">
                {exchange === 'Binance' || exchange === 'Bybit'
                  ? '⭐ Bursa Rekomendasi Testnet'
                  : 'Multi-Exchange Ready'}
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {ALL_EXCHANGES.map((ex) => (
                <button
                  type="button"
                  key={ex}
                  onClick={() => {
                    setExchange(ex);
                    setSelectedGuideEx(ex);
                    setTestResult(null);
                    setConnectionPopup(null);
                  }}
                  className={`py-2 px-2 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                    exchange === ex
                      ? 'bg-[#00F0C8]/15 border-[#00F0C8] text-[#00F0C8] font-bold shadow-sm'
                      : 'bg-[#09111E] border-[#162740] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${exchange === ex ? 'bg-[#00F0C8]' : 'bg-slate-600'}`}
                    ></span>
                    <span className="text-xs font-mono">{ex}</span>
                  </div>
                  <span className="text-[8.5px] text-slate-500 font-mono">
                    {ex === 'Binance' || ex === 'Bybit'
                      ? 'Testnet'
                      : ex === 'Bitget' || ex === 'OKX'
                      ? 'Demo'
                      : 'Cloud'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* PANDUAN & LINK PENDAFTARAN API TESTNET INTERAKTIF */}
          <div className="rounded-xl border border-amber-500/25 bg-[#091322] overflow-hidden">
            <button
              type="button"
              onClick={() => setIsGuideOpen(!isGuideOpen)}
              className="w-full px-3.5 py-2.5 bg-gradient-to-r from-amber-500/10 via-[#0A172A] to-cyan-500/10 flex items-center justify-between text-left transition hover:opacity-95 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-400" />
                <span className="font-bold text-xs text-amber-300">
                  Panduan & Link Pendaftaran API Testnet {selectedGuideEx}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {currentGuide.hasOfficialTestnet ? 'Tersedia' : 'Rekomendasi'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="text-[10px] hidden sm:inline">
                  {isGuideOpen ? 'Tutup Panduan' : 'Buka Panduan'}
                </span>
                {isGuideOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </div>
            </button>

            {isGuideOpen && (
              <div className="p-3.5 space-y-3 text-xs border-t border-amber-500/20">
                {/* Selector for guide tab if user wants to browse other exchange guides */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 custom-scrollbar">
                  <span className="text-[10px] text-slate-400 font-mono mr-1 shrink-0">Bursa:</span>
                  {ALL_EXCHANGES.map((ex) => (
                    <button
                      type="button"
                      key={`guide-${ex}`}
                      onClick={() => setSelectedGuideEx(ex)}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-mono whitespace-nowrap transition cursor-pointer ${
                        selectedGuideEx === ex
                          ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40 font-bold'
                          : 'bg-[#0B1527] text-slate-400 hover:text-slate-200 border border-[#162740]'
                      }`}
                    >
                      {ex}
                    </button>
                  ))}
                </div>

                {/* Guide Card Header with Direct Official Link */}
                <div className="p-3 rounded-lg bg-[#070D18] border border-[#162740] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-white">{currentGuide.portalName}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{currentGuide.badge}</p>
                  </div>

                  <a
                    href={currentGuide.portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/40 text-amber-300 hover:text-amber-200 text-xs font-semibold transition cursor-pointer shrink-0"
                  >
                    <span>Buka Portal Resmi {selectedGuideEx}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Step-by-step instructions */}
                <div className="space-y-1.5">
                  <span className="text-[10.5px] font-mono font-bold text-slate-300 uppercase tracking-wider block">
                    Langkah Mendapatkan API Key & Saldo Faucet Demo:
                  </span>
                  <div className="space-y-1.5 bg-[#060C17] p-2.5 rounded-lg border border-[#14233A]">
                    {currentGuide.instructions.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-[11px] text-slate-300 leading-relaxed">
                        <span className="w-4 h-4 rounded-full bg-amber-400/20 text-amber-300 font-mono text-[10px] flex items-center justify-center shrink-0 mt-0.5 font-bold">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Faucet & Recommendation Notes */}
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Informasi Saldo Testnet:</span>
                  </div>
                  <p className="text-[10.5px] text-slate-300 leading-relaxed font-sans">
                    {currentGuide.faucetInfo}
                  </p>
                  {currentGuide.recommendationNote && (
                    <p className="text-[10px] text-amber-300/90 pt-1 font-sans">
                      💡 {currentGuide.recommendationNote}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Security Guarantee Box */}
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Proteksi 100% Non-Kustodian (Hanya Izin Spot Trading)</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
              Bot hanya membutuhkan izin <strong>Read Info</strong> dan <strong>Spot Trading</strong>.{' '}
              <span className="text-emerald-400 font-bold">JANGAN AKTIFKAN IZIN PENARIKAN (WITHDRAWAL)</span>. Dana
              pokok Anda 100% berada di dompet bursa {exchange}.
            </p>
          </div>

          {/* Form fields */}
          {!isPublicOnly ? (
            <>
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1.5 uppercase tracking-wider">
                  API Key ({exchange} • {connectionMode === 'testnet' ? 'Testnet/Demo' : 'Live Real'})
                </label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setTestResult(null);
                    setConnectionPopup(null);
                  }}
                  placeholder={
                    connectionMode === 'testnet'
                      ? `Masukkan API Key ${exchange} Testnet atau Demo...`
                      : `Masukkan API Key ${exchange} Akun Riil...`
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#09111E] border border-[#162740] font-mono text-xs text-white focus:outline-none focus:border-[#00F0C8]"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1.5 uppercase tracking-wider">
                  API Secret Key
                </label>
                <input
                  type="password"
                  value={apiSecret}
                  onChange={(e) => {
                    setApiSecret(e.target.value);
                    setTestResult(null);
                    setConnectionPopup(null);
                  }}
                  placeholder={`Masukkan Secret Key ${exchange}...`}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#09111E] border border-[#162740] font-mono text-xs text-white focus:outline-none focus:border-[#00F0C8]"
                  required
                />
              </div>

              {requiresPassphrase && (
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1.5 uppercase tracking-wider">
                    Passphrase (Wajib untuk {exchange})
                  </label>
                  <input
                    type="password"
                    value={passphrase}
                    onChange={(e) => {
                      setPassphrase(e.target.value);
                      setTestResult(null);
                      setConnectionPopup(null);
                    }}
                    placeholder={`Masukkan Passphrase yang Anda tentukan saat membuat API di ${exchange}...`}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#09111E] border border-[#162740] font-mono text-xs text-white focus:outline-none focus:border-[#00F0C8]"
                    required
                  />
                </div>
              )}
            </>
          ) : (
            <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-200 text-xs space-y-1.5">
              <div className="flex items-center gap-2 font-bold"><ShieldCheck className="w-4 h-4" /> Read-only API Certification</div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {exchangeDescriptor?.notes || 'Tidak ada API authenticated trading yang diaktifkan pada exchange ini.'}
              </p>
              <p className="text-[10px] text-slate-400 font-mono">
                Tidak ada credential yang diminta atau disimpan. Tidak ada order yang dikirim.
              </p>
            </div>
          )}

          <ExchangeCertificationPanel exchange={exchange} isSandbox={isSandbox} />

          {/* IP Whitelist & Speed Info */}
          <div className="p-3 rounded-xl bg-[#070D17] border border-[#14233A] space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-1.5 text-[11px]">
                <Lock className="w-3.5 h-3.5 text-[#00F0C8]" />
                Dedicated Node IP Whitelist (Opsional):
              </span>
              <button
                type="button"
                onClick={handleCopyIp}
                className="text-[#00F0C8] hover:underline flex items-center gap-1 text-[11px] cursor-pointer"
              >
                {copiedIp ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedIp ? 'Tersalin!' : 'Salin IP'}</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-500 font-mono">
              142.250.180.14, 172.217.16.206 (Cross-connect low latency)
            </p>

            {/* Quick Speed / Signature Explainer Toggle */}
            <div className="pt-1.5 border-t border-[#14233A]/60">
              <button
                type="button"
                onClick={() => setShowSpeedTip(!showSpeedTip)}
                className="w-full flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-200 transition"
              >
                <span className="flex items-center gap-1.5 text-amber-400/90 font-medium">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                  Kenapa verifikasi signature membutuhkan waktu?
                </span>
                {showSpeedTip ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showSpeedTip && (
                <div className="mt-2 p-2.5 rounded-lg bg-[#0B1424] border border-[#182B46] text-[11px] font-sans text-slate-300 space-y-1.5 animate-fadeIn">
                  <p className="leading-relaxed">
                    Saat memverifikasi, sistem mengeksekusi 3 tahap keamanan tingkat institusional:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[10.5px]">
                    <li>
                      <strong className="text-slate-200">Enkripsi HMAC-SHA256:</strong> Server bursa ({exchange})
                      memvalidasi keaslian signature dan timestamp.
                    </li>
                    <li>
                      <strong className="text-slate-200">Verifikasi Izin & Sandbox:</strong> Bursa mencocokkan hak
                      akses Spot Trading dan target environment ({connectionMode}).
                    </li>
                    <li>
                      <strong className="text-slate-200">Kalkulasi Valuasi Multi-Aset:</strong> Sistem otomatis
                      memindai saldo dompet dan menaksir nilai portofolio dalam USDT secara real-time.
                    </li>
                  </ol>
                </div>
              )}
            </div>
          </div>

          {/* Test Result Box */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-mono space-y-1.5 animate-fadeIn ${
                testResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
                {testResult.latencyMs !== undefined && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/40 font-mono">
                    {testResult.latencyMs} ms
                  </span>
                )}
              </div>

              {testResult.success && (
                <div className="space-y-2 pt-1 border-t border-emerald-500/20">
                  {isPublicOnly ? (
                    <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-200">
                      <div className="font-bold text-[11px]">Read-only certification selesai.</div>
                      <div className="text-[10px] text-slate-300 mt-1">Tidak ada saldo akun, credential private, atau order yang diproses.</div>
                    </div>
                  ) : (
                    <>
                      <div className="text-[11px] text-slate-200 grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Saldo Spot USDT ({connectionMode === 'testnet' ? 'Demo' : 'Live'}):</span>
                          <span className="font-bold text-[#00F0C8] text-sm">{testResult.usdtAvailable?.toFixed(2)} USDT</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Total Estimasi Nilai:</span>
                          <span className="text-emerald-400 font-bold text-sm">
                            ${testResult.totalPortfolioUsdt?.toFixed(2) ?? testResult.usdtAvailable?.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {testResult.portfolioAssets && testResult.portfolioAssets.length > 0 && (
                        <div className="p-2 rounded-lg bg-black/30 border border-emerald-500/20 space-y-1">
                          <span className="text-[10px] text-emerald-300 font-bold block uppercase tracking-wider">
                            Aset Koin Terdeteksi di Bursa ({testResult.portfolioAssets.length}):
                          </span>
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {testResult.portfolioAssets.map((asset, assetIndex) => (
                              <span
                                key={`${asset.coin}-${assetIndex}`}
                                className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-200"
                              >
                                <strong className="text-white">{asset.coin}:</strong> {asset.total} (~${asset.valueUsdt.toFixed(2)})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleApplyConnection}
                        disabled={isApplyingConnection}
                        className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#00F0C8] to-[#00D0AD] text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-[#00F0C8]/20 hover:opacity-95 transition cursor-pointer disabled:opacity-60"
                      >
                        {isApplyingConnection ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        <span>{isApplyingConnection ? 'Menyimpan koneksi...' : `Terapkan ke Dashboard (${isSandbox ? 'Demo' : 'Live'})`}</span>
                      </button>
                    </>
                  )}
                </div>
              )}

              {testResult.error && (
                <p className="text-[11px] text-red-300 leading-relaxed pt-1 border-t border-red-500/20">
                  {testResult.error}
                </p>
              )}
            </div>
          )}

          {/* Bottom Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-[#0F1A2D] text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
            >
              Tutup
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer disabled:opacity-50 ${
                connectionMode === 'testnet'
                  ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-lg shadow-amber-400/20'
                  : 'bg-[#00F0C8] text-slate-950 glow-cyan-btn'
              }`}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>{loadingStep}</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 fill-current" />
                  <span>{isPublicOnly ? `Audit API Publik ${exchange}` : `Tes & Hubungkan ${exchange} (${connectionMode === 'testnet' ? 'Testnet' : 'Live'})`}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {connectionPopup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" role="presentation">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="exchange-connection-result-title"
            className="w-full max-w-sm rounded-2xl border border-slate-700 bg-[#0B1320] p-5 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              {connectionPopup.success
                ? <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400" />
                : <AlertCircle className="mt-0.5 h-6 w-6 shrink-0 text-red-400" />}
              <div>
                <h3 id="exchange-connection-result-title" className="text-sm font-bold text-white">
                  {connectionPopup.title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">{connectionPopup.message}</p>
                <p className="mt-2 text-[10px] font-mono text-slate-400">
                  {exchange} · {isSandbox ? 'Demo' : 'Live'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const connected = connectionPopup.success;
                setConnectionPopup(null);
                if (connected) onClose();
              }}
              className={`mt-5 w-full rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                connectionPopup.success
                  ? 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
                  : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
              }`}
            >
              {connectionPopup.success ? 'Selesai' : 'Tutup'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
