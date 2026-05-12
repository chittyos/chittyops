#!/usr/bin/env bash
set -euo pipefail
HANDLER="$(dirname "$0")/../ch1tty/handler.sh"
PASS=0; FAIL=0

assert_field() {
  local name="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then echo "PASS: $name"; PASS=$((PASS+1));
  else echo "FAIL: $name (expected '$expected', got '$actual')"; FAIL=$((FAIL+1)); fi
}

# --- malformed input ---
RESULT="$(echo '{}' | bash "$HANDLER")"
OK="$(echo "$RESULT" | jq -r '.ok')"
CODE="$(echo "$RESULT" | jq -r '.error_code')"
assert_field 'missing-tool returns ok=false' "$OK" 'false'
assert_field 'missing-tool returns canonical error_code' "$CODE" 'EXECUTION_DENIED_BY_POLICY'

RESULT="$(echo '{"tool":"bogus"}' | bash "$HANDLER")"
OK="$(echo "$RESULT" | jq -r '.ok')"
CODE="$(echo "$RESULT" | jq -r '.error_code')"
assert_field 'unknown-tool returns ok=false' "$OK" 'false'
assert_field 'unknown-tool returns canonical error_code' "$CODE" 'EXECUTION_DENIED_BY_POLICY'

RESULT="$(echo '{"tool":"op.get","args":{}}' | bash "$HANDLER")"
OK="$(echo "$RESULT" | jq -r '.ok')"
CODE="$(echo "$RESULT" | jq -r '.error_code')"
assert_field 'op.get without path returns ok=false' "$OK" 'false'
assert_field 'op.get without path returns canonical error_code' "$CODE" 'EXECUTION_DENIED_BY_POLICY'

RESULT="$(echo '{"tool":"op.otp","args":{}}' | bash "$HANDLER")"
OK="$(echo "$RESULT" | jq -r '.ok')"
CODE="$(echo "$RESULT" | jq -r '.error_code')"
assert_field 'op.otp without path returns ok=false' "$OK" 'false'
assert_field 'op.otp without path returns canonical error_code' "$CODE" 'EXECUTION_DENIED_BY_POLICY'

RESULT="$(echo 'not-json' | bash "$HANDLER")"
OK="$(echo "$RESULT" | jq -r '.ok')"
CODE="$(echo "$RESULT" | jq -r '.error_code')"
assert_field 'malformed JSON returns ok=false' "$OK" 'false'
assert_field 'malformed JSON returns canonical error_code' "$CODE" 'EXECUTION_DENIED_BY_POLICY'

echo
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
