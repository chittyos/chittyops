#!/usr/bin/env bash
# install-local-ingest-timer.sh
# Installs the local-ingest-health audit as a systemd timer on chittyserv-vm.
# Idempotent. Requires sudo.
#
# What it installs:
#   /etc/systemd/system/chittyops-local-ingest-audit.service  (oneshot)
#   /etc/systemd/system/chittyops-local-ingest-audit.timer    (every 15m)
#
# The service runs scripts/audit-local-ingest.sh, writes the JSON report
# to /var/lib/chittyops/last-audit.json, and on drift dispatches the
# report to the GHA workflow via `gh api -X POST .../dispatches`.
#
# Tracking: chittyos/chittyentity#369
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/audit-local-ingest.sh"
DISPATCH_REPO="${CHITTYOPS_DISPATCH_REPO:-chittyos/chittyops}"
GH_TOKEN_FILE="${CHITTYOPS_GH_TOKEN_FILE:-/etc/chitty/chittyops-gh-token}"

[ -x "$SCRIPT" ] || { echo "audit script not executable: $SCRIPT" >&2; exit 1; }
[ -f "$GH_TOKEN_FILE" ] || { echo "gh token file missing: $GH_TOKEN_FILE (provision via ChittyConnect)" >&2; exit 1; }

sudo install -d -m 0755 /var/lib/chittyops

sudo tee /usr/local/bin/chittyops-local-ingest-audit-run >/dev/null <<EOF
#!/usr/bin/env bash
set -euo pipefail
REPORT=\$($SCRIPT 2>/dev/null || true)
echo "\$REPORT" > /var/lib/chittyops/last-audit.json
drift=\$(echo "\$REPORT" | jq -r '.drift // false')
if [ "\$drift" = "true" ]; then
  GH_TOKEN=\$(cat "$GH_TOKEN_FILE") gh api \\
    -X POST "repos/$DISPATCH_REPO/dispatches" \\
    -f event_type=local-ingest-audit \\
    --raw-field "client_payload=\$REPORT" || true
fi
EOF
sudo chmod +x /usr/local/bin/chittyops-local-ingest-audit-run

sudo tee /etc/systemd/system/chittyops-local-ingest-audit.service >/dev/null <<'EOF'
[Unit]
Description=ChittyOps local ingest health audit (chittyserv-vm)
Documentation=https://github.com/chittyos/chittyops/blob/main/scripts/audit-local-ingest.sh
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/chittyops-local-ingest-audit-run
User=ubuntu
StandardOutput=journal
StandardError=journal
EOF

sudo tee /etc/systemd/system/chittyops-local-ingest-audit.timer >/dev/null <<'EOF'
[Unit]
Description=Run ChittyOps local ingest health audit every 15 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min
AccuracySec=30s
Unit=chittyops-local-ingest-audit.service

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now chittyops-local-ingest-audit.timer
echo "installed: chittyops-local-ingest-audit.timer active"
systemctl list-timers --no-pager chittyops-local-ingest-audit.timer
