#!/bin/sh
set -eu

base_url=${BASE_URL:-http://127.0.0.1:3000}
routes="register delete pause-all resume-all engine-status credentials disconnect-exchange kill-switch"

for route in $routes; do
  method=POST
  [ "$route" != "engine-status" ] || method=GET
  status=$(curl -sS -o /dev/null -w '%{http_code}' -X "$method" \
    "$base_url/api/bot/$route" \
    -H 'Content-Type: application/json' \
    -d '{}')
  if [ "$status" != 401 ]; then
    printf '%s expected 401, got %s\n' "$route" "$status" >&2
    exit 1
  fi
  printf '%s: unauthenticated request rejected (401)\n' "$route"
done