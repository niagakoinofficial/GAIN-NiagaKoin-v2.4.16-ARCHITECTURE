# GAIN NiagaKoin — Master Roadmap Perbaikan Fitur & Konfigurasi

**Versi:** v1.2
**Tanggal:** 2 Oktober 2026
**Basis:** GAIN NiagaKoin v4.2.4.16 + audit Exchange/Identity/Portfolio/Position v1.0 + Exchange Identity Hardening v1.1 + perubahan promo Account 90%
**Tujuan:** menjadi master roadmap implementasi, verifikasi, konfigurasi, dan hardening sebelum production/live trading.

---

## 0. Prinsip Arsitektur Final

Model ownership yang harus dipertahankan:

```text
Firebase UID
    │
    ├── GAIN Wallet
    │
    ├── Exchange Connection(s)
    │       ├── Exchange
    │       ├── Environment
    │       ├── Exchange Account Identity
    │       └── Credential Version
    │
    ├── Bot Runner(s)
    │
    ├── Trading Position(s)
    │
    ├── Orders / Fills
    │
    └── Trade History / Audit
```

Sumber kebenaran utama:

```text
Exchange balance/asset  → exchange portfolio snapshot
Bot position            → backend runtime engine
Credential ownership    → PostgreSQL + exchange identity
Authentication          → Firebase UID + server verification
Strategy clock          → closed candle timestamp
UI                      → projection dari sumber authoritative
```

Tidak boleh mencampur:

```text
GAIN Liquid Balance ≠ Exchange Balance
Exchange Asset ≠ Bot Position
API Connected ≠ Bot Active
Gmail Identity ≠ Exchange Account Identity
Polling Timestamp ≠ Candle Close Timestamp
```

---

# 1. Status Fitur Saat Ini

## 1.1 Sudah dikerjakan

- [x] Candle-driven engine untuk 3m/5m/10m/15m/30m/1h.
- [x] Hanya closed candle yang digunakan untuk evaluasi strategy.
- [x] 10m dibentuk dari native 5m.
- [x] Pair-specific price/ticker handling.
- [x] Manual Force TP/close menggunakan runtime position dan tidak langsung re-buy setelah full manual close.
- [x] OTP login/security code dan durable verification challenge.
- [x] Pemisahan kode login dan kode verifikasi registrasi.
- [x] Login Google setelah OTP tidak meninggalkan AuthModal.
- [x] `Aset Koin Alokasi` memakai portfolio exchange sebagai sumber utama.
- [x] Empty-state posisi membedakan exchange connected vs belum connected.
- [x] Local exchange state dipisahkan per user + exchange.
- [x] MM OFF melepas GAIN capital/order/exposure guardrails yang memang bagian Money Management, sementara exchange-native filters dan operational safety tetap aktif.
- [x] Exchange Account Identity hardening P0.
- [x] Duplicate exchange account protection lintas UID.
- [x] Credential replacement/rebind gate.
- [x] Disconnect credential/account revoke transaction.
- [x] Runtime engine menjadi sumber utama active-position count.
- [x] Credential history dan audit events.
- [x] Multi-exchange isolation pada state/ownership.
- [x] Promo Account diubah menjadi **PROGRAM PROMO & BONUS HINGGA 90%** dengan pesan **50% + 40% = 90%** sesuai brief.

> Status di atas adalah status implementasi source/package. Integration test eksternal tetap harus dilakukan di environment deployment.

---

# 2. P0 — Production Safety Gate

Prioritas tertinggi. Tidak boleh dilewati sebelum live trading.

## P0.1 Exchange Account Identity

- [x] `identity_key`
- [x] `identity_type`
- [x] `identity_hint`
- [x] `credential_fingerprint`
- [x] `reported_identity_key`
- [x] `credential_version`
- [ ] Uji identity adapter pada setiap exchange yang benar-benar akan didukung.
- [ ] Dokumentasikan exchange yang tidak memberikan account identifier stabil.

## P0.2 Duplicate Account Ownership

- [x] Tolak account identity aktif yang sudah dimiliki UID lain.
- [x] Database partial unique index.
- [ ] Integration test race condition dua request connect bersamaan.
- [ ] Integration test dua browser + dua Gmail + credential sama.

Expected:

```text
UID A → Binance Account X → ALLOW
UID B → Binance Account X → BLOCK
```

Error standar:

