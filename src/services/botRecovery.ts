export const STARTUP_AUTO_RESUME_CONFIRM = 'I_UNDERSTAND_STARTUP_AUTO_RESUME';

export type BotRecoveryState = 'HEALTHY' | 'RECONCILIATION_PENDING' | 'STARTUP_RESUME_REQUIRED' | 'ORDER_STATUS_UNCERTAIN' | 'ERROR';

export interface BotRecoveryInput {
  status: 'active' | 'paused' | 'error';
  lastErrorReason?: string;
  resumeAfterReconciliation?: boolean;
  pendingOrder?: { status?: 'submitting' | 'reconciling' | 'unknown' | 'filled' } | undefined;
}

export interface BotRecoveryStatus {
  state: BotRecoveryState;
  label: string;
  message: string;
}


export function isStartupAutoResumeEnabled(envValue?: string, confirmationValue?: string): boolean {
  return envValue === 'true' && confirmationValue === STARTUP_AUTO_RESUME_CONFIRM;
}

export function getBotRecoveryStatus(bot: BotRecoveryInput): BotRecoveryStatus {
  if (bot.pendingOrder?.status === 'submitting' || bot.pendingOrder?.status === 'unknown' || bot.pendingOrder?.status === 'reconciling') {
    return {
      state: 'ORDER_STATUS_UNCERTAIN',
      label: 'ORDER STATUS UNCERTAIN',
      message: 'Bot ditahan karena status order terakhir belum dapat dipastikan. Jangan membuat order baru.',
    };
  }
  if (bot.resumeAfterReconciliation === true) {
    return {
      state: 'RECONCILIATION_PENDING',
      label: 'RECONCILIATION PENDING',
      message: 'Bot menunggu pemeriksaan balance exchange dan open orders sebelum dapat dilanjutkan.',
    };
  }
  if (bot.lastErrorReason === 'STARTUP_RESUME_REQUIRED') {
    return {
      state: 'STARTUP_RESUME_REQUIRED',
      label: 'STARTUP RESUME REQUIRED',
      message: 'Bot sudah direkonsiliasi setelah restart, tetapi tetap ditahan. Tekan Resume secara eksplisit untuk mengizinkan trading kembali.',
    };
  }
  if (bot.status === 'error') {
    return {
      state: 'ERROR',
      label: bot.lastErrorReason || 'RUNNER ERROR',
      message: 'Runner berada pada status error dan tetap ditahan sampai penyebabnya terselesaikan.',
    };
  }
  return {
    state: 'HEALTHY',
    label: 'HEALTHY',
    message: 'Tidak ada recovery gate aktif pada runner.',
  };
}
