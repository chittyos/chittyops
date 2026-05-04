#!/usr/bin/env bash
set -euo pipefail
HANDLER="$(dirname "$0")/../ch1tty/handler.sh"
PASS=0; FAIL=0

assert_field() {
  local name="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then echo "PASS: $name"; PASS=$((PASS+1));
  else echo "FAIL: $name (expected '$expected', got '$actual')"; FAIL=$((FAIL+1)); fi
}

OUT="$(echo '{}' | bash "$HANDLER" | jq -r '.ok')"
assert_field 'missing-tool returns ok=false' "$OUT" 'false'

OUT="$(echo '{"tool":"bogus"}' | bash "$HANDLER" | jq -r '.ok')"
assert_field 'unknown-tool returns ok=false' "$OUT" 'false'

OUT="$(echo '{"tool":"op.get","args":{}}' | bash "$HANDLER" | jq -r '.ok')"
assert_field 'op.get without path returns ok=false' "$OUT" 'false'

OUT="$(echo '{"tool":"op.otp","args":{}}' | bash "$HANDLER" | jq -r '.ok')"
assert_field 'op.otp without path returns ok=false' "$OUT" 'false'

echo
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
