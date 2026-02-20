# PR Automation Workflows

**Comprehensive automated PR management for the ChittyOS ecosystem**

## Overview

The PR automation system provides intelligent, multi-AI code review and automated merge capabilities for pull requests across all ChittyOS, ChittyCorp, and nevershitty repositories.

## Features

### 🤖 Multi-AI Review System
- **CodeRabbit AI**: GitHub App integration for automated code review
- **Claude (Anthropic)**: Deep code analysis and contextual review
- **OpenAI Codex**: Implementation quality verification and pattern detection

### 🏷️ Intelligent Auto-Labeling
Automatically labels PRs based on content:
- `implementation` - New features or functionality
- `enhancement` - Improvements to existing code
- `bugfix` - Bug fixes and patches
- `documentation` - Documentation changes
- `dependencies` - Dependency updates
- `ci-cd` - GitHub Actions workflow changes
- `tests` - Test file changes

### 🔀 Smart Auto-Merge
Automatically merges PRs when ALL conditions are met:
- ✅ All CI/CD checks pass
- ✅ No merge conflicts
- ✅ Branch is up to date
- ✅ AI reviews approve (or find no critical issues)
- ✅ Not marked as draft
- ✅ No `do-not-merge` or `wip` labels

### 🗑️ Automatic Branch Cleanup
- Deletes source branch after successful merge
- Skips protected branches (main, master, develop, etc.)
- Skips branches from forks

## Workflows

### 1. PR Automation (`.github/workflows/pr-automation.yml`)

**Trigger**: `pull_request` (opened, synchronize, reopened, edited)

**Jobs**:
- **auto-label**: Analyzes PR content and applies appropriate labels
- **notify-coderabbit**: Ensures CodeRabbit AI is aware of the PR
- **trigger-claude-review**: Initiates Claude AI review workflow
- **trigger-codex-review**: Initiates OpenAI Codex review workflow
- **canonical-checks**: Calls chittyfoundation/ops canonical review (if available)
- **pr-automation-status**: Posts summary comment on PR

**Permissions**: `contents: read`, `pull-requests: write`, `issues: write`, `statuses: write`

### 2. Claude AI Review (`.github/workflows/ai-review-claude.yml`)

**Trigger**: `workflow_dispatch` (called by pr-automation.yml)

**Process**:
1. Fetches PR details and diff
2. Calls Anthropic API with Claude 3.5 Sonnet model
3. Analyzes code for:
   - Summary of changes
   - Strengths and good patterns
   - Issues, bugs, and security concerns
   - Improvement suggestions
   - Overall verdict (APPROVE, REQUEST_CHANGES, COMMENT)
4. Posts review as PR comment
5. Sets commit status (success/failure)
6. Uploads review as artifact

**Required Secret**: `ANTHROPIC_API_KEY`

**Status Context**: `AI Review / Claude`

### 3. OpenAI Codex Review (`.github/workflows/ai-review-codex.yml`)

**Trigger**: `workflow_dispatch` (called by pr-automation.yml)

**Process**:
1. Fetches PR details and diff
2. Calls OpenAI API with GPT-4 Turbo model
3. Analyzes code for:
   - Implementation quality
   - Common issues and anti-patterns
   - Performance considerations
   - Security vulnerabilities
   - Best practice recommendations
   - Overall rating (PASS/NEEDS_WORK/CRITICAL_ISSUES)
4. Performs quick static checks:
   - Console.log statements in production code
   - TODO/FIXME comments
   - Hardcoded secrets patterns
   - Large file additions
5. Posts review as PR comment
6. Sets commit status (success/failure)
7. Uploads review as artifact

**Required Secret**: `OPENAI_API_KEY`

**Status Context**: `AI Review / Codex`

### 4. Auto-Merge (`.github/workflows/auto-merge.yml`)

**Triggers**: 
- `check_run` (completed)
- `status` (any status change)
- `pull_request_review` (submitted)
- `workflow_dispatch` (manual)

**Process**:
1. Identifies associated PR from event
2. Verifies PR is open and not a draft
3. Checks all merge conditions:
   - No merge conflicts (`mergeable == MERGEABLE`)
   - Merge state is clean
   - All CI checks passed
   - AI reviews completed without critical issues
   - No `do-not-merge` or `wip` labels
4. If all conditions met:
   - Enables auto-merge with squash strategy
   - Marks branch for auto-deletion
   - Posts success comment
5. If conditions not met:
   - Posts comment explaining what's blocking

**Permissions**: `contents: write`, `pull-requests: write`, `checks: read`, `statuses: read`

**Merge Strategy**: Squash (single commit to base branch)

### 5. Auto-Delete Branch (`.github/workflows/auto-delete-branch.yml`)

**Trigger**: `pull_request` (closed)

**Process**:
1. Confirms PR was merged (not just closed)
2. Checks if branch is protected
3. Checks if PR is from a fork
4. Deletes branch if:
   - ✅ PR was merged
   - ✅ Branch is not protected
   - ✅ Not from a fork
5. Posts confirmation comment

**Permissions**: `contents: write`, `pull-requests: read`

