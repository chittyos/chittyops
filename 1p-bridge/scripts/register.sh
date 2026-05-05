#!/usr/bin/env bash
set -euo pipefail

REGISTRY_URL="${REGISTRY_URL:-https://registry.chitty.cc}"
PAYLOAD="$(dirname "$0")/../registration.json"

[ -f "$PAYLOAD" ] || { echo "missing $PAYLOAD" >&2; exit 1; }
jq . "$PAYLOAD" > /dev/null

# Resolve registry write token via op CLI (never hardcoded, never typed)
TOKEN="$(op read 'op://infrastructure/chittyregistry/write_token' 2>/dev/null || echo '')"

# Try the v0.1/servers service-registration endpoint.
endpoint_v01="$REGISTRY_URL/v0.1/servers"

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

echo "==> Posting to $endpoint_v01"
RESPONSE="$(post_with_auth "$endpoint_v01" 2>&1)"
echo "$RESPONSE"

if echo "$RESPONSE" | grep -q "HTTP 2"; then
  echo "==> Registration successful."
else
  echo "==> Registration failed or returned a non-2xx status." >&2
  echo "    Check that the registry is reachable and the payload is valid." >&2
  exit 1
fi