```text
EXCHANGE_ACCOUNT_ALREADY_LINKED
```

## P0.3 Credential Rotation

- [x] Rotation account yang sama dapat diperlakukan sebagai credential rotation.
- [x] Rebind ke account berbeda membutuhkan kondisi flat.
- [x] Pending order menjadi reconciliation gate.
- [ ] Test rotation ketika positionQty > 0.
- [ ] Test rotation ketika ada open order.
- [ ] Test exchange timeout saat cancel.
- [ ] Test crash/restart di tengah rotation.
- [ ] Tambahkan recovery job jika transaction berhasil tetapi refresh exchange gagal.

## P0.4 Disconnect

- [x] Pause runner exchange terkait.
- [x] Attempt cancel open order GAIN.
- [x] Revoke credential/account dalam transaction.
- [ ] Integration test open order benar-benar sudah cancelled.
- [ ] Recovery state untuk cancellation yang tidak terkonfirmasi.
- [ ] UX status `DISCONNECTING`, `RECONCILIATION_REQUIRED`, `DISCONNECTED`.

---

# 3. P1 — Runtime & Trading Engine Authority

## P1.1 Single Position Authority

Target:

```text
Backend Runtime
      ↓
Authoritative Position
      ↓
Home / Bot / Trading Positions
```

- [x] Home active-position count membaca `/api/bot/engine-status`.
- [x] Hanya runner dengan `positionQty > 0` dihitung aktif.
- [x] TradingPositionsView melakukan runtime merge.
- [ ] Hilangkan seluruh jalur UI yang masih dapat menjadikan cache Firestore sebagai sumber utama posisi aktif.
- [ ] Tambahkan `positionVersion`/`lastReconciledAt` untuk mendeteksi stale projection.
- [ ] Integration test runtime position vs Firestore projection.

## P1.2 Restart Recovery

- [x] Bot runner dapat dipulihkan dari Firestore.
- [x] Reconciliation gate sudah ada.
- [ ] Test restart dengan pending order.
- [ ] Test restart setelah partial fill.
- [ ] Test restart setelah exchange timeout.
- [ ] Test restart ketika positionQty exchange berbeda dengan state lokal.
- [ ] Pastikan bot tidak melakukan duplicate BUY setelah restart.

## P1.3 Order Lifecycle

- [x] Client order ID/correlation ID digunakan.
- [x] Order confirmed/reconciliation state tersedia.
- [ ] State machine formal:

```text
CREATED
→ SUBMITTING
→ SUBMITTED
→ PARTIALLY_FILLED
→ FILLED
→ RECONCILED
```

dan:

```text
SUBMITTING
→ UNKNOWN
→ RECONCILING
→ CONFIRMED / CANCELLED
```

- [ ] Idempotency test untuk duplicate request.
- [ ] Test partial fill.
- [ ] Test network timeout setelah order sebenarnya masuk exchange.

---

# 4. P1 — Candle-Driven Strategy

- [x] Closed candle only.
- [x] Strategy clock keyed by candle close timestamp.
- [x] 3m.
- [x] 5m.
- [x] 10m aggregation dari 5m.
- [x] 15m.
- [x] 30m.
- [x] 1h.
- [ ] Tambahkan runtime assertion: tidak boleh dua strategy evaluation untuk candle timestamp yang sama.
- [ ] Simpan `lastStrategyCandleTimestamp` per bot/pair/timeframe secara durable.
- [ ] Backtest vs live parity test.
- [ ] Gap/missing candle recovery test.
- [ ] Exchange websocket disconnect/reconnect test.

Acceptance criterion:

```text
1 closed candle
→ maksimal 1 strategy evaluation
→ maksimal 1 signal transition
```

---

# 5. P1 — Risk & Money Management

## MM ON

- [x] Capital/exposure guardrails.
- [x] Layer limits.
- [x] Coverage limits.
- [x] Order-size guardrails.
- [x] Strategy parameter sanity checks.

## MM OFF

- [x] GAIN fixed capital/order/exposure ceiling dilepas sesuai semantics MM OFF.
- [x] Exchange-native amount/cost filters tetap aktif.
- [x] Operational safety tetap aktif.

Operational controls yang **tidak otomatis boleh dihapus**:

- order-rate limit;
- daily loss guard;
- drawdown guard;
- spread/slippage controls;
- exchange-native min/max amount/cost;
- live trading feature flags.

