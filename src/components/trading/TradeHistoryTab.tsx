import React, { useState, useMemo } from 'react';
import { CoinLogo } from '../common/CoinLogo';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Download,
  Copy,
  Check,
  Filter,
  Search,
  ExternalLink,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  AlertCircle,
  Eye,
  Info,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Sliders,
  DollarSign,
  Activity,
  ListFilter,
  Printer,
} from 'lucide-react';
import { TradeRecord, UserWallet, TradingPosition, ExecutedLayerDetail } from '../../types';
import { TradeDetailModal } from '../modals/TradeDetailModal';
import { calculateTradeMetrics, decorateTradesWithRealizedPnl } from '../../utils/tradeMetrics';
import { TradeInfoModal } from '../modals/TradeInfoModal';

interface TradeHistoryTabProps {
  trades: TradeRecord[];
  wallet: UserWallet;
  positions?: TradingPosition[];
  activeApiCreds: {
    exchange: string;
    apiKey: string;
    secret: string;
    password?: string;
    isSandbox: boolean;
  } | null;
  onSyncExchangeTrades: () => Promise<void>;
  isSyncing: boolean;
  hasMoreTrades?: boolean;
  isLoadingMoreTrades?: boolean;
  onLoadMoreTrades?: () => void;
  onOpenApiKeyModal: () => void;
  onForceTakeProfit?: (posId: string) => Promise<any> | void;
  onOpenMatrixModal?: (pair: string) => void;
  onCloseLayer?: (positionId: string, layerId: string) => Promise<any> | void;
}

