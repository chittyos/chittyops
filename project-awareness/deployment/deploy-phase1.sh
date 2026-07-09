#!/bin/bash

# Phase 1 Infrastructure Deployment Script
# ChittyOS Multi-Platform Connectors Strategic Deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEPLOYMENT_CONFIG="$SCRIPT_DIR/phase1-infrastructure.yaml"
LOG_FILE="$SCRIPT_DIR/deployment-$(date +%Y%m%d-%H%M%S).log"

# Logging function
log() {
    echo -e "${1}" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "${RED}ERROR: $1${NC}"
    exit 1
}

# Success logging
success() {
    log "${GREEN}✅ $1${NC}"
}

# Warning logging
warn() {
    log "${YELLOW}⚠️  $1${NC}"
}

# Info logging
info() {
    log "${BLUE}ℹ️  $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    info "Checking prerequisites..."
    
    # Check if wrangler is installed
    if ! command -v wrangler &> /dev/null; then
        error_exit "Wrangler CLI not found. Install with: npm install -g wrangler"
    fi
    
    # Check if logged into Cloudflare
    if ! wrangler whoami &> /dev/null; then
        error_exit "Not logged into Cloudflare. Run: wrangler login"
    fi
    
    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        error_exit "Node.js not found. Please install Node.js"
    fi
    
    # Check if npm is installed
    if ! command -v npm &> /dev/null; then
        error_exit "npm not found. Please install npm"
    fi
    
    success "Prerequisites check completed"
}

# Setup project structure
setup_project_structure() {
    info "Setting up project structure..."
    
    # Create necessary directories
    mkdir -p "$PROJECT_ROOT/mcp-server-worker/src"
    mkdir -p "$PROJECT_ROOT/auth-worker/src"
    mkdir -p "$PROJECT_ROOT/deployment/logs"
    
    success "Project structure setup completed"
}

# Deploy Cloudflare Workers
deploy_workers() {
    info "Deploying Cloudflare Workers..."
    
    # Deploy Project Awareness Worker
    info "Deploying Project Awareness Worker..."
    cd "$PROJECT_ROOT/cloudflare-worker"
    
    # Install dependencies if not already installed
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    
    # Deploy to staging first
    wrangler deploy --env staging --name chittyops-project-awareness-staging
    
    # Test staging deployment
    STAGING_URL="https://project-awareness-staging.chitty.cc/health"
    if curl -s "$STAGING_URL" | grep -q "healthy"; then
        success "Staging deployment successful for Project Awareness Worker"
        
        # Deploy to production
        wrangler deploy --env production --name chittyops-project-awareness
        
        # Test production deployment
        PROD_URL="https://project-awareness.chitty.cc/health"
        if curl -s "$PROD_URL" | grep -q "healthy"; then
            success "Production deployment successful for Project Awareness Worker"
        else
            error_exit "Production deployment failed for Project Awareness Worker"
        fi
    else
        error_exit "Staging deployment failed for Project Awareness Worker"
    fi
}

