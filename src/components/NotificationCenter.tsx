import { useMemo, useState } from 'react';
import { Bell, CheckCheck, CircleAlert, Info, ShieldAlert, Sparkles, X } from 'lucide-react';
import {
  buildOperationalNotifications,
  getUnreadOperationalNotifications,
  markAllOperationalNotificationsRead,
  markOperationalNotificationRead,
  type OperationalBotSnapshot,
  type OperationalNotificationSeverity,
} from '../utils/operationalNotifications';

interface NotificationCenterProps {
  bots?: OperationalBotSnapshot[];
  activePriceAlertsCount?: number;
  onOpenTrading?: () => void;
}

const severityStyle: Record<OperationalNotificationSeverity, string> = {
  critical: 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-300',
  warning: 'border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-300',
  info: 'border-sky-500/30 bg-sky-500/5 text-sky-600 dark:text-sky-300',
  success: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300',
};

function SeverityIcon({ severity }: { severity: OperationalNotificationSeverity }) {
  if (severity === 'critical') return <ShieldAlert className="w-3.5 h-3.5" />;
  if (severity === 'warning') return <CircleAlert className="w-3.5 h-3.5" />;
  if (severity === 'success') return <Sparkles className="w-3.5 h-3.5" />;
  return <Info className="w-3.5 h-3.5" />;
}

export function NotificationCenter({ bots = [], activePriceAlertsCount = 0, onOpenTrading }: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [, setRefresh] = useState(0);
  const notifications = useMemo(() => buildOperationalNotifications(bots, activePriceAlertsCount), [bots, activePriceAlertsCount]);
  const unread = getUnreadOperationalNotifications(notifications);

  const refresh = () => setRefresh((value) => value + 1);
  const markAllRead = () => {
    markAllOperationalNotificationsRead(notifications);
    refresh();
  };
  const handleRead = (readKey: string) => {
    markOperationalNotificationRead(readKey);
    refresh();
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative w-9 h-9 rounded-full bg-slate-100 dark:bg-[#111C2E] border border-slate-200 dark:border-[#1E2E44] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:text-sky-500 hover:border-sky-400/40 transition cursor-pointer"
        title="Pusat notifikasi operasional"
        aria-label="Pusat notifikasi operasional"
      >
        <Bell className="w-4 h-4" />
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white font-bold text-[9.5px] flex items-center justify-center leading-none shadow-xs font-mono">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-slate-950/30 backdrop-blur-[1px] z-40 sm:hidden" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-3 top-14 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[390px] bg-white dark:bg-[#09111E] border border-slate-200 dark:border-[#162942] rounded-2xl shadow-2xl z-50 overflow-hidden">
            <div className="px-3.5 py-3 border-b border-slate-100 dark:border-[#142236] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-sky-500" />
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">Notifikasi Operasional</div>
                  <div className="text-[9px] text-slate-500">Recovery, runner, order, dan sistem</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {unread.length > 0 && (
                  <button type="button" onClick={markAllRead} className="px-2 py-1 rounded-lg text-[9px] font-semibold text-sky-600 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-500/10 flex items-center gap-1 cursor-pointer">
                    <CheckCheck className="w-3 h-3" /> Baca semua
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)} className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center cursor-pointer" aria-label="Tutup notifikasi">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="max-h-[430px] overflow-y-auto p-2.5 space-y-2">
              {notifications.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">Belum ada notifikasi operasional.</div>
              ) : notifications.map((item) => {
                const isUnread = unread.some((candidate) => candidate.readKey === item.readKey);
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      handleRead(item.readKey);
                      if (item.botId && onOpenTrading) onOpenTrading();
                    }}
                    className={`w-full text-left rounded-xl border p-2.5 transition ${severityStyle[item.severity]} ${isUnread ? 'ring-1 ring-sky-500/10' : 'opacity-75'}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5 shrink-0"><SeverityIcon severity={item.severity} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[10px] font-bold">{item.title}</span>
                          {isUnread && <span className="w-1.5 h-1.5 rounded-full bg-sky-500 shrink-0 mt-1" />}
                        </div>
                        <p className="text-[9px] leading-relaxed mt-0.5 opacity-85">{item.message}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