export const TradeHistoryTab: React.FC<TradeHistoryTabProps> = ({
  trades,
  wallet,
  positions = [],
  activeApiCreds,
  onSyncExchangeTrades,
  isSyncing,
  hasMoreTrades = false,
  isLoadingMoreTrades = false,
  onLoadMoreTrades,
  onOpenApiKeyModal,
  onForceTakeProfit,
  onOpenMatrixModal,
  onCloseLayer,
}) => {
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [selectedPair, setSelectedPair] = useState<string>('ALL');
  const [selectedSide, setSelectedSide] = useState<'ALL' | 'buy' | 'sell'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Modals state
  const [selectedPositionForDetail, setSelectedPositionForDetail] = useState<TradingPosition | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedPositionForInfo, setSelectedPositionForInfo] = useState<TradingPosition | null>(null);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  // Accordion state for pair cards
  const [collapsedPairs, setCollapsedPairs] = useState<Record<string, boolean>>({});

  const [isSelling, setIsSelling] = useState(false);
  const [sellToast, setSellToast] = useState<{ title: string; message: string; isError?: boolean } | null>(null);

  const togglePairCollapse = (pairName: string) => {
    setCollapsedPairs((prev) => ({
      ...prev,
      [pairName]: !prev[pairName],
    }));
  };

  // Build active bot pairs that have actual active positions or recorded trades
  const botPositions = useMemo(() => {
    // Filter by search / pair filter if selected
    return positions.filter((p) => {
      const matchPair = selectedPair === 'ALL' || p.pair === selectedPair;
      const matchQuery = !searchQuery || p.pair.toLowerCase().includes(searchQuery.toLowerCase()) || p.coin.toLowerCase().includes(searchQuery.toLowerCase());
      const hasRealTrade = trades.some((t) => t.symbol === p.pair);
      const hasRealLayers = Boolean(p.executedLayers && p.executedLayers.length > 0);
      const hasRealAllocation = parseFloat(p.allocationQty || '0') > 0 && p.status === 'active';
      return matchPair && matchQuery && (hasRealTrade || hasRealLayers || hasRealAllocation);
    });
  }, [positions, selectedPair, searchQuery, trades]);

  // Available pairs from trades & positions
  const availablePairs = useMemo(() => {
    const set = new Set<string>();
    positions.forEach((p) => set.add(p.pair));
    trades.forEach((t) => set.add(t.symbol));
    return ['ALL', ...Array.from(set)];
  }, [trades, positions]);

  // Enrich exchange fills with FIFO realized PnL when the API does not provide it.
  const enrichedTrades = useMemo(() => decorateTradesWithRealizedPnl(trades), [trades]);

  // Filtered trades for table view
  const filteredTrades = useMemo(() => {
    return enrichedTrades.filter((t) => {
      const matchPair = selectedPair === 'ALL' || t.symbol === selectedPair;
      const matchSide = selectedSide === 'ALL' || t.side === selectedSide;
      const matchQuery =
        !searchQuery ||
        t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.orderId && t.orderId.toLowerCase().includes(searchQuery.toLowerCase())) ||
        t.exchange.toLowerCase().includes(searchQuery.toLowerCase());
      return matchPair && matchSide && matchQuery;
    });
  }, [enrichedTrades, selectedPair, selectedSide, searchQuery]);

  // Aggregate metrics dari trade fill exchange, bukan data demo/statis.
  const metrics = useMemo(() => calculateTradeMetrics(enrichedTrades), [enrichedTrades]);
  const connectedExchange = wallet.connectedExchange || (wallet.connectedExchanges || []).find((item) => item.isActive) || (wallet.connectedExchanges || [])[0];
  const hasExchangeConnection = Boolean(connectedExchange?.isConnected && connectedExchange?.exchange);

  const handleCopy = (id: string, textToCopy: string) => {
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleForceSell = async (position: TradingPosition) => {
    if (!onForceTakeProfit || isSelling) return;
    setIsSelling(true);
    setSellToast(null);
    try {
      const result = await onForceTakeProfit(position.id);
      if (!result?.success) {
        setSellToast({
          title: 'Sell belum berhasil',
          message: result?.error || 'Order tidak terkonfirmasi. Periksa status exchange sebelum mencoba lagi.',
          isError: true,
        });
        return;
      }

      setSellToast({
        title: result.partial ? 'Sell terisi sebagian' : 'Sell berhasil',
        message: result.persistenceWarning || (result.partial
          ? `Terjual ${Number(result.filledAmount || 0).toFixed(8)} ${position.coin}; sisa ${Number(result.remainingAmount || 0).toFixed(8)} ${position.coin} tetap aktif.`
          : `Posisi ${position.pair} berhasil dijual${result.orderId ? ` (order ${result.orderId})` : ''}.`),
        isError: Boolean(result.persistenceWarning),
      });
    } catch (error) {
      setSellToast({
        title: 'Status sell perlu diperiksa',
        message: error instanceof Error ? error.message : 'Terjadi kendala saat menyimpan hasil sell. Periksa exchange sebelum mengulang order.',
        isError: true,
      });
    } finally {
      setIsSelling(false);
    }
  };

  const handleOpenDetail = (pos: TradingPosition) => {
    setSelectedPositionForDetail(pos);
    setIsDetailModalOpen(true);
  };

  const handleOpenInfo = (pos: TradingPosition) => {
    setSelectedPositionForInfo(pos);
    setIsInfoModalOpen(true);
  };

  const handleExportCsv = () => {
    if (filteredTrades.length === 0) return;
    const headers = [
      'Trade ID',
      'Order ID',
      'Exchange',
      'Symbol',
      'Side',
      'Price (USDT)',
      'Amount',
      'Cost (USDT)',
      'Realized PnL (USDT)',
      'Timestamp',
      'Status',
    ];
    const rows = filteredTrades.map((t) => [
      t.id,
      t.orderId || '-',
      t.exchange,
      t.symbol,
      t.side.toUpperCase(),
      t.price,
      t.amount,
      t.costUsdt,
      t.realizedPnl ?? 0,
      new Date(t.timestamp).toLocaleString('id-ID'),
      t.status,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `GAIN_Trade_History_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPdfReport = () => {
    if (filteredTrades.length === 0) return;

    const printableHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>GAIN - Laporan Resmi Riwayat Transaksi Trading</title>
        <style>
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 24px; color: #1e293b; background: #fff; }
          .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
          .title { font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
          .subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
          .metric-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
          .metric-label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 600; }
          .metric-val { font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 4px; font-family: monospace; }
          .metric-val.green { color: #059669; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background: #0f172a; color: #ffffff; text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
          td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; }
          tr:nth-child(even) { background: #f8fafc; }
          .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
          .badge-buy { background: #dcfce7; color: #15803d; }
          .badge-sell { background: #e0f2fe; color: #0369a1; }
          .footer { margin-top: 30px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">GAIN NIAGA KOIN · LAPORAN AUDIT RIWAYAT TRADING</div>
            <div class="subtitle">Platform Algoritma Kuantitatif Non-Kustodial · Dicetak pada ${new Date().toLocaleString('id-ID')}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; font-weight: 700; color: #0f172a;">Member ID: ${wallet.memberId || '-'}</div>
            <div style="font-size: 10px; color: #64748b;">${wallet.email || 'Akun Terverifikasi'}</div>
          </div>
        </div>

        <div class="summary-grid">
          <div class="metric-card">
            <div class="metric-label">Total Realized PnL</div>
            <div class="metric-val green">+${metrics.totalRealizedPnl.toFixed(2)} USDT</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Total Transaksi</div>
            <div class="metric-val">${filteredTrades.length} Order</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Win Rate Bot</div>
            <div class="metric-val green">${metrics.winRate === '—' ? '—' : `${metrics.winRate}%`}</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Estimasi Gas Tank (20%)</div>
            <div class="metric-val">${(Math.max(0, metrics.totalRealizedPnl) * 0.2).toFixed(2)} USDT</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Waktu / Tanggal</th>
              <th>Bursa</th>
              <th>Pasangan Koin</th>
              <th>Side</th>
              <th>Harga (USDT)</th>
              <th>Jumlah Koin</th>
              <th>Total Biaya</th>
              <th>PnL (USDT)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${filteredTrades
              .map(
                (t) => `
              <tr>
                <td>${new Date(t.timestamp).toLocaleString('id-ID')}</td>
                <td><strong>${t.exchange}</strong></td>
                <td>${t.symbol}</td>
                <td><span class="badge ${t.side.toLowerCase() === 'buy' ? 'badge-buy' : 'badge-sell'}">${t.side}</span></td>
                <td>$${Number(t.price).toFixed(t.price < 1 ? 4 : 2)}</td>
                <td>${Number(t.amount).toFixed(4)}</td>
                <td>$${Number(t.costUsdt).toFixed(2)}</td>
                <td style="font-weight: 700; color: ${(t.realizedPnl || 0) >= 0 ? '#059669' : '#dc2626'};">
                  ${(t.realizedPnl || 0) >= 0 ? '+' : ''}${(t.realizedPnl || 0).toFixed(2)}
                </td>
                <td><span style="color: #059669; font-weight: 600;">FILLED</span></td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        <div class="footer">
          Dokumen ini digenerate secara otomatis oleh sistem analitik trading GAIN Algorithmic Platform. Seluruh catatan transaksi berasal langsung dari API resmi bursa terhubung.
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(printableHtml);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 300);
    }
  };

  return (
    <div className="theme-legacy-surface space-y-4">
      {sellToast && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${sellToast.isError
            ? 'border-red-500/40 bg-red-500/10 text-red-200'
            : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}
        >
          <div>
            <p className="font-semibold">{sellToast.title}</p>
            <p className="mt-1 text-xs opacity-90">{sellToast.message}</p>
          </div>
          <button type="button" onClick={() => setSellToast(null)} aria-label="Tutup pesan sell" className="shrink-0 px-1 text-lg leading-none">×</button>
        </div>
      )}

      {/* Overview Metric Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="p-3.5 rounded-xl bg-[#08101D] border border-[#14233A]">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">
            Total Realized PnL
          </span>
          <div
            className={`text-lg font-bold font-mono mt-1 ${
              metrics.totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {metrics.totalRealizedPnl >= 0
              ? `+${metrics.totalRealizedPnl.toFixed(2)}`
              : metrics.totalRealizedPnl.toFixed(2)}{' '}
            <span className="text-xs text-slate-400">USDT</span>
          </div>
          <span className="text-[10px] text-emerald-300 font-mono mt-0.5 block">
            {metrics.sellCount} Order SELL Selesai
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#08101D] border border-[#14233A]">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">
            Volume Selesai
          </span>
          <div className="text-lg font-bold text-white font-mono mt-1">
            ${metrics.totalVolumeUsdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
            {metrics.totalCount} Order Terisi (Filled)
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#08101D] border border-[#14233A]">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">
            Rasio Win Rate
          </span>
          <div className="text-lg font-bold text-[#00F0C8] font-mono mt-1">
            {metrics.winRate === '—' ? '—' : `${metrics.winRate}%`}
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
            {metrics.realizedTradeCount > 0 ? `${metrics.winCount} menang / ${metrics.lossCount} rugi` : 'Belum ada closed trade'}
          </span>
        </div>

        <div className="p-3.5 rounded-xl bg-[#08101D] border border-[#14233A]">
          <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">
            Distribusi Eksekusi
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-bold text-emerald-400 font-mono">
              {metrics.buyCount} BUY
            </span>
            <span className="text-slate-600 font-mono">/</span>
            <span className="text-sm font-bold text-[#00F0C8] font-mono">
              {metrics.sellCount} SELL
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
            Spot DCA & Averaging
          </span>
        </div>
      </div>

      {/* View Mode Switcher + Action Controls */}
      <div className="p-3 rounded-xl bg-[#08101D] border border-[#14233A] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Left: View Mode Toggle */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-slate-900/80 p-1 border border-[#162740] font-mono text-xs">
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 font-bold cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-[#0099ff] text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Tampilan Kartu Trade History (Sesuai Screenshot)"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Kartu Bot & Detail Layer</span>
            </button>

            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 font-bold cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-[#152742] text-[#00F0C8] shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Tabel Transaksi Log Riwayat Eksekusi"
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Tabel Log Order</span>
            </button>
          </div>

          {/* Pair filter dropdown */}
          <div className="flex items-center gap-1.5 bg-[#060B14] px-2.5 py-1.5 rounded-lg border border-[#162740]">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              id="trade-pair-filter"
              name="trade-pair-filter"
              value={selectedPair}
              onChange={(e) => setSelectedPair(e.target.value)}
              className="bg-transparent text-xs text-white font-mono focus:outline-none cursor-pointer"
            >
              {availablePairs.map((p) => (
                <option key={p} value={p} className="bg-[#0B1525] text-white">
                  {p === 'ALL' ? 'Semua Pair' : p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: Search, Sync & Export */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              id="trade-search-query"
              name="trade-search-query"
              type="text"
              placeholder="Cari pair / order..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-lg bg-[#060B14] border border-[#162740] text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-[#00F0C8]/50 w-36 md:w-44"
            />
          </div>

          <button
            onClick={hasExchangeConnection ? onSyncExchangeTrades : onOpenApiKeyModal}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F1E33] hover:bg-[#152B4A] border border-[#1F3A60] text-xs font-mono text-[#00F0C8] font-semibold transition disabled:opacity-50 cursor-pointer"
            title="Tarik transaksi riil dari bursa via CCXT API"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isSyncing ? 'Sinkron...' : 'Tarik Bursa'}</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={filteredTrades.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0F1E33] hover:bg-[#152B4A] border border-[#1F3A60] text-xs font-mono text-slate-300 hover:text-white transition disabled:opacity-40 cursor-pointer"
            title="Ekspor data ke file CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV</span>
          </button>

          <button
            onClick={handleExportPdfReport}
            disabled={filteredTrades.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-xs font-mono text-teal-400 hover:text-teal-300 transition disabled:opacity-40 cursor-pointer"
            title="Cetak Laporan Audit / Simpan PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>PDF / Cetak</span>
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: TRADE HISTORY CARDS (Exact Layout from Image 2) */}
      {viewMode === 'cards' && (
        <div className="space-y-4">
          {botPositions.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#08101D] border border-dashed border-[#1B2F4D] text-center space-y-2">
              <Layers className="w-8 h-8 text-[#00F0C8] mx-auto opacity-70" />
              <p className="text-xs font-mono text-slate-400">Tidak ada posisi bot yang cocok dengan filter.</p>
            </div>
          ) : (
            botPositions.map((pos, idx) => {
              const pairClean = pos.pair.replace('/', '');
              const coin = pos.coin || pos.pair.split('/')[0];
              const isCollapsed = !!collapsedPairs[pos.pair];
              const currentPrice = typeof pos.price === 'number' ? pos.price : parseFloat(pos.price) || 1;

              // Real Position & Trade Metrics
              const pairTrades = trades.filter((t) => t.symbol === pos.pair);
              const latestTrade = pairTrades[0];
              const totalPairTradeVol = pairTrades.reduce((sum, t) => sum + (t.costUsdt || 0), 0);
              const totalPairTradeAmount = pairTrades.reduce((sum, t) => sum + (t.amount || 0), 0);

              const avgCoinAmount = totalPairTradeAmount > 0
                ? totalPairTradeAmount
                : parseFloat(pos.allocationQty || '0');
              const avgCostUsdt = totalPairTradeVol > 0
                ? totalPairTradeVol
                : parseFloat(pos.allocationUsdt || '0');
              const avgBuyPrice = pos.avgBuyPrice || (pairTrades[0]?.price ? Number(pairTrades[0].price) : currentPrice);
              const avgFloatingPnl = pos.floatingPnl || (avgCostUsdt > 0 ? ((currentPrice - avgBuyPrice) * avgCoinAmount) : 0);
              const avgRoiPct = pos.roiPct || (avgCostUsdt > 0 ? (avgFloatingPnl / avgCostUsdt) * 100 : 0);
              const avgDate = latestTrade
                ? new Date(latestTrade.timestamp).toLocaleString('id-ID', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : (pos.status === 'active' ? 'Posisi Berjalan' : 'Standby');

              // Grid metrics
              const gridCoinAmount = avgCoinAmount > 0 ? (avgCoinAmount / Math.max(1, pos.stepLayer || 1)) : 0;
              const gridCostUsdt = avgCostUsdt > 0 ? (avgCostUsdt / Math.max(1, pos.stepLayer || 1)) : 0;
              const gridBuyPrice = avgBuyPrice;
              const gridFloatingPnl = gridCostUsdt > 0 ? (currentPrice - gridBuyPrice) * gridCoinAmount : 0;
              const gridRoiPct = gridCostUsdt > 0 ? (gridFloatingPnl / gridCostUsdt) * 100 : 0;
              const gridDate = avgDate;

              return (
                <div
                  key={`${pos.id || 'pos'}-${idx}`}
                  className="rounded-2xl overflow-hidden border border-[#162947] bg-[#070D18] shadow-lg"
                >
                  {/* Pair Header Ribbon (Vibrant Blue Bar matching Image 2) */}
                  <button
                    type="button"
                    onClick={() => togglePairCollapse(pos.pair)}
                    className="w-full px-4 py-2.5 bg-gradient-to-r from-[#1d6fe9] to-[#3a8bfd] text-white flex items-center justify-between font-mono font-bold text-sm hover:brightness-105 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <CoinLogo coin={coin} size="xs" />
                      <span className="tracking-wide uppercase font-extrabold">{pairClean}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-normal text-white/90">
                        {pos.stepLayer > 0 ? `${pos.stepLayer} Layer Aktif` : 'Ready'}
                      </span>
                      {isCollapsed ? (
                        <ChevronDown className="w-4 h-4 text-white stroke-[2.5]" />
                      ) : (
                        <ChevronUp className="w-4 h-4 text-white stroke-[2.5]" />
                      )}
                    </div>
                  </button>

                  {/* Body Content with Sub-cards */}
                  {!isCollapsed && (
                    <div className="p-3 sm:p-4 space-y-3 bg-[#0A1322]">
                      {/* Sub-card 1: COIN (Average) */}
                      <div className="p-3.5 rounded-xl bg-[#dbeafe] dark:bg-[#0c1a2e] border border-[#bfdbfe] dark:border-[#193254] font-mono text-xs space-y-2.5">
                        {/* Top: Header labels */}
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-slate-900 dark:text-white text-xs">
                            {coin} (Average)
                          </span>
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            Average + Grid
                          </span>
                        </div>

                        {/* Middle: Amount, Cost, Floating PnL & Prices */}
                        <div className="grid grid-cols-2 gap-2 items-start">
                          <div>
                            <div className="font-extrabold text-slate-900 dark:text-white text-xs">
                              {pairClean} &rarr; {avgCoinAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {coin}
                            </div>
                            <div className="font-bold text-slate-800 dark:text-slate-200 text-xs mt-1">
                              {avgCostUsdt.toFixed(5)} USDT
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                              {avgDate}
                            </div>
                          </div>

                          <div className="text-right">
                            <div
                              className={`text-sm font-black ${
                                avgFloatingPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {avgFloatingPnl >= 0 ? `+${avgFloatingPnl.toFixed(5)}` : avgFloatingPnl.toFixed(5)} USDT
                            </div>
                            <div
                              className={`text-xs font-bold mt-0.5 ${
                                avgRoiPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {avgRoiPct >= 0 ? `+${avgRoiPct.toFixed(2)}%` : `${avgRoiPct.toFixed(2)}%`}
                            </div>
                            <div className="text-xs font-extrabold text-teal-600 dark:text-[#00F0C8] mt-1">
                              {avgBuyPrice.toFixed(4)} &rarr; {currentPrice.toFixed(4)}
                            </div>
                          </div>
                        </div>

                        {/* Bottom: 3 Action Buttons (View, Info, Sell) matching Image 2 */}
                        <div className="pt-2 border-t border-slate-300 dark:border-[#162740] grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(pos)}
                            className="py-1.5 px-2 rounded-lg bg-[#0099ff] hover:bg-[#0088ee] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                            title="Buka rincian detail seluruh layer order terisi"
                          >
                            <Eye className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>View</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenInfo(pos)}
                            className="py-1.5 px-2 rounded-lg bg-[#22c55e] hover:bg-[#16a34a] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                            title="Buka parameter konfigurasi & info strategi bot"
                          >
                            <Info className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Info</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleForceSell(pos)}
                            disabled={isSelling || !onForceTakeProfit}
                            className="py-1.5 px-2 rounded-lg bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Eksekusi manual Sell / Take Profit di harga pasar"
                          >
                            <CreditCard className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Sell</span>
                          </button>
                        </div>
                      </div>

                      {/* Sub-card 2: COIN (Grid / Layer 1) */}
                      <div className="p-3.5 rounded-xl bg-[#dbeafe] dark:bg-[#0c1a2e] border border-[#bfdbfe] dark:border-[#193254] font-mono text-xs space-y-2.5">
                        {/* Top: Header labels */}
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-slate-900 dark:text-white text-xs">
                            {coin} (Grid)
                          </span>
                          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                            Average + Grid (Layer 1)
                          </span>
                        </div>

                        {/* Middle: Amount, Cost, Floating PnL & Prices */}
                        <div className="grid grid-cols-2 gap-2 items-start">
                          <div>
                            <div className="font-extrabold text-slate-900 dark:text-white text-xs">
                              {pairClean} &rarr; {gridCoinAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {coin}
                            </div>
                            <div className="font-bold text-slate-800 dark:text-slate-200 text-xs mt-1">
                              {gridCostUsdt.toFixed(5)} USDT
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                              {gridDate}
                            </div>
                          </div>

                          <div className="text-right">
                            <div
                              className={`text-sm font-black ${
                                gridFloatingPnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {gridFloatingPnl >= 0 ? `+${gridFloatingPnl.toFixed(5)}` : gridFloatingPnl.toFixed(5)} USDT
                            </div>
                            <div
                              className={`text-xs font-bold mt-0.5 ${
                                gridRoiPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {gridRoiPct >= 0 ? `+${gridRoiPct.toFixed(2)}%` : `${gridRoiPct.toFixed(2)}%`}
                            </div>
                            <div className="text-xs font-extrabold text-teal-600 dark:text-[#00F0C8] mt-1">
                              {gridBuyPrice.toFixed(4)} &rarr; {currentPrice.toFixed(4)}
                            </div>
                          </div>
                        </div>

                        {/* Bottom: 3 Action Buttons (View, Info, Sell) */}
                        <div className="pt-2 border-t border-slate-300 dark:border-[#162740] grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenDetail(pos)}
                            className="py-1.5 px-2 rounded-lg bg-[#0099ff] hover:bg-[#0088ee] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>View</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenInfo(pos)}
                            className="py-1.5 px-2 rounded-lg bg-[#22c55e] hover:bg-[#16a34a] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                          >
                            <Info className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Info</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => void handleForceSell(pos)}
                            disabled={isSelling || !onForceTakeProfit}
                            className="py-1.5 px-2 rounded-lg bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <CreditCard className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Sell</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* VIEW MODE 2: TABLE LOG OF ALL ORDERS */}
      {viewMode === 'table' && (
        <div className="space-y-2">
          {filteredTrades.length === 0 ? (
            <div className="p-8 sm:p-12 rounded-2xl bg-[#08101D] border border-dashed border-[#1B2F4D] text-center space-y-3">
              <Layers className="w-10 h-10 text-[#00F0C8] mx-auto opacity-70" />
              <h4 className="text-sm font-bold text-white font-mono">Belum Ada Riwayat Order Bursa</h4>
              <p className="text-xs font-mono text-slate-400 max-w-md mx-auto leading-relaxed">
                {hasExchangeConnection
                  ? `Bursa ${connectedExchange?.exchange} (${connectedExchange?.isSandbox ? 'Testnet' : 'Live'}) terhubung melalui server. Belum ada fill pada riwayat exchange yang tersinkron.`
                  : 'Hubungkan API Key bursa untuk menyinkronkan catatan transaksi riil.'}
              </p>
              {hasExchangeConnection ? (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={onSyncExchangeTrades}
                    disabled={isSyncing}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 text-xs font-mono font-bold transition cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Menyinkronkan dari Bursa...' : 'Tarik Riwayat dari Bursa Sekarang'}</span>
                  </button>
                </div>
              ) : (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={onOpenApiKeyModal}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#00F0C8] hover:bg-[#00D0AD] text-slate-950 text-xs font-mono font-bold transition cursor-pointer"
                  >
                    <span>Hubungkan API Bursa</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            filteredTrades.map((t, idx) => {
              const isBuy = t.side === 'buy';
              const formattedDate = new Date(t.timestamp).toLocaleString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });

              return (
                <div
                  key={`${t.id || 'trade'}-${t.timestamp || ''}-${idx}`}
                  className="p-3 rounded-xl bg-[#08101D] border border-[#14233A] hover:border-[#1E365C] transition flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs font-mono"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                        isBuy
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-[#00F0C8]/10 text-[#00F0C8] border border-[#00F0C8]/20'
                      }`}
                    >
                      {isBuy ? (
                        <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-[#00F0C8]" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <CoinLogo coin={t.symbol} size="xs" />
                        <span className="font-bold text-white">{t.symbol}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                            isBuy
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                              : 'bg-[#00F0C8]/15 text-[#00F0C8] border border-[#00F0C8]/30'
                          }`}
                        >
                          {isBuy ? 'BUY' : 'SELL'}
                        </span>
                        {t.layerStep && (
                          <span className="px-1.5 py-0.2 rounded text-[9px] bg-[#142844] text-[#00F0C8]">
                            Step #{t.layerStep}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-slate-400 text-[10px] mt-1">
                        <span>{formattedDate}</span>
                        <span>·</span>
                        <span>Member: {t.memberId || wallet.memberId}</span>
                        <span>·</span>
                        <span>ID: {t.orderId?.substring(0, 10) || t.id.substring(0, 10)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-5 pt-2 md:pt-0 border-t md:border-t-0 border-[#121E31]">
                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase">Harga</span>
                      <span className="font-bold text-white">${t.price.toFixed(4)}</span>
                    </div>

                    <div>
                      <span className="text-[9px] text-slate-500 block uppercase">Jumlah</span>
                      <span className="text-slate-300">{t.amount}</span>
                    </div>

                    <div className="text-right min-w-[80px]">
                      <span className="text-[9px] text-slate-500 block uppercase">Total</span>
                      <span className="font-bold text-white block">${t.costUsdt.toFixed(2)} USDT</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {hasMoreTrades && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={onLoadMoreTrades}
            disabled={isLoadingMoreTrades}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0E1A2C] border border-[#182B48] text-xs text-slate-300 hover:bg-[#142640] disabled:opacity-50"
          >
            {isLoadingMoreTrades && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {isLoadingMoreTrades ? 'Memuat...' : 'Muat trade lebih lama'}
          </button>
        </div>
      )}

      {/* Trade Detail Modal (Image 1) */}
      <TradeDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        position={selectedPositionForDetail}
        onForceTakeProfit={onForceTakeProfit}
        onCloseLayer={onCloseLayer}
      />

      {/* Trade Info Modal (Image 2) */}
      <TradeInfoModal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        position={selectedPositionForInfo}
        onOpenSettings={onOpenMatrixModal}
      />
    </div>
  );
};
