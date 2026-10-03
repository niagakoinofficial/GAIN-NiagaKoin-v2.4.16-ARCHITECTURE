# Release Manifest v1.5

Base: GAIN NiagaKoin v4.2.4.16 / financial hardening v1.4

### Security/source gates
- Security audit: PASS / 0 failed
- Release gate: PASS / 0 failed
- TypeScript/TSX parse: PASS / 0 errors
- Live trading default: disabled
- Testnet-only default: enabled

### P0 changes
- activation idempotency persisted
- activation cross-account idempotency conflict blocked
- deposit network+txHash uniqueness guard
- exchange coin checker read-only
- no fake fallback volume
- demo pipeline explicitly labeled

### External validation required
No claim is made that npm lint/tests/build, DB migration, exchange E2E, financial processor integration, chaos recovery, or soak testing have passed until executed in the target environment.
