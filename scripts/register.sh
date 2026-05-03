#!/usr/bin/env bash
set -euo pipefail

REGISTRY_URL="${REGISTRY_URL:-https://registry.chitty.cc}"
PAYLOAD="$(dirname "$0")/../registration.json"

[ -f "$PAYLOAD" ] || { echo "missing $PAYLOAD" >&2; exit 1; }
jq . "$PAYLOAD" > /dev/null

# Resolve registry write token via op CLI (never hardcoded, never typed)
TOKEN="$(op read 'op://infrastructure/chittyregistry/write_token' 2>/dev/null || echo '')"

# Try v0.1/servers first (MCP-style); fall back to api/v1/sync if 404
endpoint_v01="$REGISTRY_URL/v0.1/servers"
endpoint_v1="$REGISTRY_URL/api/v1/sync"

post_with_auth() {
  local url="$1"
  if [ -n "$TOKEN" ]; then
    curl -sS -w "\nHTTP %{http_code}\n" -X POST "$url" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      --data @"$PAYLOAD"
  else
    curl -sS -w "\nHTTP %{http_code}\n" -X POST "$url" \
      -H "Content-Type: application/json" \
      --data @"$PAYLOAD"
  fi
}

echo "==> Trying $endpoint_v01"
RESPONSE_V01="$(post_with_auth "$endpoint_v01" 2>&1)"
echo "$RESPONSE_V01"

if echo "$RESPONSE_V01" | grep -q "HTTP 404\|HTTP 405\|HTTP 501"; then
  echo
  echo "==> v0.1 failed, trying $endpoint_v1"
  post_with_auth "$endpoint_v1"
fi
