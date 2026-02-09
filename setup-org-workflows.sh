#!/bin/bash

# ChittyOS Ecosystem Compliance Provisioning Script
# Deploys CI/CD workflows, canonical files, ChittyConnect config,
# ChittyBeacon integration, and compliance self-checks to all repos.
#
# Usage:
#   ./setup-org-workflows.sh [options]
#
# Options:
#   --dry-run           Show what would change without modifying anything
#   --repo=ORG/REPO     Target a specific repo only
#   --org=ORG           Target a specific org only (CHITTYOS, ChittyCorp)
#   --skip-archived     Skip archived repos (default: true)
#   --verbose           Print detailed progress

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Defaults
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/templates/compliance"
WORKFLOW_TEMPLATE_DIR="$SCRIPT_DIR/.github/workflows"
REGISTRY_FILE="$SCRIPT_DIR/compliance/service-registry.yml"
WORKFLOW_DIR=".github/workflows"
BEACON_PACKAGE="@chittycorp/app-beacon"
DRY_RUN=false
TARGET_REPO=""
TARGET_ORG=""
VERBOSE=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --repo=*) TARGET_REPO="${arg#*=}" ;;
    --org=*) TARGET_ORG="${arg#*=}" ;;
    --verbose) VERBOSE=true ;;
    --help|-h)
      echo "Usage: ./setup-org-workflows.sh [--dry-run] [--repo=ORG/REPO] [--org=ORG] [--verbose]"
      exit 0 ;;
  esac
done

# Active organizations (NeverShitty excluded - legacy/archived)
ORGS=("CHITTYOS" "ChittyCorp")

log() { echo -e "${GREEN}$1${NC}"; }
warn() { echo -e "${YELLOW}$1${NC}"; }
err() { echo -e "${RED}$1${NC}"; }
info() { if $VERBOSE; then echo -e "${BLUE}  $1${NC}"; fi; }

# ── Prerequisites ──────────────────────────────────────────────────
check_prerequisites() {
  if ! command -v gh &> /dev/null; then
    err "GitHub CLI (gh) is required. Install: https://cli.github.com/"
    exit 1
  fi
  if ! gh auth status &> /dev/null 2>&1; then
    err "Please authenticate: gh auth login"
    exit 1
  fi
  if ! command -v jq &> /dev/null; then
    err "jq is required. Install: brew install jq"
    exit 1
  fi
}

# ── Project type detection ─────────────────────────────────────────
detect_project_type() {
  local repo_path=$1
  if [ -f "$repo_path/wrangler.toml" ] || [ -f "$repo_path/wrangler.jsonc" ]; then
    echo "cloudflare-worker"
  elif [ -f "$repo_path/package.json" ]; then
    if grep -q "next" "$repo_path/package.json" 2>/dev/null; then
      echo "nextjs"
    elif grep -q "@cloudflare/workers-types" "$repo_path/package.json" 2>/dev/null; then
      echo "cloudflare-worker"
    else
      echo "node"
    fi
  elif [ -f "$repo_path/requirements.txt" ] || [ -f "$repo_path/setup.py" ] || [ -f "$repo_path/pyproject.toml" ]; then
    echo "python"
  elif [ -f "$repo_path/Cargo.toml" ]; then
    echo "rust"
  elif [ -f "$repo_path/go.mod" ]; then
    echo "go"
  else
    echo "unknown"
  fi
}

# ── Template substitution ─────────────────────────────────────────
render_template() {
  local template_file=$1
  local service_name=$2
  local display_name=$3
  local tier=$4
  local domain=$5
  local org=$6
  local service_type=$7

  local service_name_upper
  service_name_upper=$(echo "$service_name" | tr '[:lower:]-' '[:upper:]_')

  local check_health="false"
  if [ "$service_type" = "cloudflare-worker" ] && [ "$domain" != "null" ] && [ -n "$domain" ]; then
    check_health="true"
  fi

  sed \
    -e "s|{{SERVICE_NAME}}|$service_name|g" \
    -e "s|{{DISPLAY_NAME}}|$display_name|g" \
    -e "s|{{SERVICE_NAME_UPPER}}|$service_name_upper|g" \
    -e "s|{{TIER}}|$tier|g" \
    -e "s|{{DOMAIN}}|${domain:-none}|g" \
    -e "s|{{ORG}}|$org|g" \
    -e "s|{{SERVICE_TYPE}}|$service_type|g" \
    -e "s|{{DESCRIPTION}}|Service in the ChittyOS ecosystem|g" \
    -e "s|{{CHECK_HEALTH}}|$check_health|g" \
    "$template_file"
}