- [ ] Buat test matrix MM ON vs OFF.
- [ ] Pastikan UI tidak mengatakan “unlimited” jika exchange masih memiliki filter.
- [ ] Tambahkan reason code yang jelas untuk setiap block.

---

# 6. P1 — Manual Trading Controls

- [x] Force TP/manual close pair-aware.
- [x] Manual close tidak bergantung pada worker lease lama.
- [x] Full manual close dapat mem-pause runner.
- [x] Batch close berarti close semua posisi yang dipilih.
- [ ] Test manual close partial fill.
- [ ] Test manual close saat runner error.
- [ ] Test manual close saat websocket disconnect.
- [ ] Test manual close setelah browser refresh.
- [ ] Pastikan UI selalu menampilkan fill price aktual exchange.

---

# 7. P1 — Portfolio & Wallet

## Exchange Portfolio

- [x] `portfolioAssets` sebagai sumber utama.
- [x] fallback `totalPortfolioUsdt - usdtBalance`.
- [x] fallback terakhir `allocatedAssetUsdt`.
- [x] Polling tidak lagi semestinya mengembalikan alokasi exchange menjadi 0.
- [ ] Tambahkan timestamp `portfolioAsOf` di UI.
- [ ] Tambahkan status `LIVE`, `STALE`, `SYNCING`, `ERROR`.
- [ ] Jangan menampilkan angka lama tanpa indikator stale.

## Posisi

- [x] Connected + no bot position → `Belum Ada Posisi Bot Aktif`.
- [x] Not connected → `Hubungkan API Exchange`.
- [ ] Audit seluruh halaman lain agar memakai semantic state yang sama.

---

# 8. P1 — Multi-Exchange

Target:

```text
UID A
 ├── Binance
 ├── Bitget
 └── OKX
```

Setiap exchange harus mempunyai:

```text
Credential
Account Identity
Portfolio
Bot Runner
Position
Orders
History
```

- [x] Local state per exchange.
- [x] Server credential ownership per UID + exchange.
- [x] Portfolio isolation.
- [ ] Integration test switch Binance → Bitget → Binance.
- [ ] Test active bot Binance saat UI melihat Bitget.
- [ ] Test disconnect Bitget tidak mem-pause Binance.
- [ ] Test history tidak bercampur.

---

# 9. P1 — Authentication & Identity

- [x] Google authentication.
- [x] Server-side login OTP.
- [x] Registration-only email verification.
- [x] 24-hour verified session flow.
- [x] AuthModal lifecycle fix.
- [ ] Integration test logout → Gmail B → Gmail A kembali.
- [ ] Pastikan semua API route menggunakan UID dari verified token, bukan email dari client.
- [ ] Audit semua localStorage/sessionStorage identity references.
- [ ] Test session expiry saat bot tetap berjalan.

---

# 10. P2 — UX & Account Configuration

## Promo Account — sudah diubah

Teks target:

```text
PROGRAM PROMO & BONUS HINGGA 90%
50% + 40% = 90%

• Diskon 50% dari harga lisensi normal
  (sekali bayar seumur hidup / Lifetime).

• Bonus 40% fee trading setelah aktivasi langsung masuk
  ke Gas Fee Tank Anda untuk bahan bakar bot!

*50% + 40% = 90% (akumulasi persentase promo, bukan nilai $).
```

- [x] Account section menggunakan copy tersebut.
- [ ] Audit copy yang sama pada ActivationFeeModal agar seluruh halaman konsisten.
- [ ] Audit angka harga normal/promo agar tidak ada teks lama yang berbeda.
- [ ] Audit referral copy agar tidak tercampur dengan promo 90%.

## Account UX

- [ ] Tampilkan License Tier.
- [ ] Tampilkan active bot quota.
- [ ] Tampilkan Exchange Account Identity hint.
- [ ] Tampilkan Credential Version.
- [ ] Tampilkan last portfolio sync.
- [ ] Tampilkan last bot reconciliation.
- [ ] Tampilkan status API: Connected / Syncing / Stale / Revoked.

---

# 11. P2 — Referral / Sponsor / Gas Fee Configuration

Karena modul finansial sudah memiliki activation, referral, gas reserve, dan profit-sharing logic, seluruh angka harus menjadi konfigurasi yang eksplisit.

