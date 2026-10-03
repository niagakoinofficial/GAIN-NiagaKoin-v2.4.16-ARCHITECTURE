# Roadmap v1.7 → Go Public

1. Replace the v1.6 installation with v1.7.
2. Run `npm ci`.
3. Run `npm run lint` until PASS.
4. Run `npm test`.
5. Run `npm run test:core`.
6. Run `npm run build`.
7. Run database migrations and verify PostgreSQL/Redis.
8. Run Binance Testnet authentication, market, candle, order, fill and reconciliation E2E.
9. Run financial replay/idempotency tests for activation, deposit, withdrawal, transfer, gas top-up and auto-refill.
10. Run multi-account/exchange isolation tests.
11. Run crash/restart/chaos recovery tests.
12. Run 24–72 hour Testnet soak.
13. Run closed beta.
14. Only after all release gates pass, prepare production deployment with LIVE trading explicitly disabled until a separately approved live-trading gate is passed.
