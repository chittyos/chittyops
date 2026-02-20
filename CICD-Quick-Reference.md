# ChittyOS CI/CD Quick Reference Card

## 🚀 Common Commands

### Initial Setup
```bash
# One-time setup for all repos
./setup-org-workflows.sh

# Manual setup for single repo
gh workflow run setup.yml
```

### PR Automation
```bash
# Check PR automation status
gh pr checks [PR_NUMBER]

# Manually trigger AI reviews
gh workflow run ai-review-claude.yml -f pr_number=[PR] -f pr_sha=[SHA]
gh workflow run ai-review-codex.yml -f pr_number=[PR] -f pr_sha=[SHA]

# Check auto-merge eligibility
gh workflow run auto-merge.yml -f pr_number=[PR_NUMBER]

# Prevent auto-merge
gh pr edit [PR_NUMBER] --add-label "do-not-merge"
```

### Daily Operations
```bash
# Check workflow status
gh run list --limit 10

# View failed runs
gh run list --status=failure

# Rerun failed workflow
gh run rerun --failed [RUN_ID]

# View workflow logs
gh run view --log [RUN_ID]
```

### Deployment Commands
```bash
# Manual deployment trigger
gh workflow run deploy.yml --ref main

# Vercel deployment
vercel --prod

# Cloudflare deployment
npx wrangler publish
```

## 🔐 Required Secrets

### GitHub Organization Secrets (New for PR Automation)
| Secret | Used For | Required |
|--------|----------|----------|
| `ANTHROPIC_API_KEY` | Claude AI reviews | For AI reviews |
| `OPENAI_API_KEY` | Codex AI reviews | For AI reviews |
| `CHITTYCONNECT_API_KEY` | Ephemeral credentials | Required |

### GitHub Repository Secrets (Legacy - Use ChittyConnect Instead)
| Secret | Used For | Required |
|--------|----------|----------|
| `BEACON_ENDPOINT` | ChittyBeacon URL | Optional |
| `CLOUDFLARE_API_TOKEN` | CF deployments | Deprecated - use ChittyConnect |
| `CLOUDFLARE_ACCOUNT_ID` | CF account | Deprecated - use ChittyConnect |
| `VERCEL_TOKEN` | Vercel deploys | If using Vercel |
| `VERCEL_ORG_ID` | Vercel org | If using Vercel |
| `VERCEL_PROJECT_ID` | Vercel project | If using Vercel |
| `SNYK_TOKEN` | Security scans | Recommended |

## 📦 ChittyBeacon Integration

### Node.js
```bash
npm install @chittycorp/app-beacon --save
```
```javascript
// Add to top of entry file
require('@chittycorp/app-beacon');
```

### Python
```python
# Add to top of entry file
import chittybeacon
```

### Environment Variables
```bash
BEACON_ENDPOINT=https://beacon.cloudeto.com  # Optional
BEACON_INTERVAL=300000  # 5 minutes
BEACON_DISABLED=false   # Enable/disable
BEACON_VERBOSE=false    # Debug mode
```

## 🚨 Troubleshooting

### Workflow Not Running?
1. Check file location: `.github/workflows/*.yml`
2. Verify YAML syntax
3. Check repository Actions settings
4. Review workflow triggers

### Authentication Failed?
1. Check secret exists: `gh secret list`
2. Regenerate token if expired
3. Verify token permissions
4. Update secret: `gh secret set TOKEN_NAME`

### Deployment Failed?
1. Check deployment logs
2. Verify all secrets are set
3. Test locally first
4. Check service quotas

### ChittyBeacon Not Working?
1. Verify import is at top of entry file
2. Check network connectivity
3. Enable verbose mode: `BEACON_VERBOSE=true`
4. Check dashboard: https://beacon.cloudeto.com

## 📊 Monitoring Links

- **ChittyBeacon Dashboard**: https://beacon.cloudeto.com
- **GitHub Actions**: https://github.com/[ORG]/[REPO]/actions
- **Vercel Dashboard**: https://vercel.com/dashboard
- **Cloudflare Dashboard**: https://dash.cloudflare.com

## 🆘 Emergency Contacts

- **DevOps On-call**: #devops-oncall (Slack)
- **Security Issues**: security@chittyos.com
- **CI/CD Support**: #ci-cd-help (Slack)

## 📋 Workflow Templates

### Basic CI Workflow
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test
```

### Deploy on Main
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run build
      - run: npm run deploy
```

## ✅ Pre-deployment Checklist

- [ ] All tests passing
- [ ] ChittyBeacon integrated
- [ ] Secrets configured
- [ ] Branch protection enabled
- [ ] Security scans clean
- [ ] Documentation updated

---
**Version**: 1.0 | **Updated**: 2025-08-06 | **Full SOPs**: ChittyOS-CICD-SOPs.md