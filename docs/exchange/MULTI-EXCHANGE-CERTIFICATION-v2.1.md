# GAIN NiagaKoin — Multi-Exchange Certification v2.1

## Tujuan

v2.1 menaikkan certification dari public/read-only menjadi lifecycle bertahap per exchange:

1. `authenticated_readonly`
2. `sandbox_demo_order`
3. `micro_live_order`
4. `reconcile`
5. `recovery`

Urutan ini sengaja memisahkan pembuktian akses akun, order simulasi, micro-live, rekonsiliasi, dan pemulihan.

## Exchange target

Global: Binance, Bitget, OKX, Bybit, Coinbase, Kraken.

Indonesia: Indodax, Tokocrypto, Bittime, Pintu Pro, Reku, Triv.

Registry tidak menyamakan semua exchange. Reku tetap read-only; Triv dan Pintu Pro tetap blocked jika native trading contract belum diverifikasi.

## Stage 1 — Authenticated read-only

Memeriksa `loadMarkets`, ticker, balance, dan open orders bila adapter mendukung.

Tidak ada order yang dikirim.

## Stage 2 — Sandbox/Demo order

Hanya aktif untuk exchange yang memiliki sandbox/demo resmi dan credential tersimpan berstatus sandbox.

Order berupa limit order non-marketable dengan notional kecil, lalu di-query dan dibatalkan. Run disimpan ke PostgreSQL sehingga order ID tidak hilang ketika proses perlu direstart.

Bitget demo memerlukan Demo API key dan header `paptrading: 1`; OKX demo memerlukan `x-simulated-trading: 1`. Bybit memiliki Demo/Testnet, dan Binance memiliki Spot Testnet. Dokumentasi resmi tersebut harus menjadi kontrak referensi implementasi.

## Stage 3 — Micro-live order

**OFF by default.** Harus memenuhi seluruh gate:

- `EXCHANGE_CERT_MICRO_LIVE_ENABLED=true`
- `LIVE_TRADING_ENABLED=true`
- `LIVE_TRADING_TESTNET_ONLY=false`
- credential bukan sandbox
- session elevation aktif
- 2FA/TOTP valid dan counter belum pernah digunakan
- konfirmasi exchange-spesifik `I_UNDERSTAND_MICRO_LIVE_CERTIFICATION:<EXCHANGE>`

Order tetap dibuat non-marketable dan dibatasi oleh server. Tidak ada follow-up order otomatis jika order ternyata mendapat fill. Jika cancel gagal, status menjadi `WARNING` dan membutuhkan tindakan manual.

## Stage 4 — Reconciliation

Mengambil kembali order certification terakhir dari exchange dan mencocokkan ID/status/fill dengan record PostgreSQL.

## Stage 5 — Recovery

Membuat client exchange baru dan melakukan query order ulang dua kali untuk memastikan state stabil. Jalankan stage ini **setelah server/worker restart** untuk menguji boundary recovery yang sebenarnya.

## Persistensi

Migration `009_exchange_certification_runs.sql` menyimpan:

- user/exchange
- stage/mode/status
- symbol
- client/exchange order ID
- requested qty/price/notional
- exchange status
- filled qty/average price
- result JSON
- timestamps

## UI

`ExchangeCertificationPanel` menyediakan lima tombol stage. Stage micro-live meminta OTP dan konfirmasi eksplisit, tetapi tetap tunduk pada gate server.

## Command source gate

```bash
npm run test:exchange-registry
npm run test:exchange-certification
npm run test:exchange-certification-stages
npm run release:public-audit
```

## Batasan

v2.1 tidak mengklaim bahwa semua exchange sudah live-certified. Sertifikasi aktual tetap memerlukan credential masing-masing exchange dan test runtime di environment target.
