#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=1
if [[ "${1:-}" == "--apply" ]]; then
  DRY_RUN=0
  shift
fi

orgs=("$@")
if [ ${#orgs[@]} -eq 0 ]; then
  orgs=("furnished-condos" "chittycorp" "chittyapps" "chicagoapps" "chittyos")
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh auth is not configured. Run: gh auth login"
  exit 1
fi

total=0
applied=0
failed=0

apply_repo_settings() {
  local org="$1"
  local repo="$2"

  local payload
  payload=$(jq -n '{allow_auto_merge:true, delete_branch_on_merge:true}')

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "DRY-RUN patch $org/$repo allow_auto_merge=true delete_branch_on_merge=true"
    return 0
  fi

  if gh api "repos/$org/$repo" --method PATCH --input <(printf '%s' "$payload") >/dev/null 2>/tmp/repo_patch_err.log; then
    echo "patched $org/$repo"
    return 0
  fi

  echo "failed $org/$repo"
  sed -n '1,2p' /tmp/repo_patch_err.log
  return 1
}

for org in "${orgs[@]}"; do
  echo "== $org =="
  while IFS= read -r repo; do
    [ -z "$repo" ] && continue
    total=$((total+1))
    if apply_repo_settings "$org" "$repo"; then
      applied=$((applied+1))
    else
      failed=$((failed+1))
    fi
  done < <(gh api "orgs/$org/repos" --paginate -q '.[] | select(.archived == false and .disabled == false) | .name')
done

echo
echo "Summary:"
echo "- mode: $([[ $DRY_RUN -eq 1 ]] && echo dry-run || echo apply)"
echo "- total: $total"
echo "- applied: $applied"
echo "- failed: $failed"

if [[ $DRY_RUN -eq 0 && $failed -gt 0 ]]; then
  exit 1
fi