# ── Add ChittyBeacon to package.json ──────────────────────────────
add_beacon_to_package() {
  local repo_path=$1
  if [ -f "$repo_path/package.json" ]; then
    if ! grep -q "$BEACON_PACKAGE" "$repo_path/package.json"; then
      info "Adding ChittyBeacon to package.json"
      if ! $DRY_RUN; then
        jq --arg beacon "$BEACON_PACKAGE" \
           '.dependencies[$beacon] = "^1.0.0"' \
           "$repo_path/package.json" > "$repo_path/package.json.tmp" && \
           mv "$repo_path/package.json.tmp" "$repo_path/package.json"
      fi
    else
      info "ChittyBeacon already in package.json"
    fi
  fi
}

# ── Deploy file if missing ────────────────────────────────────────
deploy_file() {
  local target_path=$1
  local content=$2
  local description=$3

  if [ -f "$target_path" ]; then
    info "$description: already exists, skipping"
    return 0
  fi

  if $DRY_RUN; then
    warn "  [DRY RUN] Would create: $target_path ($description)"
  else
    mkdir -p "$(dirname "$target_path")"
    echo "$content" > "$target_path"
    info "Created: $target_path"
  fi
  return 1  # indicates file was created (for change tracking)
}

# ── Deploy template file if missing ───────────────────────────────
deploy_template() {
  local template_file=$1
  local target_path=$2
  local service_name=$3
  local display_name=$4
  local tier=$5
  local domain=$6
  local org=$7
  local service_type=$8
  local description=$9

  if [ -f "$target_path" ]; then
    info "$description: already exists, skipping"
    return 0
  fi

  local rendered
  rendered=$(render_template "$template_file" "$service_name" "$display_name" "$tier" "$domain" "$org" "$service_type")

  if $DRY_RUN; then
    warn "  [DRY RUN] Would create: $target_path ($description)"
  else
    mkdir -p "$(dirname "$target_path")"
    echo "$rendered" > "$target_path"
    info "Created: $target_path"
  fi
  return 1
}

# ── Copy workflow if missing ──────────────────────────────────────
deploy_workflow() {
  local source_file=$1
  local target_path=$2
  local description=$3

  if [ -f "$target_path" ]; then
    info "$description: already exists, skipping"
    return 0
  fi

  if $DRY_RUN; then
    warn "  [DRY RUN] Would create: $target_path ($description)"
  else
    mkdir -p "$(dirname "$target_path")"
    cp "$source_file" "$target_path"
    info "Created: $target_path"
  fi
  return 1
}

