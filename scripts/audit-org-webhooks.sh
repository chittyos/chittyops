#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPORT_DIR="$ROOT/compliance/webhook-audit"
mkdir -p "$REPORT_DIR"

WEBHOOK_URL="https://connect.chitty.cc/integrations/github/webhook"
WEBHOOK_EVENTS_CSV="push,pull_request,workflow_run,repository"
APPLY=0

usage() {
  cat <<USAGE
Usage: scripts/audit-org-webhooks.sh [--apply] [--url=URL] [--events=a,b,c] [org ...]

Audits organization webhooks for ChittyConnect endpoint compliance.

Options:
  --apply           Auto-heal webhook config (requires WEBHOOK_SECRET env var)
  --url=URL         Target webhook URL (default: $WEBHOOK_URL)
  --events=a,b,c    Required event set in apply mode (default: $WEBHOOK_EVENTS_CSV)
USAGE
}

orgs=()
for arg in "$@"; do
  case "$arg" in
    --apply)
      APPLY=1
      ;;
    --url=*)
      WEBHOOK_URL="${arg#*=}"
      ;;
    --events=*)
      WEBHOOK_EVENTS_CSV="${arg#*=}"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      orgs+=("$arg")
      ;;
  esac
done

if [ ${#orgs[@]} -eq 0 ]; then
  orgs=("furnished-condos" "chittycorp" "chittyos" "chittyapps" "chicagoapps")
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh auth is not configured. Run: gh auth login"
  exit 1
fi

if ! gh auth status -t 2>/dev/null | grep -q 'admin:org_hook'; then
  echo "Missing admin:org_hook scope. Run: gh auth refresh -h github.com -s admin:org_hook"
  exit 1
fi

if [ "$APPLY" -eq 1 ] && [ -z "${WEBHOOK_SECRET:-}" ]; then
  echo "WEBHOOK_SECRET is required when --apply is enabled"
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
report_md="$REPORT_DIR/webhook-audit-$timestamp.md"
report_json="$REPORT_DIR/webhook-audit-$timestamp.json"

printf '# Org Webhook Audit (%s)\n\n' "$timestamp" > "$report_md"
printf '[' > "$report_json"

json_first=1
total_failures=0

events_json="$(python3 - <<PY
import json
print(json.dumps([x.strip() for x in "${WEBHOOK_EVENTS_CSV}".split(',') if x.strip()]))
PY
)"

join_by() {
  local d="$1"
  shift
  local f="$1"
  shift
  printf %s "$f" "${@/#/$d}"
}

for org in "${orgs[@]}"; do
  echo "== $org =="
  echo "## $org" >> "$report_md"

  hooks_json="$(gh api "/orgs/$org/hooks")"
  match_count="$(jq --arg url "$WEBHOOK_URL" '[.[] | select(.config.url == $url)] | length' <<<"$hooks_json")"

  if [ "$match_count" -eq 0 ]; then
    echo "- no webhook found for $WEBHOOK_URL"
    echo "- no webhook found for $WEBHOOK_URL" >> "$report_md"
    total_failures=$((total_failures + 1))
    continue
  fi

  mapfile -t hook_ids < <(jq --arg url "$WEBHOOK_URL" -r '.[] | select(.config.url == $url) | .id' <<<"$hooks_json")

  for hook_id in "${hook_ids[@]}"; do
    hook_obj="$(jq --argjson id "$hook_id" '.[] | select(.id == $id)' <<<"$hooks_json")"
    events_joined="$(jq -r '.events | join(",")' <<<"$hook_obj")"

    needs_apply_reasons=()

    # Validate event scope unless wildcard is used intentionally.
    if [ "$events_joined" = "*" ]; then
      needs_apply_reasons+=("wildcard-events")
    fi

    if [ "$APPLY" -eq 1 ]; then
      payload="$(jq -n \
        --arg url "$WEBHOOK_URL" \
        --arg secret "$WEBHOOK_SECRET" \
        --argjson events "$events_json" \
        '{active:true,events:$events,config:{url:$url,content_type:"json",insecure_ssl:"0",secret:$secret}}')"

      gh api "/orgs/$org/hooks/$hook_id" --method PATCH --input <(printf '%s' "$payload") >/dev/null
      gh api "/orgs/$org/hooks/$hook_id/pings" --method POST >/dev/null || true
      sleep 2

      hooks_json="$(gh api "/orgs/$org/hooks")"
      hook_obj="$(jq --argjson id "$hook_id" '.[] | select(.id == $id)' <<<"$hooks_json")"
      events_joined="$(jq -r '.events | join(",")' <<<"$hook_obj")"
    fi

    # Delivery-level verification (signature header + response code)
    deliveries_json="$(gh api "/orgs/$org/hooks/$hook_id/deliveries?per_page=1")"
    delivery_count="$(jq 'length' <<<"$deliveries_json")"

    if [ "$delivery_count" -eq 0 ]; then
      gh api "/orgs/$org/hooks/$hook_id/pings" --method POST >/dev/null || true
      sleep 2
      deliveries_json="$(gh api "/orgs/$org/hooks/$hook_id/deliveries?per_page=1")"
      delivery_count="$(jq 'length' <<<"$deliveries_json")"
    fi

    signature_present="false"
    status_code="0"
    delivery_event="none"
    delivery_status="no-deliveries"
    response_payload=""

    if [ "$delivery_count" -gt 0 ]; then
      delivery_id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])' <<<"$deliveries_json")"

      delivery_detail="$(gh api "/orgs/$org/hooks/$hook_id/deliveries/$delivery_id")"
      signature_present="$(jq -r '.request.headers | has("X-Hub-Signature-256")' <<<"$delivery_detail")"
      status_code="$(jq -r '.status_code // 0' <<<"$delivery_detail")"
      delivery_event="$(jq -r '.event // "unknown"' <<<"$delivery_detail")"
      delivery_status="$(jq -r '.status // "unknown"' <<<"$delivery_detail")"
      response_payload="$(jq -r '.response.payload // ""' <<<"$delivery_detail" | tr '\n' ' ' | cut -c1-220)"
    fi

    hook_fail=0
    if [ "$signature_present" != "true" ]; then
      hook_fail=1
      needs_apply_reasons+=("missing-signature-header")
    fi
    if ! [[ "$status_code" =~ ^2[0-9][0-9]$ ]]; then
      hook_fail=1
      needs_apply_reasons+=("non-2xx-delivery")
    fi

    reasons="none"
    if [ ${#needs_apply_reasons[@]} -gt 0 ]; then
      reasons="$(join_by ',' "${needs_apply_reasons[@]}")"
    fi

    if [ "$hook_fail" -eq 1 ]; then
      total_failures=$((total_failures + 1))
    fi

    echo "- hook=$hook_id event=$delivery_event code=$status_code signature=$signature_present status='$delivery_status' reasons=$reasons"
    echo "- hook $hook_id: event=$delivery_event, code=$status_code, signature=$signature_present, reasons=$reasons" >> "$report_md"
    if [ -n "$response_payload" ]; then
      echo "  - response: $response_payload" >> "$report_md"
    fi

    record="$(jq -n \
      --arg org "$org" \
      --arg hook_id "$hook_id" \
      --arg url "$WEBHOOK_URL" \
      --arg events "$events_joined" \
      --arg signature_present "$signature_present" \
      --arg delivery_event "$delivery_event" \
      --arg delivery_status "$delivery_status" \
      --arg response_payload "$response_payload" \
      --arg reasons "$reasons" \
      --argjson status_code "$status_code" \
      --argjson failing "$hook_fail" \
      '{org:$org,hook_id:$hook_id,url:$url,events:$events,signature_present:($signature_present=="true"),delivery_event:$delivery_event,delivery_status:$delivery_status,status_code:$status_code,reasons:($reasons|split(",")),response_payload:$response_payload,failing:($failing==1)}')"

    if [ "$json_first" -eq 0 ]; then
      printf ',' >> "$report_json"
    fi
    json_first=0
    printf '\n%s' "$record" >> "$report_json"
  done

  echo >> "$report_md"
done

printf '\n]\n' >> "$report_json"

echo ""
echo "Audit report: $report_md"
echo "JSON report:  $report_json"
echo "Failures:     $total_failures"

if [ "$total_failures" -gt 0 ]; then
  exit 1
fi
