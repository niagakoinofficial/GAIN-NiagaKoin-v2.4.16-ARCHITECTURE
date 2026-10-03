export interface ApiErrorPayload {
  success?: false;
  error?: string;
  code?: string;
  category?: string;
  requestId?: string;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly category?: string;
  readonly requestId?: string;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.error || 'Permintaan ke server gagal.');
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = payload.code;
    this.category = payload.category;
    this.requestId = payload.requestId;
  }
}

function notifySecurityElevationRequired(error: ApiRequestError): void {
  if (error.code !== 'SESSION_ELEVATION_REQUIRED' || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('gain:security-elevation-required', {
    detail: { message: error.message, requestId: error.requestId },
  }));
}

export async function postJson<T>(url: string, body: unknown, signal?: AbortSignal, authorizationToken?: string, extraHeaders?: Record<string,string>): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authorizationToken) headers.Authorization = `Bearer ${authorizationToken}`;
  if (extraHeaders) Object.assign(headers, extraHeaders);
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
  });

  const payload = await response.json().catch(() => null) as (T & ApiErrorPayload) | null;
  if (!response.ok || payload?.success === false) {
    const error = new ApiRequestError(response.status, payload || {});
    notifySecurityElevationRequired(error);
    throw error;
  }

  if (!payload) {
    throw new ApiRequestError(response.status, { error: 'Respons server tidak valid.' });
  }

  return payload;
}

export async function getJson<T>(url: string, authorizationToken?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (authorizationToken) headers.Authorization = `Bearer ${authorizationToken}`;
  const response = await fetch(url, { method: 'GET', headers, cache: 'no-store', credentials: 'same-origin' });
  const payload = await response.json().catch(() => null) as (T & ApiErrorPayload) | null;
  if (!response.ok || payload?.success === false) {
    const error = new ApiRequestError(response.status, payload || {});
    notifySecurityElevationRequired(error);
    throw error;
  }
  if (!payload) throw new ApiRequestError(response.status, { error: 'Respons server tidak valid.' });
  return payload;
}
