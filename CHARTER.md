---
uri: chittycanon://chittyos/services/chittyops
namespace: chittyos.operations.chittyops
type: service-charter
version: 2.0.0
status: CERTIFIED
registered_with: chittycanon://core/services/canon
organization: CHITTYOS
tier: 3
territory: operations
last_updated: 2026-02-09
---

# ChittyOps Service Charter

## Classification
- **Canonical URI**: `chittycanon://chittyos/services/chittyops`
- **Tier**: 3 (Operational)
- **Organization**: CHITTYOS
- **Territory**: Operations
- **Domain**: N/A (CI/CD infrastructure — not a deployable worker)

## Mission

ChittyOps is the **centralized CI/CD and compliance engine** for the ChittyOS ecosystem. It manages standardized workflows, enforces ecosystem compliance across 7 dimensions, and automates service onboarding across CHITTYOS and ChittyCorp organizations.

## Scope

### IS Responsible For
- Ecosystem-wide compliance auditing (7 dimensions, 62 services)
- Service registry maintenance (`compliance/service-registry.yml`)
- Compliance remediation (automated issue creation on non-compliant repos)
- Standardized CI/CD workflow management
- Compliance file templates (`.chittyconnect.yml`, `CHARTER.md`, `CODEOWNERS`, `CLAUDE.md`)
- Reusable workflow templates (deploy, publish, compliance check)
- Service onboarding automation (`scripts/onboard-service.sh`)
- Setup script for full compliance provisioning (`setup-org-workflows.sh`)
- ChittyBeacon monitoring integration
- Ephemeral credentials provisioning (via ChittyConnect)
- Cross-organization workflow management (CHITTYOS, ChittyCorp)
- Copilot coding agent definitions for automated remediation

### IS NOT Responsible For
- Application code (only CI/CD and compliance infrastructure)
- Identity generation (ChittyID — Tier 0)
- Token provisioning (ChittyAuth — Tier 1)
- Service registration runtime (ChittyRegister — Tier 1)
- LLM/AI routing (ChittyGateway — Tier 2)
- Database management
- Application monitoring runtime (ChittyBeacon — Tier 3)
- NeverShitty org (legacy/archived — excluded from compliance scope)

## Key Components

### Compliance Engine
| Component | Path | Purpose |
|-----------|------|---------|
| Service Registry | `compliance/service-registry.yml` | 62-service inventory with tier, type, domain metadata |
| Checks Reference | `compliance/checks.yml` | 7 compliance dimension definitions |
| Audit Engine | `compliance/audit.js` | GitHub API + runtime endpoint probes |
| Remediation | `compliance/remediate.js` | Auto-creates issues on non-compliant repos |
| GitHub Checker | `compliance/lib/github-checker.js` | `gh` CLI wrapper with rate limiting |
| Runtime Checker | `compliance/lib/runtime-checker.js` | HTTP endpoint probes |
| Report Generator | `compliance/lib/report-generator.js` | JSON + Markdown formatter |

### Scripts
| Script | Purpose |
|--------|---------|
| `setup-org-workflows.sh` | Full compliance provisioning across all repos |
| `scripts/onboard-service.sh` | Single-command new service onboarding |
| `lock-workflows.sh` | Workflow protection and branch rules |

### Reusable Workflows
| Workflow | Canonical URI | Purpose |
|----------|---------------|---------|
| `reusable-worker-deploy.yml` | `chittycanon://chittyos/workflows/worker-deploy` | Deploy Cloudflare Workers |
| `reusable-package-publish.yml` | `chittycanon://chittyos/workflows/package-publish` | Publish to npm/R2/Homebrew |
| `reusable-compliance-check.yml` | `chittycanon://chittyos/workflows/compliance-check` | Individual repo self-validation |
| `ecosystem-compliance-audit.yml` | `chittycanon://chittyos/workflows/ecosystem-audit` | Weekly ecosystem-wide audit |

### Copilot Agents
| Agent | Purpose |
|-------|---------|
| `chittyops-compliance` | Fixes compliance violations across 7 dimensions |
| `chittyops-onboard` | Full ecosystem onboarding for new repos |

### getchitty-creds Action
Ephemeral credential provisioning:
- `cloudflare_token`, `npm_token`, `github_token`, `account_id`

## Secrets Provisioning

**CRITICAL**: All secrets are provisioned ephemerally by ChittyConnect.

**Only Required Org-Level Secret**: `CHITTYCONNECT_API_KEY`

All other credentials (Cloudflare, npm, GitHub tokens) are provisioned on-demand.

## Dependencies

| Type | Service | Canonical URI | Purpose |
|------|---------|---------------|---------|
| Upstream | ChittyConnect | `chittycanon://chittyos/services/chittyconnect` | Ephemeral credential provisioning |
| Upstream | ChittyGateway | `chittycanon://chittyos/services/chittygateway` | LLM/AI function routing |
| Peer | ChittyBeacon | `chittycanon://chittyos/services/chittybeacon` | Monitoring integration |
| Peer | ChittyRegister | `chittycanon://chittyos/services/chittyregister` | Service registration |
| Peer | ChittyCanon | `chittycanon://foundation/services/chittycanon` | Canonical pattern governance |
| External | GitHub Actions | — | Workflow runtime |
| External | Cloudflare Workers | — | Deployment target |

## Organizations Managed
- **CHITTYOS** — 57 services (active compliance scope)
- **ChittyCorp** — 5 services (active compliance scope)
- **NeverShitty** — Legacy/archived (excluded from compliance scope)

## Performance Targets

| Metric | Target |
|--------|--------|
| Workflow success rate | >95% |
| Deployment success rate | >99% |
| Average build time | <5 minutes |
| Average deployment time | <3 minutes |
| Critical vulnerability patch | <24 hours |

## Ownership

| Role | Owner |
|------|-------|
| Service Owner | CHITTYOS |
| Technical Lead | @chittyos-infrastructure |
| CODEOWNERS | @nickbianchi, @ChittyOS/cicd-admins |
| Contact | ops@chitty.cc |

## Compliance

- [x] CLAUDE.md development guide present
- [x] CODEOWNERS configured
- [x] CHARTER.md with canonical frontmatter
- [x] ChittyConnect ephemeral credentials active
- [x] Compliance engine operational
- [ ] Branch protection rules active
- [ ] ChittyBeacon integration verified

---
*Charter Version: 2.0.0 | Last Updated: 2026-02-09 | Status: CERTIFIED*
*Registered: `chittycanon://core/services/canon`*
