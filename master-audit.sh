#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
REPORT="$ROOT/audit-report.txt"
: > "$REPORT"
exec > >(tee -a "$REPORT") 2>&1
PASS=0; FAIL=0; BLOCKED=0
run(){ local label="$1"; shift; printf '\n===== %s =====\n' "$label"; if "$@"; then echo "PASS: $label"; PASS=$((PASS+1)); else echo "FAIL: $label"; FAIL=$((FAIL+1)); fi; }

echo 'GAIN-NIAGAKOIN-V4 MASTER AUDIT — READ-ONLY / NO EXCHANGE WRITE'
echo 'This script never starts/stops Docker, starts the bot, resumes a bot, creates an order, or cancels an order.'
echo "Project: $ROOT"
command -v node >/dev/null 2>&1 || { echo 'Node.js required'; exit 2; }
command -v npm >/dev/null 2>&1 || { echo 'npm required'; exit 2; }

if [ ! -d node_modules ]; then run 'Install clean dependencies' npm ci; else echo 'Dependencies already installed.'; fi
run 'TypeScript' npm run lint
run 'Unit tests' npm test
run 'Production build' npm run build
run 'Application security audit' node scripts/security-audit.mjs
run 'Bot P0/P1 static audit' node scripts/master-audit.mjs

printf '\n===== Static secret hygiene =====\n'
HITS="$(grep -RInE --exclude-dir=node_modules --exclude-dir=.git --exclude='package-lock.json' --exclude='audit-report.txt' --exclude='firebase-applet-config.json' '-----BEGIN (RSA|EC|OPENSSH|PRIVATE) KEY-----|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|service_account|private_key' . 2>/dev/null | grep -vE '^\./\.env\.example:' || true)"
if [ -z "$HITS" ]; then echo 'PASS: no obvious credential material in the sanitized package'; PASS=$((PASS+1)); else echo "$HITS" | head -40; echo 'FAIL: possible secret material found'; FAIL=$((FAIL+1)); fi

run 'Environment diagnostic (read-only)' node scripts/environment-diagnostic.mjs

printf '\n===== Runtime integration (read-only) =====\n'
ENV_FILE="${GAIN24_ENV_FILE:-}"
if [ -z "$ENV_FILE" ] && [ -f "$ROOT/.env" ]; then ENV_FILE="$ROOT/.env"; fi
if [ -z "$ENV_FILE" ]; then
  shopt -s nullglob
  env_candidates=("$ROOT/../gain-niagakoin-v4-"*/.env)
  for candidate in "${env_candidates[@]}"; do ENV_FILE="$candidate"; break; done
  shopt -u nullglob
fi
if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
  if GAIN24_ENV_FILE="$ENV_FILE" node scripts/integration-readonly.mjs; then echo 'PASS: Runtime integration'; PASS=$((PASS+1)); else rc=$?; if [ "$rc" -eq 2 ]; then echo 'BLOCKED: Runtime integration missing service/config'; BLOCKED=$((BLOCKED+1)); else echo 'FAIL: Runtime integration'; FAIL=$((FAIL+1)); fi; fi
else
  echo 'BLOCKED: no local .env found for runtime integration'; BLOCKED=$((BLOCKED+1));
fi

printf '\n============================================\nPASS=%s FAIL=%s BLOCKED=%s\n' "$PASS" "$FAIL" "$BLOCKED"
if [ "$FAIL" -eq 0 ] && [ "$BLOCKED" -eq 0 ]; then echo 'VERDICT: FULL READ-ONLY AUDIT PASS — keep bot paused until final controlled recovery review.'; exit 0; fi
if [ "$FAIL" -eq 0 ]; then echo 'VERDICT: STATIC PASS; RUNTIME BLOCKED — no exchange write performed.'; exit 2; fi
echo 'VERDICT: AUDIT FAILED — do not restart/resume bot.'; exit 1
