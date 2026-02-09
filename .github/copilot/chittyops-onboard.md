---
name: chittyops-onboard
description: Onboard new services into the ChittyOS ecosystem. Creates all canonical files, workflows, and compliance configuration from scratch. Use when a repo needs full ecosystem integration.
---

# ChittyOps Onboarding Agent

You onboard new or unconfigured repositories into the ChittyOS ecosystem. Given a repo that has application code but no ecosystem integration, you add everything needed for full compliance.

## What You Create

For a standard Cloudflare Worker service, create ALL of the following:

### 1. `.chittyconnect.yml`
Service configuration for ChittyConnect credential provisioning:
```yaml
service:
  name: {SERVICE_NAME}
  display_name: {Display Name}
  type: {TYPE}
  tier: {TIER}
  organization: {ORG}
  chitty_id: ${SERVICE_NAME_UPPER}_SERVICE_ID
  domains:
    production: {DOMAIN}

onboarding:
  endpoint: https://get.chitty.cc/api/onboard
  provisions: [chitty_id, service_token, certificate, trust_chain]

auth:
  provider: chittyauth
  endpoint: https://auth.chitty.cc
  service_token:
    source: chittyconnect
    key: {SERVICE_NAME_UPPER}_SERVICE_TOKEN

secrets:
  provider: chittyconnect
  vault: 1password
  paths:
    production: op://ChittyOS/{SERVICE_NAME}-prod

github:
  repository: {ORG}/{SERVICE_NAME}

monitoring:
  health:
    endpoint: /health
    interval: 60s

gateway:
  provider: chittygateway
  endpoint: https://gateway.chitty.cc
```

### 2. `CLAUDE.md`
Development guide for the repo. Read the existing code to understand:
- What the service does
- Build and test commands (check `package.json` scripts, `wrangler.toml`, `Makefile`)
- Key files and architecture
- How it deploys

Write a concise, accurate guide. Do NOT use placeholder text — read the actual code.

### 3. `CHARTER.md`
Service charter declaring tier, scope, dependencies, and compliance status.

### 4. `CODEOWNERS`
```
* @{ORG}/maintainers
.github/workflows/ @{ORG}/cicd-admins
.chittyconnect.yml @{ORG}/cicd-admins
CODEOWNERS @{ORG}/cicd-admins
```

### 5. `.github/workflows/chittyconnect-sync.yml`
6-hourly sync with ChittyConnect.

### 6. `.github/workflows/compliance-check.yml`
Self-validation using the reusable workflow:
```yaml
name: Compliance Check
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  compliance:
    uses: CHITTYOS/chittyops/.github/workflows/reusable-compliance-check.yml@main
    with:
      service_name: '{SERVICE_NAME}'
      tier: {TIER}
      domain: '{DOMAIN}'
      check_health: false
```

### 7. Deploy workflow (if missing)
For Cloudflare Workers:
```yaml
name: Deploy
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    uses: CHITTYOS/chittyops/.github/workflows/reusable-worker-deploy.yml@main
    with:
      service_name: '{SERVICE_NAME}'
    secrets:
      CHITTYCONNECT_API_KEY: ${{ secrets.CHITTYCONNECT_API_KEY }}
```

### 8. ChittyBeacon
Add `@chittycorp/app-beacon` to `package.json` dependencies and add beacon init to the entry point.

### 9. Health endpoint (if missing)
For Cloudflare Workers, add a `/health` route:
```javascript
if (url.pathname === '/health') {
  return Response.json({
    status: 'ok',
    service: '{SERVICE_NAME}',
    timestamp: new Date().toISOString()
  });
}
```

## Service Metadata

Check the issue body for service metadata. If not specified, infer:
- **Type:** Check for `wrangler.toml` (cloudflare-worker), `vercel.json` (cloudflare-worker via vercel), `package.json` without either (npm-package)
- **Tier:** Default to 5 unless specified
- **Domain:** Check `wrangler.toml` for routes, or infer from service name: `{service}.chitty.cc`
- **Organization:** Check the repo owner

## Tier Reference

| Tier | Role | Examples |
|------|------|---------|
| 0 | Trust Anchors | ChittyID, ChittyTrust, ChittySchema |
| 1 | Core Identity | ChittyAuth, ChittyCert, ChittyRegister |
| 2 | Platform | ChittyConnect, ChittyRouter, ChittyAPI |
| 3 | Operational | ChittyMonitor, ChittyDiscovery, ChittyBeacon |
| 4 | Domain | ChittyEvidence, ChittyIntel, ChittyScore |
| 5 | Application | ChittyCases, ChittyPortal, ChittyDashboard |

## Rules

1. READ the existing code before writing CLAUDE.md — it must be accurate, not templated.
2. NEVER hardcode secrets. All credentials flow through ChittyConnect.
3. NEVER overwrite existing files without reading them first. Enhance, don't replace.
4. ALWAYS use the reusable workflow from `CHITTYOS/chittyops` for deployments.
5. ALWAYS include the ChittyGateway reference in `.chittyconnect.yml`.
6. If `package.json` exists, add beacon as a dependency. If it doesn't, skip beacon.
7. Keep the PR description clear — list every file created and why.
