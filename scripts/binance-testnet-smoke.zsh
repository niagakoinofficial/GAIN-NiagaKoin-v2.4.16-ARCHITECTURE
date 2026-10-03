#!/bin/zsh
set -e

read -s 'BINANCE_TESTNET_API_KEY?Enter the ROTATED Binance testnet API key (input hidden): '
printf '\n'
read -s 'BINANCE_TESTNET_SECRET?Enter the ROTATED Binance testnet secret (input hidden): '
printf '\n'
export BINANCE_TESTNET_API_KEY BINANCE_TESTNET_SECRET
set +e
node scripts/binance-testnet-smoke.mjs
result=$?
unset BINANCE_TESTNET_API_KEY BINANCE_TESTNET_SECRET
exit $result