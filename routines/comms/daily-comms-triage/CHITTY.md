---
uri: chittycanon://docs/ops/architecture/daily-comms-triage
namespace: chittycanon://docs/ops
type: architecture
version: 1.0.0
status: DRAFT
chitty_id: 03-1-USA-0955-T-2605-1-37
---

# daily-comms-triage — Architecture

## Ecosystem position

| | |
|---|---|
| Tier | 4 (Domain — comms orchestration) |
| Domain | `daily-comms-triage.chitty.cc` |
| Type | Cloudflare Worker (cron) |
| Account | ChittyCorp LLC (`0bc21e3a5a9de1a4cc843be9c3e98121`) |
| Pause-exempt | No |
| Pilot phase | Yes (until exit criteria met per `docs/PILOT.md`) |

## Pentad placement

- **P+ (Perceive plus)** — sensitivity classification on metadata before content
- **E (Evaluate)** — policy resolution (TRO / JAVL / privileged-domain)
- **N (Navigate)** — entity-prior binding from inbox + content
- **T (Transact)** — tiered classification + scoring + recommendation
- **A (Attest)** — canonical write to `actions_v1` + `actions_receipts` (ChittyDNA receipt)

## Upstream consumers (what depends on this)

- `mcp.chitty.cc/daily_updates.*` — 7 MCP gateway tools
- `chit triage` CLI subcommand
- agent.chitty.cc `/triage` route
- Notion view "Daily Triage" on Business tracker `f33d20b8…`

## Downstream dependencies (what this depends on)

| Service | Used for | Bound via |
|---------|----------|-----------|
| dispatch.chitty.cc | P+ → E → N pentad routing | HTTPS |
| autoassist.chitty.cc | `triage_followup_v1` template | HTTPS |
| orchestrator.chitty.cc | agent routing post-Attest | HTTPS |
| comptroller.chitty.cc | budget consult, tier_signal | HTTPS |
| CF AI Gateway | T0/T2/T3 LLM calls | direct |
| chittyagent-gam | ws1/ws2 Workspace inbox | Tailscale tunnel |
| Gmail MCP | personal_gmail | MCP |
| Neon `restless-grass-40598426` | DB writes | Hyperdrive |
| R2 `chittyops-actions-raw` | raw IngestItem refs | binding |

## Stack

- TypeScript modules (`worker.ts`, `types.ts`, `crypto.ts`)
- Web Crypto for hashing (no Node deps)
- Hyperdrive for Neon pooled writes
- KV `KV_LOCKS` for cross-inbox dedupe lock
- R2 for raw payload storage (30d soft / 90d hard)

## Certification level

Bronze (Phase 4 scaffold + health-only proof-of-control). Promotes to Silver upon GATE 3 completion (full worker logic deployed, bindings provisioned, Two-Space RLS test green).

## Heartbeat

Per `scheduled` invocation, `fetch(env.DISCOVERY_HEARTBEAT_URL, { method: "POST" })` to `discovery.chitty.cc/heartbeat/daily-comms-triage`.

## Tail consumer

`chittytrack` — canonical CHITTYOS tail destination.
