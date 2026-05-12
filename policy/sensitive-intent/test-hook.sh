#!/usr/bin/env bash
# Conformance test for block-credential-asking.sh.
# Each case feeds a synthetic transcript and asserts whether the hook
# returns a block decision or passes through.
set -u
HOOK="$(dirname "$0")/block-credential-asking.sh"
PASS=0; FAIL=0

assert_blocks() {
  local label="$1" assistant_text="$2"
  local payload result decision
  payload=$(jq -nc --arg t "$assistant_text" '{transcript:[{role:"assistant",content:$t}]}')
  result=$(printf '%s' "$payload" | bash "$HOOK")
  decision=$(printf '%s' "$result" | jq -r '.decision // empty' 2>/dev/null)
  if [ "$decision" = "block" ]; then
    echo "PASS (blocks): $label"; PASS=$((PASS+1))
  else
    echo "FAIL (should block): $label — got: $result"; FAIL=$((FAIL+1))
  fi
}

assert_passes() {
  local label="$1" assistant_text="$2"
  local payload result decision
  payload=$(jq -nc --arg t "$assistant_text" '{transcript:[{role:"assistant",content:$t}]}')
  result=$(printf '%s' "$payload" | bash "$HOOK")
  decision=$(printf '%s' "$result" | jq -r '.decision // empty' 2>/dev/null)
  if [ -z "$decision" ]; then
    echo "PASS (passes): $label"; PASS=$((PASS+1))
  else
    echo "FAIL (should pass): $label — got: $result"; FAIL=$((FAIL+1))
  fi
}

# Classic credential asking — must continue to block.
assert_blocks 'classic paste-api-key' 'Please paste your Cloudflare API key here.'
assert_blocks 'classic provide-token'  'Provide your GitHub token so I can deploy.'
assert_blocks 'classic env-file'       'Share your .env file please.'

# Admin-bypass phrasings — the violation pattern that the prior version missed.
assert_blocks 'widen-1p-token-vaults' \
  "Please go widen the 1P Connect token in 1P admin to add the new vault to its allowed vaults."
assert_blocks 'add-to-allowed-vaults' \
  "Add the chittyconnect vault to that token's allowed vaults in 1Password."
assert_blocks 'drop-in-1p' \
  "Drop the new secret in 1P under infrastructure/cloudflare."
assert_blocks 'go-to-cf-admin' \
  "Go to the Cloudflare dashboard and create a new API token with Workers:Edit scope."
assert_blocks 'manually-rotate-token' \
  "Manually rotate the CF API token in the Cloudflare admin and update wrangler."
assert_blocks 'expand-token-scope' \
  "Expand the scope of the GitHub token to include repo:write."

# Non-violations — must pass through.
assert_passes 'discussing-routing-architecture' \
  "ChittyConnect routes credential requests through the 1P bridge and emits a canonical envelope on failure."
assert_passes 'mentioning-canonical-error-codes' \
  "If the broker is down we emit POLICY_BLOCKED_BROKER_UNAVAILABLE rather than asking the operator."
assert_passes 'plain-text-no-credentials' \
  "I refactored the categorize() function to handle registry.read as non-sensitive."

echo
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