# ── Setup a single repository ─────────────────────────────────────
setup_repo() {
  local repo=$1
  local org=$2
  local service_name=$3
  local tier=$4
  local service_type=$5
  local domain=$6

  local display_name
  display_name=$(echo "$service_name" | sed 's/^./\U&/' | sed 's/-\(.\)/\U\1/g')

  log "\n  Processing: $org/$repo (tier=$tier, type=$service_type)"

  # Clone or update
  local repo_dir="/tmp/chittyops-setup/$org/$repo"
  if [ -d "$repo_dir" ]; then
    cd "$repo_dir"
    git fetch origin 2>/dev/null || true
    git checkout main 2>/dev/null || git checkout master 2>/dev/null || true
    git pull --ff-only 2>/dev/null || true
  else
    mkdir -p "$(dirname "$repo_dir")"
    git clone "https://github.com/$org/$repo.git" "$repo_dir" 2>/dev/null || {
      warn "  Failed to clone $org/$repo, skipping"
      return
    }
    cd "$repo_dir"
  fi

  local changes=0

  # ── 1. Canonical files (ChittyCanon) ──

  # CLAUDE.md
  deploy_template "$TEMPLATE_DIR/CLAUDE.md.tmpl" "CLAUDE.md" \
    "$service_name" "$display_name" "$tier" "$domain" "$org" "$service_type" "CLAUDE.md" || changes=$((changes+1))

  # CHARTER.md
  deploy_template "$TEMPLATE_DIR/CHARTER.md.tmpl" "CHARTER.md" \
    "$service_name" "$display_name" "$tier" "$domain" "$org" "$service_type" "CHARTER.md" || changes=$((changes+1))

  # CODEOWNERS
  deploy_template "$TEMPLATE_DIR/CODEOWNERS.tmpl" "CODEOWNERS" \
    "$service_name" "$display_name" "$tier" "$domain" "$org" "$service_type" "CODEOWNERS" || changes=$((changes+1))

  # ── 2. ChittyConnect config ──
  deploy_template "$TEMPLATE_DIR/chittyconnect.yml.tmpl" ".chittyconnect.yml" \
    "$service_name" "$display_name" "$tier" "$domain" "$org" "$service_type" ".chittyconnect.yml" || changes=$((changes+1))

  # ── 3. ChittyConnect sync workflow ──
  deploy_workflow "$TEMPLATE_DIR/chittyconnect-sync.yml.tmpl" "$WORKFLOW_DIR/chittyconnect-sync.yml" \
    "ChittyConnect Sync workflow" || changes=$((changes+1))

  # ── 4. Compliance self-check workflow ──
  deploy_template "$TEMPLATE_DIR/self-check.yml" "$WORKFLOW_DIR/compliance-check.yml" \
    "$service_name" "$display_name" "$tier" "$domain" "$org" "$service_type" "Compliance self-check workflow" || changes=$((changes+1))

  # ── 5. ChittyBeacon integration ──
  local detected_type
  detected_type=$(detect_project_type ".")
  case $detected_type in
    "node"|"nextjs"|"cloudflare-worker")
      add_beacon_to_package "."
      ;;
  esac

  # ── 6. CI/CD workflows per project type ──
  case $detected_type in
    "cloudflare-worker")
      # Create a deploy workflow using the reusable pattern
      if [ ! -f "$WORKFLOW_DIR/deploy.yml" ]; then
        if ! $DRY_RUN; then
          mkdir -p "$WORKFLOW_DIR"
          cat > "$WORKFLOW_DIR/deploy.yml" << DEPLOYEOF
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:
jobs:
  deploy:
    uses: CHITTYOS/chittyops/.github/workflows/reusable-worker-deploy.yml@main
    with:
      service_name: '$service_name'
    secrets:
      CHITTYCONNECT_API_KEY: \${{ secrets.CHITTYCONNECT_API_KEY }}
DEPLOYEOF
          info "Created: $WORKFLOW_DIR/deploy.yml (reusable worker deploy)"
        else
          warn "  [DRY RUN] Would create: $WORKFLOW_DIR/deploy.yml"
        fi
        changes=$((changes+1))
      fi
      ;;
  esac

  # ── 7. Commit and create PR ──
  if [ $changes -gt 0 ] && ! $DRY_RUN; then
    # Check for actual git changes
    if git status --porcelain | grep -q .; then
      local branch="compliance/ecosystem-setup-$(date +%Y%m%d)"
      git checkout -b "$branch" 2>/dev/null || git checkout "$branch" 2>/dev/null || true
      git add -A
      git commit -m "chore: add ecosystem compliance files

Added by chittyops compliance provisioning:
- Canonical files: CLAUDE.md, CHARTER.md, CODEOWNERS
- ChittyConnect: .chittyconnect.yml + sync workflow
- Compliance self-check workflow
- ChittyBeacon integration (if applicable)
- Deploy workflow (if applicable)

Part of ChittyOS ecosystem-wide compliance initiative.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>" || true

      git push origin "$branch" 2>/dev/null || true

      gh pr create \
        --title "chore: Ecosystem compliance provisioning" \
        --body "## Compliance Provisioning