**Protected Patterns**: `^(main|master|develop|staging|production|release/.*)$`

## Configuration

### CodeRabbit AI (`.github/coderabbit.yml`)

**Settings**:
- **Auto-review**: Enabled for non-draft PRs
- **Profile**: Chill (constructive, teaching-focused)
- **Incremental reviews**: Only review new changes
- **Request changes**: On critical issues

**Path-specific instructions**:
- `*.md`: Check links, spelling, grammar
- `.github/workflows/*.yml`: Verify syntax, security, secrets
- `*.js`: Check console.log, error handling, async/await
- `*.ts`: Verify TypeScript types, check for 'any'
- `package.json`: Verify dependencies, check security

**Custom rules**:
- No hardcoded secrets (severity: error)
- No console.log in production (severity: warning)
- Tests for new features (severity: info)

**Context**:
- ChittyOS CI/CD operations repository
- Use ChittyConnect for ephemeral secrets
- Follow existing workflow patterns
- Include ChittyBeacon monitoring

## Setup Instructions

### 1. Repository Setup

Enable auto-merge in repository settings:
```bash
# Via GitHub UI:
Settings → General → Pull Requests → Allow auto-merge ✓

# Or via gh CLI:
gh api repos/{owner}/{repo} --method PATCH -f allow_auto_merge=true
```

### 2. Install CodeRabbit AI

Install as a GitHub App:
1. Visit: https://github.com/apps/coderabbitai
2. Click "Install" or "Configure"
3. Select organizations: ChittyOS, ChittyCorp, nevershitty
4. Grant repository access: All repositories or select specific ones

### 3. Configure Secrets

**Organization-level secrets** (required):
```bash
# Navigate to: https://github.com/organizations/{ORG}/settings/secrets/actions

# Add these secrets:
ANTHROPIC_API_KEY=sk-ant-...     # Claude API key
OPENAI_API_KEY=sk-...            # OpenAI API key
```

**Note**: `GITHUB_TOKEN` is automatically provided by GitHub Actions.

### 4. Copy Workflows to Other Repositories

Use the setup script to deploy across organization:
```bash
# From chittyops repo
./setup-org-workflows.sh

# Or manually for specific repo:
cd /path/to/target/repo

# Copy workflow files
mkdir -p .github/workflows
cp /path/to/chittyops/.github/workflows/pr-automation.yml .github/workflows/
cp /path/to/chittyops/.github/workflows/ai-review-claude.yml .github/workflows/
cp /path/to/chittyops/.github/workflows/ai-review-codex.yml .github/workflows/
cp /path/to/chittyops/.github/workflows/auto-merge.yml .github/workflows/
cp /path/to/chittyops/.github/workflows/auto-delete-branch.yml .github/workflows/
cp /path/to/chittyops/.github/coderabbit.yml .github/

# Commit and push
git add .github/
git commit -m "Add PR automation workflows"
git push
```

### 5. Create Required Labels

Create labels in your repository:
```bash
gh label create "implementation" --color "0E8A16" --description "New features or functionality"
gh label create "enhancement" --color "A2EEEF" --description "Improvements to existing code"
gh label create "bugfix" --color "D73A4A" --description "Bug fixes and patches"
gh label create "documentation" --color "0075CA" --description "Documentation changes"
gh label create "dependencies" --color "0366D6" --description "Dependency updates"
gh label create "ci-cd" --color "FEF2C0" --description "CI/CD workflow changes"
gh label create "tests" --color "FBCA04" --description "Test changes"
gh label create "do-not-merge" --color "B60205" --description "Do not auto-merge this PR"
gh label create "wip" --color "FBCA04" --description "Work in progress"
```

## Usage

### Creating a PR with Automation

1. **Create your PR normally**:
   ```bash
   git checkout -b feature/my-feature
   # ... make changes ...
   git push origin feature/my-feature
   gh pr create --title "feat: Add new feature" --body "Description"
   ```

2. **Automation triggers automatically**:
   - PR is auto-labeled based on content
   - CodeRabbit, Claude, and Codex reviews are initiated
   - Status checks are created

3. **Review AI feedback**:
   - Check PR comments for AI reviews
   - Address any critical issues found
   - Make additional commits if needed

4. **Auto-merge (if conditions met)**:
   - Once all checks pass, auto-merge is enabled
   - PR merges automatically when ready
   - Branch is deleted automatically

### Preventing Auto-Merge

To prevent a PR from auto-merging:
```bash
# Add a label:
gh pr edit {PR_NUMBER} --add-label "do-not-merge"

# Or mark as draft:
gh pr ready {PR_NUMBER} --undo

# Or add WIP to title:
gh pr edit {PR_NUMBER} --title "WIP: My feature"
```

### Manual Merge

If auto-merge is not desired, merge manually:
```bash
# Disable auto-merge:
gh pr merge {PR_NUMBER} --auto=false

# Then merge manually when ready:
gh pr merge {PR_NUMBER} --squash --delete-branch
```

## Monitoring

### Check Workflow Status

