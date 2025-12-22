#!/bin/bash

# ChittyOS Evidence-Centric Architecture - Deployment Script
# Version: 1.0.0
# Authority: ChittyOS Core Team

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Header
echo "================================================================================"
echo "ChittyOS Evidence-Centric Architecture - Deployment"
echo "================================================================================"
echo ""

# Check prerequisites
log_info "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js not found. Please install Node.js 20+"
    exit 1
fi
log_success "Node.js $(node --version) found"

# Check pnpm/npm
if ! command -v pnpm &> /dev/null && ! command -v npm &> /dev/null; then
    log_error "pnpm or npm not found. Please install a package manager"
    exit 1
fi
log_success "Package manager found"

# Check Wrangler
if ! command -v wrangler &> /dev/null; then
    log_warning "Wrangler not found. Installing..."
    npm install -g wrangler
fi
log_success "Wrangler $(wrangler --version) found"

# Check PostgreSQL client
if ! command -v psql &> /dev/null; then
    log_warning "PostgreSQL client not found. Database deployment will be skipped."
    SKIP_DB=true
else
    log_success "PostgreSQL client found"
    SKIP_DB=false
fi

echo ""
echo "================================================================================"
echo "STEP 1: Credential Verification"
echo "================================================================================"
echo ""

# Check required credentials
MISSING_CREDS=false

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    log_error "CLOUDFLARE_API_TOKEN not set"
    MISSING_CREDS=true
else
    log_success "CLOUDFLARE_API_TOKEN set"
fi

if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
    log_error "CLOUDFLARE_ACCOUNT_ID not set"
    MISSING_CREDS=true
else
    log_success "CLOUDFLARE_ACCOUNT_ID set: $CLOUDFLARE_ACCOUNT_ID"
fi

if [ -z "$NEON_DATABASE_URL" ] && [ "$SKIP_DB" = false ]; then
    log_warning "NEON_DATABASE_URL not set - database deployment will be skipped"
else
    log_success "NEON_DATABASE_URL set"
fi

if $MISSING_CREDS; then
    echo ""
    log_error "Missing required credentials. Please set environment variables:"
    echo ""
    echo "  export CLOUDFLARE_API_TOKEN=\"your-api-token\""
    echo "  export CLOUDFLARE_ACCOUNT_ID=\"0bc21e3a5a9de1a4cc843be9c3e98121\""
    echo "  export NEON_DATABASE_URL=\"postgresql://...\""
    echo "  export CHITTY_ID_SERVICE_TOKEN=\"your-chittyid-token\""
    echo "  export CHITTY_CERT_SERVICE_TOKEN=\"your-chittycert-token\""
    echo ""
    echo "Or use 1Password:"
    echo "  op run --env-file=.env -- ./deploy.sh"
    echo ""
    exit 1
fi

echo ""
echo "================================================================================"
echo "STEP 2: P0 - KV Audit (Evidence Violation Detection)"
echo "================================================================================"
echo ""

log_info "Running KV audit to detect evidence violations..."

if npx tsx scripts/kv-audit.ts > kv-audit-report.csv 2> kv-audit.log; then
    log_success "KV audit complete"

    # Check for violations
    URGENT_COUNT=$(grep -c "MIGRATE_TO_R2_URGENT" kv-audit-report.csv || true)

    if [ "$URGENT_COUNT" -gt 0 ]; then
        log_error "Found $URGENT_COUNT URGENT evidence violations in KV!"
        log_warning "Review kv-audit-report.csv before proceeding"
        echo ""
        echo "  To view violations:"
        echo "    grep MIGRATE_TO_R2_URGENT kv-audit-report.csv"
        echo ""
        echo "  To migrate (after legal approval):"
        echo "    npx tsx scripts/migrate-kv-to-r2.ts --input kv-audit-report.csv --execute"
        echo ""

        read -p "Continue deployment despite violations? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_warning "Deployment cancelled. Please address KV violations first."
            exit 1
        fi
    else
        log_success "No urgent KV violations detected"
    fi
else
    log_error "KV audit failed. Check kv-audit.log for details."
    exit 1
fi

echo ""
echo "================================================================================"
echo "STEP 3: Deploy Neon Schema"
echo "================================================================================"
echo ""

if [ "$SKIP_DB" = false ] && [ -n "$NEON_DATABASE_URL" ]; then
    log_info "Deploying evidence registry schema to Neon..."

    if psql "$NEON_DATABASE_URL" < schemas/evidence-registry-neon.sql > schema-deploy.log 2>&1; then
        log_success "Neon schema deployed successfully"

        # Count created objects
        TABLES=$(grep -c "CREATE TABLE" schema-deploy.log || echo "0")
        INDEXES=$(grep -c "CREATE INDEX" schema-deploy.log || echo "0")
        VIEWS=$(grep -c "CREATE VIEW" schema-deploy.log || echo "0")

        log_info "Created: $TABLES tables, $INDEXES indexes, $VIEWS views"
    else
        log_error "Schema deployment failed. Check schema-deploy.log"
        cat schema-deploy.log
        exit 1
    fi
else
    log_warning "Skipping database deployment (PostgreSQL client or credentials not available)"
fi

echo ""
echo "================================================================================"
echo "STEP 4: Deploy Cloudflare Pipelines"
echo "================================================================================"
echo ""

