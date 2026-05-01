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
#   --tier=N              Service tier (0-5, default: 5)
#   --domain=DOMAIN       Production domain (e.g., widget.chitty.cc)
#   --type=TYPE           Service type (cloudflare-worker, npm-package, tool, docs)
#   --neon-project=ID     Existing Neon project id (e.g. orange-feather-38463342).
#                         If provided, fetch the connection URI from the Neon API
#                         and register it as NEON_DB_<SERVICE> in 1Password
#                         (synthetic-shared vault), matching the canonical pattern
#                         used by chittyfinance et al.
#   --dry-run             Show what would happen without making changes
#
# Required env when --neon-project is given:
#   NEON_API_KEY                   Neon admin API key
#   OP_SERVICE_ACCOUNT_TOKEN       1Password service-account token with WRITE
#                                  scope on the synthetic-shared vault
#   (OP_CONNECT_HOST/TOKEN are unset for this step — service-account auth only)

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
NEON_PROJECT_ID=""
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
    --neon-project=*) NEON_PROJECT_ID="${arg#*=}" ;;
    --dry-run) DRY_RUN=true ;;
  esac
done

echo -e "${GREEN}ChittyOS Service Onboarding${NC}"
echo -e "${GREEN}===========================${NC}"
echo ""
echo "Service:       $SERVICE_NAME"
echo "Org:           $ORG"
echo "Tier:          $TIER"
echo "Domain:        ${DOMAIN:-none}"
echo "Type:          $SERVICE_TYPE"
echo "Neon project:  ${NEON_PROJECT_ID:-none}"
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

# Step 3.5: Register Neon DB URL in 1Password (synthetic-shared vault)
# Mirrors the canonical NEON_DB_<SERVICE> pattern used by chittyfinance et al.
# Skipped unless --neon-project=<id> is provided.
if [ -n "$NEON_PROJECT_ID" ]; then
  echo -e "\n${GREEN}Step 3.5: Registering Neon DB URL in 1Password...${NC}"
  ITEM_TITLE="NEON_DB_$(echo "$SERVICE_NAME" | tr '[:lower:]' '[:upper:]')"
  SYNTHETIC_SHARED_VAULT_ID="wscjej6suswjce43xhhrma3edu"

  if $DRY_RUN; then
    echo -e "${YELLOW}  [DRY RUN] Would fetch connection URI from Neon project $NEON_PROJECT_ID${NC}"
    echo -e "${YELLOW}  [DRY RUN] Would create $ITEM_TITLE in vault synthetic-shared${NC}"
  else
    if [ -z "${NEON_API_KEY:-}" ]; then
      echo -e "${RED}  ERROR: NEON_API_KEY not set. Cannot fetch connection URI.${NC}" >&2
      exit 1
    fi
    if [ -z "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]; then
      echo -e "${RED}  ERROR: OP_SERVICE_ACCOUNT_TOKEN not set. Cannot write to 1Password.${NC}" >&2
      exit 1
    fi

    # Force op CLI to use service-account auth (Connect mode is read-only on this vault)
    unset OP_CONNECT_HOST OP_CONNECT_TOKEN

    # Idempotency: skip if item already exists
    if op item get "$ITEM_TITLE" --vault synthetic-shared --format=json >/dev/null 2>&1; then
      echo "  $ITEM_TITLE already exists — skipping."
    else
      # Fetch connection URI from Neon API. URI lives only in shell var, never inlined.
      NEON_RESPONSE=$(curl -sf -H "Authorization: Bearer $NEON_API_KEY" \
        "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/connection_uri?database_name=neondb&role_name=neondb_owner" \
        || { echo -e "${RED}  ERROR: Neon API call failed for project $NEON_PROJECT_ID${NC}" >&2; exit 1; })
      CONNECTION_URI=$(echo "$NEON_RESPONSE" | jq -r '.uri // empty')
      if [ -z "$CONNECTION_URI" ]; then
        echo -e "${RED}  ERROR: Neon API returned no .uri for project $NEON_PROJECT_ID${NC}" >&2
        exit 1
      fi

      # Build the 1P item JSON via jq (--arg ensures the URI never appears as a command literal).
      # Pipe to op item create via stdin; URI never reaches the process arglist.
      jq -n \
        --arg title "$ITEM_TITLE" \
        --arg vault_id "$SYNTHETIC_SHARED_VAULT_ID" \
        --arg svc "$SERVICE_NAME" \
        --arg project "$NEON_PROJECT_ID" \
        --arg uri "$CONNECTION_URI" \
        '{
          title: $title,
          category: "API_CREDENTIAL",
          vault: { id: $vault_id },
          fields: [
            { id: "notesPlain", label: "notesPlain", type: "STRING", purpose: "NOTES",
              value: ("Neon DB URL for " + $svc + ". Registered by onboard-service.sh. Project: " + $project + ".") },
            { id: "username", label: "username", type: "STRING", value: "neondb_owner" },
            { id: "credential", label: "credential", type: "CONCEALED", value: $uri }
          ]
        }' | op item create --vault synthetic-shared - >/dev/null \
        || { echo -e "${RED}  ERROR: op item create failed for $ITEM_TITLE${NC}" >&2; exit 1; }
      echo "  Created $ITEM_TITLE in vault synthetic-shared (op://synthetic-shared/$ITEM_TITLE/credential)"
    fi
  fi
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
if [ -n "$NEON_PROJECT_ID" ] && ! $DRY_RUN; then
  echo "  6. Source DB URL: op read 'op://synthetic-shared/$ITEM_TITLE/credential'"
fi
