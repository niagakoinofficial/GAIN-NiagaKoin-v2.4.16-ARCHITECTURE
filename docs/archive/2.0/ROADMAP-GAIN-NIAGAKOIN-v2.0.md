# ROADMAP — Multi-Exchange Certification Lab v2.0

## Phase 1 — Read-only API lab
1. Binance
2. Bitget
3. OKX
4. Bybit
5. Coinbase
6. Kraken
7. Indodax
8. Tokocrypto
9. Bittime
10. Reku
11. Pintu Pro (blocked until native API verified)
12. Triv (blocked until native API verified)

## Phase 2 — Sandbox/demo order certification
Prioritas:
- Binance Testnet
- OKX Demo
- Bybit Testnet/Demo
- Bitget Demo

Test:
CONNECT → CREATE LIMIT → QUERY → CANCEL → FINAL STATUS → RECONCILE

## Phase 3 — Indonesian authenticated read-only
- Indodax
- Tokocrypto
- Bittime

Test:
BALANCE → MARKETS → OPEN ORDERS → ORDER HISTORY → TRADE HISTORY

## Phase 4 — Explicit live micro-order gate
Hanya untuk exchange yang tidak memiliki sandbox order yang sesuai.
- Separate test account/budget.
- Withdrawal permission OFF.
- Maximum notional enforced server-side.
- One order at a time.
- Immediate cancel when safe.
- Exchange ID + credential fingerprint + order ID recorded.

## Phase 5 — Cross-exchange isolation
- credential isolation
- balance isolation
- order isolation
- position isolation
- restart isolation
- rate-limit isolation

## Phase 6 — Production certification
Tidak ada GO PUBLIC sebelum setiap exchange yang diiklankan sebagai trading-capable memiliki evidence integrasi yang sesuai.
