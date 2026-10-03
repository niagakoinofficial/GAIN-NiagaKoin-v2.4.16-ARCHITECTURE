# GAIN NiagaKoin v1.5 — Public-Test Hardening

## Implemented
- Activation wallet/license sekarang replay-safe dengan `Idempotency-Key` dan persisted unique key.
- Replay activation dibatasi ke account pemilik key; key milik account lain ditolak.
- Deposit tx hash diberi unique database guard per network.
- Exchange Coins Checker menjadi **read-only**: tidak lagi memanggil order execution, termasuk bulk execution test.
- Fallback volume 24h statis dihapus dari tampilan; data yang tidak tersedia ditampilkan sebagai unavailable.
- Tombol Deposit `Tempel / Buat Sample Hash` diubah menjadi `Tempel TxHash`.
- Execution Pipeline Trace diberi label eksplisit sebagai demo arsitektur, bukan telemetry runtime.
- Static/source security audit dan release gate diperluas untuk memeriksa hardening di atas.

## Validasi lokal source
- TS/TSX parser: 0 parse errors.
- Security audit: PASS, 0 failed.
- Release gate: PASS, 0 failed.
- ZIP integrity: wajib diverifikasi setelah packaging.

## Belum boleh diklaim PASS
- `npm ci`, lint, unit/integration test, build produksi jika dependency transport belum tersedia.
- PostgreSQL migration execution pada database nyata.
- Binance Testnet end-to-end.
- Deposit replay test terhadap chain/testnet.
- Withdrawal processor integration.
- Auto-refill worker multi-instance/soak.
- Order ambiguity/recovery chaos test.
- 24–72 jam soak dan closed beta.

Kesimpulan: source layer lebih keras dan lebih aman untuk masuk **Engineering Alpha / Internal Testnet**, tetapi belum menjadi bukti bahwa sistem siap public production.
