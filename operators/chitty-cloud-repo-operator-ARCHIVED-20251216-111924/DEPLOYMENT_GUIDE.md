# ChittyOS Evidence-Centric Architecture - Deployment Guide

**Version:** 1.0.0
**Status:** Ready for Deployment
**Authority:** ChittyOS Core Team

---

## Prerequisites

### Required Credentials

Before deployment, ensure you have the following credentials:

| Credential | Purpose | How to Obtain |
|------------|---------|---------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API access | [Dashboard → Profile → API Tokens](https://dash.cloudflare.com/profile/api-tokens) |
| `CLOUDFLARE_ACCOUNT_ID` | Account identifier | Already set: `0bc21e3a5a9de1a4cc843be9c3e98121` |
| `NEON_DATABASE_URL` | PostgreSQL connection | Neon Dashboard → Connection String |
| `CHITTY_ID_SERVICE_TOKEN` | ChittyID minting | ChittyID service admin |
| `CHITTY_CERT_SERVICE_TOKEN` | ChittyCert signing | ChittyCert service admin |
| `JWT_SECRET` | Worker authentication | Generate secure random string |

### Required Tools

```bash
# Node.js 20+
node --version

# Package manager
pnpm --version  # or npm

# Wrangler CLI
wrangler --version

# PostgreSQL client
psql --version

# TypeScript execution
npx tsx --version
```

---

## Deployment Methods

### Method 1: Automated Deployment (Recommended)

```bash
# Set environment variables
export CLOUDFLARE_API_TOKEN="your-api-token"
export CLOUDFLARE_ACCOUNT_ID="0bc21e3a5a9de1a4cc843be9c3e98121"
export NEON_DATABASE_URL="postgresql://..."
export CHITTY_ID_SERVICE_TOKEN="your-chittyid-token"
export CHITTY_CERT_SERVICE_TOKEN="your-chittycert-token"
export JWT_SECRET="$(openssl rand -base64 32)"

# Run deployment script
./deploy.sh
```

### Method 2: Using 1Password

```bash
# Create .env file in 1Password
# Then run with op:
op run --env-file=.env -- ./deploy.sh
```

### Method 3: Manual Deployment

Follow the step-by-step instructions below.

---

## Step-by-Step Deployment

### Step 1: P0 - KV Audit (Evidence Violation Detection)

**CRITICAL:** Execute immediately to detect evidence in KV namespaces.

```bash
# Run audit
npx tsx scripts/kv-audit.ts > kv-audit-report.csv 2> kv-audit.log

# Check for violations
grep "MIGRATE_TO_R2_URGENT" kv-audit-report.csv

# If violations found:
# 1. Review report
cat kv-audit-report.csv

# 2. Dry-run migration
npx tsx scripts/migrate-kv-to-r2.ts \
  --input kv-audit-report.csv \
  --dry-run \
  > migration-dry-run.csv

# 3. Get legal approval for migration plan

# 4. Execute migration
npx tsx scripts/migrate-kv-to-r2.ts \
  --input kv-audit-report.csv \
  --execute \
  > migration-results.csv

# 5. Verify migration success
grep "SUCCESS" migration-results.csv | wc -l
grep "FAILED" migration-results.csv
```

**Expected Duration:** 15-30 minutes (depending on violations)

---

### Step 2: Deploy Neon Schema

```bash
# Verify database connection
psql "$NEON_DATABASE_URL" -c "SELECT version();"

# Deploy schema
psql "$NEON_DATABASE_URL" < schemas/evidence-registry-neon.sql

# Verify deployment
psql "$NEON_DATABASE_URL" -c "
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name LIKE 'evidence%'
  ORDER BY table_name;
"

# Expected output:
#  evidence
#  evidence_chain_of_custody
```

**Expected Duration:** 2-5 minutes

---

### Step 3: Deploy Cloudflare Pipelines

**Note:** Cloudflare Pipelines do not currently support CLI deployment. Deploy manually via dashboard.

#### 3.1 Deploy Evidence Ingestion Pipeline

1. Navigate to [Cloudflare Dashboard → Pipelines](https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/pipelines)

2. Click "Create Pipeline"

3. Configure:
   - **Name:** `chittyevidence-ingestion-production`
   - **Description:** Legal-grade evidence ingestion with chain of custody
   - **Configuration:** Upload `pipelines/evidence-ingestion.yaml`

4. Set Pipeline Secrets:
   ```
   CHITTY_ID_SERVICE_TOKEN = <your-token>
   CHITTY_CERT_SERVICE_TOKEN = <your-token>
   NEON_DATABASE_URL = <your-connection-string>
   SLACK_WEBHOOK_EVIDENCE_ALERTS = <your-slack-webhook>
   ```

5. Enable Pipeline

#### 3.2 Deploy Vectorization Pipeline

1. Click "Create Pipeline"

2. Configure:
   - **Name:** `chittyevidence-vectorization-production`
   - **Description:** R2 evidence to Vectorize semantic indexing
   - **Configuration:** Upload `pipelines/vectorization.yaml`

3. Set Pipeline Secrets:
   ```
   NEON_DATABASE_URL = <your-connection-string>
   SLACK_WEBHOOK_VECTORIZATION_ALERTS = <your-slack-webhook>
   ```

4. Enable Pipeline

**Expected Duration:** 10-15 minutes

---

### Step 4: Deploy Workers

#### 4.1 Deploy AutoRAG Query Worker (Read-Only)

```bash
# Navigate to repository
cd operators/chitty-cloud-repo-operator

# Deploy worker
wrangler deploy \
  --config wrangler-examples/autorag.toml \
  --env production

# Set secrets
wrangler secret put JWT_SECRET \
  --name chittyevidence-autorag-query-production

wrangler secret put NEON_DATABASE_URL \
  --name chittyevidence-autorag-query-production

# Verify deployment
curl https://autorag.chitty.cc/health

# Expected: {"status":"healthy"}
```

#### 4.2 Deploy Evidence Upload Worker (Queue-Only)

```bash
# Deploy worker
wrangler deploy \
  --config wrangler-examples/upload.toml \
  --env production

# Set secrets
wrangler secret put JWT_SECRET \
  --name chittyevidence-upload-production

wrangler secret put NEON_DATABASE_URL \
  --name chittyevidence-upload-production

# Verify deployment
curl https://upload.chitty.cc/health

# Expected: {"status":"healthy"}
```

**Expected Duration:** 5-10 minutes per worker

---

### Step 5: Verify Deployment

#### 5.1 Test Evidence Upload Flow

```bash
# Generate test JWT token (replace with actual token)
TOKEN="your-jwt-token"

# Upload test evidence
curl -X POST https://upload.chitty.cc/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-evidence.pdf" \
  -F "case_id=01-C-CAS-TEST-..." \
  -F "source_platform=API_TEST"

# Expected: 202 Accepted
# Response includes upload_id and sha256_hash
```

#### 5.2 Verify Pipeline Processing

```bash
# Check pipeline logs
# Navigate to: https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/pipelines

# Verify R2 object created
wrangler r2 object list chittyevidence-originals --prefix evidence/

# Verify Neon record
psql "$NEON_DATABASE_URL" -c "
  SELECT chitty_id, r2_key, evidence_tier, created_at
  FROM evidence
  ORDER BY created_at DESC
  LIMIT 5;
"

# Verify vector index updated
psql "$NEON_DATABASE_URL" -c "
  SELECT evidence_id, chunk_count, total_vectors, index_status
  FROM vector_indexes
  ORDER BY updated_at DESC
  LIMIT 5;
"
```

#### 5.3 Test AutoRAG Query

```bash
# Search for evidence
curl -X POST https://autorag.chitty.cc/search \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "bank statement January 2024",
    "case_id": "01-C-CAS-TEST-...",
    "limit": 10
  }'

# Expected: Array of matching evidence with scores
```

**Expected Duration:** 10-15 minutes

---

## Post-Deployment Verification

### Health Checks

```bash
# Worker health
curl https://autorag.chitty.cc/health
curl https://upload.chitty.cc/health

# Database connectivity
psql "$NEON_DATABASE_URL" -c "SELECT COUNT(*) FROM evidence;"

# R2 bucket access
wrangler r2 object list chittyevidence-originals | head -10

# Vectorize index status
# Check via Cloudflare Dashboard
```

### Monitor for Violations

```bash
# Check Analytics Engine for storage violations
# Navigate to: https://dash.cloudflare.com/0bc21e3a5a9de1a4cc843be9c3e98121/analytics-engine

# Query: SELECT * FROM EVIDENCE_ACCESS WHERE double1 = 0

# Alert on any violations (double1 = 0 means violation)
```

### Verify Audit Logs

```bash
# Check evidence access logs
psql "$NEON_DATABASE_URL" -c "
  SELECT * FROM evidence_access_log
  ORDER BY access_timestamp DESC
  LIMIT 20;
"

# Check chain of custody events
psql "$NEON_DATABASE_URL" -c "
  SELECT * FROM evidence_chain_of_custody
  ORDER BY event_timestamp DESC
  LIMIT 20;
"

# Verify R2 audit bucket
wrangler r2 object list chitty-audit --prefix migrations/kv-to-r2/
```

---

## Rollback Procedures

### Rollback Workers

```bash
# List deployments
wrangler deployments list --name chittyevidence-autorag-query-production

# Rollback to previous version
wrangler rollback --name chittyevidence-autorag-query-production

# Verify rollback
curl https://autorag.chitty.cc/health
```

### Rollback Database Schema

```bash
# Backup current schema
pg_dump "$NEON_DATABASE_URL" \
  --schema-only \
  --table evidence \
  --table evidence_chain_of_custody \
  > schema-backup-$(date +%Y%m%d-%H%M%S).sql

# Drop tables (DANGEROUS - ensure you have backup)
psql "$NEON_DATABASE_URL" -c "
  DROP TABLE IF EXISTS evidence_chain_of_custody CASCADE;
  DROP TABLE IF EXISTS evidence CASCADE;
"

# Restore from backup
psql "$NEON_DATABASE_URL" < schema-backup-YYYYMMDD-HHMMSS.sql
```

### Disable Pipelines

1. Navigate to Cloudflare Dashboard → Pipelines
2. Select pipeline
3. Click "Disable"
4. Drain existing queue messages before re-enabling

---

## Monitoring & Maintenance

### Daily Checks

```bash
# Check worker health
./scripts/health-check.sh

# Review violation logs
grep "VIOLATION" kv-audit.log

# Check pipeline queue depth
# Navigate to: https://dash.cloudflare.com/queues
```

### Weekly Tasks

```bash
# Run KV audit
npx tsx scripts/kv-audit.ts > kv-audit-weekly-$(date +%Y%m%d).csv

# Review evidence growth
psql "$NEON_DATABASE_URL" -c "
  SELECT
    DATE(created_at) AS date,
    COUNT(*) AS evidence_count,
    SUM(file_size) AS total_bytes
  FROM evidence
  WHERE created_at > NOW() - INTERVAL '7 days'
  GROUP BY DATE(created_at)
  ORDER BY date DESC;
"

# Check vector index health
psql "$NEON_DATABASE_URL" -c "
  SELECT
    index_status,
    COUNT(*) AS count,
    SUM(total_vectors) AS total_vectors
  FROM vector_indexes
  GROUP BY index_status;
"
```

### Monthly Tasks

```bash
# Comprehensive KV namespace audit
npx tsx scripts/kv-audit.ts > kv-audit-monthly-$(date +%Y%m).csv

# Review evidence tier distribution
psql "$NEON_DATABASE_URL" -c "
  SELECT
    evidence_tier,
    COUNT(*) AS count,
    ROUND(AVG(evidence_weight), 2) AS avg_weight
  FROM evidence
  GROUP BY evidence_tier
  ORDER BY count DESC;
"

# Vector index rebuild (if needed)
./scripts/rebuild-vector-index.ts --index intel-embeddings --verify
```

---

## Troubleshooting

### Issue: KV Audit Fails

**Symptom:** `scripts/kv-audit.ts` exits with error

**Solution:**
```bash
# Check Cloudflare credentials
echo $CLOUDFLARE_API_TOKEN | head -c 20
echo $CLOUDFLARE_ACCOUNT_ID

# Verify API token permissions
curl -X GET "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/storage/kv/namespaces" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# Check logs
cat kv-audit.log
```

### Issue: Worker Deployment Fails

**Symptom:** `wrangler deploy` fails with error

**Solution:**
```bash
# Check wrangler.toml syntax
python3 -c "import tomllib; tomllib.load(open('wrangler-examples/autorag.toml', 'rb'))"

# Verify account access
wrangler whoami

# Check for naming conflicts
wrangler deployments list --name chittyevidence-autorag-query-production
```

### Issue: Pipeline Not Processing

**Symptom:** Evidence uploaded but not appearing in R2

**Solution:**
1. Check pipeline status in dashboard
2. Verify queue has messages: `wrangler queues consumer http evidence-upload-queue`
3. Check pipeline logs for errors
4. Verify secrets are set correctly
5. Check sink configurations (R2 bucket name, permissions)

### Issue: Vector Search Returns No Results

**Symptom:** AutoRAG query returns empty results

**Solution:**
```bash
# Verify Vectorize index exists
# Check Cloudflare Dashboard → Vectorize

# Check vector_indexes table
psql "$NEON_DATABASE_URL" -c "
  SELECT * FROM vector_indexes
  WHERE index_status = 'ACTIVE'
  ORDER BY updated_at DESC;
"

# Manually trigger vectorization
# Queue a test message to evidence-vectorization-queue
```

---

## Security Hardening

### Enable Cloudflare IAM Policies

Create restrictive policies for workers:

```json
{
  "policies": [
    {
      "name": "deny-query-worker-writes",
      "effect": "deny",
      "actions": ["r2:PutObject", "r2:DeleteObject", "vectorize:Upsert"],
      "resources": ["workers:chittyevidence-autorag-query-*"]
    },
    {
      "name": "deny-upload-worker-r2-access",
      "effect": "deny",
      "actions": ["r2:*"],
      "resources": ["workers:chittyevidence-upload-*"]
    }
  ]
}
```

Apply via Cloudflare Dashboard → Access → Service Auth → IAM Policies

### Rotate Secrets Regularly

```bash
# Generate new JWT secret
NEW_JWT_SECRET=$(openssl rand -base64 32)

# Update in all workers
echo "$NEW_JWT_SECRET" | wrangler secret put JWT_SECRET --name chittyevidence-autorag-query-production
echo "$NEW_JWT_SECRET" | wrangler secret put JWT_SECRET --name chittyevidence-upload-production

# Update in environment variable
export JWT_SECRET="$NEW_JWT_SECRET"
```

---

## Support & Escalation

- **Technical Issues:** ChittyOS Core Team
- **Legal/Compliance:** Legal Counsel
- **Security Incidents:** Security Team (immediate escalation)

---

## Deployment Checklist

Use this checklist to track deployment progress:

- [ ] Prerequisites verified (credentials, tools)
- [ ] P0 KV audit executed
- [ ] KV violations addressed (if any)
- [ ] Neon schema deployed
- [ ] Evidence ingestion pipeline deployed
- [ ] Vectorization pipeline deployed
- [ ] AutoRAG query worker deployed
- [ ] Evidence upload worker deployed
- [ ] Worker secrets configured
- [ ] Health checks passed
- [ ] Test evidence upload successful
- [ ] Test AutoRAG query successful
- [ ] Monitoring configured
- [ ] Security hardening applied
- [ ] Team notified of deployment

---

**Deployment Guide Version:** 1.0.0
**Last Updated:** 2025-12-16
**Next Review:** After first production deployment
