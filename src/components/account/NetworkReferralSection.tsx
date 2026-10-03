import { useState, useEffect } from 'react';
import {
  Users,
  Share2,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Sparkles,
  TrendingUp,
  UserCheck,
  Send,
  QrCode,
  ShieldCheck,
  ArrowUpRight,
} from 'lucide-react';
import { UserWallet, NetworkMember } from '../../types';
import { subscribeToDirectReferrals } from '../../services/memberService';
import QRCode from 'qrcode';

interface NetworkReferralSectionProps {
  wallet: UserWallet;
  userId?: string;
  onOpenTransfer?: () => void;
  onOpenProfitShare?: () => void;
  onOpenActivationModal?: () => void;
}

export function NetworkReferralSection({
  wallet,
  userId,
  onOpenTransfer,
  onOpenProfitShare,
  onOpenActivationModal,
}: NetworkReferralSectionProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'non-active'>('all');
  const [networkList, setNetworkList] = useState<NetworkMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [networkError, setNetworkError] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [referralQr, setReferralQr] = useState('');

  const referralLink = `https://gainkoin.io/register?ref=${wallet.memberId}`;

  useEffect(() => {
    if (!wallet.memberId) { setReferralQr(''); return; }
    void QRCode.toDataURL(referralLink, { margin: 1, width: 320, errorCorrectionLevel: 'M' }).then(setReferralQr).catch(() => setReferralQr(''));
  }, [referralLink, wallet.memberId]);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setNetworkError(false);
    const unsubscribe = subscribeToDirectReferrals(
      userId,
      wallet.memberId,
      (members) => {
        if (!isMounted) return;
        setNetworkList(members);
        setIsLoading(false);
      },
      () => {
        if (!isMounted) return;
        setNetworkError(true);
        setNetworkList([]);
        setIsLoading(false);
      },
    );
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [userId, wallet.memberId]);

  const copyReferral = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const copyMemberId = () => {
    navigator.clipboard.writeText(wallet.memberId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const shareToWhatsapp = () => {
    const text = encodeURIComponent(
      `Halo! Gabung bersama saya di GAIN Niaga Koin, platform bot trading crypto otomatis spot 100-step averaging & grid. Gunakan kode referal saya: ${wallet.memberId} atau klik link: ${referralLink}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const shareToTelegram = () => {
    const text = encodeURIComponent(
      `Trading crypto otomatis spot tanpa floating loss bersama GAIN Niaga Koin. Referral ID: ${wallet.memberId}`
    );
    window.open(`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${text}`, '_blank');
  };

  const filteredNetwork = networkList.filter((m) => {
    if (filterStatus === 'all') return true;
    return m.accountStatus === filterStatus;
  });

  const directCount = networkList.length;
  const activeCount = networkList.filter((m) => m.accountStatus === 'active').length;
  const totalBonus = networkList.every((member) => typeof member.bonusYieldUsdt === 'number')
    ? networkList.reduce((total, member) => total + (member.bonusYieldUsdt || 0), 0)
    : null;
  const teamTurnover = networkList.every((member) => typeof member.totalTurnoverUsdt === 'number')
    ? networkList.reduce((total, member) => total + (member.totalTurnoverUsdt || 0), 0)
    : null;

  return (
    <div className="theme-surface theme-legacy-surface theme-promo-card p-4 rounded-2xl bg-[#08101D] border border-[#162740] shadow-xl space-y-4 transition-colors">
      {/* Header with Title & Non-MLM Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#00F0C8]/10 border border-[#00F0C8]/30 flex items-center justify-center text-[#00F0C8]">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold text-white tracking-wide">
                Direct Referral & Afiliasi Mandiri
              </h3>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                Non-MLM / 1 Tingkat
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">
              Registrasi wajib via sponsor • Komisi sponsor langsung dari Gas Fee platform
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowQrModal(true)}
          className="p-1.5 rounded-lg bg-[#0E1A2D] border border-[#182B48] text-slate-300 hover:text-white transition flex items-center gap-1 text-[10px] font-mono cursor-pointer"
          title="Tampilkan QR Code Referral"
        >
          <QrCode className="w-3.5 h-3.5 text-[#00F0C8]" />
          <span>QR ID</span>
        </button>
      </div>

      {/* Member ID & Sponsor Identity Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* User Member ID Box */}
        <div className="p-3 rounded-xl bg-[#050A14] border border-[#14233A] flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-500 font-mono uppercase block">
              ID Member Anda
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="font-mono text-sm font-extrabold text-[#00F0C8]">
                {wallet.memberId}
              </span>
              <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border ${
                wallet.licenseStatus === 'active'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
              }`}>
                {wallet.licenseStatus === 'active' ? 'LICENSE: ACTIVE' : 'LICENSE: NONE'}
              </span>
            </div>
          </div>
          <button
            onClick={copyMemberId}
            className="px-2.5 py-1 rounded-lg bg-[#0E1B2E] border border-[#1A2E4C] text-[#00F0C8] text-[11px] font-mono font-bold hover:bg-[#13253F] transition flex items-center gap-1 cursor-pointer"
          >
            {copiedId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copiedId ? 'Tersalin' : 'Salin'}</span>
          </button>
        </div>

        {/* Sponsor / Upline Box */}
        <div className="p-3 rounded-xl bg-[#050A14] border border-[#14233A] flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-500 font-mono uppercase block">
              Sponsor / Pengundang Anda
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-mono text-xs font-bold text-white">
                {wallet.sponsorId || '-'}
              </span>
              <span className="text-[11px] text-slate-400 truncate max-w-[110px]">
                ({wallet.sponsorName || (wallet.sponsorId ? 'Sponsor' : 'Tidak ada sponsor')})
              </span>
            </div>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span>Terverifikasi</span>
          </span>
        </div>
      </div>

      {/* Network Overview 4-Metric Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-center">
        <div className="p-2.5 rounded-xl bg-[#060B14] border border-[#121E31]">
          <span className="text-[10px] text-slate-500 uppercase block">Mitra Langsung</span>
          <span className="text-white text-sm font-bold block mt-0.5">
            {directCount} Member
          </span>
          <span className="text-[9px] text-emerald-400 block mt-0.5">Direct 1-Tier</span>
        </div>

        <div className="p-2.5 rounded-xl bg-[#060B14] border border-[#121E31]">
          <span className="text-[10px] text-slate-500 uppercase block">Mitra Aktif</span>
          <span className="text-[#00F0C8] text-sm font-bold block mt-0.5">
            {activeCount} Member
          </span>
          <span className="text-[9px] text-slate-400 block mt-0.5">Status Active</span>
        </div>

        <div className="p-2.5 rounded-xl bg-[#060B14] border border-[#121E31]">
          <span className="text-[10px] text-slate-500 uppercase block">Bonus Sponsor</span>
          <span className="text-amber-400 text-sm font-bold block mt-0.5">
            {totalBonus === null ? 'Belum tersedia' : `+${totalBonus.toFixed(2)}`}
          </span>
          <span className="text-[9px] text-slate-400 block mt-0.5">USDT Gas Fee Share</span>
        </div>

        <div className="p-2.5 rounded-xl bg-[#060B14] border border-[#121E31]">
          <span className="text-[10px] text-slate-500 uppercase block">Omzet Trading</span>
          <span className="text-blue-400 text-sm font-bold block mt-0.5">
            {teamTurnover === null ? 'Belum tersedia' : teamTurnover.toLocaleString('id-ID')}
          </span>
          <span className="text-[9px] text-slate-400 block mt-0.5">USDT Spot</span>
        </div>
      </div>

      {/* Sharing Bar (Link, WhatsApp, Telegram) */}
      <div className="p-3 rounded-xl bg-[#060C16] border border-[#142339] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-300 flex items-center gap-1.5">
            <Share2 className="w-3 h-3 text-[#00F0C8]" />
            <span>Tautan Pendaftaran (Wajib Menggunakan Sponsor)</span>
          </span>
          <span className="text-[10px] text-emerald-400 font-mono">50% + 40% = 90%</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 px-3 py-1.5 rounded-lg bg-[#08101E] border border-[#162740] font-mono text-xs text-slate-300 truncate">
            {referralLink}
          </div>
          <button
            onClick={copyReferral}
            className="px-3 py-1.5 rounded-lg bg-[#00F0C8]/15 border border-[#00F0C8]/30 text-[#00F0C8] text-xs font-mono font-bold hover:bg-[#00F0C8]/25 transition shrink-0 flex items-center gap-1 cursor-pointer"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? 'Tersalin' : 'Salin'}</span>
          </button>
        </div>

        {/* Quick Social Sharing */}
        <div className="flex items-center gap-2 pt-1 font-mono text-xs">
          <button
            onClick={shareToWhatsapp}
            className="flex-1 py-1.5 px-2 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] hover:bg-[#25D366]/20 transition flex items-center justify-center gap-1.5 text-[11px] font-semibold cursor-pointer"
          >
            <span>Kirim WhatsApp</span>
          </button>
          <button
            onClick={shareToTelegram}
            className="flex-1 py-1.5 px-2 rounded-lg bg-[#229ED9]/10 border border-[#229ED9]/30 text-[#229ED9] hover:bg-[#229ED9]/20 transition flex items-center justify-center gap-1.5 text-[11px] font-semibold cursor-pointer"
          >
            <span>Kirim Telegram</span>
          </button>
        </div>
      </div>

      {/* Exchange connection identity / sync status */}
      {wallet.connectedExchange?.isConnected && (
        <div className="p-3.5 rounded-xl bg-[#061220] border border-cyan-500/20 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-mono font-bold text-white">Exchange Connection</h4>
            </div>
            <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${wallet.connectedExchange.portfolioSyncStatus === 'LIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : wallet.connectedExchange.portfolioSyncStatus === 'STALE' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' : 'bg-slate-500/10 text-slate-300 border-slate-500/30'}`}>
              {wallet.connectedExchange.portfolioSyncStatus || 'SYNCING'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            <div className="rounded-lg border border-[#14233A] bg-[#08101D] p-2">
              <span className="text-slate-500 block">Exchange</span>
              <strong className="text-slate-200">{wallet.connectedExchange.exchange} {wallet.connectedExchange.isSandbox ? '(Testnet)' : '(Live)'}</strong>
            </div>
            <div className="rounded-lg border border-[#14233A] bg-[#08101D] p-2">
              <span className="text-slate-500 block">Credential</span>
              <strong className="text-slate-200">v{wallet.connectedExchange.credentialVersion || 1} · {wallet.connectedExchange.credentialStatus || 'ACTIVE'}</strong>
            </div>
            <div className="rounded-lg border border-[#14233A] bg-[#08101D] p-2">
              <span className="text-slate-500 block">Account Identity</span>
              <strong className="text-slate-200">{wallet.connectedExchange.identityHint || 'Protected'}</strong>
            </div>
            <div className="rounded-lg border border-[#14233A] bg-[#08101D] p-2">
              <span className="text-slate-500 block">Portfolio As Of</span>
              <strong className="text-slate-200">{wallet.connectedExchange.portfolioAsOf ? new Date(wallet.connectedExchange.portfolioAsOf).toLocaleTimeString() : 'Syncing...'}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Program Promo & Bonus Lifetime */}
      <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#061220] via-[#07182A] to-[#040811] border border-amber-500/30 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-mono font-bold text-white">PROGRAM PROMO &amp; BONUS HINGGA 90%</h4>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
            50% + 40% = 90%
          </span>
        </div>

        <div className="space-y-1.5 text-[11px] text-slate-300 leading-relaxed font-sans">
          <p>
            • <strong className="text-white">Diskon 50%</strong> dari harga lisensi normal (sekali bayar seumur hidup / Lifetime).
          </p>
          <p>
            • <strong className="text-white">Bonus 40% fee trading</strong> setelah aktivasi langsung masuk ke Gas Fee Tank Anda untuk bahan bakar bot!
          </p>
          <p className="text-amber-200/90 italic font-mono text-[10px] pt-0.5">
            *50% + 40% = 90% (akumulasi persentase promo, bukan nilai $).
          </p>
        </div>
      </div>

      {/* Downlines Directory List */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-white font-mono">Daftar Mitra Direct</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#14233A] text-slate-300">
              {filteredNetwork.length} Orang
            </span>
          </div>

          {/* Status Filter Chips */}
          <div className="flex items-center gap-1 bg-[#060B14] p-0.5 rounded-lg border border-[#142236] font-mono text-[10px]">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-2 py-0.5 rounded-md transition ${
                filterStatus === 'all'
                  ? 'bg-[#00F0C8]/20 text-[#00F0C8] font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Semua
            </button>
            <button
              onClick={() => setFilterStatus('active')}
              className={`px-2 py-0.5 rounded-md transition ${
                filterStatus === 'active'
                  ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setFilterStatus('non-active')}
              className={`px-2 py-0.5 rounded-md transition ${
                filterStatus === 'non-active'
                  ? 'bg-amber-500/20 text-amber-400 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Non-Active
            </button>
          </div>
        </div>

        {/* Member Cards */}
        <div className="space-y-2">
          {isLoading ? (
            <p className="py-5 text-center text-xs text-slate-400">Memuat data mitra...</p>
          ) : networkError ? (
            <p className="py-5 text-center text-xs text-rose-300">Data mitra tidak dapat dimuat. Periksa koneksi atau aturan akses Firestore.</p>
          ) : filteredNetwork.length === 0 ? (
            <p className="py-5 text-center text-xs text-slate-400">
              {networkList.length === 0 ? 'Belum ada mitra langsung yang terdaftar.' : 'Tidak ada mitra pada filter ini.'}
            </p>
          ) : filteredNetwork.map((m) => (
            <div
              key={m.id}
              className="p-3 rounded-xl bg-[#060B14] border border-[#14233A] hover:border-[#1E3658] transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#0F1B2D] border border-[#182C48] flex items-center justify-center font-mono font-bold text-xs text-[#00F0C8] shrink-0">
                  {m.memberId.slice(-3)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-xs text-white">{m.memberId}</span>
                    <span className="text-xs text-slate-300 font-medium">{m.name}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border ${
                      m.accountStatus === 'active'
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    }`}>
                      {m.accountStatus === 'active' ? 'ACTIVE' : 'NON-ACTIVE'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 mt-0.5">
                    <span>Gabung: {m.joinDate}</span>
                    <span>•</span>
                    <span className={m.botStatus === 'ACTIVE' ? 'text-emerald-400' : 'text-slate-400'}>
                      {m.botStatus === 'ACTIVE' ? 'Bot Aktif' : m.botStatus === 'STANDBY' ? 'Standby' : 'Data bot belum tersedia'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Yield and Transfer Action */}
              <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#121E31] font-mono">
                <div className="text-left sm:text-right">
                  <span className="text-[9px] text-slate-500 block uppercase">Bonus Sponsor</span>
                  <span className="text-xs font-bold text-emerald-400 block">
                    {typeof m.bonusYieldUsdt === 'number' ? `+${m.bonusYieldUsdt.toFixed(2)} USDT` : 'Belum tersedia'}
                  </span>
                </div>

                {onOpenTransfer && (
                  <button
                    onClick={onOpenTransfer}
                    className="px-2.5 py-1 rounded-lg bg-[#0E1A2C] hover:bg-[#142640] border border-[#182B48] text-slate-300 hover:text-white text-[11px] font-mono transition flex items-center gap-1 cursor-pointer"
                    title={`Kirim USDT P2P ke ${m.memberId}`}
                  >
                    <Send className="w-3 h-3 text-[#00F0C8]" />
                    <span>Transfer P2P</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-sm bg-[#080E1A] border border-[#162740] rounded-2xl shadow-2xl p-5 text-center text-slate-100 space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-[#14233A]">
              <h4 className="font-bold text-sm text-white font-mono">Kode QR ID Member</h4>
              <button
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-white text-xs font-mono"
              >
                ✕ Tutup
              </button>
            </div>

            {/* Real referral QR: encodes the registration referral URL. */}
            <div className="p-4 bg-white rounded-xl mx-auto w-48 h-48 flex items-center justify-center shadow-inner">
              {referralQr ? <img src={referralQr} alt="QR referral GAIN" className="w-full h-full object-contain" /> : <span className="text-xs text-slate-500">QR belum tersedia</span>}
            </div>

            <div>
              <span className="text-xs font-mono text-[#00F0C8] font-bold block">{wallet.memberId}</span>
              <p className="text-[11px] text-slate-400 mt-1">
                Scan untuk mendaftar downline otomatis atau transfer internal P2P tanpa biaya gas.
              </p>
            </div>

            <button
              onClick={copyReferral}
              className="w-full py-2 rounded-xl bg-[#00F0C8] text-slate-950 font-mono font-bold text-xs hover:bg-[#00D0AD] transition cursor-pointer"
            >
              {copiedLink ? 'Tautan Referral Tersalin!' : 'Salin Tautan Pendaftaran'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
