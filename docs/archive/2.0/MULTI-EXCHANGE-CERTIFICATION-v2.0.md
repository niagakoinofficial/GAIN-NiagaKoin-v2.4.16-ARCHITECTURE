# GAIN NiagaKoin — Multi-Exchange Certification Lab v2.0

## Tujuan
Memperluas GAIN dari single-exchange validation menjadi certification lab untuk exchange global dan Indonesia, dengan satu registry kemampuan dan adapter yang jujur terhadap bukti API.

## Registry v2.0
- Binance — FULL / sandbox
- Bitget — FULL / demo + REST/WS
- OKX — FULL / demo
- Bybit — FULL / testnet/demo
- Coinbase — READ_ONLY
- Kraken — READ_ONLY
- Indodax — READ_ONLY
- Tokocrypto — READ_ONLY
- Bittime — READ_ONLY
- Pintu Pro — BLOCKED_PENDING_NATIVE_API
- Reku — READ_ONLY public API
- Triv — BLOCKED_PENDING_NATIVE_API

## Prinsip
1. Entry UI tidak sama dengan trading support.
2. READ_ONLY berarti hanya market/account read paths yang diperbolehkan.
3. BLOCKED_PENDING_NATIVE_API berarti tidak ada endpoint palsu, scraping UI, atau order.
4. Withdrawal permission tidak dibutuhkan untuk certification.
5. Certification publik tidak menempatkan order.
6. Order test hanya melalui sandbox/demo atau gate micro-order live yang eksplisit.

## Certification runner
`npm run test:exchange-certification`

Mode default:
`PUBLIC_READ_ONLY`

Runner menguji endpoint public/read-only yang dapat diverifikasi dan melaporkan PASS/FAIL/BLOCKED tanpa mengirim order.

## Reku
GAIN menggunakan public API resmi `https://api.reku.id/v2` untuk price/bid-ask/market-data. Tidak ada authenticated trading adapter diaktifkan sampai kontrak order resmi dapat diverifikasi.

## Triv
Status `BLOCKED_PENDING_NATIVE_API`. GAIN tidak mengarang endpoint trading dan tidak melakukan scraping halaman market.

## Bitget
Bitget dicatat sebagai exchange penuh dengan passphrase dan sandbox/demo. Adapter websocket memakai kontrak UTA ticker `topic: ticker` + `symbol`. Demo API menggunakan dedicated Demo API Key dan header/lingkungan demo resmi exchange.

## Runtime safety
- `BINANCE_TESTNET_PLACE_ORDERS=false` tetap default.
- `BOT_STARTUP_AUTO_RESUME=false` tetap default.
- Exchange certification read-only tidak mengirim order.
- Secrets tidak disimpan di localStorage.

## Status release
Source gates: PASS.
External validation: REQUIRED di Mac/staging untuk `npm ci`, lint, tests, build, dan certification runner terhadap internet/API yang sebenarnya.
