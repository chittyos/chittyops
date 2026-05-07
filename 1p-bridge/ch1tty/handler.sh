#!/usr/bin/env bash
# Ch1tty A1-light handler: JSON-in on stdin, JSON-out on stdout.
# Invoked by Ch1tty via SSH: ssh chittyserv-dev /opt/chitty-1p-bridge/ch1tty/handler.sh
set -euo pipefail

INPUT="$(cat)"

# Validate that stdin is parseable JSON before processing; always emit a JSON
# envelope so callers receive a structured error even on malformed input.
if ! echo "$INPUT" | jq -e . > /dev/null 2>&1; then
  jq -nc '{ok:false, error:"received invalid or malformed JSON input"}'; exit 0
fi

TOOL="$(echo "$INPUT" | jq -r '.tool // empty')"
ARGS="$(echo "$INPUT" | jq -c '.args // {}')"

if [ -z "$TOOL" ]; then
  jq -nc '{ok:false, error:"missing required field: tool"}'; exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# chitty-op is at /usr/local/bin in production; for tests, use repo build at dist/cli/index.js
CHITTY_OP=("${CHITTY_OP_BIN:-/usr/local/bin/chitty-op}")
if [ ! -x "${CHITTY_OP[0]}" ] && [ -f "$SCRIPT_DIR/../dist/cli/index.js" ]; then
  CHITTY_OP=(node "$SCRIPT_DIR/../dist/cli/index.js")
fi

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
  else
    # On failure, prefer stderr for the error field; fall back to stdout.
    local msg="${err:-$out}"
    jq -nc --arg error "$msg" --argjson rc "$rc" '{ok:false, error:$error, exit_code:$rc}'
  fi
}

case "$TOOL" in
  op.get)
    P="$(echo "$ARGS" | jq -r '.path // empty')"
    [ -z "$P" ] && { jq -nc '{ok:false, error:"args.path required"}'; exit 0; }
    run_chitty_op get "$P"
    ;;
  op.list)
    V="$(echo "$ARGS" | jq -r '.vault // empty')"
    if [ -n "$V" ]; then run_chitty_op list "$V"; else run_chitty_op list; fi
    ;;
  op.otp)
    P="$(echo "$ARGS" | jq -r '.path // empty')"
    [ -z "$P" ] && { jq -nc '{ok:false, error:"args.path required"}'; exit 0; }
    run_chitty_op otp "$P"
    ;;
  *)
    jq -nc --arg t "$TOOL" '{ok:false, error:("unknown tool: " + $t)}'
    ;;
esac
