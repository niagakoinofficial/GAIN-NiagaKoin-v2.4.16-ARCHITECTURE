# GAIN NiagaKoin — Implementation Status v1.3

Tanggal: 2 Oktober 2026

## Status

Implementasi source untuk roadmap v1.2 telah diperluas. Item yang membutuhkan exchange/database/Firebase runtime eksternal tetap berstatus **VALIDATION REQUIRED**, bukan dianggap PASS hanya karena source sudah tersedia.

## Implemented in source

### P0 — Ownership & credential safety
- Exchange account identity metadata dan cross-UID duplicate protection.
- Credential fingerprint + reported exchange identity.
- Credential version/history.
- Credential rebind gate ketika posisi/order masih ada.
- Disconnect revoke transaction.
- Credential history endpoint.
- Reported identity diproyeksikan kembali ke client state.

### P1 — Runtime / position / order
- Backend runtime menjadi sumber active-position count Home.
- Firestore position projection membawa `positionVersion`.
- Runner membawa `positionVersion` dan menaikkannya saat runtime position berubah.
- Ambiguous order state diperjelas menjadi `unknown` setelah order sudah admitted tetapi hasil exchange belum pasti.
- `botOrders` menyimpan recovery marker untuk order unknown.
- Recovery UI/notifications mengenali `submitting`, `unknown`, dan `reconciling`.
- Candle duplicate guard sudah tetap berbasis `lastStrategyCandleTimestamp`.

### P1 — Portfolio
- `portfolioAssets` menjadi sumber utama allocated asset.
- Fallback total portfolio minus USDT.
- Legacy `allocatedAssetUsdt` hanya fallback terakhir.
- Portfolio sync status: `LIVE`, `STALE`, `SYNCING`, `ERROR`.
- `portfolioAsOf` tersedia untuk freshness indicator.
- Polling failure mempertahankan snapshot terakhir dan menandainya stale/error.

### P1 — MM
- MM OFF tetap melepas GAIN capital/order/exposure guardrails yang termasuk model MM.
- Exchange-native order filters tetap menjadi boundary.
- Operational safety tetap aktif.

### P2 — Promo / financial configuration
Satu source of truth baru:

`src/config/licensePromo.ts`

Memuat:
- diskon 50%;
- bonus fee trading 40%;
- headline 90%;
- Starter normal/promo price;
- Pro normal/promo price;
- gas bonus;
- referral activation percentage;
- effective date/version.

Activation backend dan ActivationFeeModal menggunakan konfigurasi yang sama.

### P2 — Account UX
Account page sekarang dapat menampilkan:
- exchange + environment;
- credential version/status;
- protected account identity hint;
- portfolio sync status;
- portfolio as-of time;
- promo 50% + 40% = 90%.

### P2 — Observability
Event `auth.google.authenticated` sekarang masuk allowlist backend sehingga tidak lagi ditolak sebagai observability event invalid.

### P2 — Testing assets
Ditambahkan:
- `src/services/orderLifecycle.ts`
- `src/services/orderLifecycle.test.ts`
- `src/config/licensePromo.test.ts`
- `src/utils/portfolioSnapshot.ts`
- `src/utils/portfolioSnapshot.test.ts`
- `scripts/security-audit.mjs` checks baru untuk ownership, runtime authority, portfolio source, MM OFF, promo config, dan observability.

## Validation required on the user's Mac/test environment

1. `npm ci`
2. `npm run lint`
3. `npm run test`
4. `npm run build`
5. `npm run db:migrate`
6. Binance Testnet connection test.
7. Gmail A → Binance Account X.
8. Gmail B → same Binance Account X must be blocked.
9. Credential rotation same exchange account.
10. Credential rebind with active position must be blocked.
11. Disconnect with open orders must enter reconciliation if cancellation cannot be confirmed.
12. Server restart with pending order.
13. Server restart with partial fill.
14. 3m/5m/10m/15m/30m/1h candle duplicate-evaluation test.
15. MM ON/OFF test matrix.
16. Multi-exchange isolation test.
17. Manual close / Force TP recovery test.
18. Testnet soak test before any live flag change.

## Important release rule

A source implementation is not equivalent to an exchange integration PASS. Live trading must remain disabled until the runtime validation items above are completed.
