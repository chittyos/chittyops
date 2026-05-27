---
uri: chittycanon://docs/ops/charter/comptroller
namespace: chittycanon://docs/ops
type: charter
version: 1.0.0
status: DRAFT
chitty_id: 03-1-USA-9636-T-2605-1-75
---

# ChittyComptroller — Charter

## Scope

Independent budget observer + delegated enforcer across all ChittyOS services. L1 (observer) + L2 (throttle) + L3 (pause). Reads `chittyops.cost_ledger` (hashed `item_id`); never reads `actions_v1` content. See spec §8.

## API contract

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe |
| GET | `/api/v1/status` | Authority level + baseline-learning state |
| GET | `/api/v1/metrics` | Spend × tier × service × day_ct |
| GET | `/budget/:service/status` | BudgetStatus for a named service |
| GET | `/reports/daily` | Today's dual report (business + legalink) |

Also scheduled every 5 minutes (cron) to poll CF AI Gateway analytics + refresh materialized views.

## Dependencies

- **Neon** `restless-grass-40598426` as `comptroller_reader` role (read-only on `chittyops.cost_ledger*`).
- **CF AI Gateway analytics** (5-min poll)
- **Anthropic billing API** (hourly poll)
- **Google AI Studio quota** (hourly poll)
- **Notion** — Business + Legalink report pages
- **Quo** — SMS confirm path for L3 pauses

## Authority levels

| L | Capability | Constraint |
|---|------------|-----------|
| L1 | Read-only · alerts · reports · forecasts | Always on |
| L2 | Tier-degrade signals | Off during 14d `BASELINE_LEARNING`; respects `pause_exemptions` |
| L3 | Pause services | Off during baseline-learning; NEVER pauses `pause_exemption=true` without SMS confirm; cold-start = L1-only for 24h |

## Scope boundaries

- **NEVER** reads `actions_v1` content. Only `cost_ledger` (hashed item_id).
- **NEVER** uses LLM calls above T0 itself (forecast uses EWMA + seasonality).
- **NEVER** pauses pause-exempt services (`chittycounsel`, `chittybiz`, `id.chitty.cc`, etc.) without SMS confirm via Quo.

## Pause-exemption

Yes — `business_critical, always_on`. Comptroller is tier-Infrastructure; never paused.

## Compliance level

Bronze (Phase 4 stub). ChittyID `03-1-USA-9636-T-2605-1-75`.
