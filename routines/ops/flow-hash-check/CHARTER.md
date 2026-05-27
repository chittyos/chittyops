---
uri: chittycanon://docs/ops/charter/flow-hash-check
namespace: chittycanon://docs/ops
type: charter
version: 1.0.0
status: DRAFT
chitty_id: 03-1-USA-6434-T-2605-1-54
---

# flow-hash-check — Charter

## Scope

Cron drift detector for Workspace Studio flows. Compares live export hash from `ws1` and `ws2` Studio tenants against the repo-committed JSON (`studio-flows/aribia-daily-inbox-triage.json`). Raises a Notion alert on drift. Read-only.

## API contract

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe |
| GET | `/api/v1/status` | Last-check timestamp + drift state |

Cron handler is the primary surface; HTTP endpoints exist for observability only.

## Dependencies

- **chittyagent-gam** tunnel — Studio flow export per tenant
- **Notion** — alert page
- `discovery.chitty.cc/heartbeat/flow-hash-check`

## Scope boundaries

- Read-only — never modifies a Studio flow.
- Alert-only — never auto-rolls-back.

## Pause-exemption

None.

## Compliance level

Bronze (Phase 4 stub). ChittyID `03-1-USA-6434-T-2605-1-54`.
