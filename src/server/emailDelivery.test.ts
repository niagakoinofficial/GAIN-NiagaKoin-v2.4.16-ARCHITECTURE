import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmailIdempotencyKey, getEmailDeliveryConfig } from './emailDelivery';

const original = {
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_FROM: process.env.RESEND_FROM,
  SMTP_FROM: process.env.SMTP_FROM,
};

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('transactional email delivery', () => {
  it('requires both API key and sender address', () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    delete process.env.SMTP_FROM;
    assert.equal(getEmailDeliveryConfig().configured, false);

    process.env.RESEND_API_KEY = 're_test';
    process.env.RESEND_FROM = 'GAIN <no-reply@example.com>';
    const config = getEmailDeliveryConfig();
    assert.equal(config.configured, true);
    assert.equal(config.fromDomain, 'example.com');
  });

  it('builds stable idempotency keys for one email attempt', () => {
    const a = buildEmailIdempotencyKey('login-verification', 'uid-1', 123, '123456');
    const b = buildEmailIdempotencyKey('login-verification', 'uid-1', 123, '123456');
    const c = buildEmailIdempotencyKey('login-verification', 'uid-1', 124, '123456');
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(a, /^login-verification\/uid-1\/123\/[a-f0-9]{40}$/);
  });
});