```bash
# List recent workflow runs
gh run list --workflow=pr-automation.yml --limit 10

# View specific run
gh run view {RUN_ID} --log

# View AI review artifacts
gh run download {RUN_ID}
```

### Check AI Review Status

```bash
# View PR status checks
gh pr checks {PR_NUMBER}

# View PR comments
gh pr view {PR_NUMBER} --comments
```

### Troubleshooting

**AI reviews not posting?**
- Check secrets are configured: `gh secret list`
- View workflow logs: `gh run view {RUN_ID} --log`
- Verify API keys are valid

**Auto-merge not triggering?**
- Check PR meets all conditions (see auto-merge comment)
- Verify no `do-not-merge` label
- Ensure all status checks passed
- Check if auto-merge is enabled in repo settings

**Branch not deleting?**
- Check if branch is protected
- Verify PR was actually merged
- Check workflow logs for errors

## Integration with Foundation

### Canonical Reviews

The PR automation integrates with `chittyfoundation/ops` for canonical checks:

```yaml
# In pr-automation.yml
canonical-checks:
  runs-on: ubuntu-latest
  steps:
    - name: Check for canonical workflow
      # Checks if chittyfoundation/ops has canonical-review.yml
    
    - name: Run canonical checks
      # Calls: chittyfoundation/ops/.github/workflows/canonical-review.yml@main
```

**Note**: This requires the canonical workflow to exist and be publicly accessible in the foundation repository.

### Cross-Repository Reuse

All workflows are designed to be copied to other repositories in:
- `chittyos/*`
- `chittyapps/*`
- `chittycorp/*`
- `furnished-condos/*`
- `chicagoapps/*`

No modifications needed - just copy and configure secrets.

## Best Practices

### For PR Authors

1. **Write descriptive PR titles**: AI reviews use titles for context
2. **Include detailed descriptions**: Helps AI understand intent
3. **Keep PRs focused**: Smaller PRs get better reviews
4. **Address AI feedback**: AI reviews highlight real issues
5. **Use draft PRs**: For work-in-progress changes

### For Repository Maintainers

1. **Configure branch protection**: Require status checks before merge
2. **Set up CODEOWNERS**: For critical paths requiring human review
3. **Monitor AI review quality**: Check that reviews are helpful
4. **Adjust CodeRabbit config**: Tune for your project's needs
5. **Review auto-merged PRs**: Periodically audit auto-merged changes

### For Security

1. **Never commit API keys**: AI reviews will flag this
2. **Review security findings**: AI reviews check for vulnerabilities
3. **Keep dependencies updated**: Use dependabot alongside AI reviews
4. **Audit auto-merged PRs**: Review changes that bypassed human review

## Costs and Limits

### API Costs

- **Anthropic API**: ~$0.003 per PR review (Claude 3.5 Sonnet)
- **OpenAI API**: ~$0.01-0.02 per PR review (GPT-4 Turbo)
- **CodeRabbit**: Free for open source, paid for private repos

### Rate Limits

- **Claude**: 50 requests/minute (Tier 2)
- **OpenAI**: 10,000 requests/day
- **CodeRabbit**: No hard limits (as GitHub App)

### GitHub Actions Minutes

- **Per PR**: ~5-10 minutes (all workflows combined)
- **Monthly**: Depends on PR volume
- **Optimization**: Workflows use caching and parallel jobs

## Support

### Documentation

- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [CodeRabbit Docs](https://docs.coderabbit.ai/)
- [Anthropic API Docs](https://docs.anthropic.com/)
- [OpenAI API Docs](https://platform.openai.com/docs/)

### Getting Help

- **Workflow issues**: Check `.github/workflows/*.yml` for inline comments
- **AI review issues**: Check workflow logs and API responses
- **Auto-merge issues**: Review conditions in auto-merge comments
- **General questions**: [ChittyOS/chittyops issues](https://github.com/ChittyOS/chittyops/issues)

## Advanced Configuration

### Customizing AI Prompts

Edit the workflows to adjust AI review prompts:

**Claude** (`.github/workflows/ai-review-claude.yml`):
```yaml
# Line ~88: Modify the prompt
content: "You are an expert code reviewer. Review the following PR..."
```

**Codex** (`.github/workflows/ai-review-codex.yml`):
```yaml
# Line ~95: Modify system prompt
content: "You are an expert code reviewer specializing in..."
```

### Customizing Auto-Merge Conditions

Edit `.github/workflows/auto-merge.yml`:

```yaml
# Add custom conditions in "Evaluate auto-merge conditions" step
# Example: Require specific label
if echo "$LABELS" | grep -q "approved"; then
  REASONS="$REASONS\n✅ Has approved label"
else
  SHOULD_MERGE="false"
  REASONS="$REASONS\n❌ Missing approved label"
fi
```

### Customizing Labels

Edit `.github/workflows/pr-automation.yml` in the `auto-label` job:

```yaml
# Add custom label logic
if echo "$FILES" | grep -qE 'custom-pattern'; then
  LABELS="custom-label,$LABELS"
fi
```

---

**PR automation makes code review faster, more consistent, and more thorough. 🚀**
