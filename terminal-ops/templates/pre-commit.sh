#!/bin/bash
# Example pre-commit hook
# Runs linting and tests before commit
# Territory: operations
# Governed by: @chittyfoundation/hookify

set -e

echo "🔍 Running pre-commit checks..."

# Run linter if available
if [ -f "package.json" ] && grep -q "lint" package.json; then
    echo "  → Linting..."
    npm run lint
fi

# Run tests if available
if [ -f "package.json" ] && grep -q "test" package.json; then
    echo "  → Testing..."
    npm test
fi

echo "✅ Pre-commit checks passed"
exit 0