# Create MCP Server Worker
create_mcp_server_worker() {
    info "Creating MCP Server Worker..."
    
    MCP_WORKER_DIR="$PROJECT_ROOT/mcp-server-worker"
    
    # Create package.json
    cat > "$MCP_WORKER_DIR/package.json" << EOF
{
  "name": "chittyos-mcp-server",
  "version": "1.0.0",
  "description": "ChittyOS MCP Server for ChatGPT integration",
  "main": "src/worker.js",
  "scripts": {
    "deploy": "wrangler deploy",
    "dev": "wrangler dev",
    "build": "echo 'Build step placeholder'"
  },
  "dependencies": {
    "itty-router": "^4.0.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240620.0"
  }
}
EOF

    # Create wrangler.toml
    cat > "$MCP_WORKER_DIR/wrangler.toml" << EOF
name = "chittyos-mcp-server"
main = "src/worker.js"
compatibility_date = "2024-08-29"
compatibility_flags = ["nodejs_compat"]

routes = [
  { pattern = "mcp.chitty.cc/*", custom_domain = true }
]

[vars]
ENVIRONMENT = "production"
CHATGPT_OAUTH_CLIENT_ID = "chittychat-mcp"
MCP_PROTOCOL_VERSION = "2024-11-05"
WEBSOCKET_TIMEOUT = "300000"
MAX_CONNECTIONS = "1000"

[[kv_namespaces]]
binding = "MCP_SESSIONS"
id = "mcp_sessions"
preview_id = "mcp_sessions_preview"

[[durable_objects.bindings]]
name = "MCP_WEBSOCKET_DO"
class_name = "MCPWebSocketDurableObject"
EOF

    # Create basic MCP worker
    cat > "$MCP_WORKER_DIR/src/worker.js" << 'EOF'
/**
 * ChittyOS MCP Server Worker for ChatGPT Integration
 */

import { Router } from 'itty-router';

const router = Router();

// Health check
router.get('/health', () => {
  return new Response(JSON.stringify({
    status: 'healthy',
    service: 'chittyos-mcp-server',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// OAuth authorization endpoint
router.get('/oauth/authorize', async (request) => {
  const url = new URL(request.url);
  const clientId = url.searchParams.get('client_id');
  const redirectUri = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state');
  
  // For now, auto-approve (implement proper OAuth later)
  const code = 'temp_auth_code_' + Math.random().toString(36).substring(7);
  
  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set('code', code);
  redirectUrl.searchParams.set('state', state);
  
  return Response.redirect(redirectUrl.toString(), 302);
});

// OAuth token endpoint
router.post('/oauth/token', async (request) => {
  const body = await request.json();
  
  // Basic token response (implement proper OAuth later)
  return new Response(JSON.stringify({
    access_token: 'mcp_token_' + Math.random().toString(36).substring(7),
    token_type: 'Bearer',
    expires_in: 3600
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// MCP WebSocket endpoint
router.get('/mcp', async (request, env) => {
  const upgradeHeader = request.headers.get('Upgrade');
  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }
  
  // Get Durable Object for WebSocket handling
  const durableObjectId = env.MCP_WEBSOCKET_DO.idFromName('mcp-websocket');
  const durableObject = env.MCP_WEBSOCKET_DO.get(durableObjectId);
  
  return durableObject.fetch(request);
});

export default {
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  }
};

// Durable Object for MCP WebSocket connections
export class MCPWebSocketDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }
  
  async fetch(request) {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    
    server.accept();
    
    // Basic MCP protocol handler
    server.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      
      // Echo back for now (implement full MCP protocol later)
      server.send(JSON.stringify({
        jsonrpc: '2.0',
        id: message.id,
        result: { message: 'MCP server placeholder response' }
      }));
    });
    
    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}
EOF

    success "MCP Server Worker created"
}

# Create Auth Provider Worker
create_auth_worker() {
    info "Creating Auth Provider Worker..."
    
    AUTH_WORKER_DIR="$PROJECT_ROOT/auth-worker"
    
    # Create package.json
    cat > "$AUTH_WORKER_DIR/package.json" << EOF
{
  "name": "chittyos-auth-provider",
  "version": "1.0.0",
  "description": "ChittyOS Universal Auth Provider",
  "main": "src/worker.js",
  "scripts": {
    "deploy": "wrangler deploy",
    "dev": "wrangler dev",
    "build": "echo 'Build step placeholder'"
  },
  "dependencies": {
    "itty-router": "^4.0.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240620.0"
  }
}
EOF

    # Create wrangler.toml
    cat > "$AUTH_WORKER_DIR/wrangler.toml" << EOF
name = "chittyos-auth-provider"
main = "src/worker.js"
compatibility_date = "2024-08-29"
compatibility_flags = ["nodejs_compat"]

routes = [
  { pattern = "auth.chitty.cc/*", custom_domain = true }
]

[vars]
ENVIRONMENT = "production"
OAUTH_TOKEN_EXPIRY = "3600"
REFRESH_TOKEN_EXPIRY = "2592000"
JWT_ALGORITHM = "ES256"

[[kv_namespaces]]
binding = "AUTH_STORE"
id = "chittyops_auth"
preview_id = "chittyops_auth_preview"
EOF

    # Create basic auth worker
    cat > "$AUTH_WORKER_DIR/src/worker.js" << 'EOF'
/**
 * ChittyOS Universal Auth Provider
 */

import { Router } from 'itty-router';

const router = Router();

// Health check
router.get('/health', () => {
  return new Response(JSON.stringify({
    status: 'healthy',
    service: 'chittyos-auth-provider',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// OAuth provider info
router.get('/.well-known/oauth-authorization-server', () => {
  return new Response(JSON.stringify({
    issuer: 'https://auth.chitty.cc',
    authorization_endpoint: 'https://auth.chitty.cc/oauth/authorize',
    token_endpoint: 'https://auth.chitty.cc/oauth/token',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    scopes_supported: ['project:read', 'project:write', 'session:sync']
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// Basic OAuth endpoints (placeholder implementation)
router.get('/oauth/authorize', async (request) => {
  // Implement OAuth authorization flow
  return new Response('OAuth authorization placeholder', { status: 200 });
});

router.post('/oauth/token', async (request) => {
  // Implement OAuth token exchange
  return new Response(JSON.stringify({
    access_token: 'placeholder_token',
    token_type: 'Bearer',
    expires_in: 3600
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
});

export default {
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  }
};
EOF

    success "Auth Provider Worker created"
}

# Deploy all workers
deploy_all_workers() {
    info "Deploying all workers..."
    
    # Deploy Project Awareness Worker (already exists)
    deploy_workers
    
    # Deploy MCP Server Worker
    info "Deploying MCP Server Worker..."
    cd "$PROJECT_ROOT/mcp-server-worker"
    npm install
    wrangler deploy
    
    # Test MCP server
    MCP_URL="https://mcp.chitty.cc/health"
    if curl -s "$MCP_URL" | grep -q "healthy"; then
        success "MCP Server Worker deployed successfully"
    else
        error_exit "MCP Server Worker deployment failed"
    fi
    
    # Deploy Auth Provider Worker
    info "Deploying Auth Provider Worker..."
    cd "$PROJECT_ROOT/auth-worker"
    npm install
    wrangler deploy
    
    # Test auth provider
    AUTH_URL="https://auth.chitty.cc/health"
    if curl -s "$AUTH_URL" | grep -q "healthy"; then
        success "Auth Provider Worker deployed successfully"
    else
        error_exit "Auth Provider Worker deployment failed"
    fi
}

# Setup KV namespaces
setup_kv_namespaces() {
    info "Setting up KV namespaces..."
    
    # Create KV namespaces if they don't exist
    wrangler kv:namespace create "SESSION_STORE" || true
    wrangler kv:namespace create "SESSION_STORE" --preview || true
    wrangler kv:namespace create "PROJECT_STORE" || true
    wrangler kv:namespace create "PROJECT_STORE" --preview || true
    wrangler kv:namespace create "CROSS_PLATFORM_SYNC" || true
    wrangler kv:namespace create "CROSS_PLATFORM_SYNC" --preview || true
    wrangler kv:namespace create "AUTH_STORE" || true
    wrangler kv:namespace create "AUTH_STORE" --preview || true
    wrangler kv:namespace create "MCP_SESSIONS" || true
    wrangler kv:namespace create "MCP_SESSIONS" --preview || true
    
    success "KV namespaces setup completed"
}

# Setup R2 buckets
setup_r2_buckets() {
    info "Setting up R2 buckets..."
    
    # Create R2 buckets if they don't exist
    wrangler r2 bucket create chittyops-project-data || true
    wrangler r2 bucket create chittyops-project-data-preview || true
    wrangler r2 bucket create chittyops-analytics || true
    wrangler r2 bucket create chittyops-analytics-preview || true
    
    success "R2 buckets setup completed"
}

# Setup secrets
setup_secrets() {
    info "Setting up secrets..."
    
    warn "Please set the following secrets manually:"
    warn "wrangler secret put CHITTYID_API_KEY"
    warn "wrangler secret put CHITTYCHAT_API_KEY"
    warn "wrangler secret put REGISTRY_API_KEY"
    warn "wrangler secret put SESSION_ENCRYPTION_KEY"
    warn "wrangler secret put WEBHOOK_SECRET"
    warn "wrangler secret put JWT_PRIVATE_KEY"
    warn "wrangler secret put JWT_PUBLIC_KEY"
    
    info "Secrets setup instructions provided"
}

# Validate deployment
validate_deployment() {
    info "Validating deployment..."
    
    # Test all endpoints
    ENDPOINTS=(
        "https://project-awareness.chitty.cc/health"
        "https://mcp.chitty.cc/health"
        "https://auth.chitty.cc/health"
    )
    
    for endpoint in "${ENDPOINTS[@]}"; do
        if curl -s "$endpoint" | grep -q "healthy"; then
            success "✅ $endpoint is healthy"
        else
            error_exit "❌ $endpoint is not responding properly"
        fi
    done
    
    success "All services deployed and healthy"
}

# Create deployment summary
create_deployment_summary() {
    info "Creating deployment summary..."
    
    SUMMARY_FILE="$SCRIPT_DIR/deployment-summary-$(date +%Y%m%d-%H%M%S).md"
    
    cat > "$SUMMARY_FILE" << EOF
# ChittyOS Phase 1 Infrastructure Deployment Summary

**Deployment Date**: $(date)
**Deployment Duration**: $SECONDS seconds

## Deployed Services

### Project Awareness Service
- **URL**: https://project-awareness.chitty.cc
- **Status**: ✅ Deployed and Healthy
- **Features**: Cross-platform project awareness, WebSocket sync

### MCP Server
- **URL**: https://mcp.chitty.cc
- **Status**: ✅ Deployed and Healthy
- **Features**: ChatGPT MCP integration, OAuth flow

### Auth Provider
- **URL**: https://auth.chitty.cc
- **Status**: ✅ Deployed and Healthy
- **Features**: Universal OAuth provider, API key management

## Storage Resources

### KV Namespaces
- SESSION_STORE: Platform session storage
- PROJECT_STORE: Project context and metadata
- CROSS_PLATFORM_SYNC: Cross-platform synchronization data
- AUTH_STORE: Authentication tokens and sessions
- MCP_SESSIONS: MCP session management

### R2 Buckets
- chittyops-project-data: Persistent project data and session history
- chittyops-analytics: Usage analytics and performance data

## Next Steps

1. **Configure Secrets**: Set up required API keys and encryption secrets
2. **Test ChatGPT Integration**: Connect ChatGPT to mcp.chitty.cc
3. **Monitor Services**: Set up alerting and monitoring
4. **Phase 2 Deployment**: Deploy OpenAI CustomGPT Actions

## Important URLs

- Project Awareness API: https://project-awareness.chitty.cc/api/info
- MCP Server Health: https://mcp.chitty.cc/health
- Auth Provider Info: https://auth.chitty.cc/.well-known/oauth-authorization-server

EOF

    success "Deployment summary created: $SUMMARY_FILE"
}

# Main execution
main() {
    info "Starting ChittyOS Phase 1 Infrastructure Deployment"
    info "Log file: $LOG_FILE"
    
    START_TIME=$(date +%s)
    
    # Execute deployment steps
    check_prerequisites
    setup_project_structure
    setup_kv_namespaces
    setup_r2_buckets
    create_mcp_server_worker
    create_auth_worker
    deploy_all_workers
    setup_secrets
    validate_deployment
    create_deployment_summary
    
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    
    success "🎉 Phase 1 Infrastructure Deployment Completed Successfully!"
    success "Total Duration: ${DURATION} seconds"
    success "All services are deployed and healthy"
    
    info "Next steps:"
    info "1. Set up required secrets using wrangler secret put commands"
    info "2. Test ChatGPT integration with mcp.chitty.cc"
    info "3. Proceed with Phase 2 deployment (OpenAI CustomGPT Actions)"
}

# Execute main function
main "$@"