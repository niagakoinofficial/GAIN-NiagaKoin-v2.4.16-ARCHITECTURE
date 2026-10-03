import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  Users,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  DollarSign,
  Fuel,
  TrendingUp,
} from 'lucide-react';
import { subscribeToMemberDirectory } from '../../services/memberService';
import type { DirectoryMember } from '../../services/memberService';
import { formatUsdt } from '../../utils/formatters';

interface AdminUserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminUserManagementModal({ isOpen, onClose }: AdminUserManagementModalProps) {
  const [members, setMembers] = useState<DirectoryMember[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'non-active'>('all');

  useEffect(() => {
    if (!isOpen) return;
    setLoadError(false);
    return subscribeToMemberDirectory(setMembers, () => {
      setMembers([]);
      setLoadError(true);
    });
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.memberId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.emailMasked.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || m.accountStatus === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="theme-modal-shell w-full max-w-4xl bg-[#0F172A] border border-amber-500/40 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white font-mono">Super Admin: User Management Vault</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 font-mono">
                  MASTER AUDIT
                </span>
              </div>
              <p className="text-xs text-slate-400 font-sans mt-0.5">
                Monitoring & Pengelolaan Seluruh Direktori Member & Investor GAIN Ecosystem
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="p-4 bg-slate-950/50 border-b border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, ID, atau email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-400 font-mono"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto font-mono text-xs">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterStatus === 'all'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Semua ({members.length})
            </button>
            <button
              onClick={() => setFilterStatus('active')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterStatus === 'active'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Aktif ({members.filter((m) => m.accountStatus === 'active').length})
            </button>
            <button
              onClick={() => setFilterStatus('non-active')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterStatus === 'non-active'
                  ? 'bg-rose-500 text-white'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              Non-Aktif ({members.filter((m) => m.accountStatus === 'non-active').length})
            </button>
          </div>
        </div>

        {/* Member Table */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {loadError && (
              <p className="py-5 text-center text-xs text-rose-300">Direktori tidak dapat dimuat. Periksa aturan akses Firestore.</p>
            )}
            {!loadError && filteredMembers.length === 0 && (
              <p className="py-5 text-center text-xs text-slate-400">Belum ada data member di direktori.</p>
            )}
            {filteredMembers.map((member) => {
              const isActive = member.accountStatus === 'active';
              return (
                <div
                  key={member.memberId}
                  className="p-3.5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-amber-400 font-mono shrink-0">
                      {member.memberId.slice(-3)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{member.username}</span>
                        <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                          {member.memberId}
                        </span>
                        {member.role === 'admin' && (
                          <span className="text-[9px] text-cyan-300 font-bold bg-cyan-500/20 px-1.5 py-0.5 rounded">
                            ADMIN
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>{member.emailMasked}</span>
                        <span>•</span>
                        <span>Sponsor: {member.sponsorId || 'GAIN Foundation'}</span>
                        <span>•</span>
                        <span>Bergabung: {member.joinedAt}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                        isActive
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      }`}
                    >
                      {isActive ? 'Aktif (Berbayar)' : 'Non-Aktif (Unpaid)'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs font-mono text-slate-400">
          <span>Total Database: {members.length} Member Terdaftar</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition cursor-pointer"
          >
            Tutup Panel Admin
          </button>
        </div>
      </div>
    </div>
  );
}
