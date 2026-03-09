# ChittyOps Implementation

**Foundation-governed operations for the ChittyOS ecosystem**

## Architecture

### Foundation Layer
[chittyfoundation/chittyops](https://github.com/chittyfoundation/chittyops) - Governance primitives

### Implementation Layer  
ChittyOS/chittyops (this repo) - Operational tools

## Features

### 🤖 PR Automation
Multi-AI code review and intelligent auto-merge system
- CodeRabbit, Claude, and OpenAI Codex integration
- Automatic labeling and status tracking
- Smart auto-merge when all checks pass
- See [PR_AUTOMATION.md](./PR_AUTOMATION.md) for details

### 🔧 CLI Tools
- `hookify` - Hook management (foundation-validated)
- `chitty-org` - Cross-org orchestration (territory-aware)
- `chitty-ops` - Unified interface

## Quick Start

```bash
# Add a hook
hookify add pre-commit ./scripts/lint.sh

# Deploy across orgs
chitty-org deploy chittycore --all-orgs

# Set up PR automation
./setup-org-workflows.sh
```

## Documentation

- [Quick Start Guide](./QUICK_START.md) - Get started in 5 minutes
- [PR Automation](./PR_AUTOMATION.md) - Automated PR management
- [CI/CD Quick Reference](./CICD-Quick-Reference.md) - Common commands
- [CI/CD SOPs](./ChittyOS-CICD-SOPs.md) - Standard operating procedures
- [Secrets Provisioning](./SECRETS_PROVISIONING.md) - ChittyConnect integration
- [Terminal Operations](./TERMINAL_OPS_PLAN.md) - Hook system details

See [TERMINAL_OPS_PLAN.md](./TERMINAL_OPS_PLAN.md) for details.
