import dotenv from 'dotenv';

dotenv.config();

const apiKey = String(process.env.RESEND_API_KEY || '').trim();
const from = String(process.env.RESEND_FROM || process.env.SMTP_FROM || '').trim();

function senderDomain(value) {
  const address = (value.match(/<([^>]+)>/)?.[1] || value).trim().toLowerCase();
  const at = address.lastIndexOf('@');
  return at > 0 ? address.slice(at + 1) : '';
}

if (!apiKey || !from) {
  console.log(JSON.stringify({
    ok: false,
    status: 'BLOCKED',
    code: 'EMAIL_DELIVERY_NOT_CONFIGURED',
    apiKeyConfigured: Boolean(apiKey),
    fromConfigured: Boolean(from),
  }, null, 2));
  process.exit(1);
}

const domain = senderDomain(from);
try {
  const response = await fetch('https://api.resend.com/domains', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    console.log(JSON.stringify({
      ok: false,
      status: 'BLOCKED',
      code: response.status === 401 ? 'RESEND_API_KEY_REJECTED' : 'RESEND_DOMAINS_LOOKUP_FAILED',
      httpStatus: response.status,
      fromDomain: domain,
      providerMessage: typeof body?.message === 'string' ? body.message : undefined,
    }, null, 2));
    process.exit(1);
  }

  const domains = Array.isArray(body?.data) ? body.data : [];
  const match = domains.find((item) => String(item?.name || '').toLowerCase() === domain);
  const verified = Boolean(match && ['verified', 'active'].includes(String(match?.status || '').toLowerCase()));

  console.log(JSON.stringify({
    ok: verified,
    status: verified ? 'PASS' : 'BLOCKED',
    code: verified ? 'RESEND_SENDER_DOMAIN_VERIFIED' : 'RESEND_SENDER_NOT_ALLOWED',
    fromDomain: domain,
    domainFound: Boolean(match),
    domainStatus: match?.status || null,
    configuredSender: from.replace(/([^<\s]+)@([^>\s]+)/, (_m, local, d) => `${local}@${d}`),
  }, null, 2));
  process.exit(verified ? 0 : 1);
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    status: 'BLOCKED',
    code: 'RESEND_PREFLIGHT_NETWORK_ERROR',
    message: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
}
