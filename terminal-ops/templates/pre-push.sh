#!/bin/bash
# Example pre-push hook
# Validates branch and runs full test suite
# Territory: operations
# Governed by: @chittyfoundation/hookify

set -e

echo "🚀 Running pre-push checks..."

# Get current branch
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Prevent pushing to main/master directly
if [ "$BRANCH" = "main" ] || [ "$BRANCH" = "master" ]; then
    echo "❌ Direct push to $BRANCH is not allowed"
    echo "   Please create a PR instead"
    exit 1
fi

# Run full test suite
if [ -f "package.json" ] && grep -q "test" package.json; then
    echo "  → Running full test suite..."
    npm test
fi

echo "✅ Pre-push checks passed"
exit 0
