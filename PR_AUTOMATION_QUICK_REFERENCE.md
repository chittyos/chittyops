# PR Automation Quick Reference

## Overview

Comprehensive CI/CD automation for pull requests with multi-AI reviews, auto-labeling, auto-merge, and branch cleanup.

## Quick Commands

### Using Reusable Workflow (Recommended)

```yaml
# .github/workflows/pr-automation.yml
name: PR Automation

on:
  pull_request:

jobs:
  automation:
    uses: CHITTYOS/chittyops/.github/workflows/reusable-pr-automation.yml@main
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### Deploy to Multiple Orgs

```bash
# Deploy to all default organizations
./deploy-pr-automation.sh

# Deploy to specific organizations
./deploy-pr-automation.sh chittyos chittycorp
```

## AI Review Systems

| System | Purpose | API Key Required |
|--------|---------|------------------|
| CodeRabbit | Incremental PR reviews | No (GitHub App) |
| Claude | Code quality & best practices | `ANTHROPIC_API_KEY` |
| OpenAI Codex | Security & performance | `OPENAI_API_KEY` |

## Auto-Labeling Rules

Labels are automatically applied based on:

| Pattern | Label |
|---------|-------|
| Branch `feature/*`, `feat/*` | `implementation` |
| Branch `bugfix/*`, `fix/*`, `hotfix/*` | `bugfix` |
| Branch `enhance/*`, `improvement/*` | `enhancement` |
| Files `*.md`, `docs/**` | `documentation` |
| Files `.github/workflows/**` | `ci-cd` |
| Files `package.json`, `requirements.txt` | `dependencies` |
| Title/Body contains "breaking" | `breaking-change` |
| Title contains "hotfix", "urgent" | `urgent` |

## Auto-Merge Conditions

PRs auto-merge when ALL conditions are met:

- ✅ All required checks pass
- ✅ No merge conflicts
- ✅ Branch is up to date
- ✅ No blocking labels
- ✅ Not a draft PR
- ✅ Canonical checks pass

### Blocking Labels

These labels prevent auto-merge:
- `do-not-merge`
- `wip`
- `work-in-progress`
- `blocked`

## Configuration

### `.github/auto-merge.json`

```json
{
  "enabled": true,
  "mergeMethod": "squash",
  "requireAllChecks": true,
  "requiredChecks": ["test", "security", "canonical-checks"],
  "blockedLabels": ["do-not-merge", "wip"],
  "requireUpToDate": true,
  "deleteAfterMerge": true
}
```

### `.github/coderabbit.yml`

```yaml
language: en-US
reviews:
  auto_review:
    enabled: true
    auto_incremental_review: true
  high_level_summary: true
```

## Secrets Setup

### Repository Level

```bash
# Add secrets via CLI
gh secret set ANTHROPIC_API_KEY --body "sk-ant-..."
gh secret set OPENAI_API_KEY --body "sk-..."
```

### Organization Level

```bash
# Add secrets for all repos
gh secret set ANTHROPIC_API_KEY --org chittyos --body "sk-ant-..."
gh secret set OPENAI_API_KEY --org chittyos --body "sk-..."
```

## Branch Protection

Set up required status checks:

```bash
# Via GitHub CLI
gh api repos/{owner}/{repo}/branches/main/protection \
  -X PUT \
  -F required_status_checks[strict]=true \
  -F required_status_checks[contexts][]=canonical-checks \
  -F required_status_checks[contexts][]=ai-review-claude \
  -F required_status_checks[contexts][]=ai-review-codex
```

Or via GitHub UI:
1. Settings → Branches → Add rule
2. Branch name: `main`
3. Require status checks: ✅
4. Select: `canonical-checks`, `ai-review-claude`, `ai-review-codex`

## Troubleshooting

### AI Reviews Not Running

```bash
# Check if secrets are set
gh secret list

# Check workflow runs
gh run list --workflow=ai-review-claude.yml

# View logs
gh run view --log
```

### Auto-Merge Not Working

```bash
# Check PR status
gh pr checks <PR_NUMBER>

# Check labels
gh pr view <PR_NUMBER> --json labels

# Remove blocking label
gh pr edit <PR_NUMBER> --remove-label "wip"
```

### Re-trigger Reviews

```bash
# Re-run workflow
gh run rerun <RUN_ID>

# Or add comment
gh pr comment <PR_NUMBER> --body "@coderabbitai review"
```

## Cost Estimates

Per PR (typical):
- CodeRabbit: Included (or $12/user/month)
- Claude: ~$0.003
- OpenAI GPT-4: ~$0.02

Monthly (100 PRs):
- CodeRabbit: $12/user/month
- Claude: ~$0.30
- OpenAI: ~$2.00

## Organizations

Deployed to:
- ✅ Chittyfoundation
- ✅ chittyos
- ✅ chittyapps
- ✅ chittycorp
- ✅ furnished-condos
- ✅ chicagoapps

## Documentation

- **Full Setup Guide**: [PR_AUTOMATION_SETUP.md](./PR_AUTOMATION_SETUP.md)
- **Architecture**: [CLAUDE.md](./CLAUDE.md)
- **SOPs**: [ChittyOS-CICD-SOPs.md](./ChittyOS-CICD-SOPs.md)

## Support

- Issues: https://github.com/chittyos/chittyops/issues
- Slack: #ops-automation
- Email: ops@chitty.cc
