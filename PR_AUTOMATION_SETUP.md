# PR Automation Setup Guide

## Overview

This repository implements comprehensive CI/CD automation for pull requests with multi-AI review systems, auto-labeling, auto-merge, and branch cleanup functionality.

## Features

### 1. Multi-AI Review System

Three AI systems provide automated code reviews:

- **CodeRabbit AI**: GitHub App integration for automatic PR reviews
- **Claude (Anthropic)**: Deep code analysis and best practices review
- **OpenAI Codex**: Security vulnerability scanning and code quality analysis

### 2. Auto-Labeling

PRs are automatically labeled based on:
- File patterns (implementation, documentation, testing, ci-cd, dependencies)
- Branch naming conventions (feature/, bugfix/, hotfix/, enhance/, perf/)
- PR title and description content (breaking-change, urgent, rfc)

### 3. Auto-Merge

PRs automatically merge when ALL conditions are met:
- All CI/CD checks pass
- All AI reviews complete successfully
- No merge conflicts exist
- Branch is up to date with base branch
- No blocking labels present
- Canonical checks from chittyfoundation/ops pass

### 4. Auto-Delete Branches

Source branches are automatically deleted after successful merge, except:
- Protected branches (main, master, develop, staging, production)
- Branches from forks
- Release and hotfix branches

### 5. Canonical Checks Integration

Integrates with chittyfoundation/ops for governance validation:
- Territory validation
- Hook contract compliance
- Repository structure validation
- Workflow integrity checks

## Workflows

### Main Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `pr-automation.yml` | PR events | Main automation orchestrator |
| `ai-review-claude.yml` | PR open/sync | Claude AI code review |
| `ai-review-codex.yml` | PR open/sync | OpenAI security analysis |
| `auto-merge.yml` | Check completion | Auto-merge when ready |
| `auto-delete-branch.yml` | PR closed | Clean up merged branches |
| `canonical-checks.yml` | PR open/push | Foundation governance validation |

### Configuration Files

| File | Purpose |
|------|---------|
| `.github/coderabbit.yml` | CodeRabbit AI configuration |
| `.github/labeler.yml` | Auto-labeling rules |
| `.github/auto-merge.json` | Auto-merge conditions |

## Setup Instructions

### Step 1: Install CodeRabbit GitHub App

1. Go to https://github.com/apps/coderabbitai
2. Click "Install"
3. Select your organization or repositories
4. Grant required permissions:
   - Pull requests: Read & Write
   - Contents: Read
   - Issues: Read & Write

### Step 2: Configure Secrets

Add the following secrets to your repository or organization settings:

#### Required for AI Reviews

- `ANTHROPIC_API_KEY` - Get from https://console.anthropic.com/
- `OPENAI_API_KEY` - Get from https://platform.openai.com/api-keys

#### ChittyConnect Integration (Recommended)

- `CHITTYCONNECT_API_KEY` - For ephemeral secret provisioning

To add secrets:
1. Go to repository Settings → Secrets and variables → Actions
2. Click "New repository secret" or "New organization secret"
3. Add each secret name and value

### Step 3: Configure Auto-Merge Rules

Edit `.github/auto-merge.json` to customize:

```json
{
  "enabled": true,
  "mergeMethod": "squash",
  "requireAllChecks": true,
  "requiredChecks": [
    "test",
    "security", 
    "canonical-checks",
    "ai-review-claude",
    "ai-review-codex"
  ],
  "blockedLabels": [
    "do-not-merge",
    "wip",
    "work-in-progress",
    "blocked"
  ],
  "requireUpToDate": true,
  "deleteAfterMerge": true
}
```

### Step 4: Set Up Branch Protection

Configure branch protection rules for `main` branch:

1. Go to Settings → Branches → Add rule
2. Branch name pattern: `main`
3. Enable:
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - ✅ Select required status checks:
     - `canonical-checks`
     - `ai-review-claude`
     - `ai-review-codex`
     - `test` (if applicable)
     - `security` (if applicable)

### Step 5: Customize Labels

Create the following labels in your repository:

| Label | Color | Description |
|-------|-------|-------------|
| `implementation` | #0366d6 | New feature implementations |
| `enhancement` | #a2eeef | Improvements to existing features |
| `bugfix` | #d73a4a | Bug fixes |
| `documentation` | #0075ca | Documentation changes |
| `security` | #ee0701 | Security-related changes |
| `performance` | #fbca04 | Performance improvements |
| `dependencies` | #0366d6 | Dependency updates |
| `ci-cd` | #1d76db | CI/CD changes |
| `testing` | #d4c5f9 | Test-related changes |
| `breaking-change` | #b60205 | Breaking changes |
| `urgent` | #d93f0b | Urgent fixes |
| `do-not-merge` | #b60205 | Blocks auto-merge |

