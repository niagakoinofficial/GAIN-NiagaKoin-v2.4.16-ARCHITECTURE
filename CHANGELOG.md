# Changelog

## 2.4.16 — Architecture 25

- Separated Firebase identity, member lifecycle, license entitlement, security elevation, and TOTP/2FA.
- Removed paid-user OTP as a dashboard/login gate.
- Added on-demand 24-hour security-session elevation for protected actions.
- Added independent server-side member/license gates.
- Added database constraints/indexes for Architecture 25 member/license status.
- Hardened startup recovery with fail-closed manual resume by default.
- Added multi-exchange certification stages and public-readiness source gates.
- Added deterministic local setup/doctor tooling for clean clones.
