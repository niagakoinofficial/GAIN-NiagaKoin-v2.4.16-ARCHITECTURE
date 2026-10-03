import { createHash } from 'node:crypto';

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
};

export type EmailDeliveryFailureCode =
  | 'EMAIL_DELIVERY_NOT_CONFIGURED'
  | 'RESEND_API_KEY_REJECTED'
  | 'RESEND_SENDER_NOT_ALLOWED'
  | 'EMAIL_PROVIDER_RATE_LIMITED'
  | 'EMAIL_DELIVERY_FAILED';

export class EmailDeliveryError extends Error {
  readonly code: EmailDeliveryFailureCode;
  readonly status: number;
  readonly providerCode?: string;
  readonly providerMessage?: string;

  constructor(input: {
    code: EmailDeliveryFailureCode;
    status: number;
    message: string;
    providerCode?: string;
    providerMessage?: string;
  }) {
    super(input.message);
    this.name = 'EmailDeliveryError';
    this.code = input.code;
    this.status = input.status;
    this.providerCode = input.providerCode;
    this.providerMessage = input.providerMessage;
  }
}

function getFromAddress(): string {
  return String(process.env.RESEND_FROM || process.env.SMTP_FROM || '').trim();
}

function getFromDomain(from: string): string {
  const match = from.match(/<([^>]+)>/);
  const address = (match?.[1] || from).trim().toLowerCase();
  const at = address.lastIndexOf('@');
  return at > 0 ? address.slice(at + 1) : '';
}

export function getEmailDeliveryConfig() {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  const from = getFromAddress();
  return {
    provider: 'resend' as const,
    configured: Boolean(apiKey && from),
    apiKeyConfigured: Boolean(apiKey),
    fromConfigured: Boolean(from),
    fromDomain: getFromDomain(from),
    from,
  };
}

function safeProviderError(payload: unknown): { name?: string; message?: string } {
  if (!payload || typeof payload !== 'object') return {};
  const value = payload as Record<string, unknown>;
  return {
    name: typeof value.name === 'string' ? value.name.slice(0, 96) : undefined,
    message: typeof value.message === 'string' ? value.message.slice(0, 300) : undefined,
  };
}

export async function sendTransactionalEmail(email: TransactionalEmail): Promise<{ id?: string }> {
  const config = getEmailDeliveryConfig();
  if (!config.configured) {
    throw new EmailDeliveryError({
      code: 'EMAIL_DELIVERY_NOT_CONFIGURED',
      status: 503,
      message: 'Email delivery is not configured.',
    });
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': email.idempotencyKey,
    },
    body: JSON.stringify({
      from: config.from,
      to: [email.to],
      subject: email.subject,
      text: email.text,
    }),
  });

  if (!response.ok) {
    const providerError = safeProviderError(await response.json().catch(() => null));
    let code: EmailDeliveryFailureCode = 'EMAIL_DELIVERY_FAILED';
    let status = 502;

    if (response.status === 401) {
      code = 'RESEND_API_KEY_REJECTED';
      status = 503;
    } else if (response.status === 403) {
      code = 'RESEND_SENDER_NOT_ALLOWED';
      status = 503;
    } else if (response.status === 429) {
      code = 'EMAIL_PROVIDER_RATE_LIMITED';
      status = 503;
    }

    throw new EmailDeliveryError({
      code,
      status,
      message: providerError.message || 'Email provider rejected the verification message.',
      providerCode: providerError.name,
      providerMessage: providerError.message,
    });
  }

  const data = await response.json().catch(() => null) as { id?: unknown } | null;
  return { id: typeof data?.id === 'string' ? data.id : undefined };
}

export function buildEmailIdempotencyKey(kind: 'email-verification' | 'login-verification', uid: string, sentAt: number, code: string): string {
  const digest = createHash('sha256').update(`${kind}|${uid}|${sentAt}|${code}`).digest('hex').slice(0, 40);
  return `${kind}/${uid}/${sentAt}/${digest}`;
}
