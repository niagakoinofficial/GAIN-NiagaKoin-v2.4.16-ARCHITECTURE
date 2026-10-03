# Roadmap v1.5 → Public Test

## P0 selesai pada source
1. Activation idempotency + conflict isolation.
2. Deposit replay uniqueness.
3. Coin checker read-only.
4. Hilangkan static market-volume claim.
5. Pisahkan demo architecture dari runtime telemetry.

## P0 berikutnya di environment nyata
1. Jalankan migration 008 pada PostgreSQL staging.
2. `npm ci` → lint → test:core → build.
3. Binance Testnet connection/market/order/reconciliation matrix.
4. Activation double-submit test dengan key sama.
5. Deposit same-TxHash replay test.
6. Withdrawal processor integration + settlement/reject reversal.

## P1 runtime reliability
- Candle-driven 3m/5m/10m/15m/1h integration matrix.
- Partial close layer/restart recovery.
- Unknown-order reconciliation chaos tests.
- Auto-refill threshold/daily-cap/restart/duplicate-worker tests.
- Multi-exchange identity isolation.
- Price Alert server-side worker bila requirement public adalah alert saat browser tertutup.

## Public gates
Gate A: source/security PASS
Gate B: staging DB + build PASS
Gate C: Testnet E2E PASS
Gate D: financial replay/recovery PASS
Gate E: 24–72h soak PASS
Gate F: closed beta 5–20 users PASS
Gate G: public beta dengan LIVE tetap disabled/testnet-only sampai seluruh gate selesai.
