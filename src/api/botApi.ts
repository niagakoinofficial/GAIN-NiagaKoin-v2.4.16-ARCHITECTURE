import { postJson, getJson } from './httpClient';
import { auth } from '../firebase';

async function getBotAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesi Firebase diperlukan untuk mengelola bot.');
  return user.getIdToken();
}

export async function registerBackgroundBot(payload: Record<string, unknown>) {
  return postJson<Record<string, any>>('/api/bot/register', payload, undefined, await getBotAuthToken());
}

export async function deleteBackgroundBot(botId: string) {
  return postJson<Record<string, any>>('/api/bot/delete', { botId }, undefined, await getBotAuthToken());
}

export async function storeBotCredentials(credentials: {
  exchange: string;
  apiKey: string;
  secret: string;
  password?: string;
  isSandbox: boolean;
}) {
  return postJson<Record<string, any>>('/api/bot/credentials', credentials, undefined, await getBotAuthToken());
}

export async function getExchangeCredentialHistory(exchange?: string) {
  const query = exchange ? `?exchange=${encodeURIComponent(exchange)}` : '';
  return getJson<Record<string, any>>(`/api/bot/credentials/history${query}`, await getBotAuthToken());
}

export async function disconnectBotExchange(exchange: string) {
  return postJson<Record<string, any>>('/api/bot/disconnect-exchange', { exchange }, undefined, await getBotAuthToken());
}

export async function activateBotKillSwitch() {
  return postJson<Record<string, any>>('/api/bot/kill-switch', {}, undefined, await getBotAuthToken());
}

export async function getBotEngineStatus() {
  return getJson<Record<string, any>>('/api/bot/engine-status', await getBotAuthToken());
}

export async function setBotStatus(
  botId: string,
  status: 'active' | 'paused',
) {
  return postJson<Record<string, any>>(
    '/api/bot/status',
    { botId, status },
    undefined,
    await getBotAuthToken(),
  );
}


export async function forceTakeProfit(botId: string, pair: string, quantity?: number, layerId?: string) {
  return postJson<Record<string, any>>(
    '/api/bot/force-take-profit',
    { botId, pair, quantity, layerId },
    undefined,
    await getBotAuthToken(),
  );
}

export async function reconcileBot(botId: string) {
  return postJson<Record<string, any>>(
    '/api/bot/reconcile',
    { botId },
    undefined,
    await getBotAuthToken(),
  );
}

export async function pauseAllBots() {
  return postJson<Record<string, any>>(
    '/api/bot/pause-all',
    {},
    undefined,
    await getBotAuthToken(),
  );
}

export async function resumeAllBots() {
  return postJson<Record<string, any>>(
    '/api/bot/resume-all',
    {},
    undefined,
    await getBotAuthToken(),
  );
}