This PR was auto-generated by \`chittyops/setup-org-workflows.sh\` to bring this repository into compliance with ChittyOS ecosystem standards.

### Added Files
| File | Purpose |
|------|---------|
| \`CLAUDE.md\` | Claude Code development guide |
| \`CHARTER.md\` | Service charter (tier, scope, deps) |
| \`CODEOWNERS\` | Code review ownership |
| \`.chittyconnect.yml\` | ChittyConnect integration config |
| \`.github/workflows/chittyconnect-sync.yml\` | 6-hourly sync to ChittyConnect |
| \`.github/workflows/compliance-check.yml\` | Compliance self-check on PRs |

### Compliance Dimensions
- [x] ChittyConnect config + sync
- [x] ChittyCanon canonical files
- [x] ChittyTrust/ChittyCert onboarding provisions
- [x] Compliance self-check workflow
- [ ] ChittyBeacon (verify post-merge)
- [ ] Health endpoint (service must implement)
- [ ] ChittyRegister (auto on deploy)

See: https://github.com/CHITTYOS/chittyops/tree/main/compliance" \
        --base main 2>/dev/null || \
      gh pr create \
        --title "chore: Ecosystem compliance provisioning" \
        --body "Ecosystem compliance files. See chittyops/compliance for details." \
        --base master 2>/dev/null || \
      warn "  Failed to create PR for $org/$repo"

      log "  Created PR with $changes compliance files"
    else
      log "  No changes needed"
    fi
  elif [ $changes -gt 0 ] && $DRY_RUN; then
    warn "  [DRY RUN] Would create PR with $changes files for $org/$repo"
  else
    log "  Already compliant"
  fi

  cd "$SCRIPT_DIR"
}

# ── Main execution ─────────────────────────────────────────────────
main() {
  log "ChittyOS Ecosystem Compliance Provisioning"
  log "============================================"
  if $DRY_RUN; then warn "[DRY RUN MODE - no changes will be made]"; fi
  echo ""

  # If targeting a specific repo
  if [ -n "$TARGET_REPO" ]; then
    local org="${TARGET_REPO%%/*}"
    local repo="${TARGET_REPO##*/}"
    # We'd need registry data -- for now use defaults
    setup_repo "$repo" "$org" "$repo" "5" "unknown" ""
    return
  fi

  # Process each organization
  for ORG in "${ORGS[@]}"; do
    if [ -n "$TARGET_ORG" ] && [ "$TARGET_ORG" != "$ORG" ]; then continue; fi

    log "\nOrganization: $ORG"
    log "================================="

    # Get list of non-archived, non-fork repos
    local repos
    repos=$(gh repo list "$ORG" --limit 200 --no-archived --source --json name,description -q '.[].name' 2>/dev/null || true)

    if [ -z "$repos" ]; then
      warn "  No repos found or access denied for $ORG"
      continue
    fi

    local count=0
    for REPO in $repos; do
      # Skip org config repos
      if [ "$REPO" = ".github" ] || [ "$REPO" = ".claude" ]; then
        info "Skipping org config repo: $REPO"
        continue
      fi

      # Look up service metadata from registry (simple grep-based for shell)
      local tier="5"
      local svc_type="unknown"
      local domain=""

      if [ -f "$REGISTRY_FILE" ]; then
        # Extract tier for this service
        local tier_line
        tier_line=$(grep -A5 "^      ${REPO}:" "$REGISTRY_FILE" 2>/dev/null | grep "tier:" | head -1 || true)
        if [ -n "$tier_line" ]; then
          tier=$(echo "$tier_line" | sed 's/.*tier: //' | tr -d ' ')
          [ "$tier" = "null" ] && tier="5"
        fi

        # Extract type
        local type_line
        type_line=$(grep -A5 "^      ${REPO}:" "$REGISTRY_FILE" 2>/dev/null | grep "type:" | head -1 || true)
        if [ -n "$type_line" ]; then
          svc_type=$(echo "$type_line" | sed 's/.*type: //' | tr -d ' ')
        fi

        # Extract domain
        local domain_line
        domain_line=$(grep -A5 "^      ${REPO}:" "$REGISTRY_FILE" 2>/dev/null | grep "domain:" | head -1 || true)
        if [ -n "$domain_line" ]; then
          domain=$(echo "$domain_line" | sed 's/.*domain: //' | tr -d ' ')
          [ "$domain" = "null" ] && domain=""
        fi

        # Skip inactive
        local active_line
        active_line=$(grep -A8 "^      ${REPO}:" "$REGISTRY_FILE" 2>/dev/null | grep "active:" | head -1 || true)
        if echo "$active_line" | grep -q "false"; then
          info "Skipping inactive: $REPO"
          continue
        fi
      fi

      setup_repo "$REPO" "$ORG" "$REPO" "$tier" "$svc_type" "$domain"
      count=$((count+1))
    done

    log "\n  Processed $count repos in $ORG"
  done

  log "\nCompliance provisioning complete!"
  log "================================="
  log "Next steps:"
  log "1. Review and merge created PRs"
  log "2. Ensure CHITTYCONNECT_API_KEY is set at org level"
  log "3. Run: npm run audit  (to verify compliance)"
  log "4. Monitor: https://beacon.cloudeto.com"
}

check_prerequisites
main
