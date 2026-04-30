![ChittyOS](https://img.shields.io/badge/ChittyOS-service-6366F1?style=flat-square)
![Tier](https://img.shields.io/badge/tier-3%20operational-3730A3?style=flat-square)

# ChittyOps Implementation

**Foundation-governed operations for the ChittyOS ecosystem**

## Architecture

### Foundation Layer
[chittyfoundation/chittyops](https://github.com/chittyfoundation/chittyops) - Governance primitives

### Implementation Layer  
ChittyOS/chittyops (this repo) - Operational tools

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
```

See [TERMINAL_OPS_PLAN.md](./TERMINAL_OPS_PLAN.md) for details.
