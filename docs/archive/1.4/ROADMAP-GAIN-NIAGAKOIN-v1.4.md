# GAIN NiagaKoin — Roadmap Eksekusi v1.4

Tanggal: 2 Oktober 2026
Basis: v4.2.4.16 + ALL ROADMAP IMPLEMENTED v1.3

## Tujuan

Mengubah fitur yang sebelumnya masih UI-only / client-authoritative menjadi alur:

```text
UI
 ↓
Backend API
 ↓
Authoritative PostgreSQL / Runtime
 ↓
Exchange / Blockchain
 ↓
Ledger + Audit
 ↓
Firestore Read Model
 ↓
UI
```

## Sprint yang dieksekusi pada v1.4

### P0 Financial Safety
- Manual Close Layer dipindahkan ke bot runtime/exchange melalui Force TP partial quantity + layerId.
- Wallet tidak lagi didebit/credit secara lokal untuk activation, deposit, withdrawal, transfer, dan real gas top-up.
- Withdrawal tetap REVIEW sampai settlement processor mengubah state menjadi SENT/CONFIRMED.
- Deposit QR memakai alamat server yang dikonfigurasi; tidak ada QR statis dan tidak ada TxHash palsu.
- Financial fallback `$30/$10/$70` dihapus dari wallet/trading display.

### P0 Financial Ledger
- `FINANCIAL_CONFIG` menjadi source of truth untuk referral dan gas configuration.
- Gas top-up server menghitung bonus promo secara authoritative.
- Gas top-up idempotent menggunakan idempotency key.
- Referral activation menggunakan central referral configuration.
- Referral trading fee USDT menghasilkan 20% cash reward melalui PostgreSQL ledger.
- Referral downline gas top-up menghasilkan 10% non-cash gas reward melalui PostgreSQL ledger.
- Profit Share modal membaca settlement dari backend, bukan placeholder.

### P1 Auto Refill
- `gas_auto_refill_configs` ditambahkan.
- GET/POST `/api/wallet/auto-refill` ditambahkan.
- Worker server memproses threshold/refill/daily cap setiap menit.
- Setiap refill masuk wallet ledger dan audit event.

### P1 Backtest / Research
- Backtest mendukung fee dan slippage.
- Monte Carlo bootstrap stress test 20–2000 simulasi.
- Seed deterministik untuk regression test.
- UI Backtest Workspace menampilkan median ROI, P05/P95 ROI, median/worst drawdown, dan persentase outcome positif.
- Tombol Matrix “Monte Carlo Stress Test & Simulasi” sekarang membuka Backtest Workspace.

### P1 Runtime Position
- Manual partial close memakai authoritative runtime quantity.
- `closedLayerIds` diproyeksikan dari runner sehingga layer yang sudah ditutup tidak muncul lagi pada detail layer.

## Yang tetap membutuhkan validasi eksternal

Source implementation bukan exchange integration PASS. Tetap wajib dijalankan di Mac/Testnet:

1. `npm ci`
2. `npm run lint`
3. `npm run test`
4. `npm run build`
5. `npm run db:migrate`
6. Binance Testnet connection.
7. Partial/manual layer close pada Testnet.
8. Gas top-up + duplicate request/idempotency.
9. Referral activation/trading fee/top-up settlement dengan dua akun.
10. Auto-refill threshold + daily cap.
11. Withdrawal REVIEW → settlement SENT/CONFIRMED.
12. Deposit QR + real BSC transaction verification.
13. Server restart saat order pending/partial.
14. Candle 3m/5m/10m/15m/30m/1h duplicate evaluation test.
15. MM ON/OFF matrix.
16. Multi-exchange isolation.
17. Testnet soak 24–72 jam.

## Release Gate

```text
Parse OK
 ↓
Security Audit PASS
 ↓
Source Gate PASS
 ↓
Typecheck/Lint PASS
 ↓
Unit Test PASS
 ↓
Build PASS
 ↓
DB Migration PASS
 ↓
Testnet Financial Integration PASS
 ↓
Order/Position Recovery PASS
 ↓
Backtest/Live Parity PASS
 ↓
Soak Test PASS
 ↓
Release Candidate
```

Live trading tetap disabled sampai external validation selesai.
