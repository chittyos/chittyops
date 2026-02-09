# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is the ChittyOps CI/CD and compliance repository — the centralized engine for managing ecosystem compliance, CI/CD workflows, and service onboarding across CHITTYOS and ChittyCorp organizations. It provides a compliance audit engine (7 dimensions, 62 services), automated remediation, reusable workflow templates, and Copilot coding agent definitions.

**Architecture:**
- **Foundation Layer:** [chittyfoundation/chittyops](https://github.com/chittyfoundation/chittyops) - Governance primitives, hook contracts, territory definitions
- **Implementation Layer:** ChittyOS/chittyops (this repo) - CI/CD workflows, deployment automation, operational tools
- **Reference:** Organizations consume this implementation which adheres to foundation governance

## Common Commands

### Compliance Engine
```bash
# Run full ecosystem audit (all orgs, skip runtime probes)
npm run audit

# Audit with JSON + Markdown output
npm run audit:json

# Audit a single service
npm run audit:service -- chittyconnect

# Generate remediation report (dry run)
npm run remediate

# Create GitHub issues on non-compliant repos
node compliance/remediate.js compliance-report.json --mode=issues

# Run tests
npm test
```

### Service Onboarding
```bash
# Onboard a new service end-to-end
./scripts/onboard-service.sh chittywidget CHITTYOS --tier=4 --domain=widget.chitty.cc

# Deploy compliance files to a specific repo
./setup-org-workflows.sh --repo=CHITTYOS/chittywidget

# Dry run first
./setup-org-workflows.sh --repo=CHITTYOS/chittywidget --dry-run
```

### CI/CD Setup and Management
```bash
# Full compliance provisioning across all repos
./setup-org-workflows.sh

# Lock workflows and add protection (requires admin)
./lock-workflows.sh

# Check workflow status
gh run list --limit 10
gh run list --status=failure
```

### Security and Monitoring
```bash
# Check CI/CD health
gh api /orgs/[ORG]/dependabot/alerts
gh pr list --label="dependencies"

# View ChittyBeacon dashboard
# https://beacon.cloudeto.com
```

## Architecture

### Repository Structure
- `compliance/` - Ecosystem compliance engine
  - `service-registry.yml` - 62-service inventory (canonical URI: `chittycanon://chittyos/registry/services`)
  - `checks.yml` - 7 compliance dimension definitions (reference)
  - `audit.js` - Main audit engine (GitHub API + runtime probes)
  - `remediate.js` - Auto-creates issues on non-compliant repos
  - `lib/` - GitHub checker, runtime checker, report generator
  - `README.md` - Compliance engine documentation
- `templates/compliance/` - 6 canonical file templates (.chittyconnect.yml, CHARTER.md, CODEOWNERS, CLAUDE.md, self-check, sync workflow)
- `scripts/onboard-service.sh` - Single-command service onboarding
- `setup-org-workflows.sh` - Full compliance provisioning across all repos
- `.github/workflows/` - CI, reusable workflows, ecosystem audit
- `.github/copilot/` - Copilot coding agent definitions (compliance + onboarding)
- `test/` - Automated test suite (19 tests)
- `CODEOWNERS` - Code ownership and review requirements

### Workflow System Components

1. **Project Type Detection**
   - Automatically identifies: Node.js, Python, Rust, Go, Cloudflare Workers, Next.js
   - Applies appropriate workflow templates based on detected type

2. **ChittyBeacon Integration**
   - Automatic monitoring package installation
   - Heartbeat tracking every 5 minutes
   - Platform detection and deployment tracking

3. **Security Features**
   - Automated dependency updates via Dependabot
   - Security scanning with Snyk, CodeQL, OWASP
   - Secret detection in code
   - Weekly vulnerability assessments

4. **Deployment Platforms**
   - Vercel (preview and production deployments)
   - Cloudflare Workers (edge deployment)
   - Generic Node.js CI/CD

### Secrets Provisioning (IMPORTANT)

**All secrets are provisioned ephemerally by ChittyConnect.**

DO NOT add long-lived secrets to repos. Instead, use ChittyConnect's ephemeral credential system:

```yaml
# ✅ CORRECT: Use reusable workflow with ChittyConnect
jobs:
  deploy:
    uses: CHITTYOS/chittyops/.github/workflows/reusable-worker-deploy.yml@main
    with:
      service_name: 'my-service'
    secrets:
      CHITTYCONNECT_API_KEY: ${{ secrets.CHITTYCONNECT_API_KEY }}
```

The only required org-level secret is `CHITTYCONNECT_API_KEY`. All other credentials (Cloudflare, npm, GitHub tokens) are provisioned on-demand by ChittyConnect.

**See:** `SECRETS_PROVISIONING.md` for complete documentation.

### Reusable Workflows

| Workflow | Purpose |
|----------|---------|
| `reusable-worker-deploy.yml` | Deploy Cloudflare Workers |
| `reusable-package-publish.yml` | Publish to npm/R2/Homebrew |

### getchitty-creds Action

For custom workflows, use the `getchitty-creds` action:

```yaml
- uses: CHITTYOS/chittyops/.github/actions/getchitty-creds@main
  id: creds
  with:
    api_key: ${{ secrets.CHITTYCONNECT_API_KEY }}
    purpose: 'my-purpose'
    service: 'my-service'

# Outputs: cloudflare_token, npm_token, github_token, account_id
```

### Legacy Secrets (Deprecated)

The following secrets are deprecated. Use ChittyConnect instead:

| Secret Name | Status | Replacement |
|------------|--------|-------------|
| `CLOUDFLARE_API_TOKEN` | Deprecated | `steps.creds.outputs.cloudflare_token` |
| `CLOUDFLARE_ACCOUNT_ID` | Deprecated | `steps.creds.outputs.account_id` |
| `NPM_TOKEN` | Deprecated | `steps.creds.outputs.npm_token` |
| `VERCEL_TOKEN` | Deprecated | Use ChittyConnect |
| `SNYK_TOKEN` | Still used | Security scanning |

### Organizations Managed
- **CHITTYOS** — 57 services (active compliance scope)
- **ChittyCorp** — 5 services (active compliance scope)
- **NeverShitty** — Legacy/archived (excluded from compliance scope)

## Key SOPs

### SOP-001: Initial Setup
- Runs `setup-org-workflows.sh` to deploy workflows across all repos
- Creates PRs with CI/CD changes for review
- Configures organization-wide secrets

### SOP-002: New Repository Integration
- Detects project type automatically
- Adds appropriate workflows
- Integrates ChittyBeacon monitoring
- Sets up branch protection

### SOP-003: ChittyBeacon Integration
- Node.js: `npm install @chittycorp/app-beacon --save`
- Python: Custom module in `chittybeacon/`
- Environment variables for configuration

### SOP-004: Deployment Management
- Platform-specific deployment workflows
- Rollback procedures for each platform
- Environment separation (production/preview)

### SOP-005: Security Management
- Weekly dependency updates
- Automated vulnerability scanning
- Security response by severity level

### SOP-006: Troubleshooting
- Common issues and resolutions
- Debug commands and procedures
- Emergency response workflows

### SOP-007: Monitoring and Maintenance
- Daily health checks
- Weekly dependency reviews
- Monthly performance analysis
- Quarterly strategy reviews

## Workflow Protection System

The repository implements a comprehensive protection system:

1. **CODEOWNERS File**
   - Requires admin approval for workflow changes
   - Protected paths: `.github/workflows/`, setup scripts
   - Default reviewers: @nickbianchi, @ChittyOS/cicd-admins

2. **Branch Protection Rules**
   - Required status checks: beacon-check, test, security
   - Dismiss stale reviews
   - Require code owner reviews
   - No force pushes or deletions

3. **Automated Checks**
   - ChittyBeacon integration verification
   - Secret detection in code
   - License file presence
   - YAML syntax validation

## Emergency Procedures

### Complete Pipeline Failure
1. Disable failing workflow temporarily
2. Deploy manually using platform CLIs
3. Create incident ticket
4. Investigate root cause
5. Implement fix and re-enable

### Quick Rollback
- Vercel: `vercel rollback [URL]`
- Cloudflare: `npx wrangler rollback`
- Git: `git revert HEAD && git push`

## Performance Targets

- Workflow success rate: >95%
- Deployment success rate: >99%
- Average build time: <5 minutes
- Average deployment time: <3 minutes
- Critical vulnerability patch time: <24 hours

## Monitoring Dashboards

- ChittyBeacon: https://beacon.cloudeto.com
- GitHub Actions: https://github.com/[ORG]/[REPO]/actions
- Vercel: https://vercel.com/dashboard
- Cloudflare: https://dash.cloudflare.com