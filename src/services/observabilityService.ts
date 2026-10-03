import type { Metric } from 'web-vitals';
import { submitClientEvent, submitWebVital, type ClientObservabilityEvent } from '../api/observabilityApi';

export function reportClientEvent(
  event: ClientObservabilityEvent,
  attributes: Record<string, string | number | boolean> = {}
): void {
  void submitClientEvent({ event, attributes }).catch(() => {});
}

export function reportWebVital(metric: Metric): void {
  if (!['CLS', 'FCP', 'INP', 'LCP', 'TTFB'].includes(metric.name)) return;
  void submitWebVital({
    name: metric.name as 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB',
    value: metric.value,
    rating: metric.rating,
    id: metric.id,
  }).catch(() => {});
}

export function initClientObservability(): void {
  window.addEventListener('error', (event) => {
    reportClientEvent('client.render.error', {
      errorName: event.error instanceof Error ? event.error.name : 'Error',
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportClientEvent('client.unhandled.rejection', {
      errorName: event.reason instanceof Error ? event.reason.name : 'UnhandledRejection',
    });
  });
}
