#!/bin/bash

# ChittyOS Service Onboarding Script
# Onboards a new service into the ecosystem with full compliance
#
# Usage:
#   ./scripts/onboard-service.sh <service-name> <org> [options]
#
# Example:
#   ./scripts/onboard-service.sh chittywidget CHITTYOS --tier=4 --domain=widget.chitty.cc
#
# Options:
#   --tier=N          Service tier (0-5, default: 5)
#   --domain=DOMAIN   Production domain (e.g., widget.chitty.cc)
#   --type=TYPE       Service type (cloudflare-worker, npm-package, tool, docs)
#   --dry-run         Show what would happen without making changes

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Parse positional args
SERVICE_NAME="${1:-}"
ORG="${2:-}"
TIER=5
DOMAIN=""
SERVICE_TYPE="cloudflare-worker"
DRY_RUN=false

if [ -z "$SERVICE_NAME" ] || [ -z "$ORG" ]; then
  echo "Usage: ./scripts/onboard-service.sh <service-name> <org> [--tier=N] [--domain=DOMAIN] [--type=TYPE] [--dry-run]"
  echo ""
  echo "Example:"
  echo "  ./scripts/onboard-service.sh chittywidget CHITTYOS --tier=4 --domain=widget.chitty.cc"
  exit 1
fi

# Parse optional args
shift 2
for arg in "$@"; do
  case $arg in
    --tier=*) TIER="${arg#*=}" ;;
    --domain=*) DOMAIN="${arg#*=}" ;;
    --type=*) SERVICE_TYPE="${arg#*=}" ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

echo -e "${GREEN}ChittyOS Service Onboarding${NC}"
echo -e "${GREEN}===========================${NC}"
echo ""
echo "Service:  $SERVICE_NAME"
echo "Org:      $ORG"
echo "Tier:     $TIER"
echo "Domain:   ${DOMAIN:-none}"
echo "Type:     $SERVICE_TYPE"
echo ""

# Step 1: Call ChittyConnect onboarding endpoint
echo -e "${GREEN}Step 1: Calling ChittyConnect onboarding...${NC}"
if ! $DRY_RUN; then
  ONBOARD_RESPONSE=$(curl -sf -X POST "https://get.chitty.cc/api/onboard" \
    -H "Content-Type: application/json" \
    -d "{
      \"service_name\": \"$SERVICE_NAME\",
      \"organization\": \"$ORG\",
      \"tier\": $TIER,
      \"domain\": \"${DOMAIN:-null}\",
      \"type\": \"$SERVICE_TYPE\"
    }" 2>/dev/null || echo '{"status":"pending","message":"Onboarding endpoint not yet available - manual provisioning required"}')
  echo "  Response: $ONBOARD_RESPONSE"
else
  echo -e "${YELLOW}  [DRY RUN] Would POST to https://get.chitty.cc/api/onboard${NC}"
fi

# Step 2: Add to service registry
echo -e "\n${GREEN}Step 2: Adding to service registry...${NC}"
REGISTRY_FILE="$SCRIPT_DIR/compliance/service-registry.yml"
if grep -q "^      ${SERVICE_NAME}:" "$REGISTRY_FILE" 2>/dev/null; then
  echo "  Already in registry, skipping"
else
  if ! $DRY_RUN; then
    echo "  Adding $SERVICE_NAME to $ORG in service-registry.yml"
    # Build the entry block
    ENTRY="\\
      # Added by onboard-service.sh $(date +%Y-%m-%d)\\
      ${SERVICE_NAME}:\\
        repo: ${ORG}/${SERVICE_NAME}\\
        tier: ${TIER}\\
        type: ${SERVICE_TYPE}\\
        domain: ${DOMAIN:-null}\\
        territory: operations\\
        active: true\\
        description: \"Onboarded service\""
    # Find the last service entry under the target org's services: section
    # and insert the new entry after it
    if grep -q "^  ${ORG}:" "$REGISTRY_FILE" 2>/dev/null; then
      # Use python for reliable YAML-aware insertion
      python3 -c "
import sys
lines = open('$REGISTRY_FILE').readlines()
org_found = False
insert_idx = None
for i, line in enumerate(lines):
    if line.strip() == '${ORG}:':
        org_found = True
    elif org_found and line.strip() and not line.startswith(' ') and not line.startswith('#'):
        # Hit next top-level key after our org
        insert_idx = i
        break
    elif org_found and line.strip().endswith(':') and not line.strip().startswith('#'):
        # Track last entry under this org
        insert_idx = None  # keep scanning
if insert_idx is None:
    insert_idx = len(lines)
entry = '''
      # Added by onboard-service.sh $(date +%Y-%m-%d)
      ${SERVICE_NAME}:
        repo: ${ORG}/${SERVICE_NAME}
        tier: ${TIER}
        type: ${SERVICE_TYPE}
        domain: ${DOMAIN:-null}
        territory: operations
        active: true
        description: Onboarded service
'''
lines.insert(insert_idx, entry)
open('$REGISTRY_FILE', 'w').writelines(lines)
"
      echo "  Added to registry under $ORG section"
    else
      echo -e "${RED}  ERROR: Org '$ORG' not found in registry. Add manually.${NC}"
    fi
  else
    echo -e "${YELLOW}  [DRY RUN] Would add $SERVICE_NAME to registry${NC}"
  fi
fi

# Step 3: Run setup script for this specific repo
echo -e "\n${GREEN}Step 3: Deploying compliance files...${NC}"
if ! $DRY_RUN; then
  "$SCRIPT_DIR/setup-org-workflows.sh" --repo="$ORG/$SERVICE_NAME" --verbose
else
  echo -e "${YELLOW}  [DRY RUN] Would run: setup-org-workflows.sh --repo=$ORG/$SERVICE_NAME${NC}"
fi

# Step 4: Summary
echo -e "\n${GREEN}Onboarding Complete!${NC}"
echo -e "${GREEN}=====================${NC}"
echo ""
echo "Next steps:"
echo "  1. Review and merge the compliance PR on $ORG/$SERVICE_NAME"
echo "  2. Implement /health endpoint returning {\"status\":\"ok\",\"service\":\"$SERVICE_NAME\"}"
echo "  3. Ensure CHITTYCONNECT_API_KEY is available as org secret"
echo "  4. Run: npm run audit -- --service=$SERVICE_NAME  (to verify)"
if [ -n "$DOMAIN" ]; then
  echo "  5. Verify: curl -sf https://$DOMAIN/health | jq ."
fi