## Usage

### For Pull Request Authors

1. **Create a PR** - The automation will:
   - Automatically label your PR based on changes
   - Trigger AI reviews from Claude and OpenAI
   - CodeRabbit will review automatically

2. **Review AI Feedback** - Check PR comments for:
   - Claude's code quality and best practices review
   - OpenAI's security and performance analysis
   - CodeRabbit's incremental review

3. **Wait for Auto-Merge** - If all checks pass:
   - PR will automatically merge
   - Source branch will be auto-deleted

### Blocking Auto-Merge

To prevent auto-merge, add one of these labels:
- `do-not-merge`
- `wip` or `work-in-progress`
- `blocked`

### Manual Review

AI reviews complement, not replace, human review. Team members should still review PRs for:
- Business logic correctness
- Architecture decisions
- User experience considerations

## Troubleshooting

### AI Reviews Not Running

1. **Check API Keys**: Verify secrets are configured
   ```bash
   # In repository settings, check:
   # - ANTHROPIC_API_KEY is set
   # - OPENAI_API_KEY is set
   ```

2. **Check Workflow Permissions**: Ensure workflows have write permissions
   - Settings → Actions → General → Workflow permissions
   - Select "Read and write permissions"

3. **Check Rate Limits**: AI APIs have rate limits
   - Claude: 50 requests/minute
   - OpenAI: Varies by tier

### Auto-Merge Not Working

1. **Check Required Checks**: All required checks must pass
   ```bash
   # View check status
   gh pr checks <PR_NUMBER>
   ```

2. **Check Labels**: Remove blocking labels
   ```bash
   # Remove label
   gh pr edit <PR_NUMBER> --remove-label "wip"
   ```

3. **Check Conflicts**: Resolve merge conflicts
   ```bash
   git pull origin main
   git push
   ```

### CodeRabbit Not Reviewing

1. **Verify Installation**: Check GitHub App is installed
   - https://github.com/apps/coderabbitai/installations

2. **Check Configuration**: Review `.github/coderabbit.yml`

3. **Re-trigger**: Add a comment `@coderabbitai review`

## Cross-Organization Deployment

### Option 1: Organization .github Repository

1. Create a `.github` repository in your organization
2. Copy workflows to `.github/.github/workflows/`
3. All org repositories will inherit these workflows

### Option 2: Reusable Workflows

Create reusable workflow in central repo:

```yaml
# In CHITTYOS/chittyops/.github/workflows/reusable-pr-automation.yml
name: Reusable PR Automation

on:
  workflow_call:
    secrets:
      ANTHROPIC_API_KEY:
        required: false
      OPENAI_API_KEY:
        required: false

jobs:
  # ... workflow jobs
```

Use in other repos:

```yaml
# In any repository
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

### Option 3: Template Repository

1. Mark this repository as a template
2. Create new repositories from template
3. Workflows are automatically included

## Organizations Supported

This automation is designed for:
- Chittyfoundation
- chittyos
- chittyapps  
- chittycorp
- furnished-condos
- chicagoapps

## Best Practices

1. **Use Descriptive Branch Names**: Follow conventions:
   - `feature/add-user-auth`
   - `bugfix/fix-login-error`
   - `hotfix/security-patch`
   - `enhance/improve-performance`

2. **Write Clear PR Titles**: Include:
   - What changed
   - Why it changed
   - Any breaking changes

3. **Respond to AI Reviews**: AI reviews are not perfect:
   - Review and address valid concerns
   - Ignore false positives
   - Add comments explaining decisions

4. **Keep PRs Small**: Smaller PRs get:
   - Better AI reviews
   - Faster human reviews
   - Fewer merge conflicts

5. **Use Draft PRs**: Mark WIP PRs as draft to:
   - Skip auto-merge
   - Still get AI reviews
   - Signal work in progress

## Cost Considerations

### AI API Costs

- **Claude**: ~$0.003 per request (typical PR)
- **OpenAI GPT-4**: ~$0.02 per request (typical PR)
- **CodeRabbit**: Free tier available, paid plans start at $12/user/month

### Optimization Tips

1. Use CodeRabbit for most reviews (included in GitHub)
2. Enable Claude/OpenAI for critical repos only
3. Configure skip patterns for generated code
4. Use rate limiting in workflows

## Support

- **Issues**: https://github.com/chittyos/chittyops/issues
- **Docs**: See `CLAUDE.md` for architecture details
- **SOPs**: See `ChittyOS-CICD-SOPs.md` for procedures

## License

See LICENSE file in repository root.
