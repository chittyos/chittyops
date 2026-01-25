#!/bin/bash
# Example pre-deploy hook
# Validates deployment readiness
# Territory: operations
# Governed by: @chittyfoundation/hookify

set -e

echo "🚀 Running pre-deployment checks..."

# Check environment variables
REQUIRED_VARS="CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID"
for VAR in $REQUIRED_VARS; do
    if [ -z "${!VAR}" ]; then
        echo "❌ Required environment variable missing: $VAR"
        exit 1
    fi
done

# Run build
if [ -f "package.json" ] && grep -q "build" package.json; then
    echo "  → Building..."
    npm run build
fi

# Run tests
if [ -f "package.json" ] && grep -q "test" package.json; then
    echo "  → Testing..."
    npm test
fi

# Check wrangler config
if [ -f "wrangler.toml" ]; then
    echo "  → Validating wrangler.toml..."
    npx wrangler deploy --dry-run
fi

echo "✅ Pre-deployment checks passed"
exit 0
