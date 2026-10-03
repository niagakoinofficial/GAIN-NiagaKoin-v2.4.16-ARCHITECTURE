# ROADMAP — GAIN NiagaKoin v4.2.4.16 → GO PUBLIC v1.6

## Phase A — Source hardening
Status: COMPLETE

- financial source of truth
- idempotency
- exchange safety
- UI truthfulness
- source/release gates

## Phase B — Engineering Alpha
Run on the target Mac/staging environment:

1. `npm ci`
2. `npm run lint`
3. `npm run test:core`
4. `npm test`
5. `npm run build`
6. `npm run db:migrate`
7. `npm run db:check`

Block release on any failure.

## Phase C — Binance Testnet E2E

Test:
- credential connect/disconnect
- candle-driven 3m/5m/10m/etc.
- bot start/stop
- BUY
- partial fill
- FILLED
- timeout
- UNKNOWN
- reconciliation
- restart
- manual partial close
- position version
- exchange/account isolation

## Phase D — Financial Testnet

Test duplicate/retry/concurrency for:

- activation
- deposit
- withdrawal
- transfer
- gas top-up
- referral
- auto-refill

Expected invariant:

**one business event → one financial mutation**

## Phase E — Chaos / Recovery

Inject:

- API timeout
- exchange timeout
- WebSocket disconnect
- Redis restart
- worker restart
- PostgreSQL restart
- duplicate HTTP requests
- delayed exchange response
- partial fills

Expected:

- no duplicate order
- no duplicate debit
- no lost position
- no false success
- reconciliation succeeds

## Phase F — Soak

24–72 hours Testnet.

Monitor:

- order count
- fill count
- position drift
- balance drift
- ledger drift
- worker restarts
- memory
- CPU
- DB connections
- Redis
- WebSocket

## Phase G — Closed Beta

5–20 controlled users.

Keep:
- live trading disabled by default
- testnet-only default
- withdrawals under review/processor controls
- detailed audit logs

## Phase H — Public Beta

Open registration gradually.

Require:
- monitoring
- incident response
- rollback
- backups
- rate limits
- support procedure

## Phase I — Go Public

Only when:

- zero unresolved P0
- zero unresolved P1 affecting financial/trading integrity
- all required integration tests pass
- recovery tests pass
- soak passes
- backup/restore passes
- production secrets are verified
- live trading is explicitly gated
- operator runbook exists

No source-only audit may substitute for runtime evidence.
