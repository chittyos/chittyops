#!/bin/bash

# ChittyOps Project Awareness Cloudflare Worker Deployment Script
# Automates the complete deployment process

set -e

echo "🚀 ChittyOps Project Awareness - Cloudflare Worker Deployment"
echo "============================================================"

# Configuration
WORKER_NAME="chittyops-project-awareness"
DOMAIN="project-awareness.chitty.cc"
STAGING_DOMAIN="project-awareness-staging.chitty.cc"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if wrangler is installed
    if ! command -v wrangler &> /dev/null; then
        print_error "Wrangler CLI not found. Please install it with: npm install -g wrangler"
        exit 1
    fi
    
    # Check if logged in to Cloudflare
    if ! wrangler whoami &> /dev/null; then
        print_error "Not logged in to Cloudflare. Please run: wrangler login"
        exit 1
    fi
    
    # Check if npm is available
    if ! command -v npm &> /dev/null; then
        print_error "npm not found. Please install Node.js and npm"
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    npm install
    print_success "Dependencies installed"
}

# Setup KV namespaces
setup_kv_namespaces() {
    print_status "Setting up KV namespaces..."
    
    # Create KV namespaces if they don't exist
    echo "Creating SESSION_STORE namespace..."
    wrangler kv:namespace create "SESSION_STORE" || print_warning "SESSION_STORE namespace might already exist"
    
    echo "Creating PROJECT_STORE namespace..."
    wrangler kv:namespace create "PROJECT_STORE" || print_warning "PROJECT_STORE namespace might already exist"
    
    echo "Creating CROSS_PLATFORM_SYNC namespace..."
    wrangler kv:namespace create "CROSS_PLATFORM_SYNC" || print_warning "CROSS_PLATFORM_SYNC namespace might already exist"
    
    print_success "KV namespaces setup completed"
}

# Setup R2 bucket
setup_r2_bucket() {
    print_status "Setting up R2 bucket..."
    
    # Create R2 bucket for project data
    wrangler r2 bucket create chittyops-project-data || print_warning "R2 bucket might already exist"
    
    print_success "R2 bucket setup completed"
}

# Setup secrets
setup_secrets() {
    print_status "Setting up secrets..."
    
    # Check if secrets file exists
    if [ -f "./secrets.env" ]; then
        print_status "Found secrets.env file, setting up secrets..."
        
        # Source the secrets file
        source ./secrets.env
        
        # Set secrets
        [ ! -z "$CHITTYID_API_KEY" ] && echo "$CHITTYID_API_KEY" | wrangler secret put CHITTYID_API_KEY
        [ ! -z "$CHITTYCHAT_API_KEY" ] && echo "$CHITTYCHAT_API_KEY" | wrangler secret put CHITTYCHAT_API_KEY
        [ ! -z "$REGISTRY_API_KEY" ] && echo "$REGISTRY_API_KEY" | wrangler secret put REGISTRY_API_KEY
        [ ! -z "$SESSION_ENCRYPTION_KEY" ] && echo "$SESSION_ENCRYPTION_KEY" | wrangler secret put SESSION_ENCRYPTION_KEY
        [ ! -z "$WEBHOOK_SECRET" ] && echo "$WEBHOOK_SECRET" | wrangler secret put WEBHOOK_SECRET
        [ ! -z "$JWT_SECRET" ] && echo "$JWT_SECRET" | wrangler secret put JWT_SECRET
        [ ! -z "$OPENAI_API_KEY" ] && echo "$OPENAI_API_KEY" | wrangler secret put OPENAI_API_KEY
        
        print_success "Secrets setup completed"
    else
        print_warning "secrets.env file not found. Please create it with your API keys."
        print_status "Required secrets: CHITTYID_API_KEY, CHITTYCHAT_API_KEY, REGISTRY_API_KEY, SESSION_ENCRYPTION_KEY, WEBHOOK_SECRET, JWT_SECRET, OPENAI_API_KEY"
    fi
}

# Build the worker
build_worker() {
    print_status "Building worker..."
    npm run build
    print_success "Worker built successfully"
}

# Deploy to staging
deploy_staging() {
    print_status "Deploying to staging environment..."
    wrangler deploy --env staging
    print_success "Staging deployment completed"
    print_status "Staging URL: https://$STAGING_DOMAIN"
}

