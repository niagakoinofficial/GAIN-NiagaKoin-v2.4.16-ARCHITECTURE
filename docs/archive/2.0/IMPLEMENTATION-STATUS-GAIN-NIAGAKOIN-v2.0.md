# IMPLEMENTATION STATUS — GAIN NiagaKoin v2.0 Multi-Exchange Certification

Tanggal: 2026-10-02

## Implemented
- Central `EXCHANGE_REGISTRY` untuk global + Indonesia.
- Bitget ditambahkan sebagai FULL exchange dengan sandbox/demo capability.
- Reku ditambahkan sebagai public read-only adapter menggunakan official public API.
- Triv ditambahkan sebagai explicit `BLOCKED_PENDING_NATIVE_API` tanpa fake adapter.
- Pintu Pro juga fail-closed sampai native API contract terverifikasi.
- HeaderBar dan Exchange Coin Checker mengambil exchange list dari registry agar tidak drift.
- ApiKeyModal memiliki guide untuk seluruh registry dan tidak menampilkan mode live/testnet untuk public-only certification targets.
- Public-only targets tidak meminta API secret.
- Bitget UTA public WebSocket memakai `topic: ticker` dan `symbol`.
- Certification runner `npm run test:exchange-certification`.
- Registry regression tests.
- Release readiness checks untuk registry/certification/Bitget WS/Reku/Triv.

## Source validation in this environment
- TypeScript/TSX parser: PASS — 123 files, 0 parse diagnostics.
- Security audit: PASS — 0 failed.
- Public readiness source gate: PASS — 0 failed.
- ZIP integrity: to be checked after packaging.
- Full npm lint/test/build: NOT CLAIMED because container dependency installation timed out / incomplete.

## External validation required
Run on Mac project:
- `npm ci`
- `npm run lint`
- `npm test`
- `npm run test:core`
- `npm run build`
- `npm run test:exchange-registry`
- `npm run test:exchange-certification`

Then perform authenticated read-only certification for exchange credentials one by one.
Do not enable withdrawal permission.
Do not use one exchange's credentials for another exchange.
