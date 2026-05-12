#!/usr/bin/env bash
# Install / update the System-Wide Sensitive Intent Contract v1 chat-layer
# guard on the local machine and (optionally) on chittyserv-vm.
#
# Usage:
#   policy/sensitive-intent/install.sh                 # local only
#   policy/sensitive-intent/install.sh --remote HOST   # local + remote (e.g. chittyserv-dev)
#   policy/sensitive-intent/install.sh --remote-only HOST
#
# The hook is the canonical artifact in this repo; this script copies it
# into the Claude Code hooks dir (~/.claude/hooks) and verifies the Stop
# hook entry in settings.json. Re-running is idempotent.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOK_SRC="$REPO_ROOT/policy/sensitive-intent/block-credential-asking.sh"
CANON_DIR="$REPO_ROOT/policy/canon"
HOOK_TEST="$REPO_ROOT/policy/sensitive-intent/test-hook.sh"

REMOTE=""
LOCAL=true
while [ $# -gt 0 ]; do
  case "$1" in
    --remote)       REMOTE="$2"; shift 2 ;;
    --remote-only)  REMOTE="$2"; LOCAL=false; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0"; exit 0 ;;
    *)
      echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done

[ -f "$HOOK_SRC" ] || { echo "hook source missing: $HOOK_SRC" >&2; exit 1; }

install_local() {
  local hooks_dir="$HOME/.claude/hooks"
  local target="$hooks_dir/block-credential-asking.sh"
  mkdir -p "$hooks_dir"
  if [ -f "$target" ] && diff -q "$HOOK_SRC" "$target" >/dev/null 2>&1; then
    echo "[local] hook already up to date: $target"
  else
    install -m 0755 "$HOOK_SRC" "$target"
    echo "[local] installed hook: $target"
  fi

  # Verify settings.json references the hook on Stop.
  local settings="$HOME/.claude/settings.json"
  if [ -f "$settings" ] && command -v jq >/dev/null 2>&1; then
    if jq -e '.hooks.Stop[]?.hooks[]? | select(.command | test("block-credential-asking.sh"))' \
         "$settings" >/dev/null 2>&1; then
      echo "[local] settings.json Stop hook entry: OK"
    else
      cat <<EOF >&2
[local] WARN: settings.json does NOT bind block-credential-asking.sh on Stop.
       Add the following to ~/.claude/settings.json under "hooks.Stop":
         { "type": "command", "command": "$target" }
EOF
    fi
  else
    echo "[local] (skipping settings.json check; jq or settings missing)"
  fi

  # Run the hook self-test to prove the rules fire.
  echo "[local] running hook self-test..."
  bash "$HOOK_TEST"
}

install_remote() {
  local host="$1"
  echo "[$host] mirroring hook + canon to remote..."
  ssh "$host" "mkdir -p ~/.claude/hooks ~/.ch1tty/canon"
  scp -q "$HOOK_SRC" "$host:~/.claude/hooks/block-credential-asking.sh"
  ssh "$host" "chmod 0755 ~/.claude/hooks/block-credential-asking.sh"
  scp -q "$HOOK_TEST" "$host:/tmp/test-credential-asking-hook.sh"
  ssh "$host" "chmod +x /tmp/test-credential-asking-hook.sh"
  scp -q "$CANON_DIR"/*.md "$CANON_DIR"/*.json "$CANON_DIR"/*.yaml \
    "$host:~/.ch1tty/canon/"
  echo "[$host] running hook self-test on remote..."
  ssh "$host" "HOOK=~/.claude/hooks/block-credential-asking.sh bash -c '
    sed -i.bak \"s|HOOK=\\\"\\\$(dirname \\\"\\\$0\\\")/block-credential-asking.sh\\\"|HOOK=~/.claude/hooks/block-credential-asking.sh|\" /tmp/test-credential-asking-hook.sh
    bash /tmp/test-credential-asking-hook.sh
  '"
  echo "[$host] verifying settings.json Stop hook entry..."
  ssh "$host" "command -v jq >/dev/null && [ -f ~/.claude/settings.json ] && \
    jq -e '.hooks.Stop[]?.hooks[]? | select(.command | test(\"block-credential-asking.sh\"))' \
       ~/.claude/settings.json >/dev/null 2>&1 \
    && echo '[$host] settings.json Stop hook entry: OK' \
    || echo '[$host] WARN: settings.json missing the Stop hook entry — bind manually'"
}

if [ "$LOCAL" = true ]; then
  install_local
fi
if [ -n "$REMOTE" ]; then
  install_remote "$REMOTE"
fi
