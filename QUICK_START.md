# ChittyOps Quick Start

Get up and running with foundation-governed operations in 5 minutes.

## Prerequisites

- Node.js 18+
- Git
- GitHub CLI (`gh`)
- Access to ChittyOS organizations

## Installation

### 1. Clone and Install
```bash
# Clone the repo
git clone https://github.com/ChittyOS/chittyops.git
cd chittyops

# Install dependencies (includes foundation packages)
npm install

# Link CLIs globally
npm link

# Verify installation
hookify --help
chitty-org --help
```

### 2. Initialize Configuration
```bash
# Initialize cross-org configuration
chitty-org init

# This will:
# ✅ Discover all organizations
# ✅ Map territories
# ✅ Validate foundation governance
```

## Quick Examples

### Example 1: Add a Pre-Commit Hook

```bash
# Go to your project
cd ~/github.com/ChittyOS/chittycore

# Create a simple lint hook
cat > .chitty-hooks/lint.sh << 'EOF'
#!/bin/bash
echo "🔍 Running linter..."
npm run lint
EOF

# Add the hook (foundation validates automatically)
hookify add pre-commit .chitty-hooks/lint.sh

# ✅ Hook is now active and foundation-validated
# Try committing - the hook will run!
```

### Example 2: Use Built-in Templates

```bash
# Create a pre-commit hook from template
hookify create pre-commit ./my-pre-commit.sh

# Edit the generated script
# Then add it
hookify add pre-commit ./my-pre-commit.sh
```

### Example 3: Sync Hooks Across All Repos

```bash
# First, add your hooks
hookify add pre-commit ./scripts/lint.sh
hookify add pre-push ./scripts/test.sh

# Then sync to all your repos
hookify sync --all-repos

# ✅ All repos now have your hooks
# ✅ All validated against foundation
```

### Example 4: Deploy Across Organizations

```bash
# Deploy a service to all orgs
chitty-org deploy chittycore --all-orgs

# Foundation automatically:
# ✅ Validates you have permission in 'operations' territory
# ✅ Checks cross-territory coordination
# ✅ Logs operation for audit
```

### Example 5: Check Cross-Org Status

```bash
# See all organizations and their territories
chitty-org status --all-orgs --detailed

# Output shows:
# - Organization names
# - Territory assignments
# - Permission levels
# - Services per org
```

## Common Workflows

### Workflow 1: Set Up a New Project

```bash
# 1. Create project
mkdir my-new-service && cd my-new-service
git init

# 2. Add standard hooks
hookify add pre-commit $(pwd)/../chittyops/terminal-ops/templates/pre-commit.sh
hookify add pre-push $(pwd)/../chittyops/terminal-ops/templates/pre-push.sh

# 3. Verify
hookify list

# ✅ Your project now has foundation-validated hooks
```

### Workflow 2: Deploy to Multiple Environments

```bash
# Deploy to staging
chitty-org deploy myservice --env staging --all-orgs

# Test in staging...

# Deploy to production
chitty-org deploy myservice --env production --all-orgs

# Foundation validates both deployments
```

### Workflow 3: Sync Workflows Across Org

```bash
# Sync GitHub Actions workflows
chitty-org sync-workflows --all-orgs

# This:
# ✅ Checks write permissions per org
# ✅ Validates workflow compatibility
# ✅ Creates PRs with updates
```

## Understanding Foundation Validation

### Hook Validation
When you add a hook, foundation checks:
```
✅ Hook type (git, terminal, custom)
✅ Governance policy (blocking, timeout, etc)
✅ Territory permission
✅ Lifecycle contract
```

### Territory Validation
When you deploy, foundation checks:
```
✅ Organization in territory
✅ Permission level (read/write/admin)
✅ Cross-territory coordination allowed
✅ Governance consensus met
```

## Troubleshooting

### Hook Not Executing
```bash
# Check hook status
hookify list

# Verify hook is enabled and compliant
# Look for ✅ (compliant) vs ⚠️ (issues)

# Check logs
tail -f ~/.chitty/logs/hook-manager.log
```

### Territory Permission Denied
```bash
# Check your org's territory
chitty-org status --org YourOrg

# Verify service territory
# If mismatched, you need permission from territory owners
```

### Foundation Validation Failed
```bash
# Hooks show compliance issues
hookify list

# Fix the issues shown, or
# Request governance change via foundation PR
```

## Next Steps

1. **Read the docs**: Check [README.md](./README.md) for full details
2. **Explore templates**: See `terminal-ops/templates/` for examples
3. **Join governance**: Contribute to [chittyfoundation/chittyops](https://github.com/chittyfoundation/chittyops)
4. **Share hooks**: Create reusable hooks for the team

## Getting Help

- **Hook issues**: `hookify --help`
- **Cross-org issues**: `chitty-org --help`  
- **Foundation questions**: [chittyfoundation/chittyops issues](https://github.com/chittyfoundation/chittyops/issues)
- **Implementation bugs**: [ChittyOS/chittyops issues](https://github.com/ChittyOS/chittyops/issues)

## Reference

**Foundation**: https://github.com/chittyfoundation/chittyops
**Implementation**: https://github.com/ChittyOS/chittyops
**Territories**: See foundation README for complete list

---

**You're now ready to use foundation-governed operations! 🎉**
