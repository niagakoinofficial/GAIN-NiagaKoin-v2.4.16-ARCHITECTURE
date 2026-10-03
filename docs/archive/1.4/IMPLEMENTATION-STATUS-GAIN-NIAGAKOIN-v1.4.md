# GAIN NiagaKoin — Implementation Status v1.4

Tanggal: 2 Oktober 2026

## Source implementation

### Financial authority
- Manual Close Layer tidak lagi mengubah wallet/Firestore secara langsung; request dikirim ke authoritative bot runtime.
- Activation/deposit/withdrawal/transfer/real gas top-up tidak lagi melakukan financial mutation kedua dari client.
- Withdrawal UI membedakan request REVIEW dari settlement.
- Deposit QR memakai `QRCode.toDataURL()` terhadap alamat deposit yang diberikan server.
- Tidak ada random TxHash fallback.
- Fake financial fallbacks pada wallet/trading matrix dihapus.

### Financial ledger
- `src/config/financialConfig.ts` menjadi source of truth.
- `wallet_ledger.idempotency_key` ditambahkan.
- Gas top-up bonus dihitung backend.
- Referral trading fee 20% cash disettle dalam transaksi PostgreSQL yang sama dengan fill settlement.
- Referral top-up 10% non-cash disettle dalam transaksi PostgreSQL.
- `/api/wallet/profit-share` tersedia.
- Profit Share modal membaca backend.

### Auto refill
- `gas_auto_refill_configs` migration.
- `/api/wallet/auto-refill` GET/POST.
- Worker auto-refill setiap 60 detik dengan threshold, refill amount, dan daily cap.
- Ledger + audit + Firestore projection setelah refill.

### Trading runtime
- Partial Force TP mendukung `quantity` dan `layerId`.
- Runner menyimpan `closedLayerIds`.
- Position projection menyertakan `closedLayerIds`.
- UI Trade Detail menyembunyikan layer yang sudah authoritative ditutup.

### Backtest
- Fee/slippage configuration.
- Deterministic Monte Carlo bootstrap stress test.
- Backtest UI menampilkan stress distribution.
- Matrix simulation button membuka Backtest Workspace.

## Verification completed in this container

- TypeScript parser: 121 TS/TSX files, 0 parse errors.
- `scripts/security-audit.mjs`: PASS, failed=0.
- `scripts/release-gate.mjs`: PASS, failed=0, externalValidationRequired=true.

## Verification not completed

`npm ci` timed out in the container before dependencies were fully installed. Karena itu:

- `npm run lint`: belum dapat dinyatakan PASS.
- `npm run test`: belum dapat dinyatakan PASS.
- `npm run build`: belum dapat dinyatakan PASS.

Ini adalah dependency/environment limitation, bukan klaim bahwa test/build gagal secara fungsional.

## Required Mac/Testnet validation

1. npm ci
2. lint
3. unit tests
4. build
5. db:migrate
6. Binance Testnet
7. financial ledger integration
8. referral two-account integration
9. manual partial close
10. withdrawal settlement
11. deposit verification
12. auto-refill
13. restart/pending/partial order recovery
14. candle duplicate guard
15. MM ON/OFF
16. multi-exchange isolation
17. 24–72h Testnet soak

## Release rule

Source PASS != Exchange Integration PASS.

Live trading must remain disabled until the external validation matrix is completed.
