# ChittyOS Secrets Provisioning

## Overview

**All secrets in ChittyOS are provisioned ephemerally by ChittyConnect.**

Services DO NOT store long-lived credentials. Instead, they request short-lived tokens on-demand from ChittyConnect's `/credentials/deploy` endpoint.

## How It Works

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  GitHub Actions │         │  ChittyConnect  │         │   1Password     │
│  (any service)  │         │ connect.chitty.cc│         │   (root creds)  │
└────────┬────────┘         └────────┬────────┘         └────────┬────────┘
         │                           │                           │
         │ CHITTYCONNECT_API_KEY     │                           │
         │ (org secret)              │                           │
         ├──────────────────────────►│                           │
         │                           │                           │
         │                           │  Fetch root credentials   │
         │                           ├──────────────────────────►│
         │                           │◄─────────────────────────┤
         │                           │                           │
         │                           │  Mint ephemeral tokens    │
         │                           │  (scoped, time-limited)   │
         │                           │                           │
         │◄──────────────────────────┤                           │
         │  cloudflare_token         │                           │
         │  npm_token                │                           │
         │  github_token             │                           │
         │  account_id               │                           │
         │                           │                           │
         │  Deploy/Publish           │                           │
         ├──────────────────────────────────────────────────────►│
         │                           │                           │
```

## Key Principles

1. **No long-lived secrets in repos** - Only `CHITTYCONNECT_API_KEY` at org level
2. **Ephemeral tokens** - Short-lived, scoped to specific purpose
3. **Centralized provisioning** - ChittyConnect is the single source
4. **Audit trail** - All credential requests logged to ChittyChronicle
5. **Risk scoring** - ContextConsciousness™ evaluates each request

## Required Setup

### Organization Level (one-time)

Set `CHITTYCONNECT_API_KEY` as an organization secret:
- GitHub: `https://github.com/organizations/CHITTYOS/settings/secrets/actions`

This single secret enables all repos to request ephemeral credentials.

### Repository Level

**No secrets needed.** Repos inherit `CHITTYCONNECT_API_KEY` from org.

## Using in Workflows

### Option 1: Use Reusable Workflows (Recommended)

```yaml
jobs:
  deploy:
    uses: CHITTYOS/chittyops/.github/workflows/reusable-worker-deploy.yml@main
    with:
      service_name: 'chittyid'
    secrets:
      CHITTYCONNECT_API_KEY: ${{ secrets.CHITTYCONNECT_API_KEY }}
```

### Option 2: Use getchitty-creds Action Directly

```yaml
jobs:
  my-job:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: CHITTYOS/chittyops
          sparse-checkout: .github/actions/getchitty-creds
          path: .chittyops

      - name: Get ephemeral credentials
        id: creds
        uses: ./.chittyops/.github/actions/getchitty-creds
        with:
          api_key: ${{ secrets.CHITTYCONNECT_API_KEY }}
          purpose: 'my-purpose'
          service: 'my-service'

      - name: Use credentials
        run: |
          echo "Cloudflare token available"
          wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ steps.creds.outputs.cloudflare_token }}
          CLOUDFLARE_ACCOUNT_ID: ${{ steps.creds.outputs.account_id }}
```

## Available Credentials

| Output | Description | Use For |
|--------|-------------|---------|
| `cloudflare_token` | Ephemeral Cloudflare API token | Worker deployments, R2, KV |
| `account_id` | Cloudflare Account ID | Wrangler commands |
| `npm_token` | Ephemeral npm token | Publishing packages |
| `github_token` | Ephemeral GitHub token | Cross-repo operations |

## ChittyConnect Endpoint

```
POST https://connect.chitty.cc/credentials/deploy
Authorization: Bearer {CHITTYCONNECT_API_KEY}
Content-Type: application/json

{
  "purpose": "worker-deploy",
  "service": "chittyid",
  "repo": "CHITTYOS/chittyid",
  "run_id": "12345"
}

Response:
{
  "cloudflare_token": "cf_ephemeral_...",
  "npm_token": "npm_...",
  "github_token": "ghs_...",
  "account_id": "0bc21e3a5a9de1a4cc843be9c3e98121",
  "expires_at": "2026-01-06T12:00:00Z"
}
```

## Security Features

- **Scoped tokens** - Only permissions needed for the purpose
- **Time-limited** - Tokens expire (typically 1 hour for CI)
- **Rate limited** - Max 10 provisions/hour/service
- **Risk scoring** - Requests scored by ContextConsciousness™
- **Audit logging** - All requests logged to ChittyChronicle

## Anti-Patterns (Don't Do This)

```yaml
# ❌ WRONG: Storing long-lived secrets in repo
env:
  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}

# ❌ WRONG: Hardcoding credentials
env:
  NPM_TOKEN: "npm_actual_token_value"

# ❌ WRONG: Using personal tokens
env:
  GITHUB_TOKEN: ${{ secrets.PERSONAL_ACCESS_TOKEN }}
```

## Correct Pattern

```yaml
# ✅ CORRECT: Get ephemeral credentials from ChittyConnect
- uses: ./.chittyops/.github/actions/chitty-creds
  id: creds
  with:
    api_key: ${{ secrets.CHITTYCONNECT_API_KEY }}

- run: wrangler deploy
  env:
    CLOUDFLARE_API_TOKEN: ${{ steps.creds.outputs.cloudflare_token }}
```

## Related Documentation

- `/Volumes/chitty/github.com/CHITTYOS/chittyconnect/SECRETS_QUICK_REFERENCE.md`
- `/Volumes/chitty/github.com/CHITTYOS/chittyconnect/1PASSWORD_INTEGRATION_COMPLETE.md`
- `/Volumes/chitty/docs/architecture/ALCHEMY_CONTEXTCONSCIOUSNESS.md`
