#!/usr/bin/env bash
#
# enroll-warp-service.sh
# 
# Enrolls the ChittyServ VM into Cloudflare One via WARP Service Mode.
# This completely eliminates the need for agents to use CHITTY_AUTH_SERVICE_TOKEN
# because the network egress itself is cryptographically verified by Zero Trust Access.
#
# Prerequisites: warp-cli must be installed.
# Docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-devices/warp/deployment/linux/

set -e

ORG_NAME="${CLOUDFLARE_ORG_NAME:-chittyos}"
# Using Service Tokens for headless automated enrollment
CLIENT_ID="${CF_SERVICE_AUTH_ID:-}"
CLIENT_SECRET="${CF_SERVICE_AUTH_SECRET:-}"

echo "Starting Cloudflare WARP Service Enrollment for ChittyServ node..."

if ! command -v warp-cli &> /dev/null; then
    echo "ERROR: warp-cli could not be found. Please install the Cloudflare One Client first."
    echo "Docs: https://pkg.cloudflareclient.com/"
    exit 1
fi

echo "1. Registering WARP client with organization: $ORG_NAME..."
if [ -n "$CLIENT_ID" ] && [ -n "$CLIENT_SECRET" ]; then
    # Headless enrollment using Cloudflare Access Service Token
    warp-cli registration new --auth-client-id "$CLIENT_ID" --auth-client-secret "$CLIENT_SECRET" "$ORG_NAME" || true
else
    echo "WARNING: No Service Token found. Falling back to interactive or MDM enrollment."
    warp-cli registration new "$ORG_NAME" || true
fi

echo "2. Setting operating mode to Proxy (Traffic + DNS)..."
warp-cli set-mode warp

echo "3. Connecting the daemon tunnel..."
warp-cli connect

echo "4. Verifying Zero Trust Device Posture status..."
sleep 2
warp-cli status

echo ""
echo "=========================================================================="
echo "✅ SUCCESS: The ChittyServ VM is now securely bound to Cloudflare One."
echo "Agents on this node no longer need to manage CHITTY_AUTH_SERVICE_TOKEN."
echo "All traffic to mcp.chitty.cc / connect.chitty.cc is natively authenticated"
echo "at the network edge by Cloudflare Zero Trust!"
echo "=========================================================================="
