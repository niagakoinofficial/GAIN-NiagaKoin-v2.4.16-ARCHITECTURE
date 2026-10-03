# GAIN NiagaKoin v2.5 — Public Certification Roadmap

## Purpose

This is the **only active roadmap** for the repository after v2.4.16 Architecture 25. It closes external validation gaps before any public live-trading release.

## Phase 0 — Repository / release hygiene

- [x] Architecture 25 implementation landed.
- [x] Local Mac dependency install, lint, unit/core/v2 tests and production build verified.
- [x] PostgreSQL migration 010 applied and checked.
- [x] Runtime security elevation verified through a protected action.
- [ ] Make all release/static audits semantically aligned with Architecture 25.
- [ ] Keep README, metadata, Dockerfile, package manifest and lockfile version-aligned.
- [ ] Keep generated/local artifacts out of release archives and Git.

## Phase 1 — Security and identity certification

- [ ] Firebase Auth + Firestore rules reviewed against production project.
- [ ] Firebase Admin credentials verified in staging.
- [ ] Security elevation expiry/restart behavior verified.
- [ ] TOTP enrollment/recovery and high-risk action gates verified.
- [ ] Cross-account and cross-exchange isolation verified.
- [ ] Rate-limit and CORS policy reviewed for the public domain.

## Phase 2 — Exchange certification

For each advertised exchange, certify capabilities independently:

1. authenticated read-only;
2. official sandbox/demo order where supported;
3. reconciliation;
4. recovery;
5. micro-live only when the exchange lacks an adequate sandbox and only under the explicit server + 2FA + notional gate.

Priority remains:

```text
Binance → OKX → Bybit → Bitget → Coinbase → Kraken
Indodax → Tokocrypto → Bittime → Reku → Pintu Pro → Triv
```

Reku remains read-only unless a native trading contract is verified. Pintu Pro and Triv remain blocked until their native API contracts are verified.

## Phase 3 — Financial integrity certification

Replay and concurrency-test:

- activation;
- deposit;
- withdrawal;
- transfer;
- gas top-up;
- referral settlement;
- auto-refill.

Invariant:

```text
one business event = one financial mutation
```

## Phase 4 — Trading E2E / reconciliation

- [ ] Binance Testnet authenticated E2E through GAIN gateway.
- [ ] BUY/create → verify → partial fill → FILLED/CANCELLED/UNKNOWN paths.
- [ ] Client order idempotency and ambiguous-create recovery.
- [ ] Position reconciliation after mismatch.
- [ ] Manual partial close / Force TP reconciliation.
- [ ] Exchange/account isolation.

## Phase 5 — Chaos and recovery

Inject:

- API timeout;
- exchange timeout;
- websocket disconnect;
- Redis restart;
- PostgreSQL restart;
- worker/API restart;
- duplicate requests;
- delayed exchange response;
- partial fill.

Expected:

- no duplicate order;
- no duplicate debit;
- no lost position;
- no false success;
- reconciliation succeeds.

## Phase 6 — Soak

Run 24–72 hours on Testnet with monitoring for:

- orders/fills;
- balance/position drift;
- ledger drift;
- worker restarts;
- memory/CPU;
- PostgreSQL connections;
- Redis;
- websocket state;
- 4xx/5xx and latency.

## Phase 7 — Closed beta

Target 5–20 controlled users. Keep live trading disabled by default, testnet-first, withdrawals under processor controls, and detailed audit logging.

## Phase 8 — Public beta

Gradual registration, rate limits, support procedure, incident response, rollback, backups, monitoring, and a controlled live enablement process.

## Phase 9 — Production go-live gate

No production-live declaration until:

- zero unresolved P0;
- zero unresolved P1 affecting financial/trading integrity;
- required exchange certifications pass;
- financial replay passes;
- chaos/recovery passes;
- 24–72h soak passes;
- backup/restore passes;
- production secrets and access controls are verified;
- operator runbook and incident response exist;
- live trading remains explicitly gated and auditable.
