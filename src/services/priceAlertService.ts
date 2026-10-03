import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { PriceAlert } from '../types';
import { isDemoMode } from '../config/appMode';
import { sendBrowserNotification, playAlertChime } from './notificationService';
import { formatUsdt } from '../utils/formatters';

const LOCAL_STORAGE_KEY = 'gain_price_alerts_v1';

function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as Partial<T>;
}

function thresholdMet(alert: PriceAlert, currentPrice: number): boolean {
  return alert.condition === 'above'
    ? currentPrice >= alert.targetPrice
    : currentPrice <= alert.targetPrice;
}


/**
 * Get cached local alerts fallback
 */
export function getLocalPriceAlerts(): PriceAlert[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save cached local alerts
 */
export function setLocalPriceAlerts(alerts: PriceAlert[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(alerts));
  } catch {
    // Ignore storage quota error
  }
}

/**
 * Subscribe to real-time Price Alerts from Firestore (or LocalStorage fallback)
 */
export function subscribeToPriceAlerts(
  userId: string | null | undefined,
  onUpdate: (alerts: PriceAlert[]) => void
): () => void {
  if (isDemoMode && (!userId || auth.currentUser?.uid !== userId)) {
    onUpdate(getLocalPriceAlerts());
    return () => {};
  }
  if (!userId || auth.currentUser?.uid !== userId) {
    onUpdate([]);
    return () => {};
  }

  const alertsCol = collection(db, 'users', userId, 'price_alerts');
  return onSnapshot(
    alertsCol,
    (snapshot) => {
      const alerts: PriceAlert[] = [];
      snapshot.forEach((docSnap) => {
        alerts.push(docSnap.data() as PriceAlert);
      });
      alerts.sort((a, b) => b.createdAt - a.createdAt);
      setLocalPriceAlerts(alerts);
      onUpdate(alerts);
    },
    (err) => {
      console.error('[PRICE_ALERT_SUBSCRIPTION_FAILED]', err);
      // Keep the last local projection visible during a transient Firestore error.
      // Cloud remains authoritative; this avoids a misleading empty alert list.
      onUpdate(getLocalPriceAlerts());
    }
  );
}

function useLocalDemoAlerts(userId: string | null | undefined): boolean {
  return isDemoMode && (!userId || auth.currentUser?.uid !== userId);
}

function requireFirebaseUser(userId: string | null | undefined): asserts userId is string {
  if (!userId || !auth.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Login Firebase diperlukan untuk menyimpan Price Alert ke cloud.');
  }
}

/**
 * Add or update a price alert in Firestore & local cache
 */
export async function savePriceAlert(
  userId: string | null | undefined,
  alert: PriceAlert
): Promise<void> {
  if (useLocalDemoAlerts(userId)) {
    const currentLocal = getLocalPriceAlerts().filter((item) => item.id !== alert.id);
    setLocalPriceAlerts([alert, ...currentLocal]);
    return;
  }

  requireFirebaseUser(userId);
  const alertRef = doc(db, 'users', userId, 'price_alerts', alert.id);
  await setDoc(alertRef, stripUndefined({ ...alert, userId }), { merge: true });
  const currentLocal = getLocalPriceAlerts().filter((item) => item.id !== alert.id);
  setLocalPriceAlerts([alert, ...currentLocal]);
}

/**
 * Delete a price alert
 */
export async function deletePriceAlert(
  userId: string | null | undefined,
  alertId: string
): Promise<void> {
  if (useLocalDemoAlerts(userId)) {
    setLocalPriceAlerts(getLocalPriceAlerts().filter((alert) => alert.id !== alertId));
    return;
  }

  requireFirebaseUser(userId);
  const alertRef = doc(db, 'users', userId, 'price_alerts', alertId);
  await deleteDoc(alertRef);
  setLocalPriceAlerts(getLocalPriceAlerts().filter((alert) => alert.id !== alertId));
}

/**
 * Update a price alert status / properties
 */
export async function updatePriceAlert(
  userId: string | null | undefined,
  alertId: string,
  updates: Partial<PriceAlert>
): Promise<void> {
  if (useLocalDemoAlerts(userId)) {
    setLocalPriceAlerts(getLocalPriceAlerts().map((alert) =>
      alert.id === alertId ? { ...alert, ...updates } : alert
    ));
    return;
  }

  requireFirebaseUser(userId);
  const alertRef = doc(db, 'users', userId, 'price_alerts', alertId);
  await updateDoc(alertRef, stripUndefined({ ...updates, userId }));
  setLocalPriceAlerts(getLocalPriceAlerts().map((alert) =>
    alert.id === alertId ? { ...alert, ...updates } : alert
  ));
}

/**
 * Evaluate price alerts against real-time tickers and trigger notifications
 */
export function checkPriceAlerts(
  alerts: PriceAlert[],
  currentPrices: Record<string, number>,
  userId: string | null | undefined,
  onTriggered?: (alert: PriceAlert, triggeredPrice: number) => void
): PriceAlert[] {
  let hasChanges = false;
  const updatedAlerts = alerts.map((alert) => {
    if (alert.status !== 'active') return alert;

    const currentPrice = currentPrices[alert.symbol];
    if (typeof currentPrice !== 'number' || currentPrice <= 0) return alert;

    const isTriggered = thresholdMet(alert, currentPrice);

    // Repeating alert is edge-triggered: fire once while inside the threshold,
    // then re-arm only after price moves back outside the threshold.
    if (alert.isRepeating && alert.notificationSent && isTriggered) {
      return alert;
    }

    if (!isTriggered) {
      if (alert.isRepeating && alert.notificationSent) {
        const rearmed: PriceAlert = { ...alert, notificationSent: false };
        updatePriceAlert(userId, alert.id, { notificationSent: false }).catch((error) =>
          console.error('[PRICE_ALERT_REARM_FAILED]', error)
        );
        return rearmed;
      }
      return alert;
    }

    if (isTriggered) {
      hasChanges = true;
      const triggeredAt = Date.now();
      const updated: PriceAlert = {
        ...alert,
        status: alert.isRepeating ? 'active' : 'triggered',
        triggeredAt,
        triggeredPrice: currentPrice,
        notificationSent: true,
      };

      // 1. Play pleasant audio chime
      playAlertChime();

      // 2. Send native browser notification
      const conditionText =
        alert.condition === 'above' ? 'naik melampaui' : 'turun menembus';
      const title = `🚨 Target Harga ${alert.symbol}: $${formatUsdt(currentPrice)}!`;
      const body = `Harga ${alert.symbol} telah ${conditionText} target Anda ($${formatUsdt(alert.targetPrice)}). Waktu: ${new Date(triggeredAt).toLocaleTimeString('id-ID')}.`;

      sendBrowserNotification(title, {
        body,
        tag: `price-alert-${alert.id}`,
      });

      // 3. Callback for in-app toast / banner
      if (onTriggered) {
        onTriggered(updated, currentPrice);
      }

      // 4. Update in Firestore / LocalStorage
      updatePriceAlert(userId, alert.id, {
        status: updated.status,
        triggeredAt,
        triggeredPrice: currentPrice,
        notificationSent: true,
      }).catch((error) => console.error('[PRICE_ALERT_UPDATE_FAILED]', error));

      return updated;
    }

    return alert;
  });

  return hasChanges ? updatedAlerts : alerts;
}
