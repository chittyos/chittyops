---
uri: chittycanon://docs/ops/architecture/comptroller
namespace: chittycanon://docs/ops
type: architecture
version: 1.0.0
status: DRAFT
chitty_id: 03-1-USA-9636-T-2605-1-75
---

# ChittyComptroller — Architecture

| | |
|---|---|
| Tier | 3 (Operational — sibling to all agents) |
| Domain | `comptroller.chitty.cc` |
| Type | Cloudflare Worker (5-min cron + HTTP API) |
| Account | ChittyCorp LLC |
| Pause-exempt | Yes (`business_critical`, `always_on`) |
| Pilot phase | Active — `BASELINE_LEARNING=true` for 14 days post-deploy |

## Mental model

Comptroller's office — independent, advisory, with delegated authority to act.

## Outputs

| Output | Surface | Cadence |
|--------|---------|---------|
| Real-time anomaly alert | Notion + Quo SMS (crit) | < 5 min from spike |
| Daily cost report | Notion auto-update | 07:00 CT |
| Weekly variance + forecast | Notion + email | Mon 07:00 CT |
| Monthly closeout + tier-rebalance rec | Notion + Mercury memo | 1st of month |
| Per-service spend dashboard | comptroller.chitty.cc UI | Live |
| `GET /budget/:service/status` | MCP · CLI · any agent | On-demand |

## Dual-report (F-L13)

- **Business** report: Legal aggregated as single line "Legal Operations" — no per-case detail.
- **Legalink-only** report: Full per-case breakdown, visible inside Legalink only.

## Stack

- TypeScript module (`worker.ts`)
- Hyperdrive → Neon `comptroller_reader` role
- KV `KV_STATE` for authority-level + baseline-learning timer
- EWMA + seasonality forecast (no LLM above T0)

## Tail consumer

`chittytrack`.

## Certification level

Bronze (health-only stub + registration). Promotes to Silver upon GATE 3.
