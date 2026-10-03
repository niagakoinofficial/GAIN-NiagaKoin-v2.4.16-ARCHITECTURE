import { postJson } from './httpClient';

export type ClientObservabilityEvent =
  | 'auth.login.success'
  | 'auth.login.failed'
  | 'auth.logout.success'
  | 'auth.logout.failed'
  | 'auth.permission.changed'
  | 'auth.google.authenticated'
  | 'wallet.activation.completed'
  | 'bot.manual_layer_close.completed'
  | 'wallet.deposit.verified'
  | 'wallet.withdraw.submitted'
  | 'wallet.transfer.completed'
  | 'admin.action.attempted'
  | 'exchange.error'
  | 'client.render.error'
  | 'client.unhandled.rejection';

export interface ClientEventPayload {
  event: ClientObservabilityEvent;
  attributes?: Record<string, string | number | boolean>;
}

export interface WebVitalPayload {
  name: 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  id: string;
}

export function submitClientEvent(payload: ClientEventPayload) {
  return postJson<{ success: true }>('/api/observability/client-event', payload);
}

export function submitWebVital(payload: WebVitalPayload) {
  return postJson<{ success: true }>('/api/observability/web-vital', payload);
}
