# Release Manifest — GAIN NiagaKoin v2.2

Release: 2.4.16 / v2.2 hardening package

Primary change: Resend email/OTP delivery hardening.

Source checks:
- parser: 125 TS/TSX files, 0 parse diagnostics
- email helper present
- email preflight present
- email OTP idempotency present
- source release gate extended for email hardening

External status:
- local Mac build/test must be rerun
- Resend sender-domain verification required
- real Gmail delivery test required
