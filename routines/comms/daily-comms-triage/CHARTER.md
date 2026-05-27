---
uri: chittycanon://docs/ops/charter/daily-comms-triage
namespace: chittycanon://docs/ops
type: charter
version: 1.0.0
status: DRAFT
registered_with: chittycanon://core/services/canon
title: "daily-comms-triage Charter"
certifier: chittycanon://core/services/chittycertify
visibility: PUBLIC
chitty_id: 03-1-USA-0955-T-2605-1-37
---

# daily-comms-triage — Charter

## Scope

Cron-triggered routine. Ingests from all configured comms/event sources (Gmail × 3 accounts, Quo, iMessage, Mercury, Notion, M365, CF, Linear, Cash App, Docusign, RMail) at **07:00 America/Chicago** daily; classifies, triages, prioritizes; emits ScoredAction rows to `chittyops.actions_v1` and per-call entries to `chittyops.cost_ledger`.

Source-of-truth design: `spec/daily-updates-orchestration-v0.5.md`.

## API contract

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe. Returns `{ status: "ok", service, version }` |
| GET | `/api/v1/status` | Detailed status with mode + last-run summary |
| GET | `/api/v1/metrics` | Latest run metrics (count, P95, cost) |
| POST | `/dispatch` | Internal entry from realtime variant — non-public |

Cron handler (`scheduled`) is the primary surface; HTTP endpoints exist for observability + the realtime sibling.

## Dependencies

- **Neon** `restless-grass-40598426` — writes `chittyops.actions_*`, `chittyops.classification_cache`, `chittyops.cost_ledger`
- **chittyagent-gam** — Workspace inbox access for ws_nevershitty, ws_jeanarlene
- **Gmail MCP** — personal_gmail readonly
- **dispatch.chitty.cc / orchestrator.chitty.cc / autoassist.chitty.cc** — Pentad routing + template invocation
- **comptroller.chitty.cc** — budget consult (tier_signal subscribe)
- **CF AI Gateway** — T0 (Workers AI Llama), T2/T3 (cached Haiku/Sonnet, pilot-disabled)
- **R2 bucket** `chittyops-actions-raw` — IngestItem raw refs

## Scope boundaries

- Does **NOT** write to actions_v1 with `routing=business` for items classified privileged — RLS enforces.
- Does **NOT** invoke paid tiers (T2/T3) while `PILOT_MODE=true` — escalations flag `pilot_unresolved`.
- Does **NOT** auto-archive items in `privileged_domains` even at confidence ≥ 0.95.
- Does **NOT** bypass `TRO_REVIEW_PENDING`, `JAVL_PAYROLL_PRECEDES_DISTRIBUTION`, or `LITIGATION_HOLD:*` flags.

## Pause-exemption

None — daily-comms-triage may be paused by Comptroller L3 without SMS confirm.

## Compliance triad

- CHARTER.md (this file) — API contract + dependencies
- CHITTY.md — architecture, ecosystem position, consumers
- AGENTS.md — operating defaults for agents touching this routine

## Compliance level

Phase 4 health-only stub deployed and registered (ChittyID `03-1-USA-0955-T-2605-1-37`). Full worker logic deploys pending GATE 3 (bindings + secrets + Two-Space RLS test verified).
