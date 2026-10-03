# Roadmap — GAIN NiagaKoin v2.1 → Multi-Exchange Certification

## P0

1. Keep startup auto-resume disabled.
2. Keep live certification disabled by default.
3. Certify authenticated read-only per exchange.
4. Certify sandbox/demo order where officially supported.
5. Reconcile and persist every certification order.
6. Recovery test after process restart.

## P1

7. Micro-live certification under explicit server + 2FA gate.
8. Cross-exchange credential isolation.
9. Rate-limit/error matrix.
10. User WebSocket/order-update certification where supported.
11. Repeated 24h/72h recovery/soak tests.

## Exchange order of execution

### Global
Binance → OKX → Bybit → Bitget → Coinbase → Kraken

### Indonesia
Indodax → Tokocrypto → Bittime → Reku → Pintu Pro → Triv

Reku remains read-only; Pintu Pro and Triv remain blocked until native trading API contracts are verified.

## Public gate

GO PUBLIC tetap mensyaratkan seluruh source gates PASS + runtime evidence + financial replay + chaos/recovery + 24–72h soak + backup/restore.
