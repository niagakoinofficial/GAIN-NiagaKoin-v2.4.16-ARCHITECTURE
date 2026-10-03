# GAIN NiagaKoin v2.2 — Email Delivery Hardening

## Incident

During local authenticated registration/login with a different Gmail account, the UI reached the OTP/security verification modal but Resend rejected the configured sender. Runtime evidence showed:

- `403 validation_error` from Resend
- `RESEND_SENDER_NOT_ALLOWED`
- `/api/auth/send-verification-code` returned `503`
- `/api/auth/send-login-code` returned `502`

The recipient Gmail address was not the root cause.

## Root cause

`RESEND_FROM` / `SMTP_FROM` pointed to a sender address that Resend did not allow for the configured account/domain. Resend's current guidance requires the sender to match a verified domain for production sending.

## Implemented

1. Centralized Resend delivery helper: `src/server/emailDelivery.ts`.
2. Both email OTP flows use the helper:
   - registration/email verification
   - login/session verification
3. Resend `Idempotency-Key` is included for each OTP send attempt.
4. Provider failures are classified:
   - `RESEND_API_KEY_REJECTED`
   - `RESEND_SENDER_NOT_ALLOWED`
   - `EMAIL_PROVIDER_RATE_LIMITED`
   - `EMAIL_DELIVERY_NOT_CONFIGURED`
   - generic provider failure
5. UI now maps these errors to actionable messages.
6. UI no longer claims an OTP was sent when delivery failed.
7. Added `npm run test:email` sender-domain preflight.
8. Added `src/server/emailDelivery.test.ts`.
9. Public-readiness source gate checks email hardening and preflight tooling.
10. `.env.example` documents the required Resend sender configuration.

## External prerequisite

Source changes cannot verify ownership of a sender domain. Before Gmail delivery can succeed:

- `RESEND_API_KEY` must be valid.
- `RESEND_FROM` must use a sender address on a Resend-verified domain.
- DNS/domain verification must be completed in Resend.

Do not paste the Resend API key into chat or commit it to git.
