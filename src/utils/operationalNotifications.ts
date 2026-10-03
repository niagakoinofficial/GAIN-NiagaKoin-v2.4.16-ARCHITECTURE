export type OperationalNotificationSeverity = 'critical' | 'warning' | 'info' | 'success';
export type OperationalNotificationKind = 'order' | 'reconciliation' | 'runner' | 'price' | 'system';

export interface OperationalNotification {
  id: string;
  kind: OperationalNotificationKind;
  severity: OperationalNotificationSeverity;
  title: string;
  message: string;
  botId?: string;
  pair?: string;
  createdAt: number;
  readKey: string;
}

export interface OperationalBotSnapshot {
  id: string;
  botId?: string;
  botName?: string;
  pair: string;
  status: string;
  lastErrorReason?: string;
  resumeAfterReconciliation?: boolean;
  pendingOrderStatus?: 'submitting' | 'reconciling' | 'unknown' | 'filled' | null;
  recoveryState?: 'HEALTHY' | 'RECONCILIATION_PENDING' | 'STARTUP_RESUME_REQUIRED' | 'ORDER_STATUS_UNCERTAIN' | 'ERROR';
  recoveryLabel?: string;
  recoveryMessage?: string;
  lastReconciledAt?: number;
}

const READ_KEY = 'gain_operational_notifications_read_v1';

function readMap(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(READ_KEY) || '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function notificationId(parts: string[]): string {
  return parts.join('|').replace(/\s+/g, '_').slice(0, 180);
}

export function buildOperationalNotifications(
  bots: OperationalBotSnapshot[],
  activePriceAlertsCount = 0,
  now = Date.now(),
): OperationalNotification[] {
  const items: OperationalNotification[] = [];
  for (const bot of bots) {
    const base = [bot.id, bot.pair];
    if (bot.recoveryState === 'ORDER_STATUS_UNCERTAIN' || ['submitting', 'unknown', 'reconciling'].includes(String(bot.pendingOrderStatus))) {
      items.push({
        id: notificationId([...base, 'order-uncertain']),
        kind: 'order',
        severity: 'critical',
        title: `Order perlu verifikasi · ${bot.pair}`,
        message: bot.recoveryMessage || 'Status order belum pasti. Bot ditahan untuk mencegah duplicate order.',
        botId: bot.botId || bot.id,
        pair: bot.pair,
        createdAt: now,
        readKey: notificationId([...base, 'order-uncertain']),
      });
      continue;
    }
    if (bot.recoveryState === 'STARTUP_RESUME_REQUIRED') {
      items.push({
        id: notificationId([...base, 'startup-resume']),
        kind: 'runner',
        severity: 'warning',
        title: `Resume manual diperlukan · ${bot.pair}`,
        message: bot.recoveryMessage || 'Bot direkonsiliasi setelah restart tetapi tetap dijeda. Resume hanya dilakukan setelah Anda sengaja menekan Resume.',
        botId: bot.botId || bot.id,
        pair: bot.pair,
        createdAt: bot.lastReconciledAt || now,
        readKey: notificationId([...base, 'startup-resume']),
      });
      continue;
    }
    if (bot.recoveryState === 'RECONCILIATION_PENDING' || bot.resumeAfterReconciliation === true) {
      items.push({
        id: notificationId([...base, 'reconciliation']),
        kind: 'reconciliation',
        severity: 'warning',
        title: `Reconciliation tertunda · ${bot.pair}`,
        message: bot.recoveryMessage || 'Runner menunggu verifikasi balance dan open orders sebelum eksekusi dilanjutkan.',
        botId: bot.botId || bot.id,
        pair: bot.pair,
        createdAt: bot.lastReconciledAt || now,
        readKey: notificationId([...base, 'reconciliation']),
      });
      continue;
    }
    if (bot.recoveryState === 'ERROR' || bot.status === 'error') {
      items.push({
        id: notificationId([...base, 'error', bot.lastErrorReason || 'unknown']),
        kind: 'runner',
        severity: 'critical',
        title: `Runner error · ${bot.pair}`,
        message: bot.recoveryMessage || bot.lastErrorReason || 'Runner membutuhkan perhatian operasional.',
        botId: bot.botId || bot.id,
        pair: bot.pair,
        createdAt: now,
        readKey: notificationId([...base, 'error', bot.lastErrorReason || 'unknown']),
      });
    }
  }

  if (activePriceAlertsCount > 0) {
    items.push({
      id: 'price-alerts-active',
      kind: 'price',
      severity: 'info',
      title: `${activePriceAlertsCount} price alert aktif`,
      message: 'Target harga aktif sedang menunggu trigger.',
      createdAt: now,
      readKey: 'price-alerts-active',
    });
  }

  const healthNotices = bots.length > 0 && bots.every((bot) => bot.recoveryState === 'HEALTHY' || (!bot.recoveryState && bot.status === 'active'))
    ? [{
      id: 'system-runtime-healthy',
      kind: 'system' as const,
      severity: 'success' as const,
      title: 'Runtime bot sehat',
      message: `${bots.length} runner aktif tanpa recovery blocker.`,
      createdAt: now,
      readKey: 'system-runtime-healthy',
    }]
    : [];

  return [...items, ...healthNotices].sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
}

export function getUnreadOperationalNotifications(notifications: OperationalNotification[]): OperationalNotification[] {
  const read = readMap();
  return notifications.filter((item) => !read[item.readKey]);
}

export function markOperationalNotificationRead(readKey: string): void {
  if (typeof window === 'undefined') return;
  const read = readMap();
  read[readKey] = Date.now();
  window.localStorage.setItem(READ_KEY, JSON.stringify(read));
}

export function markAllOperationalNotificationsRead(notifications: OperationalNotification[]): void {
  if (typeof window === 'undefined') return;
  const read = readMap();
  for (const item of notifications) read[item.readKey] = Date.now();
  window.localStorage.setItem(READ_KEY, JSON.stringify(read));
}

export function clearOperationalNotificationReadState(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(READ_KEY);
}
