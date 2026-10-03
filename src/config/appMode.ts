export const APP_MODE = (import.meta.env.VITE_APP_MODE || 'production').toLowerCase();
export const isDemoMode = APP_MODE === 'demo';

export function assertProductionSafeMode(): void {
  if (isDemoMode) {
    console.warn('[GAIN] Demo mode is active. Do not use this build for live public operations.');
  }
}
