# Release Manifest — GAIN NiagaKoin v2.1

Package: `GAIN-NiagaKoin-v4.2.4.16-MULTI-EXCHANGE-CERTIFICATION-v2.1.zip`

Application version: `2.4.16`

## Source hardening

- Five-stage multi-exchange certification lifecycle.
- Persistent certification run records.
- Sandbox/demo safety gates.
- Micro-live explicit gate + TOTP + confirmation.
- Reconciliation and recovery stages.
- Safe `.env.example` defaults.

## Source checks

- TypeScript/TSX parse: PASS (124 files, 0 diagnostics)
- Exchange certification stage smoke: PASS
- Release gate: PASS (0 failed)
- Security audit: PASS (0 failed)
- Public readiness source gate: PASS (0 failed)

## External checks

Not claimed in container. Must be run on target Mac/staging environment.

## Safety defaults

`LIVE_TRADING_ENABLED=false`

`LIVE_TRADING_TESTNET_ONLY=true`

`EXCHANGE_CERT_MICRO_LIVE_ENABLED=false`

`BOT_STARTUP_AUTO_RESUME=false`

## Release status

`EXTERNAL_VALIDATION_REQUIRED`
