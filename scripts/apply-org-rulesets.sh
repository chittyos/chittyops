#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BASE="$ROOT/compliance/rulesets/orgs"

if ! gh auth status >/dev/null 2>&1; then
  echo "gh auth is not configured. Run: gh auth login"
  exit 1
fi

if ! gh auth status -t 2>/dev/null | rg -q 'admin:org'; then
  echo "Missing admin:org scope. Run: gh auth refresh -h github.com -s admin:org"
  exit 1
fi

orgs=("$@")
if [ ${#orgs[@]} -eq 0 ]; then
  mapfile -t orgs < <(find "$BASE" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)
fi

"$ROOT/scripts/discover-org-checks.sh" "${orgs[@]}"
python3 "$ROOT/scripts/generate-org-rulesets.py" "${orgs[@]}"

blocked_orgs=()
failed_orgs=()
applied_total=0
skipped_total=0

for org in "${orgs[@]}"; do
  dir="$BASE/$org"
  [ -d "$dir" ] || { echo "Skipping unknown org: $org"; continue; }

  echo "Applying rulesets for $org"
  if ! existing="$(gh api "orgs/$org/rulesets" -q '.[].name' 2>/tmp/ruleset_list_err.log)"; then
    if rg -q "Upgrade to GitHub Team" /tmp/ruleset_list_err.log; then
      echo "  blocked: org rulesets require GitHub Team plan"
      blocked_orgs+=("$org")
      continue
    fi
    echo "  failed: unable to list existing rulesets"
    sed -n '1,5p' /tmp/ruleset_list_err.log
    failed_orgs+=("$org")
    continue
  fi

  for f in "$dir"/*.json; do
    [ -f "$f" ] || continue
    name=$(jq -r '.name' "$f")
    if printf '%s\n' "$existing" | rg -Fxq "$name"; then
      echo "  - skip $name (already exists)"
      skipped_total=$((skipped_total + 1))
      continue
    fi

    if gh api "orgs/$org/rulesets" --method POST --input "$f" >/tmp/ruleset_apply_out.log 2>/tmp/ruleset_apply_err.log; then
      echo "  - applied $name"
      applied_total=$((applied_total + 1))
      existing="$existing"$'\n'"$name"
    else
      if rg -q "Upgrade to GitHub Team" /tmp/ruleset_apply_err.log; then
        echo "  blocked: org rulesets require GitHub Team plan"
        blocked_orgs+=("$org")
        break
      fi
      echo "  failed applying $name"
      sed -n '1,5p' /tmp/ruleset_apply_err.log
      failed_orgs+=("$org")
      break
    fi
  done

done

echo
echo "Summary:"
echo "- applied: $applied_total"
echo "- skipped(existing): $skipped_total"
echo "- blocked(org plan): ${#blocked_orgs[@]}"
echo "- failed: ${#failed_orgs[@]}"

if [ ${#blocked_orgs[@]} -gt 0 ]; then
  echo "Blocked orgs: ${blocked_orgs[*]}"
fi
if [ ${#failed_orgs[@]} -gt 0 ]; then
  echo "Failed orgs: ${failed_orgs[*]}"
  exit 1
fi
