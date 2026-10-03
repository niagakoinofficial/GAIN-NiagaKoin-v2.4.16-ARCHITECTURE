/**
 * GAIN Web Browser Notification and Audio Alert Service
 * Handles native browser desktop/mobile notifications, Web Audio API chimes,
 * and event-driven alerts for Price Targets, Layer Executions, and Take Profit events.
 */

import { formatUsdt } from '../utils/formatters';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';
export type AlertSoundType = 'alert' | 'layer' | 'takeprofit';

/**
 * Get current browser notification permission
 */
export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission as NotificationPermissionState;
}

/**
 * Request browser notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const perm = await Notification.requestPermission();
    return perm as NotificationPermissionState;
  } catch {
    return Notification.permission as NotificationPermissionState;
  }
}

/**
 * Play harmonic audio cues using standard Web Audio API
 */
export function playAlertChime(type: AlertSoundType = 'alert') {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    if (type === 'takeprofit') {
      // Celebratory ascending major arpeggio (C5 -> E5 -> G5 -> C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.2, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.5);
      });
    } else if (type === 'layer') {
      // Crisp mechanical order fill blip (E5 -> B5 -> E6 rapid affirmative tick)
      const notes = [659.25, 987.77, 1318.51];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);

        gain.gain.setValueAtTime(0.18, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.25);
      });
    } else {
      // Standard Price Alert dual-tone chime
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.setValueAtTime(880.00, now + 0.12); // A5
      osc1.frequency.setValueAtTime(1174.66, now + 0.24); // D6

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(293.66, now); // D4
      osc2.frequency.setValueAtTime(440.00, now + 0.12); // A4
      osc2.frequency.setValueAtTime(587.33, now + 0.24); // D5

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.65);
      osc2.stop(now + 0.65);
    }
  } catch {
    // Audio context may require prior user interaction on strict browsers
  }
}

/**
 * Send native browser system notification
 */
export function sendBrowserNotification(
  title: string,
  options?: {
    body?: string;
    icon?: string;
    tag?: string;
    data?: any;
    onClick?: () => void;
  }
): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    try {
      const notification = new Notification(title, {
        body: options?.body || 'Pemberitahuan dari GAIN Niaga Koin',
        icon: options?.icon || '/gain-logo.png',
        badge: '/gain-logo.png',
        tag: options?.tag,
        silent: false,
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
        if (options?.onClick) {
          options.onClick();
        }
      };

      return true;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Notify Price Alert trigger (audio + browser notification)
 */
export function notifyPriceAlert(
  symbol: string,
  condition: 'above' | 'below',
  targetPrice: number,
  currentPrice: number,
  onClick?: () => void
) {
  playAlertChime('alert');

  const conditionText = condition === 'above' ? 'naik melampaui' : 'turun menembus';
  const title = `🚨 Target Harga ${symbol}: $${formatUsdt(currentPrice)}!`;
  const body = `Harga ${symbol} telah ${conditionText} target Anda ($${formatUsdt(targetPrice)}). Jam: ${new Date().toLocaleTimeString('id-ID')}.`;

  sendBrowserNotification(title, {
    body,
    tag: `price-alert-${symbol}-${Date.now()}`,
    onClick,
  });
}

/**
 * Notify Layer Execution (audio + browser notification)
 */
export function notifyLayerExecution(data: {
  pair: string;
  coin?: string;
  layerStep: number;
  maxStep?: number;
  side?: string;
  price: number;
  amount: number;
  costUsdt: number;
  layerType?: string;
  onClick?: () => void;
}) {
  playAlertChime('layer');

  const coin = data.coin || data.pair.split('/')[0];
  const side = (data.side || 'BUY').toUpperCase();
  const maxStepText = data.maxStep ? ` / ${data.maxStep}` : '';
  const title = `🤖 Layer ${data.layerStep}${maxStepText} Tereksekusi: ${data.pair}`;
  const body = `Order ${side} terisi: ${data.amount} ${coin} @ $${formatUsdt(data.price)} (Total: $${data.costUsdt.toFixed(2)} USDT). Matrix aktif!`;

  sendBrowserNotification(title, {
    body,
    tag: `layer-exec-${data.pair}-${Date.now()}`,
    onClick: data.onClick,
  });
}

/**
 * Notify Take Profit Event (audio + browser notification)
 */
export function notifyTakeProfit(data: {
  pair: string;
  coin?: string;
  profitUsdt: number;
  roiPct: number;
  exitPrice?: number;
  isAuto?: boolean;
  onClick?: () => void;
}) {
  playAlertChime('takeprofit');

  const title = `🎉 Take Profit Tercapai: ${data.pair} (+${data.roiPct.toFixed(2)}%)!`;
  const exitText = data.exitPrice ? ` di harga $${formatUsdt(data.exitPrice)}` : '';
  const body = `Selamat! Posisi ${data.pair} ditutup profit +$${data.profitUsdt.toFixed(2)} USDT (+${data.roiPct.toFixed(2)}%)${exitText}. Saldo vault telah diperbarui.`;

  sendBrowserNotification(title, {
    body,
    tag: `tp-${data.pair}-${Date.now()}`,
    onClick: data.onClick,
  });
}
