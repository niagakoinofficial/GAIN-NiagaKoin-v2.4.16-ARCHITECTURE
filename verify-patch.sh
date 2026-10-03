#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PASS=0
FAIL=0
SKIP=0

run() {
  local label="$1"; shift
  printf '\n===== %s =====\n' "$label"
  if "$@"; then
    printf 'PASS: %s\n' "$label"
    PASS=$((PASS+1))
  else
    printf 'FAIL: %s\n' "$label"
    FAIL=$((FAIL+1))
  fi
}

printf '%s\n' 'GAIN-NIAGAKOIN-V4 PATCH VERIFIER — READ-ONLY / NO EXCHANGE WRITE'
printf '%s\n' 'This verifier does not start the bot, place/cancel orders, or resume any bot.'
printf 'Project: %s\n' "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js is required.'
  exit 2
fi
if ! command -v npm >/dev/null 2>&1; then
  echo 'npm is required.'
  exit 2
fi

NODE_VERSION="$(node -v)"
NPM_VERSION="$(npm -v)"
printf 'Node: %s | npm: %s\n' "$NODE_VERSION" "$NPM_VERSION"

if [ ! -d node_modules ]; then
  run 'Install clean dependencies (npm ci)' npm ci
else
  echo 'node_modules already exists; skipping npm ci.'
fi

run 'TypeScript check' npm run lint
run 'Unit tests' npm test
run 'Production build' npm run build
run 'Application security audit' node scripts/security-audit.mjs

printf '\n===== Static secret hygiene =====\n'
SECRET_HITS="$(grep -RInE --exclude-dir=node_modules --exclude-dir=.git --exclude='package-lock.json' \
  '-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|sk_(live|test)_[0-9A-Za-z]+|service_account|private_key' \
  . 2>/dev/null | grep -vE '^\./\.env\.example:' || true)"
if [ -z "$SECRET_HITS" ]; then
  echo 'PASS: no obvious credential patterns found outside .env.example'
  PASS=$((PASS+1))
else
  echo 'FAIL: possible secret material found:'
  echo "$SECRET_HITS" | head -80
  FAIL=$((FAIL+1))
fi

printf '\n===== Dangerous runtime command scan =====\n'
DANGEROUS="$(grep -RInE --exclude-dir=node_modules --exclude-dir=.git \
  'createOrder\(|cancelOrder\(|setBotStatus\([^\n]*active|transitionBotLifecycle' \
  src server.ts 2>/dev/null | head -80 || true)"
if [ -n "$DANGEROUS" ]; then
  echo 'INFO: exchange/lifecycle code exists (expected); no commands were executed by this verifier.'
else
  echo 'INFO: no matching runtime write calls found in scanned files.'
fi

printf '\n============================================\n'
printf 'PASS=%s FAIL=%s SKIP=%s\n' "$PASS" "$FAIL" "$SKIP"
if [ "$FAIL" -eq 0 ]; then
  echo 'VERDICT: STATIC/LOCAL VERIFICATION PASS'
  echo 'NEXT: controlled integration verification; keep bot paused and exchange writes at 0.'
  exit 0
else
  echo 'VERDICT: VERIFICATION FAILED — do not restart/resume the bot.'
  exit 1
fi
