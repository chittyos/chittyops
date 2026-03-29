# ChittyOps Implementation

**Foundation-governed operations for the ChittyOS ecosystem**

## Architecture

### Foundation Layer
[chittyfoundation/chittyops](https://github.com/chittyfoundation/chittyops) - Governance primitives

### Implementation Layer  
ChittyOS/chittyops (this repo) - Operational tools

## Features

### 🤖 PR Automation (NEW)

Comprehensive CI/CD automation for pull requests with:
- **Multi-AI Review System**: CodeRabbit, Claude, and OpenAI Codex
- **Auto-Labeling**: Automatic PR labeling based on content and patterns
- **Auto-Merge**: Merge PRs when all conditions are met
- **Auto-Delete**: Clean up merged branches automatically
- **Canonical Checks**: Integration with chittyfoundation/ops governance

**Quick Start:**
```yaml
# .github/workflows/pr-automation.yml
jobs:
  automation:
    uses: CHITTYOS/chittyops/.github/workflows/reusable-pr-automation.yml@main
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

📚 **Documentation:**
- [Setup Guide](./PR_AUTOMATION_SETUP.md) - Complete setup instructions
- [Quick Reference](./PR_AUTOMATION_QUICK_REFERENCE.md) - Commands and configuration
- Deploy to multiple orgs: `./deploy-pr-automation.sh`

### 🔐 Secrets Provisioning

ChittyConnect provides ephemeral credentials on-demand:
- No long-lived secrets in repositories
- Scoped, time-limited tokens
- Centralized audit trail

See [SECRETS_PROVISIONING.md](./SECRETS_PROVISIONING.md) for details.

## CLI Tools

- `hookify` - Hook management (foundation-validated)
- `chitty-org` - Cross-org orchestration (territory-aware)
- `chitty-ops` - Unified interface

## Quick Start

```bash
# Add a hook
hookify add pre-commit ./scripts/lint.sh

# Deploy across orgs
chitty-org deploy chittycore --all-orgs

# Deploy PR automation to all orgs
./deploy-pr-automation.sh
```

See [TERMINAL_OPS_PLAN.md](./TERMINAL_OPS_PLAN.md) for details.