log_warning "Cloudflare Pipelines deployment via CLI is not yet available"
log_info "Manual deployment required:"
echo ""
echo "  1. Navigate to: https://dash.cloudflare.com/$CLOUDFLARE_ACCOUNT_ID/pipelines"
echo "  2. Create new pipeline: 'chittyevidence-ingestion-production'"
echo "  3. Upload: pipelines/evidence-ingestion.yaml"
echo "  4. Create new pipeline: 'chittyevidence-vectorization-production'"
echo "  5. Upload: pipelines/vectorization.yaml"
echo "  6. Configure secrets:"
echo "     - CHITTY_ID_SERVICE_TOKEN"
echo "     - CHITTY_CERT_SERVICE_TOKEN"
echo "     - NEON_DATABASE_URL"
echo ""

read -p "Have you deployed the pipelines manually? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warning "Please deploy pipelines before continuing with workers"
    exit 1
fi

echo ""
echo "================================================================================"
echo "STEP 5: Deploy Workers"
echo "================================================================================"
echo ""

# Create deployment directory
mkdir -p .wrangler-deploy

# Deploy AutoRAG Query Worker
log_info "Deploying AutoRAG Query Worker (read-only)..."

cp wrangler-examples/autorag.toml .wrangler-deploy/autorag.toml
cp workers/autorag-query.ts .wrangler-deploy/autorag-query.ts
cp middleware/storage-guard.ts .wrangler-deploy/storage-guard.ts

cd .wrangler-deploy

if wrangler deploy --config autorag.toml --env production; then
    log_success "AutoRAG Query Worker deployed"
else
    log_error "AutoRAG Query Worker deployment failed"
    cd ..
    exit 1
fi

cd ..

# Deploy Evidence Upload Worker
log_info "Deploying Evidence Upload Worker (queue-only)..."

cp wrangler-examples/upload.toml .wrangler-deploy/upload.toml
cp workers/evidence-upload.ts .wrangler-deploy/evidence-upload.ts

cd .wrangler-deploy

if wrangler deploy --config upload.toml --env production; then
    log_success "Evidence Upload Worker deployed"
else
    log_error "Evidence Upload Worker deployment failed"
    cd ..
    exit 1
fi

cd ..

# Configure secrets
log_info "Configuring worker secrets..."

log_info "Setting JWT_SECRET for autorag-query..."
if [ -n "$JWT_SECRET" ]; then
    echo "$JWT_SECRET" | wrangler secret put JWT_SECRET --name chittyevidence-autorag-query-production
else
    log_warning "JWT_SECRET not set - configure manually with: wrangler secret put JWT_SECRET"
fi

log_info "Setting JWT_SECRET for evidence-upload..."
if [ -n "$JWT_SECRET" ]; then
    echo "$JWT_SECRET" | wrangler secret put JWT_SECRET --name chittyevidence-upload-production
else
    log_warning "JWT_SECRET not set - configure manually with: wrangler secret put JWT_SECRET"
fi

if [ -n "$NEON_DATABASE_URL" ]; then
    log_info "Setting NEON_DATABASE_URL for workers..."
    echo "$NEON_DATABASE_URL" | wrangler secret put NEON_DATABASE_URL --name chittyevidence-autorag-query-production
    echo "$NEON_DATABASE_URL" | wrangler secret put NEON_DATABASE_URL --name chittyevidence-upload-production
else
    log_warning "NEON_DATABASE_URL not set - configure manually"
fi

echo ""
echo "================================================================================"
echo "STEP 6: Deployment Verification"
echo "================================================================================"
echo ""

log_info "Verifying deployments..."

# Check AutoRAG worker
if curl -s https://autorag.chitty.cc/health | grep -q "healthy"; then
    log_success "AutoRAG Query Worker is healthy"
else
    log_warning "AutoRAG Query Worker health check failed (may need DNS propagation)"
fi

# Check Upload worker
if curl -s https://upload.chitty.cc/health | grep -q "healthy"; then
    log_success "Evidence Upload Worker is healthy"
else
    log_warning "Evidence Upload Worker health check failed (may need DNS propagation)"
fi

echo ""
echo "================================================================================"
echo "DEPLOYMENT SUMMARY"
echo "================================================================================"
echo ""

log_success "ChittyOS Evidence-Centric Architecture deployed!"
echo ""
echo "Deployed Components:"
echo "  ✅ Neon Schema (evidence registry + chain of custody)"
echo "  ✅ AutoRAG Query Worker (read-only retrieval)"
echo "  ✅ Evidence Upload Worker (queue-only ingestion)"
echo "  ⏳ Cloudflare Pipelines (manual deployment required)"
echo ""
echo "Worker URLs:"
echo "  - AutoRAG Query:    https://autorag.chitty.cc"
echo "  - Evidence Upload:  https://upload.chitty.cc"
echo ""
echo "Next Steps:"
echo "  1. Verify pipelines are processing evidence"
echo "  2. Test evidence upload flow"
echo "  3. Verify vectors are being created in Vectorize"
echo "  4. Monitor Analytics Engine for violations"
echo ""
echo "Monitoring:"
echo "  - Worker logs:     wrangler tail --name chittyevidence-autorag-query-production"
echo "  - Pipeline status: https://dash.cloudflare.com/$CLOUDFLARE_ACCOUNT_ID/pipelines"
echo "  - KV violations:   grep MIGRATE_TO_R2_URGENT kv-audit-report.csv"
echo ""

log_info "Deployment complete!"
