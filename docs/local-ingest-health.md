# Local Ingest Health Audit

Tracks: chittyos/chittyentity#369. Same structural pattern as chittyconnect's
binding-drift audit (#216/#217), adapted for filesystem and systemd-local
checks on chittyserv-vm.

## What it watches

1. **Systemd unit allowlist** — every entry in
   `config/local-ingest-health.allowlist.json#must_run_units` must be present
   on the host and in a healthy state (timers `active`, oneshot services not
   `failed`). A unit that doesn't exist on the host is treated as **drift**
   — that catches deploy regressions (the case from #369: the issue claimed
   `chittymarket-flush.service` was failing; investigation found it was never
   installed at all).
2. **Buffer dirs** — total size and oldest-file age for each ingest staging
   path (`~/.claude/chittycontext/buffers`, `/tmp/claude-1001`,
   `/var/lib/chittyevidence-watcher`). Thresholds in the same config file.
3. **Disk** — root mount usage with `warn` and `page` percent thresholds.

## How it runs

The audit is filesystem-local — it can't run on a GitHub-hosted runner. Layout:

```
chittyserv-vm (systemd timer, every 15m)        GitHub Actions (every 15m)
  -> chittyops-local-ingest-audit.timer           -> .github/workflows/
  -> audit-local-ingest.sh                           local-ingest-health-audit.yml
  -> writes /var/lib/chittyops/last-audit.json    -> pulls latest report OR
  -> on drift: POST repos/.../dispatches             receives via repository_dispatch
                                                  -> opens / updates / closes
                                                     'local-ingest-drift' issue
```

The local timer is the source of truth; the GHA workflow is the issue-management
layer. The `repository_dispatch` event is preferred (real-time on drift); the
poll-and-pull artifact path is a safety net for "report stopped arriving".

## Workflow YAML

The companion GitHub Actions workflow is staged at
`docs/local-ingest-health-audit.workflow.yml` (not in `.github/workflows/`
because the CI token used to open the initial PR lacks `workflow` scope).

To activate it, a maintainer with `workflow`-scoped credentials needs to:

```bash
git mv docs/local-ingest-health-audit.workflow.yml .github/workflows/local-ingest-health-audit.yml
git commit -m "chore(ci): activate local-ingest-health audit workflow"
git push
```

This is a deliberate two-step so the operator-actionable script + config
land first and can be installed on chittyserv-vm immediately; the
issue-management layer follows.

## Installation

On chittyserv-vm, with operator sudo + a `gh` PAT provisioned via ChittyConnect
to `/etc/chitty/chittyops-gh-token` (scope: `repo` on `chittyos/chittyops`):

```bash
cd /home/ubuntu/projects/github.com/CHITTYOS/chittyops
./scripts/install-local-ingest-timer.sh
```

## Smoke test

```bash
./scripts/audit-local-ingest.sh
echo "EXIT=$?"
```

Healthy: exits 0, prints `{"drift": false, "findings": []}`.
Drift: exits 1, prints `{"drift": true, "findings": [...]}` with one entry per
finding.

Latest smoke-test run on chittyserv-vm (2026-06-04):
- 6 findings: 2 unit_missing (chittymarket-flush.{service,timer}), 1
  service_failed (chittyevidence-drop-watcher — see Part 1 of #369), 2
  buffer_stale, 1 disk_pressure (92% > warn 85%).
- Exit code 1.

## Operator actions required (Part 1 of #369)

Two repair items the audit detected that require sudo on chittyserv-vm:

### 1. chittyevidence-drop-watcher — read-only state dir

Root cause: `/etc/systemd/system/chittyevidence-drop-watcher.service` declares
`ProtectSystem=strict` with `ReadWritePaths=/etc/chitty /run /tmp` — but the
script writes status-polling state to `/var/lib/chittyevidence-watcher/pending.tsv`.
That path is read-only under the strict sandbox, so the tee fails and systemd
records the unit as `failed` even though R2 upload + `/collect` POST already
succeeded.

```bash
sudo sed -i 's|^ReadWritePaths=/etc/chitty /run /tmp$|ReadWritePaths=/etc/chitty /run /tmp /var/lib/chittyevidence-watcher|' \
  /etc/systemd/system/chittyevidence-drop-watcher.service
sudo systemctl daemon-reload
sudo systemctl restart chittyevidence-drop-watcher.service
sudo systemctl status chittyevidence-drop-watcher.service --no-pager
```

Verify: next timer fire should record an entry in
`/var/lib/chittyevidence-watcher/pending.tsv` and the unit transitions to
`inactive (dead)` cleanly (not `failed`).

### 2. chittymarket-flush — unit doesn't exist

The issue title names this unit but it is not installed on the host. The
upstream symptom is the 444M of unflushed buffers in
`~/.claude/chittycontext/buffers` and the sync-daemon log showing 100% flush
failures since 2026-05-10 with `HTTP 500 code 1101`. That `1101` is the
McpAgent.serve() crash tracked in `chittyos/chittyentity#195` — the flush
target endpoint is dead, not a creds/binary problem on chittyserv-vm.

Action: out of ChittyConnect's lane. Tracked separately on `#195`; once that
upstream lands, install the timer (the audit will then flip those two units
from `unit_missing` to active).

### 3. Disk pressure follow-up

92% at audit time. Recommendation: archive
`~/.claude/chittycontext/buffers/*.jsonl` files older than 7 days off-host
(do not delete — they are unflushed telemetry). Once #195 is fixed and the
sync daemon drains them, the buffer dir self-empties.
