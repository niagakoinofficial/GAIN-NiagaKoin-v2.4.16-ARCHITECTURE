# IMPLEMENTATION STATUS — GAIN NiagaKoin v4.2.4.16 — Public Hardening v1.6

## Scope
This release continues from v1.5 and applies the master audit/repair prompt with emphasis on financial replay safety, misleading UI/data removal, defense-in-depth validation, and public-readiness gates.

## Implemented

### Financial integrity
- Activation remains PostgreSQL-authoritative and idempotent through `Idempotency-Key`.
- Activation replay no longer creates duplicate audit/read-model financial side effects.
- Deposit replay is globally unique by `(network, tx_hash)`.
- A previously credited deposit transaction is rejected when another account attempts to claim it (`DEPOSIT_TX_ALREADY_CLAIMED`).
- Transfer amount is validated again inside the database service.
- Gas top-up amount and idempotency key are validated again inside the database service.
- Withdrawal amount, fee, and idempotency key are validated again inside the database service.
- Deposit amount/TxHash are validated again inside the database service.
- Existing wallet/ledger transactions remain PostgreSQL transaction-bound.

### Exchange safety
- Exchange Coin Checker remains read-only.
- No direct exchange order execution path exists in the checker.
- Static fallback compatibility/volume is no longer presented as current live market data.
- When live market data is unavailable, the UI explicitly says live data is unavailable.

### UI truthfulness
- Execution Pipeline Trace is explicitly labeled as synthetic demo architecture, not production runtime telemetry.
- The synthetic 142 ms example is explicitly identified as illustrative.
- Price Alert UI now discloses that the current trigger is browser-side while the application is active; it is not represented as server-side always-on monitoring.
- Deposit TxHash action remains `Tempel TxHash`; no sample hash generation is exposed.

### Release gates
- Added `scripts/public-readiness-gate.mjs`.
- Extended security/release gates with:
  - cross-account deposit replay protection
  - financial service defense-in-depth validation
  - activation replay side-effect protection
  - synthetic pipeline disclosure
  - price alert limitation disclosure

## Verification evidence

### Source/static
- Security audit: PASS, 0 failed.
- Source release gate: PASS, 0 failed.
- Public readiness source gate: PASS, 0 failed.
- TypeScript/TSX parser scan: 121 files, 0 parse diagnostics.
- ZIP integrity: must be verified after packaging.

### Not claimed
The following require the user's runtime/staging environment and are NOT claimed as passed:
- `npm ci`
- full lint/typecheck with project dependencies
- automated test suite
- production/staging DB migration
- Binance Testnet E2E
- BSC on-chain integration
- withdrawal processor integration
- chaos/recovery
- 24–72 hour soak
- backup/restore

The previous dependency installation attempt hit the execution transport timeout. No result is inferred from that timeout.

## Current release status

**SOURCE HARDENED / ENGINEERING TESTNET CANDIDATE**

Not yet `GO PUBLIC`.

The remaining release decision depends on external validation gates.
