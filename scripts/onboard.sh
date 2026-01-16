#!/bin/bash
set -euo pipefail
echo "=== chittyops Onboarding ==="
curl -s -X POST "${GETCHITTY_ENDPOINT:-https://get.chitty.cc/api/onboard}" \
  -H "Content-Type: application/json" \
  -d '{"service_name":"chittyops","organization":"CHITTYOS","type":"operations","tier":3,"domains":["ops.chitty.cc"]}' | jq .