# Test staging deployment
test_staging() {
    print_status "Testing staging deployment..."
    
    # Test health endpoint
    HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://$STAGING_DOMAIN/health")
    
    if [ "$HEALTH_STATUS" = "200" ]; then
        print_success "Staging health check passed"
    else
        print_error "Staging health check failed (HTTP $HEALTH_STATUS)"
        return 1
    fi
    
    # Test API info endpoint
    API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://$STAGING_DOMAIN/api/info")
    
    if [ "$API_STATUS" = "200" ]; then
        print_success "Staging API check passed"
    else
        print_error "Staging API check failed (HTTP $API_STATUS)"
        return 1
    fi
    
    print_success "Staging tests completed successfully"
}

# Deploy to production
deploy_production() {
    print_status "Deploying to production environment..."
    wrangler deploy
    print_success "Production deployment completed"
    print_status "Production URL: https://$DOMAIN"
}

# Test production deployment
test_production() {
    print_status "Testing production deployment..."
    
    # Test health endpoint
    HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/health")
    
    if [ "$HEALTH_STATUS" = "200" ]; then
        print_success "Production health check passed"
    else
        print_error "Production health check failed (HTTP $HEALTH_STATUS)"
        return 1
    fi
    
    # Test API info endpoint
    API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/api/info")
    
    if [ "$API_STATUS" = "200" ]; then
        print_success "Production API check passed"
    else
        print_error "Production API check failed (HTTP $API_STATUS)"
        return 1
    fi
    
    print_success "Production tests completed successfully"
}

# Setup custom domains (if not already configured)
setup_domains() {
    print_status "Setting up custom domains..."
    print_warning "Custom domain setup requires manual configuration in Cloudflare dashboard"
    print_status "Please ensure the following domains are configured:"
    print_status "- Production: $DOMAIN"
    print_status "- Staging: $STAGING_DOMAIN"
}

# Display post-deployment information
show_deployment_info() {
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo "=================================="
    echo ""
    echo "🌐 URLs:"
    echo "  Production: https://$DOMAIN"
    echo "  Staging: https://$STAGING_DOMAIN"
    echo ""
    echo "🔧 Available endpoints:"
    echo "  GET  /health                     - Health check"
    echo "  GET  /api/info                   - API information"
    echo "  POST /api/auth/session           - Create session"
    echo "  GET  /api/projects/suggestions   - Get project suggestions"
    echo "  POST /api/projects/active        - Set active project"
    echo "  GET  /api/projects/context       - Analyze context"
    echo "  POST /api/projects/sync          - Cross-platform sync"
    echo "  POST /api/sessions/register      - Register session"
    echo "  POST /api/sessions/consolidate   - Consolidate memory"
    echo "  GET  /api/sessions/statistics    - Get statistics"
    echo "  POST /api/sessions/alignment     - Force alignment"
    echo "  GET  /ws                         - WebSocket endpoint"
    echo ""
    echo "📊 Monitoring:"
    echo "  Logs: wrangler tail"
    echo "  Analytics: wrangler analytics"
    echo ""
    echo "🔑 Next steps:"
    echo "  1. Test all endpoints with your AI platform integrations"
    echo "  2. Update platform configurations to use the new endpoints"
    echo "  3. Monitor logs and analytics for any issues"
    echo "  4. Setup monitoring and alerting"
}

# Main deployment function
main() {
    local ENVIRONMENT="${1:-all}"
    
    case $ENVIRONMENT in
        "staging")
            check_prerequisites
            install_dependencies
            build_worker
            deploy_staging
            test_staging
            ;;
        "production")
            check_prerequisites
            build_worker
            deploy_production
            test_production
            ;;
        "setup")
            check_prerequisites
            install_dependencies
            setup_kv_namespaces
            setup_r2_bucket
            setup_secrets
            setup_domains
            ;;
        "all")
            check_prerequisites
            install_dependencies
            setup_kv_namespaces
            setup_r2_bucket
            setup_secrets
            build_worker
            deploy_staging
            test_staging
            
            echo ""
            read -p "Staging tests passed. Deploy to production? (y/N): " -n 1 -r
            echo ""
            
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                deploy_production
                test_production
                show_deployment_info
            else
                print_status "Skipping production deployment"
            fi
            ;;
        *)
            echo "Usage: $0 [staging|production|setup|all]"
            echo ""
            echo "Commands:"
            echo "  staging     - Deploy only to staging"
            echo "  production  - Deploy only to production"
            echo "  setup       - Setup KV, R2, secrets, and domains"
            echo "  all         - Full deployment pipeline (default)"
            exit 1
            ;;
    esac
}

# Run main function with arguments
main "$@"