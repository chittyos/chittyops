#!/usr/bin/env bash
# audit-local-ingest.sh
# Local ingest health audit for chittyserv-vm. Same pattern as
# chittyconnect's binding-drift audit (#216/#217) — detect silent drift
# in the local->remote sync pipeline so disk doesn't fill again.
#
# Checks:
#   1. Every systemd unit in the must-run allowlist is `active`.
#      Treats "unit does not exist on host" as drift (catches deploy regressions).
#   2. Local ingest buffer dirs are below configured size + age thresholds.
#   3. Root filesystem usage is below warn / page thresholds.
#
# Exit codes:
#   0  — all green
#   1  — drift detected (one or more checks failed)
#   2  — usage / config error
#
# Output: JSON report on stdout. Human summary on stderr.
#
# This script does NOT require sudo. It uses `systemctl is-active`
# (unprivileged), `du`, `find`, `df`. It must run *on* chittyserv-vm —
# the GHA cron wrapper (or local timer) is responsible for getting it there.
#
# Tracking: chittyos/chittyentity#369
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="${LOCAL_INGEST_CONFIG:-$SCRIPT_DIR/../config/local-ingest-health.allowlist.json}"

if ! command -v jq >/dev/null 2>&1; then
  echo "audit-local-ingest: jq is required" >&2
  exit 2
fi

if [ ! -f "$CONFIG_FILE" ]; then
  echo "audit-local-ingest: config not found: $CONFIG_FILE" >&2
  exit 2
fi

DRIFT=0
FINDINGS_FILE="$(mktemp)"
trap 'rm -f "$FINDINGS_FILE"' EXIT
echo "[]" > "$FINDINGS_FILE"

add_finding() {
  local severity="$1" code="$2" detail="$3"
  jq --arg s "$severity" --arg c "$code" --arg d "$detail" \
    '. + [{severity:$s, code:$c, detail:$d}]' \
    "$FINDINGS_FILE" > "$FINDINGS_FILE.tmp" && mv "$FINDINGS_FILE.tmp" "$FINDINGS_FILE"
}

# 1. Systemd units
mapfile -t UNITS < <(jq -r '.must_run_units[] | "\(.unit)|\(.kind)"' "$CONFIG_FILE")
for entry in "${UNITS[@]}"; do
  unit="${entry%%|*}"
  kind="${entry##*|}"
  # systemctl is-active returns "active", "inactive", "failed", or "unknown" (for missing units).
  state="$(systemctl is-active "$unit" 2>/dev/null || true)"
  loaded="$(systemctl show -p LoadState --value "$unit" 2>/dev/null || echo "unknown")"
  if [ "$loaded" = "not-found" ] || [ "$loaded" = "masked" ]; then
    add_finding "drift" "unit_missing" "$unit ($kind): LoadState=$loaded — not installed on host"
    DRIFT=1
    continue
  fi
  case "$kind" in
    timer)
      # Timers should be active (loaded+enabled). Inactive timer = no triggering = silent drift.
      if [ "$state" != "active" ]; then
        add_finding "drift" "timer_not_active" "$unit: state=$state (expected active)"
        DRIFT=1
      fi
      ;;
    service)
      # Oneshot services driven by timers will be "inactive (dead)" between runs — that's healthy.
      # Drift is "failed" (last run errored) or LoadState=not-found.
      if [ "$state" = "failed" ]; then
        last_lines="$(journalctl -u "$unit" -n 5 --no-pager -o cat 2>/dev/null | tr '\n' ' ' | head -c 400 || true)"
        add_finding "drift" "service_failed" "$unit: state=failed; last journal: $last_lines"
        DRIFT=1
      fi
      ;;
  esac
done

# 2. Buffer paths
mapfile -t BUFFERS < <(jq -c '.buffer_paths[]' "$CONFIG_FILE")
for buf in "${BUFFERS[@]}"; do
  path="$(echo "$buf" | jq -r '.path')"
  max_bytes="$(echo "$buf" | jq -r '.max_total_bytes')"
  max_age_hours="$(echo "$buf" | jq -r '.max_age_hours')"
  [ -d "$path" ] || continue
  total_bytes="$(du -sb "$path" 2>/dev/null | awk '{print $1}')"
  if [ -n "$total_bytes" ] && [ "$total_bytes" -gt "$max_bytes" ]; then
    add_finding "drift" "buffer_oversize" "$path: $(numfmt --to=iec "$total_bytes") > limit $(numfmt --to=iec "$max_bytes")"
    DRIFT=1
  fi
  oldest_min="$(
    set +o pipefail
    find "$path" -type f -printf '%T@\n' 2>/dev/null \
      | sort -n \
      | head -1 \
      | awk -v now="$(date +%s)" '{ if ($0) printf "%d", (now-$0)/60 }'
  )"
  if [ -n "$oldest_min" ] && [ "$oldest_min" -gt $((max_age_hours * 60)) ]; then
    add_finding "drift" "buffer_stale" "$path: oldest file $((oldest_min/60))h old > limit ${max_age_hours}h"
    DRIFT=1
  fi
done

# 3. Disk
root_mount="$(jq -r '.disk_thresholds.root_mount' "$CONFIG_FILE")"
warn_pct="$(jq -r '.disk_thresholds.warn_percent' "$CONFIG_FILE")"
page_pct="$(jq -r '.disk_thresholds.page_percent' "$CONFIG_FILE")"
use_pct="$(df -P "$root_mount" | awk 'NR==2 {gsub("%","",$5); print $5}')"
if [ -n "$use_pct" ]; then
  if [ "$use_pct" -ge "$page_pct" ]; then
    add_finding "page" "disk_full" "$root_mount: ${use_pct}% >= page ${page_pct}%"
    DRIFT=1
  elif [ "$use_pct" -ge "$warn_pct" ]; then
    add_finding "warn" "disk_pressure" "$root_mount: ${use_pct}% >= warn ${warn_pct}%"
    DRIFT=1
  fi
fi

# Emit JSON report
jq -n \
  --arg host "$(hostname)" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson drift "$DRIFT" \
  --slurpfile findings "$FINDINGS_FILE" \
  '{host:$host, timestamp:$ts, drift:($drift==1), findings:$findings[0]}'

# Human summary to stderr
if [ "$DRIFT" -eq 0 ]; then
  echo "audit-local-ingest: OK — no drift" >&2
else
  echo "audit-local-ingest: DRIFT detected — $(jq -r 'length' "$FINDINGS_FILE") finding(s)" >&2
fi

exit "$DRIFT"
