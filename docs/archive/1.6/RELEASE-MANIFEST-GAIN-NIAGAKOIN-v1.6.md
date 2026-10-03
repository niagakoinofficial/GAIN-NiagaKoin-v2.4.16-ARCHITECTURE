# RELEASE MANIFEST — GAIN NiagaKoin v4.2.4.16 — v1.6

## Release
Application version: `2.4.16`
Hardening package: `v1.6`

## Key changes
- activation replay side-effect hardening
- cross-account deposit replay protection
- database-layer financial validation
- exchange checker read-only/live-data truthfulness
- synthetic pipeline disclosure
- price alert limitation disclosure
- public readiness source gate

## Source evidence
- security audit: PASS / 0 failed
- release gate: PASS / 0 failed
- public readiness source gate: PASS / 0 failed
- parser scan: 121 TS/TSX files / 0 parse diagnostics

## External validation
Required and not claimed:
- dependency installation
- lint/test/build
- DB migration
- Binance Testnet E2E
- BSC integration
- withdrawal processor
- chaos/recovery
- 24–72h soak
- backup/restore

## Safety defaults
- `LIVE_TRADING_ENABLED=false`
- `LIVE_TRADING_TESTNET_ONLY=true`

## Release rule
This package is a hardened **testnet candidate**, not a declaration of production readiness.