- [ ] Satukan konfigurasi promo di satu source of truth.
- [ ] Satukan konfigurasi Starter/Pro.
- [ ] Satukan referral percentage.
- [ ] Satukan trading bonus percentage.
- [ ] Pisahkan “marketing percentage” dari “financial ledger percentage”.
- [ ] Tambahkan effective date/version untuk perubahan promo.
- [ ] Pastikan perubahan UI tidak mengubah ledger financial rule secara tidak sengaja.

Target:

```text
PROMO_CONFIG v1
 ├── licenseDiscountPct
 ├── tradingFeeBonusPct
 ├── referralActivationPct
 ├── gasBonusPct
 └── effectiveFrom
```

---

# 12. P2 — Observability & Error Hygiene

Error yang masih perlu dibersihkan/ditindaklanjuti:

- [ ] `/api/observability/client-event` 400 untuk event yang tidak di-allowlist.
- [ ] `[BINANCE_CLIENT_WS_DISABLED]` ditinjau agar jelas apakah expected atau error.
- [ ] Jangan log secret/API key.
- [ ] Standardisasi error code frontend/backend.
- [ ] Correlation ID end-to-end:

```text
UI action
→ API request
→ bot runner
→ exchange request
→ order/fill
→ audit event
```

- [ ] Dashboard internal untuk:
  - order failures;
  - reconciliation failures;
  - exchange disconnects;
  - credential conflicts;
  - stale portfolio;
  - bot recovery.

---

# 13. P2 — Database & Migration

- [x] Exchange identity migration.
- [x] Credential history structure.
- [ ] Pastikan seluruh migration tercatat pada `schema_migrations`.
- [ ] Backup sebelum production migration.
- [ ] Migration rollback plan.
- [ ] Unique index verification.
- [ ] Foreign-key/index audit.
- [ ] Retention policy untuk audit/order history.

---

# 14. P2 — Security

- [x] Credential encrypted at rest.
- [x] Secret tidak dikirim ke browser.
- [x] UID ownership checks.
- [x] Duplicate exchange-account protection.
- [ ] API key permission validation: read/trade/withdraw.
- [ ] Tolak credential dengan withdrawal permission jika exchange dapat melaporkan permission scope.
- [ ] IP restriction guidance untuk user.
- [ ] Key rotation policy.
- [ ] Security audit untuk semua financial routes.
- [ ] Rate limit per sensitive endpoint.

---

# 15. P2 — Backtest & Research

Backtest menjadi validation layer sebelum perubahan strategy diterapkan.

- [x] CSV parser.
- [x] Deterministic DCA backtest.
- [x] Candle-driven unit tests.
- [ ] Backtest setiap preset.
- [ ] Backtest setiap timeframe.
- [ ] Backtest MM ON/OFF.
- [ ] Include fee/slippage.
- [ ] Compare backtest signal timestamps dengan live closed-candle timestamps.
- [ ] Regression dataset disimpan versioned.

Acceptance:

```text
Same dataset
+ same config
+ same code version
= same result
```

---

# 16. P3 — Performance & Reliability

- [ ] Kurangi polling yang tidak perlu.
- [ ] Gunakan websocket sebagai primary market-data path jika stabil.
- [ ] HTTP polling menjadi recovery/fallback.
- [ ] Portfolio refresh debounce.
- [ ] Cache ticker berdasarkan exchange + environment + symbol.
- [ ] Batasi reconnect storm.
- [ ] Circuit breaker exchange API.
- [ ] Graceful shutdown runner.
- [ ] Graceful restart recovery.

---

# 17. P3 — Testing Matrix

## Authentication

- [ ] Gmail A login.
- [ ] Gmail B login.
- [ ] OTP success.
- [ ] OTP wrong.
- [ ] OTP expired.
- [ ] Logout.
- [ ] Session expiry.

## Exchange

- [ ] Connect.
- [ ] Reconnect.
- [ ] Disconnect.
- [ ] Same account same UID.
- [ ] Same account different UID.
- [ ] Different account.
- [ ] Multi-exchange.
- [ ] Testnet.
- [ ] Live feature flag.

## Bot

- [ ] Register.
- [ ] Start.
- [ ] Pause.
- [ ] Resume.
- [ ] Restart server.
- [ ] Position recovery.
- [ ] Pending order recovery.
- [ ] Manual TP.
- [ ] Batch close.

## Strategy

- [ ] 3m.
- [ ] 5m.
- [ ] 10m.
- [ ] 15m.
- [ ] 30m.
- [ ] 1h.
- [ ] Closed candle only.
- [ ] No duplicate candle evaluation.

