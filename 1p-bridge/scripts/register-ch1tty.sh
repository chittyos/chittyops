#!/usr/bin/env bash
set -euo pipefail

# Local/dev helper. Canonical Ch1tty registration routes through CI +
# ChittyConnect (BINDING). Gate behind ALLOW_LOCAL_REGISTER=1.
if [ "${ALLOW_LOCAL_REGISTER:-0}" != "1" ]; then
  echo "Refusing to register from local script. Use the CI workflow." >&2
  echo "Override with ALLOW_LOCAL_REGISTER=1 if CI is unreachable." >&2
  exit 2
fi

CH1TTY_URL="${CH1TTY_URL:-https://agent.chitty.cc/mcp}"
MANIFEST="$(dirname "$0")/../ch1tty/manifest.json"

[ -f "$MANIFEST" ] || { echo "missing $MANIFEST" >&2; exit 1; }
jq . "$MANIFEST" > /dev/null

# Distinguish "op failed" from "no token configured".
if ! TOKEN="$(op read 'op://infrastructure/ch1tty/registry_write_token' 2>&1)"; then
  echo "op read failed: $TOKEN" >&2
  if [ "${ALLOW_ANON_REGISTER:-0}" != "1" ]; then
    echo "Set ALLOW_ANON_REGISTER=1 to proceed unauthenticated." >&2
    exit 3
  fi
  TOKEN=""
fi
if [ -z "$TOKEN" ]; then
  echo "warn: no Ch1tty write token; attempting anonymous registration" >&2
  curl -sS -X POST "$CH1TTY_URL/tools/register" \
    -H "Content-Type: application/json" \
    --data @"$MANIFEST" | jq .
else
  curl -sS -X POST "$CH1TTY_URL/tools/register" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data @"$MANIFEST" | jq .
fi
