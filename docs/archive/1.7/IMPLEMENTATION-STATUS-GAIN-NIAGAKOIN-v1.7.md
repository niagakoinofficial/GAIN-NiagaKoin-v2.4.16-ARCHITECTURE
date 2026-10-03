# GAIN NiagaKoin v4.2.4.16 — Implementation Status v1.7

## Trigger
External Mac validation of v1.6 exposed 21 TypeScript errors, 3 test-file runtime failures, and a production build failure.

## Repairs implemented in v1.7
- Restored `closedLayerIds` to `ActiveBotRunner` runtime typing.
- Added `EXCHANGE_CREDENTIAL_REPLACED` to the lifecycle reason union.
- Added missing client observability event types.
- Restored `getLicenseTierConfig` import where required.
- Removed obsolete admin sandbox balance-reset controls from the public Wallet UI rather than reintroducing a frontend financial write path.
- Corrected Deposit callback contract to return `void`/`Promise<void>`.
- Added missing read-only Exchange Coin Checker report counters.
- Added wallet-service exports for authoritative Auto-Refill API functions.
- Migrated project tests from invalid `expect` imports from `node:test` to `node:assert/strict`.
- Removed untyped PostgreSQL `query<any>` calls from the affected database functions.
- Added optional position identifiers to analytics leader rows for stable UI keys.

## Validation performed in audit container
- TypeScript/TSX parser: 121 files, 0 parse diagnostics.
- Source diff reviewed against v1.6.
- Full `npm ci` in the audit container was attempted but transport-timed out; therefore container-side lint/build/test are not claimed as PASS.

## External validation status
The user successfully completed `npm ci` on macOS for v1.6 and supplied the resulting lint/test/build output. That output showed:
- `npm ci`: PASS, 556 packages installed.
- `npm audit`: 6 vulnerabilities (2 moderate, 4 high).
- `npm run lint`: FAIL, 21 TypeScript errors.
- `npm test`: PASS, 22/22 tests.
- `npm run test:core`: FAIL, 3 tests due invalid `node:test` `expect` import.
- `npm run build`: FAIL due missing Auto-Refill exports.

v1.7 specifically addresses those source failures. The next required step is to rerun the same Mac commands against v1.7 and record the new evidence.