## Money Management

- [ ] MM ON.
- [ ] MM OFF.
- [ ] Capital high.
- [ ] Layer high.
- [ ] Coverage high.
- [ ] Exchange-native limit exceeded.
- [ ] Operational daily-loss limit.

---

# 18. P3 — Release / Deployment Configuration

## Local Development

```text
LIVE_TRADING_ENABLED=false
LIVE_TRADING_TESTNET_ONLY=true
DATABASE_URL=<local/staging>
ENCRYPTION_MASTER_KEY=<secret>
```

## Testnet

```text
LIVE_TRADING_ENABLED=false
LIVE_TRADING_TESTNET_ONLY=true
EXCHANGE_SANDBOX=true
```

## Production preparation

Sebelum `LIVE_TRADING_ENABLED=true`:

- [ ] Semua P0 test PASS.
- [ ] Semua P1 integration test PASS.
- [ ] No unresolved reconciliation gate.
- [ ] Database backup.
- [ ] Secrets rotated.
- [ ] Exchange API withdrawal permission disabled.
- [ ] Monitoring aktif.
- [ ] Kill switch diuji.
- [ ] Recovery drill selesai.

---

# 19. Urutan Eksekusi yang Direkomendasikan

### Sprint 1 — Integrity

1. Jalankan migration.
2. `npm ci`.
3. lint/typecheck.
4. unit test.
5. build.
6. perbaiki seluruh error compilation.

### Sprint 2 — Exchange Identity

7. Test Gmail A → Binance.
8. Test Gmail B → same Binance.
9. Test different Binance account.
10. Test credential rotation.
11. Test disconnect.
12. Test restart/recovery.

### Sprint 3 — Runtime Position

13. Test position authority.
14. Test Firestore stale projection.
15. Test server restart.
16. Test partial fill.
17. Test manual close.

### Sprint 4 — Candle & Strategy

18. Test semua timeframe.
19. Test duplicate candle prevention.
20. Backtest/live parity.
21. Test websocket reconnect.

### Sprint 5 — Wallet & Multi-Exchange

22. Binance portfolio.
23. Bitget portfolio.
24. Switch exchange.
25. Disconnect one exchange.
26. Verify other exchange unaffected.

### Sprint 6 — Account / Promo / Referral

27. Verify promo 90% copy.
28. Verify price configuration.
29. Verify gas bonus ledger.
30. Verify referral ledger.
31. Verify UI copy vs backend financial rules.

### Sprint 7 — Security & Observability

32. API permission audit.
33. Sensitive route audit.
34. Audit log verification.
35. Error-code normalization.
36. Monitoring.

### Sprint 8 — Release Candidate

37. Full test suite.
38. Testnet soak test.
39. Restart drill.
40. Exchange disconnect drill.
41. Recovery drill.
42. Backup/restore drill.
43. Final release sign-off.

---

# 20. Definition of Done

GAIN belum dianggap siap production hanya karena UI terlihat benar.

Definition of Done:

```text
UI benar
AND
Backend state benar
AND
Database ownership benar
AND
Exchange state ter-reconcile
AND
Order lifecycle idempotent
AND
Restart recovery benar
AND
Candle timing benar
AND
Risk configuration benar
AND
Audit trail tersedia
AND
Test suite PASS
AND
Testnet soak test PASS
```

Khusus live trading:

```text
NO UNKNOWN ORDER
NO UNKNOWN POSITION
NO CROSS-USER EXCHANGE OWNERSHIP
NO DUPLICATE CANDLE EXECUTION
NO SECRET IN CLIENT
NO UNRECONCILED RUNNER
```

---

# 21. Release Gate

Urutan gate final:

```text
                    SOURCE
                      ↓
                 TYPECHECK
                      ↓
                   TEST
                      ↓
                   BUILD
                      ↓
             DATABASE MIGRATION
                      ↓
              TESTNET INTEGRATION
                      ↓
             BOT RECOVERY TEST
                      ↓
             EXCHANGE OWNERSHIP
                      ↓
               SECURITY AUDIT
                      ↓
              SOAK TEST / MONITOR
                      ↓
                RELEASE CANDIDATE
                      ↓
                LIVE ENABLEMENT
```

Tidak ada tahap yang boleh dilewati hanya karena fitur UI sudah terlihat bekerja.
