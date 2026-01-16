# ChittyOps Charter

## Classification
- **Tier**: 3 (Service Layer)
- **Organization**: CHITTYOS
- **Domain**: N/A (CI/CD infrastructure)

## Mission

ChittyOps is the **centralized CI/CD system** for managing standardized workflows across all ChittyOS, ChittyCorp, and nevershitty organization repositories. It provides automated testing, deployment, security scanning, and ChittyBeacon monitoring integration.

## Scope

### IS Responsible For
- Standardized CI/CD workflow management
- Project type detection (Node.js, Python, Rust, Go, Cloudflare Workers, Next.js)
- ChittyBeacon monitoring integration
- Security scanning (Snyk, CodeQL, OWASP, Dependabot)
- Secret detection in code
- Workflow protection and branch rules
- Deployment automation (Vercel, Cloudflare Workers)
- Ephemeral credentials provisioning (via ChittyConnect)
- Reusable workflow templates
- Cross-organization workflow management

### IS NOT Responsible For
- Application code (only CI/CD infrastructure)
- Identity generation (ChittyID)
- Token provisioning (ChittyAuth)
- Service registration (ChittyRegister)
- Database management
- Application monitoring (ChittyBeacon handles this)

## Key Components

### Scripts
| Script | Purpose |
|--------|---------|
| `setup-org-workflows.sh` | Deploy CI/CD across all organization repos |
| `lock-workflows.sh` | Implement workflow protection and branch rules |

### Reusable Workflows
| Workflow | Purpose |
|----------|---------|
| `reusable-worker-deploy.yml` | Deploy Cloudflare Workers |
| `reusable-package-publish.yml` | Publish to npm/R2/Homebrew |

### getchitty-creds Action
Ephemeral credential provisioning:
- `cloudflare_token`
- `npm_token`
- `github_token`
- `account_id`

## Secrets Provisioning

**CRITICAL**: All secrets are provisioned ephemerally by ChittyConnect.

**Only Required Org-Level Secret**: `CHITTYCONNECT_API_KEY`

All other credentials (Cloudflare, npm, GitHub tokens) are provisioned on-demand.

## Dependencies

| Type | Service | Purpose |
|------|---------|---------|
| Upstream | ChittyConnect | Ephemeral credential provisioning |
| Peer | ChittyBeacon | Monitoring integration |
| External | GitHub Actions | Workflow runtime |
| External | Vercel | Deployment target |
| External | Cloudflare Workers | Deployment target |
| External | Snyk | Security scanning |
| External | CodeQL | Code analysis |

## Organizations Managed

- ChittyOS
- ChittyCorp
- nevershitty

## Performance Targets

| Metric | Target |
|--------|--------|
| Workflow success rate | >95% |
| Deployment success rate | >99% |
| Average build time | <5 minutes |
| Average deployment time | <3 minutes |
| Critical vulnerability patch | <24 hours |

## SOPs

| SOP | Purpose |
|-----|---------|
| SOP-001 | Initial setup across all repos |
| SOP-002 | New repository integration |
| SOP-003 | ChittyBeacon integration |
| SOP-004 | Deployment management |
| SOP-005 | Security management |
| SOP-006 | Troubleshooting |
| SOP-007 | Monitoring and maintenance |

## Ownership

| Role | Owner |
|------|-------|
| Service Owner | ChittyOS |
| Technical Lead | @chittyos-infrastructure |
| CODEOWNERS | @nickbianchi, @ChittyOS/cicd-admins |
| Contact | ops@chitty.cc |

## Compliance

- [ ] CLAUDE.md development guide present
- [ ] CODEOWNERS configured
- [ ] Branch protection rules active
- [ ] ChittyBeacon integration verified
- [ ] ChittyConnect ephemeral credentials active

---
*Charter Version: 1.0.0 | Last Updated: 2026-01-13*
