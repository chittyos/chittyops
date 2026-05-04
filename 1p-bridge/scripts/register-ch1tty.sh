#!/usr/bin/env bash
set -euo pipefail
CH1TTY_URL="${CH1TTY_URL:-https://agent.chitty.cc/mcp}"
MANIFEST="$(dirname "$0")/../ch1tty/manifest.json"

[ -f "$MANIFEST" ] || { echo "missing $MANIFEST" >&2; exit 1; }
jq . "$MANIFEST" > /dev/null

TOKEN="$(op read 'op://infrastructure/ch1tty/registry_write_token' 2>/dev/null || echo '')"
if [ -z "$TOKEN" ]; then
  echo "warn: no Ch1tty write token in 1P; attempting anonymous registration" >&2
  curl -sS -X POST "$CH1TTY_URL/tools/register" \
    -H "Content-Type: application/json" \
    --data @"$MANIFEST" | jq .
else
  curl -sS -X POST "$CH1TTY_URL/tools/register" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data @"$MANIFEST" | jq .
fi
