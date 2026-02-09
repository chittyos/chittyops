# ChittyOS Compliance Engine

Audits all services across the ChittyOS ecosystem against 7 compliance dimensions and generates remediation plans.

## Quick Start

```bash
# Run full audit (all orgs, skip runtime probes)
npm run audit

# Audit with JSON + Markdown output
npm run audit:json

# Audit a single service
npm run audit:service -- chittyconnect

# Generate remediation report (dry run)
npm run remediate

# Create GitHub issues on failing repos
node compliance/remediate.js compliance-report.json --mode=issues
```

## Compliance Dimensions

| # | Dimension | What It Checks |
|---|-----------|----------------|
| 1 | **ChittyConnect** | `.chittyconnect.yml` exists + sync workflow present |
| 2 | **ChittyBeacon** | `@chittycorp/app-beacon` in package.json |
| 3 | **ChittyCanon** | `CLAUDE.md` + `CODEOWNERS` + `CHARTER.md` + branch protection |
| 4 | **ChittyRegister** | Registry heartbeat in deploy workflow + registered at `registry.chitty.cc` |
| 5 | **ChittyRouter** | Route configured (when domain exists) |
| 6 | **ChittyTrust** | Trust chain provisions in `.chittyconnect.yml` |
| 7 | **Health Endpoint** | `https://{domain}/health` returns `{"status":"ok"}` |

## Files

| File | Purpose |
|------|---------|
| `service-registry.yml` | All 62 services with tier, type, domain metadata |
| `checks.yml` | Compliance dimension definitions (reference) |
| `audit.js` | Main audit engine |
| `remediate.js` | Auto-creates GitHub issues on non-compliant repos |
| `lib/github-checker.js` | GitHub API wrappers via `gh` CLI |
| `lib/runtime-checker.js` | HTTP endpoint probes |
| `lib/report-generator.js` | JSON + Markdown report formatter |

## Compliance Profiles

Not all dimensions apply to every service type:

| Type | Connect | Beacon | Canon | Register | Router | Trust | Health |
|------|:-------:|:------:|:-----:|:--------:|:------:|:-----:|:------:|
| cloudflare-worker | required | required | required | required | required | required | required |
| npm-package | required | optional | required | optional | N/A | optional | N/A |
| tool | required | optional | required | optional | N/A | optional | N/A |
| documentation | optional | N/A | required | N/A | N/A | N/A | N/A |
| client-sdk | required | optional | required | optional | N/A | optional | N/A |

## Fixing Compliance Issues

The fastest path to compliance is running the setup script:

```bash
# Fix a specific repo
./setup-org-workflows.sh --repo=CHITTYOS/myservice

# Dry run first
./setup-org-workflows.sh --repo=CHITTYOS/myservice --dry-run

# Onboard a new service end-to-end
./scripts/onboard-service.sh myservice CHITTYOS --tier=4 --domain=myservice.chitty.cc
```

Templates for all canonical files are in `../templates/compliance/`.
