#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RULESETS_BASE="$ROOT/compliance/rulesets/orgs"
INV_SCRIPT="$ROOT/scripts/discover-org-checks.sh"
GEN_SCRIPT="$ROOT/scripts/generate-org-rulesets.py"

DRY_RUN=1
if [[ "${1:-}" == "--apply" ]]; then
  DRY_RUN=0
  shift
fi

orgs=("$@")
if [ ${#orgs[@]} -eq 0 ]; then
  orgs=("furnished-condos" "chittycorp" "chittyapps" "chicagoapps")
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh auth is not configured. Run: gh auth login"
  exit 1
fi

# Refresh inventory and ruleset files so fallback uses current check names.
bash "$INV_SCRIPT" "${orgs[@]}"
python3 "$GEN_SCRIPT" "${orgs[@]}"

total_applied=0
total_skipped=0
total_failed=0

apply_repo_branch_protection() {
  local org="$1"
  local repo="$2"
  local branch="$3"
  local contexts_json="$4"

  local payload
  payload=$(jq -n \
    --argjson contexts "$contexts_json" \
    '{
      required_status_checks: (if ($contexts|length) > 0 then { strict: true, contexts: $contexts } else null end),
      enforce_admins: true,
      required_pull_request_reviews: {
        dismiss_stale_reviews: true,
        require_code_owner_reviews: false,
        required_approving_review_count: 1,
        require_last_push_approval: false
      },
      restrictions: null,
      required_conversation_resolution: true,
      allow_force_pushes: false,
      allow_deletions: false,
      block_creations: false
    }'
  )

  local branch_enc
  branch_enc=$(jq -nr --arg b "$branch" '$b|@uri')

  if [[ $DRY_RUN -eq 1 ]]; then
    echo "DRY-RUN apply $org/$repo branch=$branch contexts=$(jq -r 'join(",")' <<<"$contexts_json")"
    return 0
  fi

  local errfile
  errfile=$(mktemp)
  if gh api "repos/$org/$repo/branches/$branch_enc/protection" \
    --method PUT \
    --input <(printf '%s' "$payload") >/dev/null 2>"$errfile"; then
    echo "applied $org/$repo branch=$branch"
    return 0
  fi

  echo "failed $org/$repo branch=$branch"
  sed -n '1,3p' "$errfile"
  return 1
}

for org in "${orgs[@]}"; do
  echo "== $org =="

  dir="$RULESETS_BASE/$org"
  if [ ! -d "$dir" ]; then
    echo "skip $org (no generated rulesets dir)"
    continue
  fi

  mapfile -t repos < <(gh api "orgs/$org/repos" --paginate -q '.[] | select(.archived == false and .disabled == false) | .name')

  # Build repo -> required check contexts from generated org rulesets.
  declare -A repo_contexts=()
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    mapfile -t contexts < <(jq -r '.rules[]? | select(.type=="required_status_checks") | .parameters.required_status_checks[]?.context' "$f")
    if [ ${#contexts[@]} -eq 0 ]; then
      continue
    fi
    mapfile -t inc_repos < <(jq -r '.conditions.repository_name.include[]? | select(startswith("~")|not)' "$f")
    for r in "${inc_repos[@]}"; do
      for c in "${contexts[@]}"; do
        if [[ -n "${repo_contexts[$r]:-}" ]]; then
          repo_contexts[$r]="${repo_contexts[$r]}|$c"
        else
          repo_contexts[$r]="$c"
        fi
      done
    done
  done < <(find "$dir" -maxdepth 1 -type f -name '*.json' | sort)

  for repo in "${repos[@]}"; do
    default_branch=$(gh api "repos/$org/$repo" -q '.default_branch' 2>/dev/null || true)
    if [[ -z "$default_branch" || "$default_branch" == "null" ]]; then
      echo "skip $org/$repo (no default branch)"
      total_skipped=$((total_skipped + 1))
      continue
    fi

    unique_contexts_json="[]"
    if [[ -n "${repo_contexts[$repo]:-}" ]]; then
      unique_contexts_json=$(printf '%s\n' "${repo_contexts[$repo]}" | tr '|' '\n' | sed '/^$/d' | sort -u | jq -R -s 'split("\n")[:-1]')
    fi

    if apply_repo_branch_protection "$org" "$repo" "$default_branch" "$unique_contexts_json"; then
      total_applied=$((total_applied + 1))
    else
      total_failed=$((total_failed + 1))
    fi
  done

done

echo
echo "Summary:"
echo "- mode: $([[ $DRY_RUN -eq 1 ]] && echo dry-run || echo apply)"
echo "- applied: $total_applied"
echo "- failed: $total_failed"
echo "- skipped: $total_skipped"

if [[ $DRY_RUN -eq 0 && $total_failed -gt 0 ]]; then
  exit 1
fi
