# RELEASE MANIFEST — GAIN NiagaKoin v2.0

Application version: 2.4.16
Package label: Multi-Exchange Certification Lab

## Included
- Central exchange capability registry
- Bitget demo/sandbox metadata + UTA websocket normalization
- Reku public read-only adapter
- Triv fail-closed blocked status
- Pintu Pro fail-closed blocked status
- Dynamic exchange lists
- Expanded API guides
- Read-only certification runner
- Registry tests
- Public readiness source checks
- Multi-exchange roadmap/status documents

## Source gates
- Security audit: PASS
- Public readiness source gate: PASS
- Parser: PASS (123 TS/TSX files, 0 parse diagnostics)

## External gates
NOT VERIFIED IN CONTAINER.
Must be run on the user's Mac/staging environment.

## Safety defaults
- LIVE_TRADING_ENABLED=false
- LIVE_TRADING_TESTNET_ONLY=true
- BINANCE_TESTNET_PLACE_ORDERS=false
- BOT_STARTUP_AUTO_RESUME=false
