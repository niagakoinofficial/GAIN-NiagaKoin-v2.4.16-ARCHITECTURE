# GAIN-NiagaKoin v2.4.16 — Roadmap Implementation

## Scope

This package completes the **source-level implementation** of the 14-phase engineering roadmap agreed for GAIN-NiagaKoin v2.4.16. It does **not** claim that exchange credentials, testnet accounts, database infrastructure, or production monitoring have been validated in the user's Mac/runtime.

## Email / DNS HOLD

Email and Resend are intentionally out of scope for this implementation pass. No DNS record, `RESEND_FROM`, Resend sender configuration, or OTP delivery behavior is changed here. The external DNS/Resend gate remains pending until the user reports its status.

## Phase status

| Phase | Scope | Source status | Runtime gate |
|---|---|---|---|
| 1 | TypeFix / build integrity | Implemented | `npm run lint`, tests, build |
| 2 | Backend sanity / Redis / DB | Implemented | target Mac/staging DB+Redis |
| 3 | Auth / session | Implemented | real OAuth/session E2E |
| 4 | Multi-exchange connector/capability layer | Implemented | per-exchange credentials |
| 5 | Candle-driven engine | Implemented | live OHLCV verification per timeframe |
| 6 | Signal engine | Implemented | strategy replay/runtime checks |
| 7 | Backtest | Implemented + MM ON/OFF aligned | historical datasets / replay |
| 8 | Risk & Money Management (MM master toggle) | Implemented | configuration matrix / testnet |
| 9 | Order / execution engine | Implemented | exchange testnet E2E |
| 10 | Position reconciliation | Implemented | deliberate mismatch/recovery tests |
| 11 | Bot Matrix | Implemented | UI ↔ runtime configuration parity |
| 12 | Recovery / restart | Implemented, fail-closed | restart + open-order recovery |
| 13 | Testnet / soak | Harness implemented | credentials + 24–72h soak |
| 14 | Production readiness | Source gates implemented | backup/restore, monitoring, incident drill |

## MM semantics

`useMoneyManagement` is the **master MM switch** exposed per bot.

When MM is `ON`, platform-level order size, projected capital and exposure guardrails apply.

When MM is `OFF`, those GAIN capital/exposure ceilings are removed from strategy sizing. The exchange's native order filters, available account balance, idempotency, reconciliation, stale-data protection, global kill switch, and other non-negotiable execution safety checks remain active.

The backtest workspace now uses the same MM ON/OFF semantics for order/exposure/capital ceilings, so a backtest configuration can be compared to a matching runtime configuration.

## Candle-driven hardening

Supported strategy timeframes remain:

`3m`, `5m`, `10m`, `15m`, `30m`, `1h`.

`3m` and `5m` use native OHLCV. `10m`, `15m`, `30m`, and `1h` are constructed from contiguous closed 5m candles and partial/missing buckets are rejected. Strategy evaluation remains keyed to the **closed candle timestamp**, while current ticker price is used only for execution/display.

## Validation commands

Source gates:

```bash
npm run release:roadmap-gate
node scripts/release-gate.mjs
node scripts/security-audit.mjs
node scripts/exchange-certification-stage-smoke.mjs
```

Runtime gates on the target environment:

```bash
npm ci
npm run lint
npm test
npm run test:core
npm run build
npm run db:migrate
npm run db:check
npm run test:binance
```

Live exchange certification and production release remain blocked until the dedicated micro-live, reconciliation, recovery, soak, backup/restore, and monitoring gates are explicitly passed.
