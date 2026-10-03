# GAIN Niaga Koin v2.4.16 — Architecture 25 Implementation Report

## Final architecture implemented

1. **Identity** — Google/Firebase Authentication answers who the user is.
2. **Member lifecycle** — `users.status` / `memberStatus` answers whether the GAIN member account is usable (`active`, `suspended`, `closed`).
3. **License entitlement** — `licenses.status` / `licenseStatus` answers which paid entitlement the member owns (`none`, `active`, `suspended`, `expired`).
4. **Security session** — email 6-digit verification creates a 24-hour elevated security session on demand; it is no longer a dashboard/login gate.
5. **Transaction security** — TOTP/Google Authenticator remains separate for high-risk live transactions and micro-live certification.
6. **Resource/execution authorization** — live execution independently checks license, security session, exchange credential state, server runtime flags, and TOTP as applicable.

## User model

### User 2 — registered member, no license
- Can authenticate with Google and open the dashboard.
- Has `memberStatus=active`, `licenseStatus=none`.
- Does not receive a paid license entitlement merely by logging in.
- Non-licensed/test/sandbox features remain subject to their own route guards.

### User 1 — registered member, active license
- Can authenticate with Google and open the dashboard without an OTP gate.
- Has `memberStatus=active`, `licenseStatus=active`.
- Receives paid entitlement according to `licenseTier`/license metadata.
- Security verification is requested only when a protected action requires an elevated session.

## Code changes

- Removed the paid-user login/dashboard OTP gate from `src/App.tsx`.
- Added global `SESSION_ELEVATION_REQUIRED` handling in `src/api/httpClient.ts` so protected actions can open `SecurityVerificationModal` on demand.
- Added/retained security-session API in `src/api/authApi.ts` and server endpoints under `/api/security/*`.
- Kept legacy `/api/auth/send-login-code`, `/api/auth/verify-login-code`, and `/api/auth/session-status` aliases for rollout compatibility.
- Added server-side `requireActiveMember()` and kept `requireActiveLicense()` as independent authorization gates.
- Made live order execution independently require security session + active license + TOTP when live.
- Kept TOTP separate from the 24-hour email security session.
- Added explicit `memberStatus` and `licenseStatus` to wallet/read-model state.
- Kept `accountStatus` as a backward-compatible alias for the active-license state.
- Added database constraints/indexes in `db/migrations/010_architecture25_membership_license.sql`.
- Changed the new-member client default so an unprovisioned client state does not invent a paid `starter_6` license before the server read model loads.
- Added `scripts/architecture25-gate.mjs` and `npm run release:architecture25-gate`.
- Updated `docs/architecture/ARCHITECTURE-FINAL-v2.4.16.md` with the final architecture and acceptance model.

## Validation completed

### Local Mac runtime

- `npm ci`: **PASS** on the target Mac before the repository cleanup pass.
- `npm run lint`: **PASS**.
- `npm test`: **PASS — 27/27**.
- `npm run test:core`: **PASS — 31/31**.
- `npm run test:v2`: **PASS — 3/3**.
- `npm run build`: **PASS**.
- PostgreSQL migration `010_architecture25_membership_license`: **APPLIED**.
- `npm run db:check`: **PASS**.
- Architecture 25 gate: **PASS — 13/13**.
- Roadmap source gate: **PASS — 25/25**.
- Public-readiness source gate: **PASS — 0 source failures**.
- Security audit after Architecture 25 alignment: **PASS — 0 failures**.

### Browser runtime evidence

- User without a license opened the dashboard without a login OTP gate.
- A protected Profit Share action returned `SESSION_ELEVATION_REQUIRED`.
- The dedicated security-session email OTP was delivered and accepted.
- A 24-hour security session was established.
- The same protected Profit Share action then returned HTTP 200.
- Startup recovery remained fail-closed with manual resume required.

## Remaining external certification

The following are still not production-complete:

- full per-exchange authenticated certification matrix;
- full GAIN gateway Testnet order lifecycle for each advertised exchange;
- financial replay/concurrency matrix for activation, deposit, withdrawal, transfer, gas and referral flows;
- chaos/recovery matrix;
- backup/restore drill;
- 24–72 hour Testnet soak with production-like monitoring;
- final Firebase/Resend/domain validation in staging;
- controlled closed beta followed by public beta gates.

The read-only exchange certification harness was also executed in the current validation container on 2026-10-03, but outbound public HTTPS/DNS was unavailable. It therefore recorded `BLOCKED_ENVIRONMENT` rather than incorrectly treating the exchanges as failed. See `docs/release/EXTERNAL-CERTIFICATION-2026-10-03.md`.

## Important rollout property

No API secret or `.env` file is included in the release source archive. The cleaned repository intentionally excludes `node_modules`, `dist`, `.env`, and macOS archive metadata.
