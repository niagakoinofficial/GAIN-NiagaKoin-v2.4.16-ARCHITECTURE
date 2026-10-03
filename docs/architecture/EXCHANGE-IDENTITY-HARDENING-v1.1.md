# GAIN NiagaKoin — Exchange Identity & Portfolio/Position Hardening v1.1

Tanggal: 2 Oktober 2026

Basis: `Gain-NiagaKoin-Skema-Exchange-Identity-Portfolio-Position-v1.0.md`

## Status

Implementasi prioritas P0/P1/P2 dari audit v1.0 telah diterapkan pada source package ini, dengan batasan bahwa integration test terhadap database/exchange eksternal harus tetap dijalankan di environment pengguna.

## P0 — Exchange Account Identity

### 1. Exchange Account Identity

`exchange_accounts` sekarang memiliki metadata:

- `identity_key`
- `identity_type`
- `identity_hint`
- `credential_fingerprint`
- `reported_identity_key`
- `credential_version`

Ownership tidak lagi hanya dipandang sebagai `(user_id, exchange)`.

### 2. Duplicate account protection lintas UID

Saat credential disimpan, server melakukan verifikasi credential ke exchange terlebih dahulu dan membuat:

- fingerprint HMAC dari credential + exchange + environment;
- identity key dari account identifier yang dilaporkan exchange bila tersedia.

Jika identity yang sama sudah aktif pada Firebase UID lain, penyimpanan ditolak dengan:

`EXCHANGE_ACCOUNT_ALREADY_LINKED`

### 3. Ownership lock

Database mempunyai unique partial indexes untuk identity aktif sehingga race condition dua request connect tidak hanya bergantung pada pengecekan aplikasi.

### 4. Credential replacement lifecycle

Jika credential baru menunjuk ke identity yang berbeda dan bot lama masih memiliki position quantity atau pending order, replacement ditolak:

`EXCHANGE_CREDENTIAL_REBIND_REQUIRES_FLAT`

Jika tidak ada posisi/pending order, runner terkait dijeda, open order GAIN dicoba dibatalkan, lalu credential baru disimpan.

Jika pembatalan order tidak dapat dikonfirmasi, replacement ditolak dan runner tetap paused:

`EXCHANGE_CREDENTIAL_REBIND_UNCONFIRMED`

Rotasi API key dalam account exchange yang sama tidak diperlakukan sebagai account rebind bila identity exchange yang dilaporkan konsisten.

### 5. Revoke saat disconnect

Disconnect sekarang merevoke baik `exchange_credentials` maupun `exchange_accounts` dalam transaksi database.

---

## P1 — Runtime Authority

### 6. Home active-position count

Home tidak lagi memakai cache `positions` sebagai sumber utama jumlah posisi aktif.

Sumber utama:

`GET /api/bot/engine-status`

Hanya runner yang mempunyai `positionQty > 0` yang dihitung sebagai posisi aktif.

Konfigurasi bot paused/error tanpa quantity posisi tidak dihitung sebagai posisi aktif.

### 7. Trading Positions

Footer active count juga mempertimbangkan runtime position quantity sehingga bot yang hanya terdaftar/paused tidak salah dihitung sebagai posisi aktif.

`TradingPositionsView` sudah memiliki runtime merge untuk menghidupkan kembali position projection yang stale/missing dari backend runner.

---

## P2 — UX & Audit

### 8. Exchange identity status

API connection metadata sekarang dapat menampilkan:

- Exchange Account identity hint
- Credential version
- Identity type

Secret/API key tetap tidak dikirim ke browser.

### 9. Audit log

Connect/update dan rebind dicatat melalui event audit:

- `bot.credentials.updated`
- `bot.exchange.identity_rebound`
- `bot.exchange.disconnected`
- `exchange_credential_history` menyimpan CONNECTED / RECONNECTED / ROTATED

Konflik ownership menghasilkan error terstruktur sehingga UI dapat menjelaskan masalah tanpa membocorkan UID pemilik lain.

### 10. Credential history

Setiap connect/reconnect/rotation dicatat pada `exchange_credential_history` tanpa menyimpan secret/API key mentah. UI API modal menampilkan riwayat terakhir dan credential version.

### 11. Multi-exchange isolation

State koneksi tetap menggunakan identitas per user + exchange dan server-side credential ownership. Active exchange tidak boleh mengambil credential exchange lain.

---

## Skenario yang sekarang ditangani

| Skenario | Perilaku |
|---|---|
| Gmail A → Binance API X | Connect |
| Gmail B → Binance API Y | Connect jika account identity berbeda |
| Gmail A → Binance API X, Gmail B → Binance API X | Ditolak |
| Gmail A → Binance API lama → API baru, account sama | Credential rotation |
| Gmail A → Binance API lama → API baru, account berbeda, bot flat | Bot dipause/cancel order lalu rebind |
| Gmail A → API baru, account berbeda, bot masih punya posisi | Ditolak sampai flat/reconcile |
| Disconnect | Bot exchange dijeda, open order GAIN dicoba dibatalkan, credential/account direvoke |
| Logout lalu Gmail B | Bot tetap milik UID A; Gmail B tidak mengambil ownership |
| Binance ↔ Bitget | Portfolio/bot state dipisahkan berdasarkan exchange |
| Browser reload | Credential tetap server-side; browser menerima metadata aman |

## Catatan penting

`credential_fingerprint` dapat mendeteksi credential API yang sama secara deterministik.

`reported_identity_key` dapat mendeteksi account identity yang dilaporkan exchange ketika adapter CCXT/exchange menyediakannya.

Tidak semua exchange/testnet menyediakan account identifier yang konsisten. Karena itu fingerprint tetap dipertahankan sebagai lapisan kedua.

Jika dua API key berbeda menunjuk ke account yang sama tetapi exchange tidak memberikan identifier account yang dapat dibaca melalui endpoint yang dipakai, sistem tidak dapat membuktikan hubungan tersebut hanya dari saldo. Dalam kasus seperti itu diperlukan adapter khusus exchange untuk endpoint account identity yang resmi.

## Verifikasi

Yang sudah diverifikasi pada package:

- syntax parse untuk seluruh file yang diubah: PASS;
- migration file tersedia;
- ZIP integrity: harus diverifikasi setelah package dibuat;
- full `npm run lint`, `npm test`, `npm run build`, dan integration test exchange/database belum dapat dinyatakan PASS dari container ini karena dependency/runtime eksternal tidak tersedia lengkap.

## Checklist deployment

1. Jalankan `npm ci` di Mac/server.
2. Pastikan `DATABASE_URL` dan `ENCRYPTION_MASTER_KEY` tersedia.
3. Jalankan `npm run db:migrate`.
4. Restart server.
5. Login Gmail A.
6. Connect Binance Testnet.
7. Pastikan Exchange Account hint/version muncul.
8. Login Gmail B.
9. Coba API Binance Testnet yang sama.
10. Pastikan server menolak dengan `EXCHANGE_ACCOUNT_ALREADY_LINKED`.
11. Uji API rotation pada account yang sama.
12. Uji rotation saat bot memiliki posisi — harus ditolak.
13. Uji disconnect dengan open order — credential tidak boleh direvoke jika cancellation tidak terkonfirmasi.
14. Uji Home: exchange connected + no bot position harus tetap menampilkan `Posisi Bot Aktif = 0` tanpa meminta connect API.
