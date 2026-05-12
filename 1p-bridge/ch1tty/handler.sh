#!/usr/bin/env bash
# Ch1tty A1-light handler: JSON-in on stdin, JSON-out on stdout.
# Invoked by Ch1tty via SSH: ssh chittyserv-dev /opt/chitty-1p-bridge/ch1tty/handler.sh
#
# All chitty-op invocations from this handler are tagged source=broker so
# the policy gate in the CLI knows the intent arrived via the mandatory
# broker route, not directly from chat. CLI errors are returned as-is —
# the CLI already emits a canonical PolicyEnvelope on stderr.
set -euo pipefail

INPUT="$(cat)"

# Validate that stdin is parseable JSON before processing; always emit a JSON
# envelope so callers receive a structured error even on malformed input.
if ! echo "$INPUT" | jq -e . > /dev/null 2>&1; then
  jq -nc '{ok:false, error_code:"EXECUTION_DENIED_BY_POLICY", message:"received invalid or malformed JSON input"}'
  exit 0
fi

TOOL="$(echo "$INPUT" | jq -r '.tool // empty')"
ARGS="$(echo "$INPUT" | jq -c '.args // {}')"

if [ -z "$TOOL" ]; then
  jq -nc '{ok:false, error_code:"EXECUTION_DENIED_BY_POLICY", message:"missing required field: tool"}'
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# chitty-op is at /usr/local/bin in production; for tests, use repo build at dist/cli/index.js
CHITTY_OP=("${CHITTY_OP_BIN:-/usr/local/bin/chitty-op}")
if [ ! -x "${CHITTY_OP[0]}" ] && [ -f "$SCRIPT_DIR/../dist/cli/index.js" ]; then
  CHITTY_OP=(node "$SCRIPT_DIR/../dist/cli/index.js")
fi

# Mark every CLI invocation as broker-sourced so the policy gate doesn't
# treat handler calls as chat-layer requests.
export CHITTY_BRIDGE_SOURCE=broker

run_chitty_op() {
  local stdout_file stderr_file out err rc
  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"
  "${CHITTY_OP[@]}" "$@" >"$stdout_file" 2>"$stderr_file" && rc=0 || rc=$?
  out="$(cat "$stdout_file")"
  err="$(cat "$stderr_file")"
  rm -f "$stdout_file" "$stderr_file"
  if [ "$rc" -eq 0 ]; then
    jq -nc --arg result "$out" '{ok:true, result:$result}'
    return
  fi

  # CLI exit codes:
  #   0 = ok
  #   1 = provider error (envelope on stderr)
  #   2 = policy error (envelope on stderr)
  # If stderr is a JSON envelope, propagate it verbatim (already canonical).
  # Otherwise wrap in a generic envelope with the error string scrubbed.
  if echo "$err" | jq -e '.error_code // empty' > /dev/null 2>&1; then
    echo "$err"
  else
    local code="EXECUTION_FAILED_PROVIDER_ERROR"
    [ "$rc" -eq 2 ] && code="EXECUTION_DENIED_BY_POLICY"
    jq -nc --arg msg "$err" --arg code "$code" --argjson rc "$rc" \
      '{ok:false, error_code:$code, message:$msg, details:{exit_code:$rc}}'
  fi
}

case "$TOOL" in
  op.get)
    P="$(echo "$ARGS" | jq -r '.path // empty')"
    if [ -z "$P" ]; then
      jq -nc '{ok:false, error_code:"EXECUTION_DENIED_BY_POLICY", message:"args.path required"}'
      exit 0
    fi
    run_chitty_op get "$P"
    ;;
  op.list)
    V="$(echo "$ARGS" | jq -r '.vault // empty')"
    if [ -n "$V" ]; then run_chitty_op list "$V"; else run_chitty_op list; fi
    ;;
  op.otp)
    P="$(echo "$ARGS" | jq -r '.path // empty')"
    if [ -z "$P" ]; then
      jq -nc '{ok:false, error_code:"EXECUTION_DENIED_BY_POLICY", message:"args.path required"}'
      exit 0
    fi
    run_chitty_op otp "$P"
    ;;
  *)
    jq -nc --arg t "$TOOL" '{ok:false, error_code:"EXECUTION_DENIED_BY_POLICY", message:("unknown tool: " + $t)}'
    ;;
esac
