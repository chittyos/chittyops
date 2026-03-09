#!/bin/bash
# Deploy PR Automation to Multiple Organizations
# Usage: ./deploy-pr-automation.sh [org1] [org2] ...

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_REPO="CHITTYOS/chittyops"

# Organizations to deploy to
DEFAULT_ORGS=(
  "Chittyfoundation"
  "chittyos"
  "chittyapps"
  "chittycorp"
  "furnished-condos"
  "chicagoapps"
)

ORGS=("${@:-${DEFAULT_ORGS[@]}}")

echo "🚀 PR Automation Deployment Script"
echo "===================================="
echo ""
echo "This script will deploy PR automation workflows to multiple organizations."
echo ""

# Check for gh CLI
if ! command -v gh &> /dev/null; then
  echo "❌ GitHub CLI (gh) is not installed."
  echo "Install from: https://cli.github.com/"
  exit 1
fi

# Check authentication
if ! gh auth status &> /dev/null; then
  echo "❌ Not authenticated with GitHub CLI."
  echo "Run: gh auth login"
  exit 1
fi

echo "✅ GitHub CLI authenticated"
echo ""

# Deployment options
read -p "Deploy to all organizations? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Deployment cancelled."
  exit 0
fi

echo ""
echo "Organizations to deploy to:"
for org in "${ORGS[@]}"; do
  echo "  - $org"
done
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  exit 0
fi

echo ""
echo "Starting deployment..."
echo ""

# Function to deploy to a single organization
deploy_to_org() {
  local org=$1
  echo "📦 Deploying to organization: $org"
  
  # Get list of repositories in the organization
  repos=$(gh repo list "$org" --limit 1000 --json name --jq '.[].name')
  
  if [ -z "$repos" ]; then
    echo "  ⚠️  No repositories found or no access to $org"
    return
  fi
  
  local count=0
  for repo in $repos; do
    local full_repo="$org/$repo"
    echo "  → Processing $full_repo"
    
    # Check if repo is archived
    is_archived=$(gh repo view "$full_repo" --json isArchived --jq '.isArchived')
    if [ "$is_archived" = "true" ]; then
      echo "    ⏭️  Skipped (archived)"
      continue
    fi
    
    # Create a branch for the changes
    branch_name="automation/add-pr-automation-$(date +%s)"
    
    # Clone repo to temp directory
    temp_dir=$(mktemp -d)
    if ! gh repo clone "$full_repo" "$temp_dir" -- --depth 1 2>/dev/null; then
      echo "    ⚠️  Failed to clone (may be empty or no access)"
      rm -rf "$temp_dir"
      continue
    fi
    
    cd "$temp_dir"
    
    # Create workflows directory if it doesn't exist
    mkdir -p .github/workflows
    mkdir -p .github
    
    # Copy configuration files
    cp "$SCRIPT_DIR/.github/coderabbit.yml" .github/ 2>/dev/null || true
    cp "$SCRIPT_DIR/.github/labeler.yml" .github/ 2>/dev/null || true
    cp "$SCRIPT_DIR/.github/auto-merge.json" .github/ 2>/dev/null || true
    
    # Create a simple workflow that calls the reusable workflow
    cat > .github/workflows/pr-automation.yml << 'EOF'
name: PR Automation

on:
  pull_request:
    types: [opened, synchronize, reopened, labeled, unlabeled]
  pull_request_review:
    types: [submitted]
  check_suite:
    types: [completed]

jobs:
  automation:
    uses: CHITTYOS/chittyops/.github/workflows/reusable-pr-automation.yml@main
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
EOF
    
    # Check if there are changes
    if ! git diff --quiet 2>/dev/null; then
      # Create branch and commit
      git checkout -b "$branch_name"
      git add .github/
      git config user.name "ChittyOps Bot"
      git config user.email "ops@chitty.cc"
      
      # Create commit with proper multi-line message
      git commit -m "Add PR automation workflows" -m "- Multi-AI review system (CodeRabbit, Claude, OpenAI)
- Auto-labeling based on file patterns
- Auto-merge when all checks pass
- Auto-delete branches after merge
- Canonical checks integration

See https://github.com/CHITTYOS/chittyops/blob/main/PR_AUTOMATION_SETUP.md for setup."
      
      # Push branch
      if git push origin "$branch_name" 2>/dev/null; then
        # Create pull request
        pr_url=$(gh pr create \
          --title "Add PR automation workflows" \
          --body "This PR adds comprehensive CI/CD automation for pull requests.

## Features

- 🤖 Multi-AI review system (CodeRabbit, Claude, OpenAI)
- 🏷️ Auto-labeling based on file patterns
- ✅ Auto-merge when all checks pass
- 🗑️ Auto-delete branches after merge
- 🔒 Canonical checks integration

## Setup Required

After merging, configure the following secrets (optional but recommended):
- \`ANTHROPIC_API_KEY\` - For Claude AI reviews
- \`OPENAI_API_KEY\` - For OpenAI Codex reviews

See [setup guide](https://github.com/CHITTYOS/chittyops/blob/main/PR_AUTOMATION_SETUP.md) for details." \
          --label "ci-cd" \
          --label "enhancement" 2>&1)
        
        echo "    ✅ Created PR: $pr_url"
        ((count++))
      else
        echo "    ⚠️  Failed to push branch"
      fi
    else
      echo "    ⏭️  No changes needed"
    fi
    
    # Cleanup
    cd "$SCRIPT_DIR"
    rm -rf "$temp_dir"
  done
  
  echo "  📊 Created $count PRs in $org"
  echo ""
}

# Deploy to each organization
total_deployments=0
for org in "${ORGS[@]}"; do
  deploy_to_org "$org"
  ((total_deployments++))
done

echo ""
echo "✅ Deployment complete!"
echo "📊 Processed $total_deployments organizations"
echo ""
echo "Next steps:"
echo "1. Review and merge the PRs created in each repository"
echo "2. Configure API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY) at org level"
echo "3. Install CodeRabbit GitHub App for each organization"
echo "4. Set up branch protection rules requiring the new checks"
echo ""
echo "See PR_AUTOMATION_SETUP.md for detailed setup instructions."
