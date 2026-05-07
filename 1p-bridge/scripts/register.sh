#!/usr/bin/env bash
set -euo pipefail

# Local/dev helper. The canonical registration path is the GitHub Actions
# workflow `.github/workflows/1p-bridge-register.yml`, which routes through
# ChittyConnect (BINDING: sensitive-intent routing). Use this script only
# when CI is unavailable; gate behind ALLOW_LOCAL_REGISTER=1.
if [ "${ALLOW_LOCAL_REGISTER:-0}" != "1" ]; then
  echo "Refusing to register from local script. Use the CI workflow." >&2
  echo "Override with ALLOW_LOCAL_REGISTER=1 if CI is unreachable." >&2
  exit 2
fi

REGISTRY_URL="${REGISTRY_URL:-https://registry.chitty.cc}"
PAYLOAD="$(dirname "$0")/../registration.json"

[ -f "$PAYLOAD" ] || { echo "missing $PAYLOAD" >&2; exit 1; }
jq . "$PAYLOAD" > /dev/null

# Resolve registry write token via op CLI. Distinguish "op failed" from
# "no token configured" — silent fallback to anonymous registration would
# mask auth-state regressions.
if ! TOKEN="$(op read 'op://infrastructure/chittyregistry/write_token' 2>&1)"; then
  echo "op read failed: $TOKEN" >&2
  echo "Set ALLOW_ANON_REGISTER=1 to proceed unauthenticated." >&2
  if [ "${ALLOW_ANON_REGISTER:-0}" != "1" ]; then
    exit 3
  fi
  TOKEN=""
fi

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
