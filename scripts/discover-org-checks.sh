#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT="$ROOT/compliance/rulesets/check-inventory"
mkdir -p "$OUT"

write_with_retry() {
  local src="$1"
  local dest="$2"
  local attempts=5
  local i
  for ((i=1; i<=attempts; i++)); do
    if cat "$src" > "$dest" 2>/tmp/discover_write_err.log; then
      return 0
    fi
    sleep "$i"
  done
  echo "failed to write $dest after $attempts attempts"
  sed -n '1,3p' /tmp/discover_write_err.log || true
  return 1
}

if ! gh auth status >/dev/null 2>&1; then
  echo "gh auth is not configured. Run: gh auth login"
  exit 1
fi

discover_org() {
  local org="$1"
  local outfile="$OUT/${org}.txt"
  local tmpfile
  tmpfile="$(mktemp)"
  : > "$tmpfile"

  local repos
  repos=$(gh api "orgs/$org/repos" --paginate -q '.[].name')

  for repo in $repos; do
    {
      echo "## $org/$repo"
      if ! files=$(gh api "repos/$org/$repo/contents/.github/workflows" -q '.[] | select(.type=="file") | .path' 2>/dev/null); then
        echo "(no workflows dir)"
        echo
        continue
      fi

      if [ -z "$files" ]; then
        echo "(no workflows)"
        echo
        continue
      fi

      local out=""
      while IFS= read -r f; do
        [ -z "$f" ] && continue
        json=$(gh api "repos/$org/$repo/contents/$f" 2>/dev/null || true)
        [ -z "$json" ] && continue
        content=$(echo "$json" | jq -r '.content // empty' | tr -d '\n')
        [ -z "$content" ] && continue

        if ! (printf "%s" "$content" | base64 --decode > /tmp/wf.yml 2>/dev/null || printf "%s" "$content" | base64 -D > /tmp/wf.yml 2>/dev/null); then
          continue
        fi

        parsed=$(ruby -ryaml -e '
          begin
            y = YAML.load_file("/tmp/wf.yml")
          rescue
            exit 0
          end
          y = y.is_a?(Hash) ? y : {}
          wname = y["name"].to_s
          wname = "(unnamed workflow)" if wname.nil? || wname.empty?
          jobs = y["jobs"]
          jobs = jobs.is_a?(Hash) ? jobs : {}
          jobs.each do |jid, cfg|
            j = cfg.is_a?(Hash) ? cfg : {}
            jname = j["name"].to_s
            jname = jid.to_s if jname.nil? || jname.empty?
            puts "- #{wname} / #{jname}"
          end
        ' 2>/dev/null || true)

        if [ -n "$parsed" ]; then
          out+="$parsed"$'\n'
        fi
      done <<< "$files"

      if [ -n "$out" ]; then
        printf "%s" "$out" | sort -u
      else
        echo "(no parseable workflows)"
      fi
      echo
    } >> "$tmpfile"
  done

  write_with_retry "$tmpfile" "$outfile"
  rm -f "$tmpfile"
  echo "wrote $outfile"
}

orgs=("$@")
if [ ${#orgs[@]} -eq 0 ]; then
  orgs=("furnished-condos" "chittycorp" "chittyos" "chittyapps" "chicagoapps")
fi

for org in "${orgs[@]}"; do
  discover_org "$org"
done
