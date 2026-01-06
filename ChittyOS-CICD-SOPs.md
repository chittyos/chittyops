# ChittyOS CI/CD Standard Operating Procedures

**Document Version:** 1.0  
**Effective Date:** August 6, 2025  
**Document Owner:** DevOps Team  
**Review Cycle:** Quarterly  
**Next Review Date:** November 6, 2025

## Table of Contents

1. [SOP-001: Initial CI/CD Setup Process](#sop-001-initial-cicd-setup-process)
2. [SOP-002: Adding CI/CD to New Repositories](#sop-002-adding-cicd-to-new-repositories)
3. [SOP-003: ChittyBeacon Integration Procedures](#sop-003-chittybeacon-integration-procedures)
4. [SOP-004: Deployment Workflow Management](#sop-004-deployment-workflow-management)
5. [SOP-005: Security Scanning and Dependency Updates](#sop-005-security-scanning-and-dependency-updates)
6. [SOP-006: Troubleshooting Common CI/CD Issues](#sop-006-troubleshooting-common-cicd-issues)
7. [SOP-007: Monitoring and Maintenance Procedures](#sop-007-monitoring-and-maintenance-procedures)

## Definitions and Acronyms

- **CI/CD**: Continuous Integration/Continuous Deployment
- **SOP**: Standard Operating Procedure
- **PR**: Pull Request
- **GHA**: GitHub Actions
- **API**: Application Programming Interface
- **NPM**: Node Package Manager
- **YAML**: Yet Another Markup Language

---

## SOP-001: Initial CI/CD Setup Process

### Purpose and Scope
Establish a standardized process for implementing CI/CD workflows across all ChittyOS, ChittyCorp, and nevershitty organization repositories.

### Prerequisites
- [ ] GitHub CLI (`gh`) installed
- [ ] Git installed and configured
- [ ] SSH keys configured for GitHub access
- [ ] Admin access to organization repositories
- [ ] Access to CI/CD templates repository

### Roles and Responsibilities
- **DevOps Engineer**: Execute setup procedures
- **Repository Owner**: Review and approve changes
- **Security Team**: Validate security configurations

### Procedure

#### Step 1: Environment Preparation
1.1. Verify GitHub CLI installation:
   ```bash
   gh --version
   ```
   - **Success Criteria**: Version 2.0 or higher displayed
   - **If Failed**: Install from https://cli.github.com/

1.2. Authenticate GitHub CLI:
   ```bash
   gh auth login
   ```
   - Select: SSH protocol
   - Authenticate: Via web browser
   - **Success Criteria**: "Logged in as [username]" message

1.3. Clone CI/CD templates repository:
   ```bash
   git clone git@github.com:ChittyOS/cicd-templates.git
   cd cicd-templates
   ```
   - **Success Criteria**: Repository cloned without errors

#### Step 2: Execute Organization-Wide Setup
2.1. Make setup script executable:
   ```bash
   chmod +x setup-org-workflows.sh
   ```

2.2. Run the setup script:
   ```bash
   ./setup-org-workflows.sh
   ```
   - **Expected Output**: Green success messages for each repository
   - **Duration**: 5-30 minutes depending on organization size

2.3. Monitor script execution:
   - Watch for error messages (displayed in red)
   - Note any repositories that fail
   - **Success Criteria**: "CI/CD setup complete!" message

#### Step 3: Configure Organization Secrets
3.1. Navigate to GitHub organization settings:
   - Go to: https://github.com/organizations/[ORG_NAME]/settings/secrets/actions

3.2. Add required secrets:
   | Secret Name | Description | Required |
   |------------|-------------|----------|
   | BEACON_ENDPOINT | ChittyBeacon tracking URL | Optional |
   | CLOUDFLARE_API_TOKEN | For Cloudflare deployments | Conditional |
   | CLOUDFLARE_ACCOUNT_ID | Cloudflare account identifier | Conditional |
   | VERCEL_TOKEN | For Vercel deployments | Conditional |
   | SNYK_TOKEN | Security scanning token | Recommended |

3.3. Set secret visibility:
   - Select: "Selected repositories" or "All repositories"
   - **Success Criteria**: All secrets saved with green checkmark

#### Step 4: Verify Pull Requests
4.1. Check created PRs:
   ```bash
   gh pr list --org [ORG_NAME] --search "CI/CD Workflows"
   ```

4.2. Review each PR for:
   - [ ] Correct workflow files added
   - [ ] ChittyBeacon dependency included
   - [ ] No unintended changes
   - **Success Criteria**: All PRs ready for merge

### Quality Checkpoints
- [ ] All repositories processed
- [ ] No error messages in script output
- [ ] Organization secrets configured
- [ ] Pull requests created successfully

### Troubleshooting
If setup fails:
1. Check GitHub CLI authentication: `gh auth status`
2. Verify repository permissions
3. Review script output logs
4. See [SOP-006](#sop-006-troubleshooting-common-cicd-issues)

---

## SOP-002: Adding CI/CD to New Repositories

### Purpose and Scope
Define the process for integrating CI/CD workflows into newly created repositories within ChittyOS organizations.

### Prerequisites
- [ ] Repository created and initialized
- [ ] Project type identified (Node.js, Python, etc.)
- [ ] Access to CI/CD templates

### Procedure

#### Step 1: Repository Analysis
1.1. Clone the new repository:
   ```bash
   git clone git@github.com:[ORG]/[REPO].git
   cd [REPO]
   ```

1.2. Identify project type:
   ```bash
   # Check for Node.js
   ls package.json
   
   # Check for Python
   ls requirements.txt setup.py
   
   # Check for Rust
   ls Cargo.toml
   
   # Check for Go
   ls go.mod
   ```
   - **Decision Point**: Select appropriate workflow template based on project type

#### Step 2: Create Workflow Directory
2.1. Create GitHub Actions structure:
   ```bash
   mkdir -p .github/workflows
   ```

2.2. Copy appropriate workflow templates:

**For Node.js Projects:**
```bash
cp /path/to/templates/node-ci.yml .github/workflows/ci.yml
cp /path/to/templates/dependency-update.yml .github/workflows/dependency-update.yml
```

**For Python Projects:**
```bash
cp /path/to/templates/python-ci.yml .github/workflows/ci.yml
```

**For Cloudflare Workers:**
```bash
cp /path/to/templates/cloudflare-deploy.yml .github/workflows/deploy.yml
```

#### Step 3: Add ChittyBeacon Integration
3.1. For Node.js projects, add dependency:
   ```bash
   npm install @chittycorp/app-beacon --save
   ```
   - **Success Criteria**: Package added to package.json

3.2. Update entry point file:
   ```javascript
   // Add at the top of index.js or app.js
   require('@chittycorp/app-beacon');
   ```

3.3. For Python projects, create beacon module:
   ```bash
   mkdir -p chittybeacon
   touch chittybeacon/__init__.py
   ```

#### Step 4: Configure Repository Settings
4.1. Enable GitHub Actions:
   - Navigate to: Settings → Actions → General
   - Select: "Allow all actions and reusable workflows"

4.2. Add repository secrets:
   - Navigate to: Settings → Secrets and variables → Actions
   - Add required secrets based on deployment type

4.3. Configure branch protection:
   - Navigate to: Settings → Branches
   - Add rule for `main` branch
   - Enable: "Require status checks to pass before merging"
   - Select CI workflow status checks

#### Step 5: Commit and Test
5.1. Stage all changes:
   ```bash
   git add .
   git commit -m "ci: add CI/CD workflows and ChittyBeacon integration"
   ```

5.2. Push to feature branch:
   ```bash
   git checkout -b ci/initial-setup
   git push origin ci/initial-setup
   ```

5.3. Create pull request:
   ```bash
   gh pr create --title "Add CI/CD Workflows" --body "Implements standard CI/CD configuration"
   ```

### Quality Checkpoints
- [ ] Workflow files in correct location
- [ ] ChittyBeacon properly integrated
- [ ] All required secrets configured
- [ ] CI runs successfully on PR

### Decision Tree
```
Is it a Node.js project?
├─ YES → Use node-ci.yml
│   └─ Is it Cloudflare Workers?
│       ├─ YES → Also add cloudflare-deploy.yml
│       └─ NO → Is it Vercel?
│           ├─ YES → Also add vercel-deploy.yml
│           └─ NO → Standard Node.js setup complete
└─ NO → Is it Python?
    ├─ YES → Use python-ci.yml
    └─ NO → Contact DevOps for custom workflow
```

---

## SOP-003: ChittyBeacon Integration Procedures

### Purpose and Scope
Standardize the integration of ChittyBeacon monitoring across all applications for consistent tracking and observability.

### Prerequisites
- [ ] Application repository access
- [ ] Understanding of application entry point
- [ ] NPM or appropriate package manager access

### Procedure

#### Step 1: Installation

**1.1. For Node.js Applications:**
```bash
npm install @chittycorp/app-beacon --save
```
- **Success Criteria**: Package listed in dependencies

**1.2. For Python Applications:**
```bash
# Create beacon module structure
mkdir -p chittybeacon
cat > chittybeacon/__init__.py << 'EOF'
import os
import requests
import threading
import time
import platform

class ChittyBeacon:
    def __init__(self):
        self.endpoint = os.getenv('BEACON_ENDPOINT', 'https://beacon.cloudeto.com')
        self.interval = int(os.getenv('BEACON_INTERVAL', '300000')) / 1000
        self.enabled = os.getenv('BEACON_DISABLED', 'false').lower() != 'true'
        self.verbose = os.getenv('BEACON_VERBOSE', 'false').lower() == 'true'
        
        if self.enabled:
            self.start()
    
    def start(self):
        self.send_startup()
        self.heartbeat_thread = threading.Thread(target=self.heartbeat_loop, daemon=True)
        self.heartbeat_thread.start()
    
    def send_startup(self):
        self.send_beacon('startup')
    
    def send_beacon(self, event_type):
        try:
            data = {
                'event': event_type,
                'app': os.path.basename(os.getcwd()),
                'platform': platform.system(),
                'timestamp': int(time.time() * 1000)
            }
            if self.verbose:
                print(f'ChittyBeacon: Sending {event_type} event')
            requests.post(f'{self.endpoint}/track', json=data, timeout=5)
        except Exception as e:
            if self.verbose:
                print(f'ChittyBeacon Error: {e}')
    
    def heartbeat_loop(self):
        while True:
            time.sleep(self.interval)
            self.send_beacon('heartbeat')

# Auto-initialize
beacon = ChittyBeacon()
EOF
```

#### Step 2: Integration

**2.1. Identify Application Entry Point:**

| Framework | Entry Point |
|-----------|-------------|
| Express.js | `index.js` or `app.js` |
| Next.js | `pages/_app.js` or `app/layout.js` |
| Python Flask | `app.py` or `__init__.py` |
| Python Django | `settings.py` |
| Cloudflare Workers | `index.js` or `worker.js` |

**2.2. Add Import Statement:**

For JavaScript/TypeScript:
```javascript
// Add at the very top of the entry file
require('@chittycorp/app-beacon');
// OR for ES6
import '@chittycorp/app-beacon';
```

For Python:
```python
# Add at the top of the entry file
import chittybeacon
```

#### Step 3: Configuration

3.1. Set environment variables (optional):
```bash
# .env file or environment configuration
BEACON_ENDPOINT=https://beacon.cloudeto.com
BEACON_INTERVAL=300000  # 5 minutes in milliseconds
BEACON_DISABLED=false
BEACON_VERBOSE=false
```

3.2. For production deployments, add to deployment configuration:

**Vercel (vercel.json):**
```json
{
  "env": {
    "BEACON_ENDPOINT": "@beacon-endpoint"
  }
}
```

**Cloudflare Workers (wrangler.toml):**
```toml
[vars]
BEACON_ENDPOINT = "https://beacon.cloudeto.com"
```

#### Step 4: Verification

4.1. Local testing:
```bash
# Enable verbose mode
export BEACON_VERBOSE=true
npm start  # or python app.py
```
- **Expected Output**: "ChittyBeacon: Sending startup event"

4.2. Check beacon dashboard:
- Navigate to: https://beacon.cloudeto.com
- Search for your application name
- **Success Criteria**: Application appears with recent heartbeat

### Quality Checkpoints
- [ ] Beacon package/module installed
- [ ] Import added to entry point
- [ ] No application errors on startup
- [ ] Heartbeats visible in dashboard

### Troubleshooting Decision Tree
```
Is beacon sending data?
├─ NO → Check verbose output
│   ├─ No output → Verify import location
│   └─ Error output → Check network/firewall
└─ YES → Is data in dashboard?
    ├─ NO → Verify endpoint URL
    └─ YES → Integration successful
```

---

## SOP-004: Deployment Workflow Management

### Purpose and Scope
Manage and maintain deployment workflows for different platforms (Vercel, Cloudflare Workers, custom deployments).

### Prerequisites
- [ ] Deployment platform account
- [ ] Required API tokens/secrets
- [ ] Understanding of deployment requirements

### Procedure

#### Step 1: Platform-Specific Setup

**1.1. Vercel Deployment Setup:**

1.1.1. Obtain Vercel credentials:
```bash
# Install Vercel CLI
npm i -g vercel

# Login and get token
vercel login
vercel token list
```

1.1.2. Get project IDs:
```bash
# In project directory
vercel link
cat .vercel/project.json
```

1.1.3. Add GitHub secrets:
- `VERCEL_TOKEN`: Your personal token
- `VERCEL_ORG_ID`: From project.json
- `VERCEL_PROJECT_ID`: From project.json

**1.2. Cloudflare Workers Setup:**

1.2.1. Obtain Cloudflare credentials:
- Login to Cloudflare dashboard
- Navigate to: My Profile → API Tokens
- Create token with "Edit Workers" permission

1.2.2. Get account details:
```bash
# Using Wrangler CLI
npx wrangler whoami
```

1.2.3. Add GitHub secrets:
- `CLOUDFLARE_API_TOKEN`: Created token
- `CLOUDFLARE_ACCOUNT_ID`: From whoami output

#### Step 2: Workflow Configuration

2.1. Configure deployment triggers:
```yaml
# In .github/workflows/deploy.yml
on:
  push:
    branches: [main]  # Production deployments
  pull_request:       # Preview deployments
```

2.2. Set deployment environments:
```yaml
# For staging/production separation
- name: Deploy to Production
  if: github.ref == 'refs/heads/main'
  env:
    DEPLOYMENT_ENV: production
    
- name: Deploy to Preview
  if: github.event_name == 'pull_request'
  env:
    DEPLOYMENT_ENV: preview
```

#### Step 3: Deployment Execution

3.1. Manual deployment trigger:
```bash
# Via GitHub CLI
gh workflow run deploy.yml --ref main
```

3.2. Monitor deployment:
```bash
# Check workflow status
gh run list --workflow=deploy.yml

# View specific run
gh run view [RUN_ID]
```

3.3. Verify deployment:
- Check deployment URL in workflow logs
- Test application functionality
- Verify ChittyBeacon connectivity

#### Step 4: Rollback Procedures

4.1. Identify last working deployment:
```bash
gh run list --workflow=deploy.yml --status=success --limit=10
```

4.2. Revert to previous commit:
```bash
git revert HEAD
git push origin main
```

4.3. Emergency rollback (platform-specific):

**Vercel:**
```bash
vercel rollback [DEPLOYMENT_URL]
```

**Cloudflare:**
```bash
npx wrangler rollback
```

### Quality Checkpoints
- [ ] All secrets configured correctly
- [ ] Deployment completes without errors
- [ ] Application accessible at deployment URL
- [ ] ChittyBeacon reporting from new deployment

### Deployment Decision Matrix

| Condition | Action |
|-----------|---------|
| Main branch push | Deploy to production |
| PR created/updated | Deploy preview |
| Tag created | Deploy release version |
| Deployment fails | Notify team, check logs |
| Tests fail | Block deployment |

---

## SOP-005: Security Scanning and Dependency Updates

### Purpose and Scope
Implement automated security scanning and dependency management to maintain secure and up-to-date applications.

### Prerequisites
- [ ] Repository write access
- [ ] Security tool tokens (Snyk, etc.)
- [ ] Understanding of dependency management

### Procedure

#### Step 1: Enable Security Scanning

1.1. Configure GitHub Security features:
- Navigate to: Settings → Security & analysis
- Enable:
  - [ ] Dependency graph
  - [ ] Dependabot alerts
  - [ ] Dependabot security updates
  - [ ] Code scanning alerts

1.2. Add security scanning workflow:
```yaml
# .github/workflows/security.yml
name: Security Scan

on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '0 0 * * 1'  # Weekly on Monday

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    
    - name: Run Snyk Security Scan
      uses: snyk/actions/node@master
      env:
        SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      with:
        args: --severity-threshold=high
    
    - name: Run npm audit
      run: npm audit --audit-level=moderate
    
    - name: Upload results
      uses: github/codeql-action/upload-sarif@v2
      if: always()
      with:
        sarif_file: snyk.sarif
```

#### Step 2: Configure Dependency Updates

2.1. Enable automated updates workflow:
```yaml
# .github/workflows/dependency-update.yml
name: Dependency Update

on:
  schedule:
    - cron: '0 2 * * 1'  # Weekly on Monday at 2 AM
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    
    - name: Update dependencies
      run: |
        npm update
        npm audit fix
    
    - name: Create PR
      uses: peter-evans/create-pull-request@v5
      with:
        title: 'chore: update dependencies'
        body: |
          ## Dependency Updates
          
          This PR updates dependencies to their latest versions.
          
          ### Checklist
          - [ ] All tests pass
          - [ ] No breaking changes
          - [ ] Security vulnerabilities addressed
        branch: deps/update-${{ github.run_number }}
```

2.2. Configure Dependabot:
```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
      day: "monday"
    open-pull-requests-limit: 10
    reviewers:
      - "DevOps-team"
    labels:
      - "dependencies"
      - "automated"
```

#### Step 3: Security Response Procedures

3.1. When vulnerability detected:

**Severity Assessment:**
| Level | Response Time | Action |
|-------|--------------|---------|
| Critical | Immediately | Hotfix deployment |
| High | 24 hours | Priority PR |
| Medium | 1 week | Regular update cycle |
| Low | Next release | Track and monitor |

3.2. Remediation steps:
1. Review security alert details
2. Check for available patches
3. Test patch in development
4. Create PR with fix
5. Fast-track review and deployment

#### Step 4: Monitoring and Reporting

4.1. Weekly security review:
```bash
# Generate security report
gh api /orgs/[ORG]/dependabot/alerts --jq '.[] | {severity, package: .security_advisory.summary}'
```

4.2. Track metrics:
- Number of vulnerabilities by severity
- Time to remediation
- Dependency update frequency
- Failed security scans

### Quality Checkpoints
- [ ] All security features enabled
- [ ] Automated scans running on schedule
- [ ] Dependency PRs created weekly
- [ ] No high/critical vulnerabilities

### Security Decision Tree
```
New vulnerability detected?
├─ Critical/High severity?
│   ├─ YES → Immediate action required
│   │   ├─ Patch available? → Apply immediately
│   │   └─ No patch? → Implement workaround
│   └─ NO → Schedule for next update cycle
└─ Monitor and track resolution
```

---

## SOP-006: Troubleshooting Common CI/CD Issues

### Purpose and Scope
Provide systematic approaches to diagnose and resolve common CI/CD pipeline failures and issues.

### Prerequisites
- [ ] Access to GitHub Actions logs
- [ ] Understanding of workflow syntax
- [ ] Repository admin access for settings

### Common Issues and Solutions

#### Issue 1: Workflow Not Triggering

**Symptoms:**
- Push/PR created but no workflow runs
- Workflow shows as "skipped"

**Diagnosis:**
```bash
# Check workflow syntax
gh workflow view [WORKFLOW_NAME]

# Verify file location
ls -la .github/workflows/

# Check recent runs
gh run list --workflow=[WORKFLOW_NAME]
```

**Resolution Steps:**
1. Verify workflow file extension is `.yml` or `.yaml`
2. Check workflow triggers match your action:
   ```yaml
   on:
     push:
       branches: [main, master]
     pull_request:
   ```
3. Ensure workflows are not disabled in repository settings
4. Validate YAML syntax using online validator

#### Issue 2: Authentication Failures

**Symptoms:**
- "Authentication failed" errors
- "Invalid token" messages
- 401/403 HTTP errors

**Diagnosis:**
```bash
# List configured secrets
gh secret list

# Test authentication locally
npm config get registry
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user
```

**Resolution Steps:**
1. Regenerate and update tokens:
   ```bash
   # For NPM
   npm token create
   
   # Update in GitHub
   gh secret set NPM_TOKEN
   ```
2. Verify token permissions and scopes
3. Check token expiration dates
4. Ensure secrets are available to workflow

#### Issue 3: ChittyBeacon Not Reporting

**Symptoms:**
- Application runs but no beacon data
- Dashboard shows outdated information

**Diagnosis:**
```javascript
// Add debug logging
console.log('Beacon endpoint:', process.env.BEACON_ENDPOINT);
console.log('Beacon disabled:', process.env.BEACON_DISABLED);
```

**Resolution Steps:**
1. Verify beacon import is at top of entry file
2. Check network connectivity:
   ```bash
   curl -X POST https://beacon.cloudeto.com/track \
     -H "Content-Type: application/json" \
     -d '{"event":"test","app":"debug"}'
   ```
3. Enable verbose logging:
   ```bash
   BEACON_VERBOSE=true npm start
   ```
4. Check for firewall/proxy blocking

#### Issue 4: Deployment Failures

**Symptoms:**
- Build succeeds but deployment fails
- "Deployment failed" in logs

**Platform-Specific Troubleshooting:**

**Vercel:**
```bash
# Check deployment logs
vercel logs [DEPLOYMENT_URL]

# Verify project linking
vercel list
vercel link
```

**Cloudflare:**
```bash
# Test deployment locally
npx wrangler dev

# Check account permissions
npx wrangler whoami
```

**Resolution Steps:**
1. Verify all required secrets are set
2. Check deployment quotas/limits
3. Review platform-specific error codes
4. Test deployment locally first

#### Issue 5: Test Failures

**Symptoms:**
- Tests pass locally but fail in CI
- Inconsistent test results

**Diagnosis:**
```bash
# Run tests in CI environment
docker run -it node:18 bash
# Clone repo and run tests

# Check for timing issues
npm test -- --verbose --runInBand
```

**Resolution Steps:**
1. Ensure test dependencies are installed
2. Check for environment-specific configurations
3. Add test retries for flaky tests:
   ```javascript
   jest.retryTimes(2);
   ```
4. Use consistent Node.js versions

### Troubleshooting Flowchart

```
Workflow Failed?
├─ Check Logs
│   ├─ Syntax Error? → Fix YAML syntax
│   ├─ Auth Error? → Update tokens/secrets
│   ├─ Network Error? → Check connectivity/firewall
│   └─ Unknown Error? → Enable debug mode
├─ Still Failing?
│   ├─ Search similar issues on GitHub
│   ├─ Check service status pages
│   └─ Contact DevOps team
└─ Document solution for future reference
```

### Emergency Procedures

**Complete Pipeline Failure:**
1. Disable failing workflow temporarily
2. Deploy manually using platform CLIs
3. Create incident ticket
4. Investigate root cause
5. Implement fix and re-enable

**Useful Commands Reference:**
```bash
# Debug GitHub Actions
gh workflow view
gh run view --log
gh run rerun --failed

# Local testing
act  # Run workflows locally
npm ci  # Clean install
npm test -- --coverage

# Platform CLIs
vercel --debug
wrangler tail  # Live logs
```

---

## SOP-007: Monitoring and Maintenance Procedures

### Purpose and Scope
Establish routine monitoring and maintenance procedures to ensure CI/CD pipeline health and performance.

### Prerequisites
- [ ] Access to monitoring dashboards
- [ ] GitHub organization admin access
- [ ] Understanding of SLAs and performance targets

### Procedure

#### Step 1: Daily Monitoring Tasks

1.1. Check CI/CD dashboard (9:00 AM daily):
```bash
# Create monitoring script
cat > check-ci-health.sh << 'EOF'
#!/bin/bash
echo "=== CI/CD Health Check ==="
echo "Date: $(date)"

# Check failed workflows
echo -e "\n## Failed Workflows (last 24h):"
gh run list --status=failure --created="$(date -d '24 hours ago' '+%Y-%m-%d')"

# Check pending PRs with CI
echo -e "\n## PRs Waiting for CI:"
gh pr list --search "status:pending"

# Check ChittyBeacon status
echo -e "\n## Beacon Status:"
curl -s https://beacon.cloudeto.com/health

echo -e "\n=== End Health Check ==="
EOF

chmod +x check-ci-health.sh
```

1.2. Review metrics:
- [ ] Build success rate (target: >95%)
- [ ] Average build time
- [ ] Deployment success rate
- [ ] Active beacon connections

#### Step 2: Weekly Maintenance Tasks

2.1. Dependency review (Mondays):
```bash
# Review pending dependency updates
gh pr list --label="dependencies"

# Check for security updates
gh api /orgs/[ORG]/dependabot/alerts
```

2.2. Workflow optimization (Wednesdays):
- Review long-running workflows
- Identify redundant steps
- Update deprecated actions

2.3. Secret rotation check (Fridays):
- Review secret last updated dates
- Plan rotation for expiring tokens
- Update documentation

#### Step 3: Monthly Maintenance Tasks

3.1. Performance analysis:
```bash
# Generate performance report
gh api /repos/[ORG]/[REPO]/actions/runs \
  --jq '.workflow_runs[] | {name: .name, duration: .run_duration_ms, conclusion}' \
  > ci-performance-$(date +%Y-%m).json
```

3.2. Cost optimization:
- Review billable minutes usage
- Identify inefficient workflows
- Implement caching strategies

3.3. Documentation update:
- Review and update SOPs
- Update workflow documentation
- Archive old procedures

#### Step 4: Quarterly Reviews

4.1. CI/CD strategy review:
- Assess current tools and platforms
- Evaluate new technologies
- Plan improvements

4.2. Security audit:
- Review all tokens and secrets
- Audit repository permissions
- Update security policies

4.3. Disaster recovery test:
- Test backup procedures
- Verify rollback processes
- Update emergency contacts

### Monitoring Dashboards

#### Create monitoring dashboard:
```yaml
# .github/workflows/ci-metrics.yml
name: CI Metrics Collection

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours

jobs:
  collect-metrics:
    runs-on: ubuntu-latest
    steps:
    - name: Collect workflow metrics
      run: |
        # Collect and store metrics
        gh api /repos/${{ github.repository }}/actions/runs \
          --jq '.workflow_runs[] | {
            workflow: .name,
            status: .conclusion,
            duration: .run_duration_ms,
            timestamp: .created_at
          }' > metrics.json
    
    - name: Send to monitoring service
      run: |
        # Send to your monitoring service
        curl -X POST https://metrics.chittyos.com/ci \
          -H "Content-Type: application/json" \
          -d @metrics.json
```

### Maintenance Schedule

| Frequency | Task | Owner | Duration |
|-----------|------|-------|----------|
| Daily | Health check | On-call DevOps | 15 min |
| Weekly | Dependency review | DevOps Team | 1 hour |
| Weekly | Workflow optimization | Senior DevOps | 2 hours |
| Monthly | Performance analysis | DevOps Lead | 4 hours |
| Quarterly | Strategy review | All stakeholders | 1 day |

### Key Performance Indicators (KPIs)

1. **Reliability Metrics:**
   - Workflow success rate: >95%
   - Deployment success rate: >99%
   - Mean time to recovery: <30 minutes

2. **Performance Metrics:**
   - Average build time: <5 minutes
   - Average deployment time: <3 minutes
   - Queue wait time: <1 minute

3. **Security Metrics:**
   - Time to patch critical vulnerabilities: <24 hours
   - Secret rotation compliance: 100%
   - Security scan coverage: 100%

### Escalation Procedures

**Level 1 (Automated Alert):**
- Slack notification to #ci-cd-alerts
- Auto-create issue for tracking

**Level 2 (Multiple Failures):**
- Page on-call engineer
- Create incident channel

**Level 3 (System-wide Outage):**
- Activate incident response team
- Notify all stakeholders
- Implement emergency procedures

### Continuous Improvement

1. **Feedback Collection:**
   - Monthly developer surveys
   - CI/CD suggestion box
   - Retrospective meetings

2. **Implementation Cycle:**
   - Collect feedback (Week 1)
   - Prioritize improvements (Week 2)
   - Implement changes (Week 3-4)
   - Measure impact (Following month)

---

## Appendices

### Appendix A: Quick Reference Commands

```bash
# GitHub CLI
gh workflow list
gh run list
gh pr create
gh secret set

# Platform CLIs
vercel deploy
wrangler publish
npm audit fix

# Troubleshooting
gh run view --log
gh run rerun --failed
```

### Appendix B: Contact Information

| Role | Contact | Escalation |
|------|---------|------------|
| DevOps On-call | #devops-oncall | PagerDuty |
| Security Team | security@chittyos.com | #security-alerts |
| Platform Support | Various | See vendor docs |

### Appendix C: Revision History

| Version | Date | Changes | Approved By |
|---------|------|---------|-------------|
| 1.0 | 2025-08-06 | Initial release | DevOps Team |

### Appendix D: Compliance Checklist

- [ ] All workflows include security scanning
- [ ] ChittyBeacon integrated in all apps
- [ ] Secrets rotated within 90 days
- [ ] Documentation up to date
- [ ] Disaster recovery plan tested

---

**Document End**

For questions or updates to these procedures, contact the DevOps team or submit a PR to the documentation repository.